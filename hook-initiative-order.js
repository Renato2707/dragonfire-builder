import { sortByInitiative } from './utils.js';
import { PHASES } from './habitParser.js';

function living(list) {
  return sortByInitiative((list || []).filter(c => c && !c.isDead));
}

export function applyInitiativeOrder(Battle) {
  Battle.prototype.initialize = function () {
    this.isActive = true;
    this.currentRound = 0;
    this.logSeparator('Start of Combat');
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
    this.logSeparator();
    const order = living(this.allCharacters);
    this.logAction(`Turn order: ${order.map(c => c.name).join(' → ')}`);
    for (const character of order) this.executeVanguard(character);
    this.executeHabitsForPhase(PHASES.COMBAT_START, order, 1);
  };

  const origHabits = Battle.prototype.executeHabitsForPhase;
  Battle.prototype.executeHabitsForPhase = function (phase, characters, round) {
    return origHabits.call(this, phase, living(characters), round);
  };
}
