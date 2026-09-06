// Official: "for each Enemy that retreated in the previous round".
// battle.js matchingPerTarget skips isDead, so a retreated enemy never matches.
export function applyRetreatedPerTarget(Battle) {
  if (Battle.prototype.__retreatedPerTargetHook) return;
  Battle.prototype.__retreatedPerTargetHook = true;
  const original = Battle.prototype.matchingPerTarget;
  Battle.prototype.matchingPerTarget = function (character, spec) {
    if (spec && spec.filter && spec.filter.retreatedPreviousRound) {
      const pool = spec.side === 'enemy'
        ? this.enemiesOf(character)
        : spec.side === 'self'
          ? [character]
          : this.alliesOf(character);
      return pool.filter(c => c && c.retreatedLastRound);
    }
    return original.call(this, character, spec);
  };
}
