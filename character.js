// character.js

const CORE_STATS = ['str', 'inst', 'int', 'init'];
const DEALT_BY_TYPE = { PHYSICAL: 'physical_dealt', TACTICAL: 'tactical_dealt', FIRE: 'fire_dealt' };
const RECEIVED_BY_TYPE = { PHYSICAL: 'physical_received', TACTICAL: 'tactical_received', FIRE: 'fire_received' };
const DEFAULT_LEVEL = 16;
const DEFAULT_STARS = 2;
const DEFAULT_HABIT_RANK = 1;
const SLOT_NAMES = { 0: 'Left Flank', 1: 'Vanguard', 2: 'Right Flank' };

class Character {
  constructor(dragonData, teamId, slotPosition, options = {}) {
    this.id = dragonData.id;
    this.name = dragonData.name;
    this.breed = dragonData.breed;
    this.rarity = dragonData.rarity;
    this.stats = { ...dragonData.stats };
    this.habits = dragonData.habits;
    this.affinity = dragonData.affinity || [];
    this.weaknesses = dragonData.weaknesses || [];
    this.vanguardText = dragonData.vanguardText;
    this.commandText = dragonData.commandText;
    this.troopType = dragonData.troopType || null;
    this.teamId = teamId;
    this.slotPosition = slotPosition;
    this.positionName = SLOT_NAMES[slotPosition] || `Slot ${slotPosition}`;
    this.level = options.level != null ? options.level : DEFAULT_LEVEL;
    this.stars = options.stars != null ? options.stars : DEFAULT_STARS;
    this.maxHealth = this.calculateMaxHealth();
    this.currentHealth = this.maxHealth;
    this.isDead = false;
    this.retreatedLastRound = false;
    this.diedThisRound = false;
    this.receivedRecoveryThisRound = false;
    this.receivedRecoveryLastRound = false;
    this.receivedDamageThisRound = false;
    this.oncePerRoundFired = {};
    this.activeEffects = [];
    this.actionLog = [];
    this.percentMods = [];
    this.flatMods = { str: 0, inst: 0, int: 0, init: 0 };
    this.links = {};
    this.stacks = {};
    this.stackReached = {};
    this.statModifiers = { str: 0, inst: 0, int: 0, init: 0 };
    this.damageBonus = 0;
    this.damagePenalty = 0;
    this.defenseBonus = 0;
    this.defensePenalty = 0;
    this.parsedHabits = [];
    this.habitRank = options.habitRank != null ? options.habitRank : DEFAULT_HABIT_RANK;
    this.commandKit = null;
    this.vanguardKit = null;
    this.commandName = null;
    this.commandUsedThisRound = null;
    this.commandMods = {};
  }

  calculateMaxHealth() {
    return Math.max(50, (this.stats.str + this.stats.int) * 2);
  }

  addStatModifier(statName, amount, duration = 'combat', options = {}) {
    const stat = String(statName || '').toLowerCase();
    if (!stat || stat === '__fixed' || amount == null || Number.isNaN(Number(amount))) return;
    if (options.fixed && CORE_STATS.includes(stat)) {
      this.flatMods[stat] = (this.flatMods[stat] || 0) + Number(amount);
      return;
    }
    this.percentMods.push({
      stat,
      pct: Number(amount),
      duration: duration === 'combat' || duration === 0 ? 'combat' : duration,
      excludeBasic: !!options.excludeBasic,
      stackId: options.stackId || null
    });
    if (CORE_STATS.includes(stat)) this.statModifiers[stat] = this.getPercentTotal(stat);
  }

  addStack(stackId, mods, duration, options = {}) {
    const id = stackId || 'stack';
    const max = options.maxStacks != null ? Number(options.maxStacks) : null;
    const before = this.stacks[id] || 0;
    if (max != null && before >= max) {
      return { stacks: before, added: 0, reached: false };
    }
    let added = options.stacks || 1;
    if (max != null) added = Math.min(added, max - before);
    if (added <= 0) return { stacks: before, added: 0, reached: false };

    this.stacks[id] = before + added;
    for (let i = 0; i < added; i += 1) {
      for (const stat in mods) {
        if (stat === '__fixed') continue;
        this.addStatModifier(stat, mods[stat], duration, { ...options, stackId: id });
      }
    }
    return { stacks: this.stacks[id], added, reached: true };
  }

  markStackReached(stackId, threshold) {
    const key = `${stackId}:${threshold}`;
    if (this.stackReached[key]) return false;
    this.stackReached[key] = true;
    return true;
  }

  getStackCount(stackId) {
    return this.stacks[stackId] || 0;
  }

  getPercentTotal(statName, options = {}) {
    const stat = String(statName || '').toLowerCase();
    return this.percentMods
      .filter(mod => mod.stat === stat && !(options.basic && mod.excludeBasic))
      .reduce((sum, mod) => sum + mod.pct, 0);
  }

