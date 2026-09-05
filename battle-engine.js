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
import { battlePart1 } from './battle-p1.js';
import { battlePart2 } from './battle-p2.js';
import { battlePart3 } from './battle-p3.js';
import { battlePart4 } from './battle-p4.js';
import { battlePart5 } from './battle-p5.js';

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
}
Object.assign(Battle.prototype, battlePart1, battlePart2, battlePart3, battlePart4, battlePart5);
export { Battle };
