// character.js
// Responsabilidade: Definir a classe Character (dragão em batalha) com vida, posição, efeitos

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

    this.teamId = teamId;
    this.slotPosition = slotPosition;
    this.maxHealth = this.calculateMaxHealth();
    this.currentHealth = this.maxHealth;
    this.isDead = false;
    this.activeEffects = [];
    this.actionLog = [];
    this.roundsActive = 0;

    this.statModifiers = {
      str: 0,
      inst: 0,
      int: 0,
      init: 0
    };

    this.damageBonus = 0;
    this.damagePenalty = 0;
    this.defenseBonus = 0;
    this.defensePenalty = 0;

    this.parsedHabits = [];
    this.habitRank = 1;
  }

  calculateMaxHealth() {
    const base = (this.stats.str + this.stats.int) * 2;
    return Math.max(50, base);
  }

  getModifiedStat(statName) {
    const base = this.stats[statName] || 0;
    const modifier = this.statModifiers[statName] || 0;
    return Math.max(0, base + modifier);
  }

  takeDamage(amount) {
    if (this.isDead) return 0;

    const actualDamage = Math.max(0, amount);
    this.currentHealth -= actualDamage;

    if (this.currentHealth <= 0) {
      this.currentHealth = 0;
      this.isDead = true;
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

    this.actionLog.push(`EFEITO: ${effect.name} aplicado por ${effect.duration} rodada(s)`);
    return true;
  }

  hasEffect(effectName) {
    return this.activeEffects.some(e => e.name === effectName && e.duration > 0);
  }

  getEffect(effectName) {
    return this.activeEffects.find(e => e.name === effectName && e.duration > 0) || null;
  }

  removeEffect(effectName) {
    const index = this.activeEffects.findIndex(e => e.name === effectName);
    if (index !== -1) {
      this.activeEffects.splice(index, 1);
      return true;
    }
    return false;
  }

  updateEffects() {
    for (const effect of this.activeEffects) {
      effect.duration -= 1;
    }
    this.activeEffects = this.activeEffects.filter(e => e.duration > 0);
  }

  addStatModifier(statName, amount) {
    if (this.statModifiers[statName] !== undefined) {
      this.statModifiers[statName] += amount;
    }
  }

  resetStatModifiers() {
    this.statModifiers = { str: 0, inst: 0, int: 0, init: 0 };
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

  getUsableHabits(round, phase) {
    return this.getHabitsForPhase(round, phase);
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

export { Character };
