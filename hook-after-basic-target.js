import { PHASES } from './habitParser.js';

// executeKit clears lastDamageTarget, so after_basic_attack cannot select the BA target.
// Official AM commands ("to the target") mean the Basic Attack target (lastBasicTarget).
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
  Battle.prototype.executeKit = function (character, habitLike, phase, round, label) {
    if (phase !== PHASES.AFTER_BASIC_ATTACK) {
      return origKit.apply(this, arguments);
    }
    if (!habitLike || typeof habitLike.getBlocksFor !== 'function') return false;
    const blocks = habitLike.getBlocksFor(round, phase).filter(block => this.blockAllowed(character, block));
    const pending = this.pendingBlocks(character, habitLike, blocks);
    if (!pending.length) return false;
    const ba = character.lastBasicTarget;
    character.lastDamageTarget = ba && !ba.isDead ? ba : null;
    character.lastDamageTargets = character.lastDamageTarget ? [character.lastDamageTarget] : [];
    character.lastBuffTarget = null;
    return this.withConfusion(character, () => {
      this.logAction(`${character.name} activates ${label}`);
      for (const block of pending) {
        if ((block.oncePerRound || block.oncePerCombat) && block.onceWhen !== 'success') this.consumeOnce(character, habitLike, block);
        if (!this.blockChanceHits(character, habitLike, block)) continue;
        this.runBlockActions(character, habitLike, block, round);
        if ((block.oncePerRound || block.oncePerCombat) && block.onceWhen === 'success') this.consumeOnce(character, habitLike, block);
      }
      return true;
    });
  };
}
