function healAmount(attacker, target, usedRate) {
  const inst = typeof attacker.getModifiedStat === 'function'
    ? attacker.getModifiedStat('inst')
    : 50;
  let amount = Math.max(1, inst * 1.2) * (Number(usedRate) / 100);
  if (typeof attacker.getRecoveryDealtMultiplier === 'function') {
    amount *= attacker.getRecoveryDealtMultiplier();
  }
  if (typeof target.getRecoveryReceivedMultiplier === 'function') {
    amount *= target.getRecoveryReceivedMultiplier();
  }
  return Math.max(1, Math.round(amount));
}

export function applyHealFormula(Battle) {
  if (Battle.prototype.__healFormula) return;
  Battle.prototype.__healFormula = true;
  const orig = Battle.prototype.logActionResult;
  Battle.prototype.logActionResult = function (character, habit, raw, target, actionResult) {
    if (raw && raw.t === 'heal' && actionResult && Array.isArray(actionResult.heals) && target) {
      const rate = actionResult.magnitude != null ? actionResult.magnitude : raw.pct;
      actionResult.heals = actionResult.heals.map(heal => ({
        ...heal,
        amount: healAmount(character, target, rate != null ? rate : 70)
      }));
    }
    return orig.apply(this, arguments);
  };
}
