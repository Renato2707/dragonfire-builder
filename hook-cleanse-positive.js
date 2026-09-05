function isCleanseAction(raw) {
  if (!raw) return false;
  if (raw.t === 'cleanse') return true;
  const st = String(raw.st || '').toLowerCase().replace(/-/g, '_');
  return raw.t === 'status' && st === 'cleanse';
}

function livePositives(character) {
  return (character && character.activeEffects || []).filter(effect => {
    if (!effect || effect.category !== 'positive') return false;
    if (typeof effect.isExpired === 'function' && effect.isExpired()) return false;
    return true;
  });
}

function onCleanseStackActions(character, battle) {
  const out = [];
  for (const habit of character.parsedHabits || []) {
    if (typeof character.isHabitUnlocked === 'function' && !character.isHabitUnlocked(habit)) continue;
    for (const block of habit.blocks || []) {
      if (typeof battle.blockAllowed === 'function' && !battle.blockAllowed(character, block)) continue;
      for (const action of block.actions || []) {
        if (!action || action.t !== 'stack') continue;
        const select = action.tgt && action.tgt.select;
        if (block.phase === 'on_cleanse' || select === 'last_cleanse') {
          out.push({ habit, action });
        }
      }
    }
  }
  return out;
}

// Infectious Wrath: one stack per successful positive strip. Polaridade do cleanse
// (remove:positive) já está em effects.cleanseCharacter.
export function applyOnCleanseStack(Battle) {
  if (Battle.prototype.__onCleanseStackHook) return;
  Battle.prototype.__onCleanseStackHook = true;

  const origRun = Battle.prototype.runAction;
  Battle.prototype.runAction = function (character, habit, raw, round) {
    if (
      !this.__applyingOnCleanse
      && raw
      && raw.t === 'stack'
      && raw.tgt
      && raw.tgt.select === 'last_cleanse'
    ) {
      return;
    }
    return origRun.apply(this, arguments);
  };

  const origLog = Battle.prototype.logActionResult;
  Battle.prototype.logActionResult = function (character, habit, raw, target, actionResult) {
    const cleanse = isCleanseAction(raw);
    const before = cleanse && target ? livePositives(target).map(e => e.id) : [];
    origLog.apply(this, arguments);
    if (!cleanse || !target || this.__applyingOnCleanse) return;
    const after = livePositives(target).map(e => e.id);
    if (!before.some(id => !after.includes(id))) return;
    const specs = onCleanseStackActions(character, this);
    if (!specs.length) return;
    this.__applyingOnCleanse = true;
    const round = this.currentRound || 1;
    const prevResolve = this.resolveTargets;
    try {
      this.resolveTargets = function () { return [target]; };
      for (const spec of specs) origRun.call(this, character, spec.habit, spec.action, round);
    } finally {
      this.resolveTargets = prevResolve;
      this.__applyingOnCleanse = false;
    }
  };
}

export { applyOnCleanseStack as applyCleansePositive };
