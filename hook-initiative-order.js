import { sortByInitiative } from './utils.js';
import { canUseAbilities } from './effects.js';
import { PHASES } from './habitParser.js';

function living(list) {
  return sortByInitiative((list || []).filter(c => c && !c.isDead));
}

function isFreePhase(phase) {
  return phase === PHASES.COMBAT_START
    || phase === PHASES.ROUND_START
    || phase === PHASES.ON_SELF_FIRST_DAMAGE
    || phase === PHASES.ON_ALLY_FIRE_DAMAGE
    || phase === PHASES.ON_TAUNT
    || phase === PHASES.ON_LINK_PROC;
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

  Battle.prototype.executeHabitsForPhase = function (phase, characters, round) {
    const r = round || (phase === PHASES.COMBAT_START ? 1 : this.currentRound);
    const ordered = living(characters);
    for (const character of ordered) {
      if (!character || character.isDead) continue;
      if (!isFreePhase(phase) && !canUseAbilities(character)) continue;
      for (const habit of character.getHabitsForPhase(r, phase)) {
        this.executeHabit(character, habit, phase, r);
      }
    }
  };
}