  getModifiedStat(statName) {
    const stat = String(statName || '').toLowerCase();
    const base = this.stats[stat] || 0;
    const flat = this.flatMods[stat] || 0;
    const pct = this.getPercentTotal(stat);
    if (CORE_STATS.includes(stat)) return Math.max(0, (base + flat) * (1 + pct / 100));
    return pct;
  }

  getDealtMultiplier(damageType, options = {}) {
    const key = DEALT_BY_TYPE[String(damageType || '').toUpperCase()];
    return 1 + (this.getPercentTotal('dmg_dealt', options) + (key ? this.getPercentTotal(key, options) : 0)) / 100;
  }

  getReceivedMultiplier(damageType, options = {}) {
    const key = RECEIVED_BY_TYPE[String(damageType || '').toUpperCase()];
    return 1 + (this.getPercentTotal('dmg_received', options) + (key ? this.getPercentTotal(key, options) : 0)) / 100;
  }

  getRecoveryDealtMultiplier() {
    return 1 + this.getPercentTotal('recovery_dealt') / 100;
  }

  getRecoveryReceivedMultiplier() {
    let m = 1 + this.getPercentTotal('recovery_received') / 100;
    const prey = (this.activeEffects || []).find(e => e.id === 'prey' && (typeof e.isExpired === 'function' ? !e.isExpired() : e.duration > 0));
    if (prey && prey.recoveryPenalty) m *= (1 - Number(prey.recoveryPenalty) / 100);
    return m;
  }

  tickPercentMods() {
    for (const mod of this.percentMods) {
      if (typeof mod.duration === 'number') mod.duration -= 1;
    }
    this.percentMods = this.percentMods.filter(mod =>
      mod.duration === 'combat' || (typeof mod.duration === 'number' && mod.duration > 0)
    );
    for (const stat of CORE_STATS) this.statModifiers[stat] = this.getPercentTotal(stat);
  }

  noteDeath() {
    this.diedThisRound = true;
  }

  advanceRetreatFlags() {
    this.retreatedLastRound = this.diedThisRound;
    this.diedThisRound = false;
    this.receivedRecoveryLastRound = this.receivedRecoveryThisRound;
    this.receivedRecoveryThisRound = false;
    this.receivedDamageThisRound = false;
    this.oncePerRoundFired = {};
    this.commandUsedThisRound = null;
  }

  takeDamage(amount) {
    if (this.isDead) return 0;
    this.currentHealth -= Math.max(0, amount);
    if (this.currentHealth <= 0) {
      this.currentHealth = 0;
      this.isDead = true;
      this.noteDeath();
    }
    return Math.max(0, amount);
  }

  heal(amount) {
    if (this.isDead) return 0;
    const actualHeal = Math.max(0, Math.min(amount, this.maxHealth - this.currentHealth));
    this.currentHealth += actualHeal;
    if (actualHeal > 0) this.receivedRecoveryThisRound = true;
    return actualHeal;
  }

  getHealthPercentage() {
    return this.maxHealth > 0 ? (this.currentHealth / this.maxHealth) * 100 : 0;
  }

  getInitiative() {
    return this.getModifiedStat('init');
  }

  setHabits(parsedHabits) {
    this.parsedHabits = parsedHabits || [];
  }

  setHabitRank(rank) {
    this.habitRank = Math.max(1, Math.min(5, rank));
  }

  setStars(stars) {
    this.stars = Math.max(1, Math.min(10, stars));
  }

  setLevel(level) {
    this.level = Math.max(1, level);
  }

  setTroopType(troopType) {
    this.troopType = troopType || null;
  }

  setCommandKit(kit) {
    this.commandKit = kit;
    if (kit && kit.name) this.commandName = kit.name;
  }

  setVanguardKit(kit) {
    this.vanguardKit = kit;
  }

  isHabitUnlocked(habit) {
    return (habit.unlockStar || 2) <= this.stars;
  }

  getHabitsForPhase(round, phase) {
    return this.parsedHabits.filter(habit =>
      this.isHabitUnlocked(habit) && habit.shouldTrigger(round, phase)
    );
  }

  getStatus() {
    return {
      name: this.name,
      position: this.positionName,
      slot: this.slotPosition,
      level: this.level,
      stars: this.stars,
      habitRank: this.habitRank,
      health: this.currentHealth,
      maxHealth: this.maxHealth,
      healthPercent: this.getHealthPercentage(),
      isDead: this.isDead,
      initiative: this.getInitiative()
    };
  }
}

export {
  Character,
  CORE_STATS,
  DEALT_BY_TYPE,
  RECEIVED_BY_TYPE,
  SLOT_NAMES,
  DEFAULT_LEVEL,
  DEFAULT_STARS,
  DEFAULT_HABIT_RANK
};
