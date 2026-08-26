// test-troop-advantage.js
import {
  troopAdvantageSign,
  troopAdvantageMultiplier,
  TROOP_ADVANTAGE_PCT
} from './utils.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(troopAdvantageSign('cavalry', 'shieldbearers') === 1, 'cavalry beats shieldbearers');
assert(troopAdvantageSign('shieldbearers', 'archers') === 1, 'shieldbearers beat archers');
assert(troopAdvantageSign('archers', 'spearmen') === 1, 'archers beat spearmen');
assert(troopAdvantageSign('spearmen', 'cavalry') === 1, 'spearmen beat cavalry');
assert(troopAdvantageSign('shieldbearers', 'cavalry') === -1, 'shieldbearers lose to cavalry');
assert(troopAdvantageSign('cavalry', 'cavalry') === 0, 'same troop is neutral');
assert(troopAdvantageSign('archers', 'cavalry') === 0, 'archers vs cavalry is off-triangle');
assert(troopAdvantageSign('siege', 'archers') === -1, 'siege loses to field troops');
assert(troopAdvantageSign('archers', 'siege') === 1, 'field troops beat siege');
assert(troopAdvantageSign(null, 'archers') === 0, 'missing troop is neutral');

const atk = { troopType: 'Cavalry' };
const def = { troopType: 'Shieldbearers' };
assert(troopAdvantageMultiplier(atk, def) === 1 + TROOP_ADVANTAGE_PCT / 100, 'advantage multiplies +7%');
assert(troopAdvantageMultiplier(def, atk) === 1 - TROOP_ADVANTAGE_PCT / 100, 'disadvantage multiplies -7%');
assert(troopAdvantageMultiplier({ troopType: 'archers' }, { troopType: 'archers' }) === 1, 'mirror is 1x');

console.log('test-troop-advantage: ok');
