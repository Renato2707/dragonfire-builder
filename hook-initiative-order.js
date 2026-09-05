import { sortByInitiative } from './utils.js';
import { PHASES } from './habitParser.js';

function living(list) {
  return sortByInitiative((list || []).filter(c => c && !c.isDead));
}

export function applyInitiativeOrder(Battle) {
  if (Battle.prototype.__initiativeOrderHook) return;
  Battle.prototype.__initiativeOrderHook = true;

  Battle.prototype.initialize = function () {
    this.isActive = true;
    this.currentRound = 0;
    if (typeof this.stampTeamTroops === 'function') this.stampTeamTroops();
    this.logSeparator('Start of Combat');
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
    if (typeof this.logTroopAffinity === 'function') this.logTroopAffinity();
    this.logSeparator();
    const order = living(this.allCharacters);
    for (const character of order) this.executeVanguard(character);
    this.executeHabitsForPhase(PHASES.COMBAT_START, order, 1);
  };

  const origPhase = Battle.prototype.executeHabitsForPhase;
  Battle.prototype.executeHabitsForPhase = function (phase, characters, round) {
    return origPhase.call(this, phase, living(characters), round);
  };
}
