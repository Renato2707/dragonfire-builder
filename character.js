// character.js
// Responsabilidade: Definir a classe Character (dragão em batalha) com vida, posição, efeitos

class Character {
  constructor(dragonData, teamId, slotPosition) {
    // Dados estáticos (vêm do JSON)
    this.id = dragonData.id;
    this.name = dragonData.name;
    this.breed = dragonData.breed;
    this.rarity = dragonData.rarity;
    this.stats = { ...dragonData.stats }; // Cópia para não modificar original
    this.habits = dragonData.habits;
    this.affinity = dragonData.affinity || [];
    this.weaknesses = dragonData.weaknesses || [];
    this.vanguardText = dragonData.vanguardText;
    this.commandText = dragonData.commandText;

    // Estado dinâmico (muda durante a batalha)
    this.teamId = teamId; // 0 ou 1
    this.slotPosition = slotPosition; // 0, 1, 2 (esquerda, centro, direita)
    this.maxHealth = this.calculateMaxHealth();
    this.currentHealth = this.maxHealth;
    this.isDead = false;
    this.activeEffects = []; // Array de efeitos aplicados
    this.actionLog = []; // Histórico de ações deste character
    this.roundsActive = 0; // Quantas rodadas ele sobreviveu

    // Modificadores de combate
    this.statModifiers = {
      str: 0,
      inst: 0,
      int: 0,
      init: 0
    };

    // Modificadores de efeitos (Advantage, Weakened, Resistance, Vulnerable)
    this.damageBonus = 0;      // % de bônus de dano
    this.damagePenalty = 0;    // % de penalidade de dano
    this.defenseBonus = 0;     // % de redução de dano recebido
    this.defensePenalty = 0;   // % de aumento de dano recebido

    // Habits
    this.parsedHabits = [];    // Array de Habit parseadas
    this.habitRank = 1;        // Rank das habits (1-5, correspondendo a ★2-★10)
  }

  calculateMaxHealth() {
    // Fórmula simples: baseada em STR + INT
    const base = (this.stats.str + this.stats.int) * 2;
    return Math.max(50, base); // Mínimo 50 de vida
  }

  getModifiedStat(statName) {
    const base = this.stats[statName] || 0;
    const modifier = this.statModifiers[statName] || 0;
    return Math.max(0, base + modifier); // Nunca negativo
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
    // effect = { name, duration, magnitude, appliedBy }
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
    // Chamado ao final de cada rodada
    for (let effect of this.activeEffects) {
      effect.duration -= 1;
    }
    // Remove efeitos expirados
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
    // Iniciativa = init modificado
    return this.getModifiedStat('init');
  }

  logAction(action) {
    this.actionLog.push(action);
  }

  // ========================================================================
  // HABITS
  // ========================================================================

  setHabits(parsedHabits) {
    // Carregar habits parseadas
    this.parsedHabits = parsedHabits || [];
  }

  setHabitRank(rank) {
    // Definir rank das habits (1-5)
    this.habitRank = Math.max(1, Math.min(5, rank));
  }

  getHabitsByTrigger(triggerType) {
    // Retorna habits que ativam com um trigger específico
    return this.parsedHabits.filter(habit => habit.triggerType === triggerType);
  }

  getUsableHabits(round, phase) {
    // Retorna habits que podem ser usadas nesta rodada/fase
    return this.parsedHabits.filter(habit => 
      habit.shouldTrigger(round, phase)
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

export { Character };
