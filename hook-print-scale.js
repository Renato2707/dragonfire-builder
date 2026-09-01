import { calculateFinalDamage } from './utils.js';

const PRINT_DAMAGE_SCALE = 2.69;

export function applyPrintDamageScale(Battle) {
  if (Battle.prototype.__printDamageScale) return;
  Battle.prototype.__printDamageScale = true;
  const orig = Battle.prototype.dealDamage;
  Battle.prototype.dealDamage = function (target, amount, info) {
    if (!(amount > 0)) return orig.call(this, target, amount, info);
    return orig.call(this, target, Math.max(1, Math.round(amount * PRINT_DAMAGE_SCALE)), info);
  };
}
