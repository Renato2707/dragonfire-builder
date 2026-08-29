import { hasEffect } from './effects.js';

function statusId(value) {
  return String(value || '').toLowerCase().replace(/-/g, '_');
}

// Per-target duration from ifBonus.status (Nyrena Undermine: 1 round, 2 if
// that target has Burn). habitParser ifBonus.status also ORs the caster, so
// a burned caster would leak 2-round duration onto unburned targets.
export function applyStatusDuration(Battle) {
  if (Battle.prototype.__statusDurationHook) return;
  Battle.prototype.__statusDurationHook = true;

  const orig = Battle.prototype.runAction;
  Battle.prototype.runAction = function (character, habit, raw, round) {
    const bonus = raw && raw.ifBonus;
    if (!raw || !bonus || bonus.dur == null || bonus.status == null) {
      return orig.apply(this, arguments);
    }
    const targets = this.resolveTargets(character, habit, raw);
    if (!targets.length) return;
    const prevResolve = this.resolveTargets;
    for (const target of targets) {
      if (!target || target.isDead) continue;
      const copy = { ...raw, tgt: raw.tgt ? { ...raw.tgt } : raw.tgt };
      copy.dur = hasEffect(target, statusId(bonus.status)) ? bonus.dur : raw.dur;
      const rest = { ...bonus };
      delete rest.dur;
      delete rest.status;
      delete rest.on;
      if (Object.keys(rest).length) copy.ifBonus = rest;
      else delete copy.ifBonus;
      this.resolveTargets = function () { return [target]; };
      try {
        orig.call(this, character, habit, copy, round);
      } finally {
        this.resolveTargets = prevResolve;
      }
    }
  };
}
