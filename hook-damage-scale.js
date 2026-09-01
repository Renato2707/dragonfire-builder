import { calculateTroopCapacity } from './troopCapacity.js';

const TROOP_DAMAGE_REF = 2400;
const TROOP_SCALE_FLOOR = 6500;

export function applyDamageTroopScale(Battle) {
  if (Battle.prototype.__damageTroopScale) return;
  Battle.prototype.__damageTroopScale = true;
  const orig = Battle.prototype.dealDamage;
  Battle.prototype.dealDamage = function (target, amount, info) {
    const source = info && info.source;
    const formulaCap = source
      ? calculateTroopCapacity(source.level, source.stars)
      : 0;
    let scaled = amount;
    if (source && formulaCap >= TROOP_SCALE_FLOOR && amount > 0) {
      scaled = Math.max(1, Math.round(amount * (formulaCap / TROOP_DAMAGE_REF)));
    }
    return orig.call(this, target, scaled, info);
  };
}
