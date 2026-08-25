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

const STAT_NAMES = {
  str: 'Strength',
  int: 'Intelligence',
  inst: 'Instinct',
  init: 'Initiative',
  dmg_dealt: 'Damage Dealt',
  dmg_received: 'Damage Received',
  fire_dealt: 'Fire Damage Dealt',
  fire_received: 'Fire Damage Received',
  physical_dealt: 'Physical Damage Dealt',
  physical_received: 'Physical Damage Received',
  tactical_dealt: 'Tactical Damage Dealt',
  tactical_received: 'Tactical Damage Received',
  recovery_dealt: 'Recovery Dealt',
  recovery_received: 'Recovery Received'
};

const STATUS_NAMES = {
  bleed: 'Bleed',
  panic: 'Panic',
  burn: 'Burn',
  first_strike: 'First-Strike',
  double_strike: 'Double-Strike',
  recovery: 'Recovery',
  advantage: 'Advantage',
  resistance: 'Resistance',
  slow: 'Slow',
  weakened: 'Weakened',
  vulnerable: 'Vulnerable',
  prey: 'Prey',
  evade: 'Evade',
  taunt: 'Taunt',
  stun: 'Stun',
  overwhelm: 'Overwhelm',
  stagger: 'Stagger',
  confusion: 'Confusion',
  immunity: 'Immunity'
};

const GRANTED_STATUSES = new Set([
  'first_strike', 'double_strike', 'advantage', 'resistance', 'evade', 'immunity', 'recovery'
]);

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

function statusId(name) {
  return String(name || '').toLowerCase().replace(/-/g, '_');
}

function formatStatName(stat) {
  return STAT_NAMES[stat] || String(stat || '').replace(/_/g, ' ');
}

function formatDamageTypeName(damageType) {
  const type = String(damageType || '').toUpperCase();
  if (type === 'FIRE') return 'Fire Damage';
  if (type === 'TACTICAL') return 'Tactical Damage';
  if (type === 'BASIC') return 'Basic Attack';
  return 'Physical Damage';
}

function formatStatusName(status) {
  const id = statusId(status);
  if (STATUS_NAMES[id]) return STATUS_NAMES[id];
  return id.split('_').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatDuration(duration) {
  if (duration === 'combat' || duration == null) return 'until the end of combat';
  const rounds = Number(duration);
  if (rounds === 1) return 'until the end of the round';
  return `for ${rounds} round(s)`;
}

function formatSignedPercent(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  if (amount > 0) return `+${amount}%`;
  return `${amount}%`;
}

function formatTroopCapacity(character) {
  if (!character || character.isDead) return 'retreated';
  return `${Math.round(character.currentHealth)}/${Math.round(character.maxHealth)} Troop Capacity`;
}

function isGrantedStatus(status) {
  return GRANTED_STATUSES.has(statusId(status));
}

function formatStackName(id) {
  return String(id || 'stack').split('_').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export {
  getRandomInt,
  rollChance,
  DAMAGE_TYPES,
  STAT_NAMES,
  STATUS_NAMES,
  getDamageTypeConfig,
  calculateBaseDamage,
  calculateMitigation,
  applyDamageMultipliers,
  calculateFinalDamage,
  hasActiveId,
  isTeamAlive,
  sortByInitiative,
  formatStatName,
  formatDamageTypeName,
  formatStatusName,
  formatDuration,
  formatSignedPercent,
  formatTroopCapacity,
  isGrantedStatus,
  formatStackName,
  statusId
};
