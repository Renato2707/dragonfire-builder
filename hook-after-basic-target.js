import { PHASES } from './habitParser.js';

// executeKit clears lastDamageTarget. Official AM "to the target" is lastBasicTarget.
// Restore that target inside withConfusion (after the clear) instead of cloning executeKit.
export function applyAfterBasicTarget(Battle) {
  if (Battle.prototype.__afterBasicTargetHook) return;
  Battle.prototype.__afterBasicTargetHook = true;

  const origResolve = Battle.prototype.resolveTargets;
  Battle.prototype.resolveTargets = function (character, habit, action) {
    const tgt = (action && action.tgt) || (habit && habit.targetingParsed);
    const select = tgt && String(tgt.select || '');
    if (select === 'last_basic' || select === 'ba_target' || select === 'last_basic_target') {
      const last = character && character.lastBasicTarget;
      if (!last || last.isDead) return [];
      return [last];
    }
    return origResolve.call(this, character, habit, action);
  };

  const origKit = Battle.prototype.executeKit;
  Battle.prototype.executeKit = function (character, habitLike, phase) {
    const prev = this._afterBasicTarget;
    if (phase === PHASES.AFTER_BASIC_ATTACK && character && character.lastBasicTarget && !character.lastBasicTarget.isDead) {
      this._afterBasicTarget = character.lastBasicTarget;
    } else {
      this._afterBasicTarget = null;
    }
    try {
      return origKit.apply(this, arguments);
    } finally {
      this._afterBasicTarget = prev || null;
    }
  };

  const origConfuse = Battle.prototype.withConfusion;
  Battle.prototype.withConfusion = function (character, fn) {
    const ba = this._afterBasicTarget;
    if (ba && character && !ba.isDead) {
      character.lastDamageTarget = ba;
      character.lastDamageTargets = [ba];
    }
    return origConfuse.call(this, character, fn);
  };
}
