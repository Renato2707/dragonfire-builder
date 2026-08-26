// battle.js

import {
  calculateFinalDamage, sortByInitiative, isTeamAlive, rollChance,
  formatStatName, formatDamageTypeName, formatStatusName, formatDuration,
  formatSignedPercent, formatTroopCapacity, isGrantedStatus, formatStackName,
  applyChanceIf
} from './utils.js';
import {
  updateEffects, processDamageEffects, processHealingEffects,
  canAct, canAttack, canUseAbilities, applyEffect, hasEffect, tryEvade, getEffect,
  cleanseCharacter, isImmuneTo
} from './effects.js';
import { selectTargets, getPositionName, POSITIONS, getDealerType } from './positionSystem.js';
import { executeHabitAction, resolveChance, PHASES } from './habitParser.js';

function enhancedNote(stat) {
  return stat ? ` (enhanced by ${formatStatName(stat)})` : '';
}

class Battle {
  constructor(teamA, teamB, options = {}) {
    this.teamA = teamA;
    this.teamB = teamB;
    this.allCharacters = [...teamA, ...teamB];
    this.maxRounds = options.maxRounds || 10;
    this.verbose = options.verbose !== false;
    this.teamTroop = options.teamTroop || [null, null];
    this.pve = !!options.pve;
    this.defendingTeam = options.defendingTeam != null ? Number(options.defendingTeam) : 1;
    this.currentRound = 0;
    this.isActive = false;
    this.isFinished = false;
    this.winner = null;
    this.endReason = '';
    this.battleLog = [];
    this.damageContext = null;
  }

  initialize() {
    this.isActive = true;
    this.currentRound = 0;
    this.applyTeamTroops();
    this.logSeparator('Start of Combat');
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
    this.logSeparator();
    for (const character of this.allCharacters) this.executeVanguard(character);
    this.executeHabitsForPhase(PHASES.COMBAT_START, this.allCharacters, 1);
  }

  applyTeamTroops() {
    for (const character of this.allCharacters) {
      if (!character.troopType && this.teamTroop[character.teamId]) {
        character.troopType = this.teamTroop[character.teamId];
      }
      const pct = typeof character.getTroopAffinityPct === 'function'
        ? character.getTroopAffinityPct()
        : 0;
      if (!pct) continue;
      const troop = this.troopOf(character);
      const label = pct > 0 ? 'Troop Affinity' : 'Troop Weakness';
      this.logAction(`${character.name}: ${label} (${troop}) ${formatSignedPercent(pct)} core stats`);
    }
  }

  start() {
    this.initialize();
  }
