// effects.js

const EFFECTS_CATALOG = {
  BLEED: { id: 'bleed', name: 'Bleed', category: 'damage', description: 'Physical DoT', duration: 2, damageType: 'physical', damagePerRound: 5, stackable: false, stackCap: 1 },
  PANIC: { id: 'panic', name: 'Panic', category: 'damage', description: 'Tactical DoT', duration: 2, damageType: 'tactical', damagePerRound: 5, stackable: false, stackCap: 1 },
  BURN: { id: 'burn', name: 'Burn', category: 'damage', description: 'Fire DoT', duration: 2, damageType: 'fire', damagePerRound: 5, stackable: false, stackCap: 1 },
  FIRST_STRIKE: { id: 'first_strike', name: 'First-Strike', category: 'positive', description: 'Acts first', duration: 1, initiativeModifier: 999, stackable: false, stackCap: 1 },
  DOUBLE_STRIKE: { id: 'double_strike', name: 'Double-Strike', category: 'positive', description: 'Extra basic', duration: 1, extraActions: 1, stackable: false, stackCap: 1 },
  RECOVERY: { id: 'recovery', name: 'Recovery', category: 'positive', description: 'HoT', duration: 2, healPerRound: 15, stackable: false, stackCap: 1 },
  ADVANTAGE: { id: 'advantage', name: 'Advantage', category: 'positive', description: '+damage', duration: 2, damageBonus: 15, stackable: true, stackCap: 5 },
  RESISTANCE: { id: 'resistance', name: 'Resistance', category: 'positive', description: '-received', duration: 2, defenseBonus: 20, stackable: true, stackCap: 5 },
  SLOW: { id: 'slow', name: 'Slow', category: 'negative', description: 'Acts last', duration: 2, initiativeModifier: -999, stackable: false, stackCap: 1 },
  WEAKENED: { id: 'weakened', name: 'Weakened', category: 'negative', description: '-dealt', duration: 2, damagePenalty: 25, stackable: true, stackCap: 3 },
  VULNERABLE: { id: 'vulnerable', name: 'Vulnerable', category: 'negative', description: '+received', duration: 2, defensePenalty: 25, stackable: true, stackCap: 3 },
  PREY: { id: 'prey', name: 'Prey', category: 'negative', description: '-recovery', duration: 2, recoveryPenalty: 50, stackable: false, stackCap: 1 },
  EVADE: { id: 'evade', name: 'Evade', category: 'control', description: 'Ignore hit', duration: 2, evasionChance: 25, stackable: true, stackCap: 3 },
  CLEANSE: { id: 'cleanse', name: 'Cleanse', category: 'control', description: 'Remove effects', duration: 1, removesNegative: true, stackable: false, stackCap: 1, isInstant: true },
  TAUNT: { id: 'taunt', name: 'Taunt', category: 'control', description: 'Force target', duration: 2, forcedTarget: true, stackable: false, stackCap: 1 },
  STUN: { id: 'stun', name: 'Stun', category: 'control', description: 'Cannot act', duration: 1, preventsAllActions: true, stackable: false, stackCap: 1 },
  OVERWHELM: { id: 'overwhelm', name: 'Overwhelm', category: 'control', description: 'No habits/commands', duration: 2, preventsAbilities: true, stackable: false, stackCap: 1 },
  STAGGER: { id: 'stagger', name: 'Stagger', category: 'control', description: 'No basic', duration: 2, preventsAttacks: true, stackable: false, stackCap: 1 },
  CONFUSION: { id: 'confusion', name: 'Confusion', category: 'control', description: 'Friendly fire', duration: 2, confusionChance: 50, stackable: false, stackCap: 1 },
  IMMUNITY: { id: 'immunity', name: 'Immunity', category: 'positive', description: 'Immune to listed statuses', duration: 2, stackable: false, stackCap: 1 }
};

