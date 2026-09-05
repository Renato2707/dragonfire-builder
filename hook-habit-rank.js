export function applyHabitRanks(Battle) {
  if (Battle.prototype.__habitRanks) return;
  Battle.prototype.__habitRanks = true;
  const orig = Battle.prototype.executeHabit;
  Battle.prototype.executeHabit = function (character, habit, phase, round) {
    const prev = character.habitRank;
    if (character && typeof character.rankFor === 'function') {
      character.habitRank = character.rankFor(habit);
    }
    try {
      return orig.call(this, character, habit, phase, round);
    } finally {
      character.habitRank = prev;
    }
  };
}
