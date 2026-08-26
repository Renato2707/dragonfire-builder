// troopAdvantage.js
// Official triangle (WB): Cavalry > Shieldbearers > Archers > Spearmen > Cavalry.
// Siege loses to every field troop. Magnitude unpublished; ~±7% from dragonfiresim.

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

export {
  FIELD_TROOPS,
  TROOP_BEATS,
  TROOP_ADVANTAGE_PCT,
  normalizeTroopName,
  troopOf,
  troopAdvantageSign,
  troopAdvantageMultiplier
};
