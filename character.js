// character.js

const CORE_STATS = ['str', 'inst', 'int', 'init'];

const DEALT_BY_TYPE = {
  PHYSICAL: 'physical_dealt',
  TACTICAL: 'tactical_dealt',
  FIRE: 'fire_dealt'
};

const RECEIVED_BY_TYPE = {
  PHYSICAL: 'physical_received',
  TACTICAL: 'tactical_received',
  FIRE: 'fire_received'
};

class Character {
  constructor(dragonData, teamId, slotPosition) {
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
    this.maxHealth = this.calculateMaxHealth();
    this.currentHealth = this.maxHealth;
    this.isDead = false;
    this.retreatedLastRound = false;
    this.diedThisRound = false;
    this.activeEffects = [];
    this.actionLog = [];
    this.roundsActive = 0;
    this.percentMods = [];
    this.links = {};
    this.stacks = {};

    this.statModifiers = { str: 0, inst: 0, int: 0, init: 0 };
    this.damageBonus = 0;
    this.damagePenalty = 0;
    this.defenseBonus = 0;
    this.defensePenalty = 0;
    this.parsedHabits = [];
    this.habitRank = 1;
  }

  calculateMaxHealth() {
    return Math.max(50, (this.stats.str + this.stats.int) * 2);
  }

  addStatModifier(statName, amount, duration = 'combat', options = {}) {
    const stat = String(statName || '').toLowerCase();
    if (!stat || amount == null || Number.isNaN(Number(amount))) return;
    this.percentMods.push({
      stat,
      pct: Number(amount),
      duration: duration === 'combat' || duration === 0 ? 'combat' : duration,
      excludeBasic: !!options.excludeBasic,
      stackId: options.stackId || null
    });
    if (CORE_STATS.includes(stat)) {
      this.statModifiers[stat] = this.getPercentTotal(stat);
    }
  }

  addStack(stackId, mods, duration, options = {}) {
    this.stacks[stackId] = (this.stacks[stackId] || 0) + (options.stacks || 1);
    for (const stat in mods) {
      this.addStatModifier(stat, mods[stat], duration, { ...options, stackId });
    }
    return this.stacks[stackId];
  }

  getPercentTotal(statName, options = {}) {
    const stat = String(statName || '').toLowerCase();
    const basic = !!options.basic;
    return this.percentMods
      .filter(mod => mod.stat === stat && !(basic && mod.excludeBasic))
      .reduce((sum, mod) => sum + mod.pct, 0);
  }

  getModifiedStat(statName) {
    const stat = String(statName || '').toLowerCase();
    const base = this.stats[stat] || 0;
    const pct = this.getPercentTotal(stat);
    if (CORE_STATS.includes(stat)) return Math.max(0, base * (1 + pct / 100));
    return pct;
  }

  getDealtMultiplier(damageType, options = {}) {
    const key = DEALT_BY_TYPE[String(damageType || '').toUpperCase()];
    const generic = this.getPercentTotal('dmg_dealt', options);
    const typed = key ? this.getPercentTotal(key, options) : 0;
    return 1 + (generic + typed) / 100;
  }

  getReceivedMultiplier(damageType, options = {}) {
    const key = RECEIVED_BY_TYPE[String(damageType || '').toUpperCase()];
    const generic = this.getPercentTotal('dmg_received', options);
    const typed = key ? this.getPercentTotal(key, options) : 0;
    return 1 + (generic + typed) / 100;
  }

  getRecoveryDealtMultiplier() {
    return 1 + this.getPercentTotal('recovery_dealt') / 100;
  }

  getRecoveryReceivedMultiplier() {
    return 1 + this.getPercentTotal('recovery_received') / 100;
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
  }

  resetStatModifiers() {
    this.percentMods = [];
    this.statModifiers = { str: 0, inst: 0, int: 0, init: 0 };
    this.stacks = {};
  }

  takeDamage(amount) {
    if (this.isDead) return 0;
    const actualDamage = Math.max(0, amount);
    this.currentHealth -= actualDamage;
    if (this.currentHealth <= 0) {
      this.currentHealth = 0;
      this.isDead = true;
      this.noteDeath();
      this.actionLog.push(`MORTE: ${this.name} caiu`);
    }
    return actualDamage;
  }

  heal(amount) {
    if (this.isDead) return 0;
    const actualHeal = Math.min(amount, this.maxHealth - this.currentHealth);
    this.currentHealth += actualHeal;
    return actualHeal;
  }

  applyEffect(effect) {
    if (this.isDead) return false;
    this.activeEffects.push({
      name: effect.name,
      duration: effect.duration,
      maxDuration: effect.duration,
      magnitude: effect.magnitude || 0,
      appliedBy: effect.appliedBy
    });
    return true;
  }

  hasEffect(effectName) {
    return this.activeEffects.some(e => e.name === effectName && e.duration > 0);
  }

  getHealthPercentage() {
    return this.maxHealth > 0 ? (this.currentHealth / this.maxHealth) * 100 : 0;
  }

  getInitiative() {
    return this.getModifiedStat('init');
  }

  logAction(action) {
    this.actionLog.push(action);
  }

  setHabits(parsedHabits) {
    this.parsedHabits = parsedHabits || [];
  }

  setHabitRank(rank) {
    this.habitRank = Math.max(1, Math.min(5, rank));
  }

  setTroopType(troopType) {
    this.troopType = troopType || null;
  }

  isHabitUnlocked(habit) {
    return !(habit.unlockStar > this.habitRank * 2);
  }

  getHabitsByTrigger(triggerType) {
    return this.parsedHabits.filter(habit => {
      if (habit.blocks && habit.blocks.length) {
        return habit.blocks.some(block => block.phase === triggerType);
      }
      return habit.triggerType === triggerType;
    });
  }

  getHabitsForPhase(round, phase) {
    return this.parsedHabits.filter(habit =>
      this.isHabitUnlocked(habit) && habit.shouldTrigger(round, phase)
    );
  }

  getStatus() {
    return {
      name: this.name,
      health: this.currentHealth,
      maxHealth: this.maxHealth,
      healthPercent: this.getHealthPercentage(),
      isDead: this.isDead,
      activeEffects: this.activeEffects.map(e => `${e.name} (${e.duration})`),
      initiative: this.getInitiative()
    };
  }
}

export { Character, CORE_STATS, DEALT_BY_TYPE, RECEIVED_BY_TYPE };
