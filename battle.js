// battle.js
// Ciclo: combat_start → round_start → turn → básico → after_basic_attack / low_health

import { calculateFinalDamage, sortByInitiative, isTeamAlive } from './utils.js';
import {
  updateEffects,
  processDamageEffects,
  processHealingEffects,
  canAct,
  canAttack,
  applyEffect
} from './effects.js';
import {
  selectTargets,
  getPositionName
} from './positionSystem.js';
import {
  executeHabitAction,
  PHASES
} from './habitParser.js';

class Battle {
  constructor(teamA, teamB, options = {}) {
    this.teamA = teamA;
    this.teamB = teamB;
    this.allCharacters = [...teamA, ...teamB];
    this.maxRounds = options.maxRounds || 10;
    this.verbose = options.verbose !== false;
    this.currentRound = 0;
    this.isActive = false;
    this.isFinished = false;
    this.winner = null;
    this.endReason = '';
    this.battleLog = [];
    this.roundHistory = [];
    this.actionLog = [];
  }

  initialize() {
    this.isActive = true;
    this.currentRound = 0;

    this.logSeparator('BATTLE START');
    this.logInfo(`3v3 Combat - Maximum ${this.maxRounds} rounds`);
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
    this.logSeparator();

    this.executeHabitsForPhase(PHASES.COMBAT_START, this.allCharacters, 1);
  }

  start() {
    this.initialize();
  }

  runRound() {
    if (!this.isActive || this.isFinished) {
      return false;
    }

    this.currentRound += 1;

    if (this.currentRound > this.maxRounds) {
      this.endBattle(null, `Maximum ${this.maxRounds} rounds reached`);
      return false;
    }

    this.phaseStartOfRound();

    if (!isTeamAlive(this.teamA) || !isTeamAlive(this.teamB)) {
      this.checkVictory();
      return false;
    }

    const actionOrder = this.phaseCalculateInitiative();

    for (const character of actionOrder) {
      if (character.isDead) continue;

      if (!canAct(character)) {
        this.logAction(`${character.name} cannot act this turn (${this.getActiveEffectString(character)})`);
        continue;
      }

      this.executeCharacterAction(character);

      if (!isTeamAlive(this.teamA) || !isTeamAlive(this.teamB)) {
        this.checkVictory();
        return false;
      }
    }

    this.phaseEndOfRound();

    if (!isTeamAlive(this.teamA) || !isTeamAlive(this.teamB)) {
      this.checkVictory();
      return false;
    }

    this.logRoundSummary();
    return true;
  }

  phaseStartOfRound() {
    this.logSeparator(`ROUND ${this.currentRound}`);

    for (const character of this.allCharacters) {
      updateEffects(character);
    }

    this.executeHabitsForPhase(PHASES.ROUND_START, this.allCharacters, this.currentRound);
  }

  phaseCalculateInitiative() {
    const alive = this.allCharacters.filter(c => !c.isDead);
    return sortByInitiative(alive);
  }

  phaseEndOfRound() {
    for (const character of this.allCharacters) {
      if (character.isDead) continue;
      processDamageEffects(character);
      processHealingEffects(character);
      if (character.isDead) {
        this.logAction(`💀 ${character.name} fell!`);
      }
    }
  }

  executeHabitsForPhase(phase, characters, round) {
    const r = round || (phase === PHASES.COMBAT_START ? 1 : this.currentRound);
    for (const character of characters) {
      if (!character || character.isDead) continue;
      const habits = character.getHabitsForPhase(r, phase);
      for (const habit of habits) {
        this.executeHabit(character, habit, phase, r);
      }
    }
  }

  executeCharacterAction(character) {
    this.executeHabitsForPhase(PHASES.TURN, [character], this.currentRound);
    if (character.isDead) return;

    if (character.getHealthPercentage() < 50) {
      this.executeHabitsForPhase(PHASES.LOW_HEALTH, [character], this.currentRound);
    }
    if (character.isDead) return;

    if (!canAttack(character)) {
      this.logAction(`${character.name} cannot attack`);
      return;
    }

    const targetTeam = character.teamId === 0 ? this.teamB : this.teamA;
    const alive = targetTeam.filter(c => !c.isDead);
    if (alive.length === 0) return;

    const randomIndex = Math.floor(Math.random() * alive.length);
    this.executeBasicAttack(character, alive[randomIndex]);

    if (!character.isDead) {
      this.executeHabitsForPhase(PHASES.AFTER_BASIC_ATTACK, [character], this.currentRound);
    }
  }

  selectCharacterAction(character) {
    if (!canAttack(character)) {
      return null;
    }
    return {
      type: 'basic_attack',
      name: 'Basic Attack'
    };
  }

