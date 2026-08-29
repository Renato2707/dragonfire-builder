function healthPct(character) {
  if (!character || character.isDead) return 0;
  if (typeof character.getHealthPercentage === 'function') return character.getHealthPercentage();
  return 100;
}

// tgt.hpAbove / hpBelow / hpAtLeast (Loyal Bond and similar).
export function applyTargetFilters(Battle) {
  if (Battle.prototype.__targetFiltersHook) return;
  Battle.prototype.__targetFiltersHook = true;
  const orig = Battle.prototype.resolveTargets;
  Battle.prototype.resolveTargets = function (character, habit, action) {
    let targets = orig.apply(this, arguments);
    const tgt = (action && action.tgt) || (habit && habit.targetingParsed);
    if (!tgt) return targets;
    if (tgt.hpAbove != null) {
      const floor = Number(tgt.hpAbove);
      targets = targets.filter(c => healthPct(c) > floor);
    }
    if (tgt.hpAtLeast != null) {
      const floor = Number(tgt.hpAtLeast);
      targets = targets.filter(c => healthPct(c) >= floor);
    }
    if (tgt.hpBelow != null) {
      const ceil = Number(tgt.hpBelow);
      targets = targets.filter(c => healthPct(c) < ceil);
    }
    return targets;
  };
}