class Effect {
  constructor(effectId, rank = 1, appliedBy = null) {
    const template = EFFECTS_CATALOG[String(effectId).toUpperCase().replace(/-/g, '_')];
    if (!template) throw new Error(`Effect desconhecido: ${effectId}`);
    this.id = template.id;
    this.name = template.name;
    this.category = template.category;
    this.description = template.description;
    this.duration = template.duration;
    this.maxDuration = template.duration;
    this.rank = rank;
    this.appliedBy = appliedBy;
    this.damageType = template.damageType || null;
    this.damagePerRound = template.damagePerRound || 0;
    this.healPerRound = template.healPerRound || 0;
    this.evasionChance = template.evasionChance || 0;
    this.confusionChance = template.confusionChance || 0;
    this.recoveryPenalty = template.recoveryPenalty || 0;
    this.initiativeModifier = template.initiativeModifier || 0;
    this.damageBonus = template.damageBonus || 0;
    this.damagePenalty = template.damagePenalty || 0;
    this.defenseBonus = template.defenseBonus || 0;
    this.defensePenalty = template.defensePenalty || 0;
    this.extraActions = template.extraActions || 0;
    this.stackable = template.stackable;
    this.stackCap = template.stackCap;
    this.isInstant = template.isInstant || false;
    this.preventsAllActions = template.preventsAllActions || false;
    this.preventsAbilities = template.preventsAbilities || false;
    this.preventsAttacks = template.preventsAttacks || false;
    this.forcedTarget = template.forcedTarget || false;
    this.removesNegative = template.removesNegative || false;
    this.immunities = [];
    this.isActive = true;
  }

  tick() {
    if (this.duration > 0) this.duration -= 1;
    return this.duration > 0;
  }

  isExpired() {
    return this.duration <= 0;
  }

  getDescription() {
    return `${this.name} (${this.duration}/${this.maxDuration})`;
  }
}

function applyEffect(character, effectId, rank = 1, appliedBy = null, options = {}) {
  const effect = new Effect(effectId, rank, appliedBy);
  if (options.duration != null) {
    effect.duration = options.duration;
    effect.maxDuration = options.duration;
  }
  if (options.magnitude != null) {
    const mag = Math.abs(options.magnitude);
    if (effect.id === 'weakened') effect.damagePenalty = mag;
    if (effect.id === 'vulnerable') effect.defensePenalty = mag;
    if (effect.id === 'advantage') effect.damageBonus = mag;
    if (effect.id === 'resistance') effect.defenseBonus = mag;
  }
  if (options.immunities) effect.immunities = options.immunities;

  const existing = character.activeEffects.find(e => e.id === effect.id);
  if (existing && effect.stackable) {
    if (existing.rank < effect.stackCap) existing.rank += 1;
    else existing.duration = Math.max(existing.duration, effect.duration);
  } else if (existing && !effect.stackable) {
    existing.duration = Math.max(existing.duration, effect.duration);
  } else {
    character.activeEffects.push(effect);
    applyEffectModifiers(character, effect);
  }
  return effect;
}

function applyEffectModifiers(character, effect) {
  if (effect.damageBonus > 0) character.damageBonus = (character.damageBonus || 0) + effect.damageBonus;
  if (effect.damagePenalty > 0) character.damagePenalty = (character.damagePenalty || 0) + effect.damagePenalty;
  if (effect.defenseBonus > 0) character.defenseBonus = (character.defenseBonus || 0) + effect.defenseBonus;
  if (effect.defensePenalty > 0) character.defensePenalty = (character.defensePenalty || 0) + effect.defensePenalty;
}

function removeEffectModifiers(character, effect) {
  if (effect.damageBonus > 0) character.damageBonus = Math.max(0, (character.damageBonus || 0) - effect.damageBonus);
  if (effect.damagePenalty > 0) character.damagePenalty = Math.max(0, (character.damagePenalty || 0) - effect.damagePenalty);
  if (effect.defenseBonus > 0) character.defenseBonus = Math.max(0, (character.defenseBonus || 0) - effect.defenseBonus);
  if (effect.defensePenalty > 0) character.defensePenalty = Math.max(0, (character.defensePenalty || 0) - effect.defensePenalty);
}

