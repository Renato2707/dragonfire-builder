import { statusConditionMet } from './utils.js';

function statusId(value) {
  return String(value || '').toLowerCase().replace(/-/g, '_');
}

// Per-target ifBonus on dmg.
// Rhysarion Dawnsong: ifBonus.status:control (fire 20% → 30% / 1.5x) only if
// THE TARGET has Control. habitParser ORs the caster, so a Staggered caster
// would 1.5x every target.
// Seasmoke Infectious Wrath: ifBonus.on:target status:panic (physical 30% → 60%).
export function applyControlIfBonus(Battle) {
  if (Battle.prototype.__controlIfBonusHook) return;
  Battle.prototype.__controlIfBonusHook = true;

  const orig = Battle.prototype.runAction;
  Battle.prototype.runAction = function (character, habit, raw, round) {
    const bonus = raw && raw.ifBonus;
    const want = bonus && statusId(bonus.status);
    const perTarget = !!(bonus && (
      want === 'control' || String(bonus.on || '').toLowerCase() === 'target'
    ));
    if (
      !raw
      || raw.t !== 'dmg'
      || !bonus
      || !perTarget
      || bonus.on === 'self'
      || (bonus.pct == null && bonus.mult == null)
    ) {
      return orig.apply(this, arguments);
    }
    const targets = this.resolveTargets(character, habit, raw);
    if (!targets.length) return;
    const prevResolve = this.resolveTargets;
    for (const target of targets) {
      if (!target || target.isDead) continue;
      const copy = { ...raw, tgt: raw.tgt ? { ...raw.tgt } : raw.tgt };
      if (!statusConditionMet(target, bonus.status)) delete copy.ifBonus;
      this.resolveTargets = function () { return [target]; };
      try {
        orig.call(this, character, habit, copy, round);
      } finally {
        this.resolveTargets = prevResolve;
      }
    }
  };
}