  executeBasicAttack(attacker, defender) {
    const damageType = this.selectDamageType(attacker);
    const baseDamage = calculateFinalDamage(attacker, defender, damageType);
    const actualDamage = defender.takeDamage(baseDamage);

    this.logAction(
      `${attacker.name} attacks ${defender.name} (${damageType}): -${actualDamage} HP ` +
      `(${Math.round(defender.currentHealth)}/${Math.round(defender.maxHealth)})`
    );

    attacker.logAction(`Attacked ${defender.name} for ${actualDamage} damage`);

    if (defender.isDead) {
      this.logAction(`💀 ${defender.name} fell!`);
    }

    if (Math.random() * 100 < 30) {
      this.applyRandomEffect(attacker, defender);
    }
  }

  selectDamageType(attacker) {
    const str = attacker.getModifiedStat('str');
    const inst = attacker.getModifiedStat('inst');
    const int = attacker.getModifiedStat('int');

    if (str >= inst && str >= int) return 'PHYSICAL';
    if (int >= str && int >= inst) return 'FIRE';
    return 'TACTICAL';
  }

  applyRandomEffect(attacker, defender) {
    const possibleEffects = ['BURN', 'BLEED', 'VULNERABLE', 'SLOW'];
    const randomEffect = possibleEffects[Math.floor(Math.random() * possibleEffects.length)];
    this.logAction(`  ➜ ${randomEffect} applied to ${defender.name}`);
  }

  resolveTargets(character, habit, action) {
    const tgt = (action && action.tgt) || habit.targetingParsed;
    if (!tgt) {
      return [character];
    }
    if (tgt.side === 'self') {
      return [character];
    }
    const allies = character.teamId === 0 ? this.teamA : this.teamB;
    const enemies = character.teamId === 0 ? this.teamB : this.teamA;
    return selectTargets(character, allies, enemies, tgt);
  }

  executeHabit(character, habit, phase, round) {
    const r = round || this.currentRound || 1;
    const p = phase || PHASES.TURN;
    const blocks = typeof habit.getBlocksFor === 'function'
      ? habit.getBlocksFor(r, p)
      : null;

    const actionEntries = [];
    if (blocks && blocks.length) {
      for (const block of blocks) {
        for (const action of block.actions || []) {
          actionEntries.push({ type: action.t, data: action, phase: block.phase, rounds: block.rounds });
        }
      }
    } else {
      for (const action of habit.parsedActions || []) {
        if (!action.phase || (action.phase === p && (!action.rounds || action.rounds.includes(r)))) {
          actionEntries.push(action);
        }
      }
    }

    if (actionEntries.length === 0) {
      return;
    }

    this.logAction(`${character.name} uses ${habit.name}`);

    for (const action of actionEntries) {
      const raw = action.data || action;
      const targets = this.resolveTargets(character, habit, raw);
      if (targets.length === 0) {
        this.logAction(`  ➜ ${habit.name}: no valid targets`);
        continue;
      }

      const actionResult = executeHabitAction(habit, action, character, targets, character.habitRank);
      const actionType = action.type || (raw && raw.t);

      if (actionType === 'mod' || actionType === 'stack') {
        for (const effect of actionResult.effects) {
          this.logAction(`  ➜ ${effect.log}`);
        }
      } else if (actionType === 'status') {
        const statusType = (raw.st || '').toUpperCase();
        const duration = raw.dur || 2;
        for (const target of targets) {
          if (target.isDead) continue;
          applyEffect(target, statusType, character.habitRank, character.name);
          this.logAction(`  ➜ ${statusType} applied to ${target.name} (${duration} rounds)`);
        }
      } else if (actionType === 'dmg') {
        for (const target of targets) {
          if (target.isDead) continue;
          const damage = actionResult.damages[0] ? actionResult.damages[0].amount : 50;
          const actualDamage = target.takeDamage(damage);
          this.logAction(`  ➜ ${character.name} deals ${actualDamage} damage to ${target.name}`);
          if (target.isDead) {
            this.logAction(`    💀 ${target.name} fell!`);
          }
        }
      } else if (actionType === 'heal') {
        for (const target of targets) {
          if (target.isDead) continue;
          const healing = actionResult.heals[0] ? actionResult.heals[0].amount : 50;
          const actualHealing = target.heal(healing);
          this.logAction(`  ➜ ${character.name} heals ${target.name} for ${actualHealing} HP`);
        }
      } else {
        this.logAction(`  ➜ ${actionType || 'action'} (not fully applied)`);
      }
    }
  }

  executeStartOfCombatHabits() {
    this.executeHabitsForPhase(PHASES.COMBAT_START, this.allCharacters, 1);
  }

