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
  immunity: 'Immunity',
  nullify_recovery: 'Nullify Recovery'
};

const GRANTED_STATUSES = new Set([
  'first_strike', 'double_strike', 'advantage', 'resistance', 'evade', 'immunity', 'recovery'
]);

const CONTROL_STATUSES = ['stun', 'stagger', 'overwhelm', 'confusion'];

const FIELD_TROOPS = ['cavalry', 'shieldbearers', 'archers', 'spearmen'];
const TROOP_BEATS = {
  cavalry: 'shieldbearers',
  shieldbearers: 'archers',
  archers: 'spearmen',
  spearmen: 'cavalry'
};
const TROOP_ADVANTAGE_PCT = 7;

function normalizeTroopName(troop) {
  return troop ? String(troop).toLowerCase().replace(/[\s_-]/g, '') : null;
}

function troopOf(character) {
  return normalizeTroopName(character && character.troopType);
}

function troopAdvantageSign(atkTroop, defTroop) {
  const atk = normalizeTroopName(atkTroop);
  const def = normalizeTroopName(defTroop);
  if (!atk || !def || atk === def) return 0;
  if (atk === 'siege' && FIELD_TROOPS.includes(def)) return -1;
  if (def === 'siege' && FIELD_TROOPS.includes(atk)) return 1;
  if (TROOP_BEATS[atk] === def) return 1;
  if (TROOP_BEATS[def] === atk) return -1;
  return 0;
}

function troopAdvantageMultiplier(attacker, defender) {
  const sign = troopAdvantageSign(troopOf(attacker), troopOf(defender));
  if (!sign) return 1;
  return 1 + sign * (TROOP_ADVANTAGE_PCT / 100);
}
