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

export const battlePart5 = {
  logActionResult(character, habit, raw, target, actionResult) {
    const actionType = raw.t;
    const statusId = String(raw.st || '').toLowerCase().replace(/-/g, '_');
    if (actionType === 'cleanse' || (actionType === 'status' && statusId === 'cleanse')) {
      const removed = cleanseCharacter(target, raw);
      if (removed.length) {
        character.lastCleanse = target;
        this.logAction(`Cleanses ${removed.map(formatStatusName).join(', ')} from ${target.name}`);
      } else {
        this.logAction(`Cleanses nothing from ${target.name}`);
      }
      return;
    }
    if (actionType === 'mod' || actionType === 'stack') {
      if (actionResult.effects && actionResult.effects.length) character.lastBuffTarget = target;
      for (const effect of actionResult.effects) {
        if (effect.kind === 'stack') {
          this.logAction(`${effect.target} gains ${effect.added || 1} stack of ${formatStackName(effect.stackId)} (now ${effect.stacks}) ${formatDuration(effect.duration)}${enhancedNote(effect.enhancedBy)}`);
        } else {
          const verb = Number(effect.value) < 0 ? 'Reduces' : 'Increases';
          const basic = effect.excludeBasic ? ' (excluding Basic Attacks)' : '';
          this.logAction(`${verb} ${formatStatName(effect.stat)}${basic} of ${effect.target} by ${formatSignedPercent(effect.value)} ${formatDuration(effect.duration)}${enhancedNote(effect.enhancedBy)}`);
        }
      }
    } else if (actionType === 'status') {
      const magnitude = actionResult.magnitude != null ? actionResult.magnitude : raw.val;
      let st = actionResult.statusType || String(raw.st || '').toLowerCase().replace(/-/g, '_');
      let dur = actionResult.duration != null ? actionResult.duration : raw.dur;
      if (!actionResult.statusType && raw.ifAlready && raw.ifAlready.st && hasEffect(target, st)) {
        st = String(raw.ifAlready.st).toLowerCase().replace(/-/g, '_');
        if (raw.ifAlready.dur != null) dur = raw.ifAlready.dur;
      }
      const converted = !!actionResult.converted || st !== String(raw.st || '').toLowerCase().replace(/-/g, '_');
      const applied = applyEffect(target, st.toUpperCase(), character.habitRank, character.name, {
        duration: dur,
        magnitude,
        damageRate: actionResult.damageRate,
        immunities: raw.immunities
      });
      const statusName = formatStatusName(st);
      if (!applied) {
        this.logAction(`${target.name} is Immune to ${statusName}`);
        return;
      }
      let magText = '';
      if (['advantage', 'weakened', 'vulnerable', 'resistance', 'evade'].includes(st) && magnitude != null) {
        magText = ` (${formatSignedPercent(magnitude)})`;
      } else if (['burn', 'panic', 'bleed'].includes(st) && actionResult.damageRate != null) {
        magText = ` (Damage Rate: ${formatSignedPercent(actionResult.damageRate)})`;
      }
      if (isGrantedStatus(st)) {
        this.logAction(`Grants ${statusName}${magText} to ${target.name} ${formatDuration(dur)}${enhancedNote(raw.scaleStat)}`);
      } else {
        this.logAction(`Afflicts ${target.name} with ${statusName}${magText} ${formatDuration(dur)}${enhancedNote(raw.scaleStat)}`);
      }
      character.lastBuffTarget = target;
      if (st === 'taunt' && !converted) {
        character.lastTauntTarget = target;
        this.executeHabitsForPhase(PHASES.ON_TAUNT, [character], this.currentRound);
      }
      if (raw.onHit) {
        this.runAction(character, habit, {
          ...raw.onHit,
          tgt: raw.onHit.tgt || raw.tgt || { side: 'self' }
        }, this.currentRound);
      }
    } else if (actionType === 'dmg') {
      for (const dmg of actionResult.damages) {
        const actualDamage = this.dealDamage(target, dmg.amount, { type: raw.dt, basic: false, source: character });
        if (!actualDamage) continue;
        character.lastDamageTarget = target;
        character.lastDamageTargets = character.lastDamageTargets || [];
        if (!character.lastDamageTargets.includes(target)) character.lastDamageTargets.push(target);
        this.logAction(`Deals ${actualDamage} ${formatDamageTypeName(raw.dt)} to ${target.name}${enhancedNote(raw.scaleStat)}`);
        if (target.isDead) this.logAction(`${target.name} retreated`);
      }
    } else if (actionType === 'heal') {
      for (const heal of actionResult.heals) {
        const healed = target.heal(heal.amount);
        if (!healed && hasEffect(target, 'nullify_recovery')) {
          this.logAction(`${target.name} cannot receive Recovery (Nullify Recovery)`);
        } else {
          this.logAction(`Applies Recovery to ${target.name} (+${healed} Troop Capacity)${enhancedNote(raw.scaleStat)}`);
          character.lastBuffTarget = target;
          this.notifyPreyRecovery(target);
          this.notifyLinkProc(character, 'recovery');
        }
      }
    }
  },
  checkVictory() {
    const teamAAlive = isTeamAlive(this.teamA);
    const teamBAlive = isTeamAlive(this.teamB);
    if (!teamAAlive && !teamBAlive) this.endBattle(null, 'Both teams retreated');
    else if (!teamAAlive) this.endBattle('B', 'Team A retreated');
    else if (!teamBAlive) this.endBattle('A', 'Team B retreated');
  },
  endBattle(winner, reason) {
    this.isActive = false;
    this.isFinished = true;
    this.winner = winner;
    this.endReason = reason;
    this.logSeparator('Combat End');
    this.logInfo(`Round ${this.currentRound}/${this.maxRounds} — ${reason}`);
    this.logInfo(winner === 'A' ? 'Team A is victorious' : winner === 'B' ? 'Team B is victorious' : 'Draw');
    this.logFinalStatus();
  },
  logSeparator(title = '') {
    const sep = '═'.repeat(55);
    if (title) {
      this.battleLog.push(sep, title, sep);
    } else this.battleLog.push(sep);
  },
  logInfo(message) {
    this.battleLog.push(message);
    if (this.verbose) console.log(message);
  },
  logAction(message) {
    this.battleLog.push(`  ${message}`);
    if (this.verbose) console.log(`  ${message}`);
  },
  logTeamStatus(teamName, team) {
    this.logInfo(`${teamName}:`);
    for (const char of team) {
      const pos = char.positionName || getPositionName(char.slotPosition);
      this.logAction(`${pos} · ${char.name}: ${formatTroopCapacity(char)}`);
    }
  },
  logRoundSummary() {
    this.logSeparator();
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
    this.logSeparator();
  },
  logFinalStatus() {
    this.logInfo('Final Status:');
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
  },
  getActiveEffectString(character) {
    if (!character.activeEffects || !character.activeEffects.length) return 'no effects';
    return character.activeEffects
      .filter(e => (typeof e.isExpired === 'function' ? !e.isExpired() : e.duration > 0))
      .map(e => formatStatusName(e.id || e.name))
      .join(', ') || 'no effects';
  },
  getLog() {
    return this.battleLog.join('\n');
  },
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
  },
  getSummary() {
    const result = this.getResult();
    return {
      winner: result.winner === 'A' ? 'Team A' : result.winner === 'B' ? 'Team B' : 'Draw',
      rounds: `${result.roundsPlayed}/${result.roundsMax}`,
      teamASurvivors: result.survivorsA.length,
      teamBSurvivors: result.survivorsB.length,
      reason: result.endReason
    };
  },
  isBattleActive() {
    return this.isActive && !this.isFinished;
  },
  getTeamStatus(teamId) {
    const team = teamId === 0 ? this.teamA : this.teamB;
    return {
      alive: team.filter(c => !c.isDead).length,
      dead: team.filter(c => c.isDead).length,
      totalHP: team.reduce((sum, c) => sum + c.currentHealth, 0),
      totalMaxHP: team.reduce((sum, c) => sum + c.maxHealth, 0)
    };
  },
  getCharacterStatus(character) {
    return {
      name: character.name,
      team: character.teamId === 0 ? 'A' : 'B',
      position: getPositionName(character.slotPosition),
      health: Math.round(character.currentHealth),
      maxHealth: Math.round(character.maxHealth),
      isDead: character.isDead
    };
  }
};
