import { calculateTroopCapacity } from './troopCapacity.js';

const REF = 2400;
const FLOOR = 6500;

export function applyPrintDamageScale(Battle) {
  if (Battle.prototype.__printDamageScale) return;
  Battle.prototype.__printDamageScale = true;
  const orig = Battle.prototype.dealDamage;
  Battle.prototype.dealDamage = function (target, amount, info) {
    const source = info && info.source;
    const cap = source ? calculateTroopCapacity(source.level, source.stars) : 0;
    let scaled = amount;
    if (source && cap >= FLOOR && amount > 0) {
      scaled = Math.max(1, Math.round(amount * (cap / REF)));
    }
    return orig.call(this, target, scaled, info);
  };
}