function hasEffect(character, effectId) {
  const want = String(effectId).toLowerCase().replace(/-/g, '_');
  return character.activeEffects.some(e => e.id === want && !e.isExpired());
}

function getEffect(character, effectId) {
  const want = String(effectId).toLowerCase().replace(/-/g, '_');
  return character.activeEffects.find(e => e.id === want && !e.isExpired()) || null;
}

function getEffectsByCategory(character, category) {
  return character.activeEffects.filter(e => e.category === category && !e.isExpired());
}

function getActiveEffectNames(character) {
  return character.activeEffects.filter(e => !e.isExpired()).map(e => e.name);
}

function updateEffects(character) {
  for (const effect of character.activeEffects) {
    if (effect.duration === 1) removeEffectModifiers(character, effect);
    effect.tick();
  }
  character.activeEffects = character.activeEffects.filter(e => !e.isExpired());
}

function processDamageEffects(character) {
  let totalDamage = 0;
  const damageBreakdown = {};
  for (const effect of character.activeEffects) {
    if (effect.category !== 'damage' || effect.isExpired()) continue;
    if (effect.damagePerRound > 0) {
      totalDamage += effect.damagePerRound;
      damageBreakdown[effect.name] = (damageBreakdown[effect.name] || 0) + effect.damagePerRound;
    }
  }
  if (totalDamage > 0) {
    character.takeDamage(totalDamage);
    character.logAction(`DOT DAMAGE: -${totalDamage} HP`);
  }
  return totalDamage;
}

function processHealingEffects(character) {
  let totalHealing = 0;
  for (const effect of character.activeEffects) {
    if (effect.id !== 'recovery' || effect.isExpired()) continue;
    let healing = effect.healPerRound;
    const preyEffect = getEffect(character, 'prey');
    if (preyEffect) healing *= (1 - preyEffect.recoveryPenalty / 100);
    totalHealing += character.heal(Math.round(healing));
  }
  if (totalHealing > 0) character.logAction(`HEALING: +${totalHealing} HP`);
  return totalHealing;
}

function canAct(character) {
  if (character.isDead) return false;
  return !getEffect(character, 'stun');
}

function canUseAbilities(character) {
  if (!canAct(character)) return false;
  return !getEffect(character, 'overwhelm');
}

function canAttack(character) {
  if (!canAct(character)) return false;
  return !getEffect(character, 'stagger');
}

function removeEffect(character, effectId) {
  const effect = getEffect(character, effectId);
  if (!effect) return false;
  removeEffectModifiers(character, effect);
  effect.duration = 0;
  return true;
}

function removeAllNegativeEffects(character) {
  const list = getEffectsByCategory(character, 'negative');
  list.forEach(effect => removeEffect(character, effect.id));
  return list.length;
}

function removeAllPositiveEffects(character) {
  const list = getEffectsByCategory(character, 'positive');
  list.forEach(effect => removeEffect(character, effect.id));
  return list.length;
}

function clearAllEffects(character) {
  const count = character.activeEffects.length;
  character.activeEffects.forEach(effect => removeEffectModifiers(character, effect));
  character.activeEffects = [];
  return count;
}

export {
  EFFECTS_CATALOG,
  Effect,
  applyEffect,
  applyEffectModifiers,
  removeEffectModifiers,
  hasEffect,
  getEffect,
  getEffectsByCategory,
  getActiveEffectNames,
  updateEffects,
  processDamageEffects,
  processHealingEffects,
  canAct,
  canUseAbilities,
  canAttack,
  removeEffect,
  removeAllNegativeEffects,
  removeAllPositiveEffects,
  clearAllEffects
};
