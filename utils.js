// utils.js

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollChance(percentage) {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  return Math.random() * 100 < percentage;
}

const DAMAGE_TYPES = {
  PHYSICAL: { name: 'PHYSICAL', causedBy: 'str', mitigatedBy: 'inst', variance: 5 },
  TACTICAL: { name: 'TACTICAL', causedBy: 'inst', mitigatedBy: 'int', variance: 3 },
  FIRE: { name: 'FIRE', causedBy: 'int', mitigatedBy: 'init', variance: 2 }
};

function getDamageTypeConfig(damageType) {
  const type = DAMAGE_TYPES[String(damageType || '').toUpperCase()];
  if (!type) return DAMAGE_TYPES.PHYSICAL;
  return type;
}

function calculateBaseDamage(attacker, damageType) {
  const typeConfig = getDamageTypeConfig(damageType);
  const attackerStat = attacker.getModifiedStat(typeConfig.causedBy);
  const variance = getRandomInt(-typeConfig.variance, typeConfig.variance);
  return Math.max(1, Math.round(attackerStat * 1.2 + variance));
}

function calculateMitigation(defender, damageType) {
  const typeConfig = getDamageTypeConfig(damageType);
  const defenderStat = defender.getModifiedStat(typeConfig.mitigatedBy);
  return Math.min(defenderStat * 0.3, defenderStat * 0.8);
}

function applyDamageMultipliers(baseDamage, attacker, defender, damageType, options = {}) {
  let finalDamage = baseDamage;
  if (attacker.damageBonus) finalDamage *= (1 + attacker.damageBonus / 100);
  if (attacker.damagePenalty) finalDamage *= (1 - attacker.damagePenalty / 100);
  if (defender.defenseBonus) finalDamage *= (1 - defender.defenseBonus / 100);
  if (defender.defensePenalty) finalDamage *= (1 + defender.defensePenalty / 100);
  const flags = { basic: !!options.basic };
  if (typeof attacker.getDealtMultiplier === 'function') {
    finalDamage *= attacker.getDealtMultiplier(damageType, flags);
  }
  if (typeof defender.getReceivedMultiplier === 'function') {
    finalDamage *= defender.getReceivedMultiplier(damageType, flags);
  }
  return finalDamage;
}

function calculateFinalDamage(attacker, defender, damageType, bonusPercent = 0, options = {}) {
  const baseDamage = calculateBaseDamage(attacker, damageType);
  const mitigation = calculateMitigation(defender, damageType);
  let damageMitigated = applyDamageMultipliers(baseDamage - mitigation, attacker, defender, damageType, options);
  if (bonusPercent) damageMitigated *= (1 + bonusPercent / 100);
  return Math.max(1, Math.round(damageMitigated));
}

function hasActiveId(character, id) {
  const want = String(id).toLowerCase();
  return (character.activeEffects || []).some(e => {
    const active = typeof e.isExpired === 'function' ? !e.isExpired() : e.duration > 0;
    const eid = String(e.id || e.name || '').toLowerCase().replace(/-/g, '_');
    return active && eid === want;
  });
}

function sortByInitiative(characters) {
  return [...characters].sort((a, b) => {
    const fa = hasActiveId(a, 'first_strike') ? 1 : 0;
    const fb = hasActiveId(b, 'first_strike') ? 1 : 0;
    if (fa !== fb) return fb - fa;
    const sa = hasActiveId(a, 'slow') ? 1 : 0;
    const sb = hasActiveId(b, 'slow') ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return b.getInitiative() - a.getInitiative();
  });
}

function isTeamAlive(teamCharacters) {
  return teamCharacters.some(c => !c.isDead);
}

export {
  getRandomInt,
  rollChance,
  DAMAGE_TYPES,
  getDamageTypeConfig,
  calculateBaseDamage,
  calculateMitigation,
  applyDamageMultipliers,
  calculateFinalDamage,
  hasActiveId,
  isTeamAlive,
  sortByInitiative
};
