// Official: "if the target Ally retreated in the previous round".
// battle.js also treats a dead linked ally as retreated every later round.
export function applyLinkedRetreated(Battle) {
  const original = Battle.prototype.blockAllowed;
  Battle.prototype.blockAllowed = function (character, block) {
    const req = block && block.requires;
    if (req && req.linkedRetreated) {
      const linked = character.links && character.links[req.linkedRetreated];
      if (!linked || !linked.retreatedLastRound) return false;
    }
    return original.call(this, character, block);
  };
}
