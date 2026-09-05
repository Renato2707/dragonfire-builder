import { statusConditionMet } from './utils.js';

function statusId(value) {
  return String(value || '').toLowerCase().replace(/-/g, '_');
}

function bonusOnTarget(bonus) {
  if (!bonus || bonus.on === 'self') return false;
  if (String(bonus.on || '').toLowerCase() === 'target') return true;
  if (bonus.dur != null && bonus.status != null) return true;
  const want = statusId(bonus.status);
  return want === 'control' || want === 'burn' || want === 'panic' || want === 'bleed';
}

function needsSplit(raw) {
  const bonus = raw && raw.ifBonus;
  if (!raw || !bonus || !bonusOnTarget(bonus)) return false;
  return bonus.dur != null || bonus.pct != null || bonus.mult != null;
}

function actionForTarget(raw, target) {
  const bonus = raw.ifBonus;
  const copy = { ...raw, tgt: raw.tgt ? { ...raw.tgt } : raw.tgt };
  const met = bonus.status ? statusConditionMet(target, bonus.status) : false;
  if (bonus.dur != null && bonus.status) {
    copy.dur = met ? bonus.dur : raw.dur;
  }
  const rest = { ...bonus };
  delete rest.dur;
  delete rest.on;
  if (bonus.dur != null) delete rest.status;
  if (!met && (rest.pct != null || rest.mult != null) && bonus.status) {
    delete copy.ifBonus;
    return copy;
  }
  if (Object.keys(rest).length) copy.ifBonus = rest;
  else delete copy.ifBonus;
  return copy;
}

// One per-target ifBonus pass: duration (Nyrena Burn) and rate (Rhysarion Control / Seasmoke Panic).
export function applyIfBonusTarget(Battle) {
  if (Battle.prototype.__ifBonusTargetHook) return;
  Battle.prototype.__ifBonusTargetHook = true;
  const orig = Battle.prototype.runAction;
  Battle.prototype.runAction = function (character, habit, raw, round) {
    if (!needsSplit(raw)) return orig.apply(this, arguments);
    const targets = this.resolveTargets(character, habit, raw);
    if (!targets.length) return;
    const prevResolve = this.resolveTargets;
    for (const target of targets) {
      if (!target || target.isDead) continue;
      this.resolveTargets = function () { return [target]; };
      try {
        orig.call(this, character, habit, actionForTarget(raw, target), round);
      } finally {
        this.resolveTargets = prevResolve;
      }
    }
  };
}