  checkVictory() {
    const teamAAlive = isTeamAlive(this.teamA);
    const teamBAlive = isTeamAlive(this.teamB);

    if (!teamAAlive && !teamBAlive) {
      this.endBattle(null, 'Both teams eliminated');
    } else if (!teamAAlive) {
      this.endBattle('B', 'Team A eliminated');
    } else if (!teamBAlive) {
      this.endBattle('A', 'Team B eliminated');
    }
  }

  endBattle(winner, reason) {
    this.isActive = false;
    this.isFinished = true;
    this.winner = winner;
    this.endReason = reason;

    this.logSeparator('BATTLE END');
    this.logInfo(`Round ${this.currentRound}/${this.maxRounds}`);
    this.logInfo(`Reason: ${reason}`);

    if (winner === 'A') {
      this.logInfo('🏆 TEAM A WINS!');
    } else if (winner === 'B') {
      this.logInfo('🏆 TEAM B WINS!');
    } else {
      this.logInfo('⚔️ DRAW - Both teams eliminated or timeout');
    }

    this.logSeparator();
    this.logFinalStatus();
  }

  logSeparator(title = '') {
    const sep = '═══════════════════════════════════════════════════════';
    if (title) {
      this.battleLog.push(sep);
      this.battleLog.push(title);
      this.battleLog.push(sep);
    } else {
      this.battleLog.push(sep);
    }
  }

  logInfo(message) {
    this.battleLog.push(message);
    if (this.verbose) console.log(message);
  }

  logAction(message) {
    this.battleLog.push(`  ${message}`);
    if (this.verbose) console.log(`  ${message}`);
  }

  logTeamStatus(teamName, team) {
    this.logInfo(`${teamName}:`);
    for (const char of team) {
      const status = char.isDead ? '💀 DEAD' : `${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)} HP`;
      this.logAction(`${char.name}: ${status}`);
    }
  }

  logRoundSummary() {
    this.logSeparator();
    this.logTeamStatus('Team A Status', this.teamA);
    this.logTeamStatus('Team B Status', this.teamB);
    this.logSeparator();
  }

  logFinalStatus() {
    this.logInfo('Final Status:');
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
    const survivorsA = this.teamA.filter(c => !c.isDead);
    const survivorsB = this.teamB.filter(c => !c.isDead);
    this.logInfo(`Survivors: Team A: ${survivorsA.length}, Team B: ${survivorsB.length}`);
  }

  getActiveEffectString(character) {
    if (!character.activeEffects || character.activeEffects.length === 0) {
      return 'no effects';
    }
    const effectNames = character.activeEffects
      .filter(e => {
        if (typeof e.isExpired === 'function') return !e.isExpired();
        return e.duration > 0;
      })
      .map(e => e.name)
      .join(', ');
    return effectNames || 'no effects';
  }

  getLog() {
    return this.battleLog.join('\n');
  }

  getResult() {
    return {
      winner: this.winner,
      endReason: this.endReason,
      roundsPlayed: this.currentRound,
      roundsMax: this.maxRounds,
      survivorsA: this.teamA.filter(c => !c.isDead),
      survivorsB: this.teamB.filter(c => !c.isDead),
      log: this.getLog()
    };
  }

  getSummary() {
    const result = this.getResult();
    const winnerName = result.winner === 'A' ? 'Team A' : result.winner === 'B' ? 'Team B' : 'Draw';
    return {
      winner: winnerName,
      rounds: `${result.roundsPlayed}/${result.roundsMax}`,
      teamASurvivors: result.survivorsA.length,
      teamBSurvivors: result.survivorsB.length,
      reason: result.endReason
    };
  }

  isBattleActive() {
    return this.isActive && !this.isFinished;
  }

  getAlliveCharacters() {
    return this.allCharacters.filter(c => !c.isDead);
  }

  getTeamStatus(teamId) {
    const team = teamId === 0 ? this.teamA : this.teamB;
    return {
      alive: team.filter(c => !c.isDead).length,
      dead: team.filter(c => c.isDead).length,
      totalHP: team.reduce((sum, c) => sum + c.currentHealth, 0),
      totalMaxHP: team.reduce((sum, c) => sum + c.maxHealth, 0)
    };
  }

  getCharacterStatus(character) {
    return {
      name: character.name,
      team: character.teamId === 0 ? 'A' : 'B',
      position: getPositionName(character.slotPosition),
      health: Math.round(character.currentHealth),
      maxHealth: Math.round(character.maxHealth),
      healthPercent: character.getHealthPercentage(),
      isDead: character.isDead,
      activeEffects: (character.activeEffects || [])
        .filter(e => {
          if (typeof e.isExpired === 'function') return !e.isExpired();
          return e.duration > 0;
        })
        .map(e => ({ name: e.name, duration: e.duration }))
    };
  }
}

export { Battle };
