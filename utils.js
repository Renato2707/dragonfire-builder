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
  if (!type) {
    console.warn(`Tipo de dano desconhecido: ${damageType}, usando PHYSICAL`);
    return DAMAGE_TYPES.PHYSICAL;
  }
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

function applyDamageMultipliers(baseDamage, attacker, defender, damageType) {
  let finalDamage = baseDamage;
  if (attacker.damageBonus) finalDamage *= (1 + attacker.damageBonus / 100);
  if (attacker.damagePenalty) finalDamage *= (1 - attacker.damagePenalty / 100);
  if (defender.defenseBonus) finalDamage *= (1 - defender.defenseBonus / 100);
  if (defender.defensePenalty) finalDamage *= (1 + defender.defensePenalty / 100);
  if (typeof attacker.getDealtMultiplier === 'function') {
    finalDamage *= attacker.getDealtMultiplier(damageType);
  }
  if (typeof defender.getReceivedMultiplier === 'function') {
    finalDamage *= defender.getReceivedMultiplier(damageType);
  }
  return finalDamage;
}

function calculateFinalDamage(attacker, defender, damageType, bonusPercent = 0) {
  const baseDamage = calculateBaseDamage(attacker, damageType);
  const mitigation = calculateMitigation(defender, damageType);
  let damageMitigated = applyDamageMultipliers(baseDamage - mitigation, attacker, defender, damageType);
  if (bonusPercent) damageMitigated *= (1 + bonusPercent / 100);
  return Math.max(1, Math.round(damageMitigated));
}

function calculateCriticalChance(attacker) {
  return Math.min(30, Math.max(0, attacker.getModifiedStat('inst') / 4));
}

function getCriticalMultiplier() {
  return 1.5;
}

function rollCritical(critChance) {
  return rollChance(critChance);
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

function getDistance(slot1, slot2) {
  return Math.abs(slot1 - slot2);
}

function isInSameLane(slot1, slot2) {
  return slot1 === slot2;
}

function isAdjacent(slot1, slot2) {
  return getDistance(slot1, slot2) === 1;
}

function getAdjacentSlots(slot) {
  const adjacent = [];
  if (slot > 0) adjacent.push(slot - 1);
  if (slot < 2) adjacent.push(slot + 1);
  return adjacent;
}

function getSlotName(slot) {
  return ['Left', 'Center', 'Right'][slot] || 'Unknown';
}

function validateCharacterTeam(characters) {
  if (!Array.isArray(characters) || characters.length !== 3) return false;
  return characters.every(c => c && c.name && typeof c.currentHealth === 'number');
}

function isTeamAlive(teamCharacters) {
  return teamCharacters.some(c => !c.isDead);
}

function validateDamageType(damageType) {
  return Object.keys(DAMAGE_TYPES).includes(String(damageType || '').toUpperCase());
}

function formatHealth(current, max) {
  return `${Math.round(current)}/${Math.round(max)}`;
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function getHealthColor(healthPercent) {
  if (healthPercent > 75) return 'green';
  if (healthPercent > 50) return 'yellow';
  if (healthPercent > 25) return 'orange';
  return 'red';
}

function formatDamageReport(attacker, defender, damageType, baseDamage, mitigation, finalDamage) {
  return {
    attacker: attacker.name,
    defender: defender.name,
    type: damageType,
    baseDamage: Math.round(baseDamage),
    mitigation: Math.round(mitigation),
    finalDamage: Math.round(finalDamage),
    description: `${attacker.name} (${damageType}) → ${defender.name}: ${Math.round(finalDamage)} dano`
  };
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
  calculateCriticalChance,
  getCriticalMultiplier,
  rollCritical,
  hasActiveId,
  getDistance,
  isInSameLane,
  isAdjacent,
  getAdjacentSlots,
  getSlotName,
  validateCharacterTeam,
  isTeamAlive,
  validateDamageType,
  sortByInitiative,
  formatHealth,
  formatPercent,
  getHealthColor,
  formatDamageReport
};
