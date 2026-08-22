// battle.js

import { calculateFinalDamage, sortByInitiative, isTeamAlive, rollChance } from './utils.js';
import {
  updateEffects, processDamageEffects, processHealingEffects,
  canAct, canAttack, canUseAbilities, applyEffect, hasEffect
} from './effects.js';
import { selectTargets, getPositionName } from './positionSystem.js';
import { executeHabitAction, resolveChance, PHASES } from './habitParser.js';

class Battle {
  constructor(teamA, teamB, options = {}) {
    this.teamA = teamA;
    this.teamB = teamB;
    this.allCharacters = [...teamA, ...teamB];
    this.maxRounds = options.maxRounds || 10;
    this.verbose = options.verbose !== false;
    this.teamTroop = options.teamTroop || [null, null];
    this.currentRound = 0;
    this.isActive = false;
    this.isFinished = false;
    this.winner = null;
    this.endReason = '';
    this.battleLog = [];
  }

  initialize() {
    this.isActive = true;
    this.currentRound = 0;
    this.logSeparator('BATTLE START');
    this.logInfo(`3v3 Combat - Maximum ${this.maxRounds} rounds`);
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
    this.logSeparator();
    for (const character of this.allCharacters) this.executeVanguard(character);
    this.executeHabitsForPhase(PHASES.COMBAT_START, this.allCharacters, 1);
  }

  start() {
    this.initialize();
  }

  runRound() {
    if (!this.isActive || this.isFinished) return false;
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
    for (const character of this.phaseCalculateInitiative()) {
      if (character.isDead) continue;
      if (!canAct(character)) {
        this.logAction(`${character.name} cannot act (${this.getActiveEffectString(character)})`);
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
    for (const character of this.allCharacters) updateEffects(character);
    this.executeHabitsForPhase(PHASES.ROUND_START, this.allCharacters, this.currentRound);
  }

  phaseCalculateInitiative() {
    return sortByInitiative(this.allCharacters.filter(c => !c.isDead));
  }

  phaseEndOfRound() {
    for (const character of this.allCharacters) {
      if (!character.isDead) {
        processDamageEffects(character);
        processHealingEffects(character);
        if (typeof character.tickPercentMods === 'function') character.tickPercentMods();
      }
    }
    for (const character of this.allCharacters) {
      if (typeof character.advanceRetreatFlags === 'function') character.advanceRetreatFlags();
    }
  }

  troopOf(character) {
    return character.troopType || this.teamTroop[character.teamId] || null;
  }

  blockAllowed(character, block) {
    const req = block.requires;
    if (!req) return true;
    if (req.command && character.commandUsedThisRound !== req.command) return false;
    if (req.troop && this.troopOf(character) !== req.troop) return false;
    if (req.linkedRetreated) {
      const linked = character.links && character.links[req.linkedRetreated];
      if (!linked || !(linked.retreatedLastRound || linked.isDead)) return false;
    }
    return true;
  }

  blockChanceHits(character, habit, block) {
    if (block.chance == null) return true;
    const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
    const chance = resolveChance({ chance: block.chance }, rankIndex, character);
    const first = (block.actions || [])[0];
    const targets = first ? this.resolveTargets(character, habit, first) : [character];
    const target = targets[0] || character;
    const hit = rollChance(chance);
    this.logChanceRoll(habit, target, chance, hit);
    return hit;
  }

  executeVanguard(character) {
    const kit = character.vanguardKit;
    if (!kit) return;
    this.executeKit(character, kit, PHASES.COMBAT_START, 1, 'Vanguard');
  }

  executeCommand(character) {
    const kit = character.commandKit;
    if (!kit || !canUseAbilities(character)) return;
    const fired = this.executeKit(character, kit, PHASES.TURN, this.currentRound, kit.name || 'Command');
    if (fired) character.commandUsedThisRound = kit.name;
  }

  executeKit(character, habitLike, phase, round, label) {
    if (!habitLike || typeof habitLike.getBlocksFor !== 'function') return false;
    const blocks = habitLike.getBlocksFor(round, phase);
    if (!blocks.length) return false;
    this.logAction(`${character.name} uses ${label}`);
    for (const block of blocks) {
      if (!this.blockChanceHits(character, habitLike, block)) continue;
      for (const action of block.actions || []) this.runAction(character, habitLike, action, round);
    }
    return true;
  }

  executeHabitsForPhase(phase, characters, round) {
    const r = round || (phase === PHASES.COMBAT_START ? 1 : this.currentRound);
    for (const character of characters) {
      if (!character || character.isDead) continue;
      if (phase !== PHASES.COMBAT_START && !canUseAbilities(character)) continue;
      for (const habit of character.getHabitsForPhase(r, phase)) {
        this.executeHabit(character, habit, phase, r);
      }
    }
  }

  executeCharacterAction(character) {
    this.executeCommand(character);
    if (character.isDead) return;
    if (canUseAbilities(character)) {
      this.executeHabitsForPhase(PHASES.TURN, [character], this.currentRound);
    }
    if (character.isDead) return;
    if (character.getHealthPercentage() < 50 && canUseAbilities(character)) {
      this.executeHabitsForPhase(PHASES.LOW_HEALTH, [character], this.currentRound);
    }
    if (character.isDead) return;
    if (!canAttack(character)) {
      this.logAction(`${character.name} cannot attack`);
      return;
    }
    const defender = this.selectBasicAttackTarget(character);
    if (!defender) return;
    this.executeBasicAttack(character, defender);
    if (!character.isDead && canUseAbilities(character)) {
      this.executeHabitsForPhase(PHASES.AFTER_BASIC_ATTACK, [character], this.currentRound);
    }
  }

  selectBasicAttackTarget(character) {
    const alive = this.enemiesOf(character).filter(c => !c.isDead);
    if (!alive.length) return null;
    const taunters = alive.filter(c => hasEffect(c, 'taunt'));
    return taunters[0] || alive[Math.floor(Math.random() * alive.length)];
  }

  executeBasicAttack(attacker, defender) {
    const damageType = this.selectDamageType(attacker);
    const actualDamage = defender.takeDamage(calculateFinalDamage(attacker, defender, damageType, 0, { basic: true }));
    this.logAction(`${attacker.name} attacks ${defender.name} (${damageType}): -${actualDamage} HP`);
    if (defender.isDead) this.logAction(`${defender.name} fell`);
  }

  selectDamageType(attacker) {
    const str = attacker.getModifiedStat('str');
    const inst = attacker.getModifiedStat('inst');
    const int = attacker.getModifiedStat('int');
    if (str >= inst && str >= int) return 'PHYSICAL';
    if (int >= str && int >= inst) return 'FIRE';
    return 'TACTICAL';
  }

  alliesOf(character) {
    return character.teamId === 0 ? this.teamA : this.teamB;
  }

  enemiesOf(character) {
    return character.teamId === 0 ? this.teamB : this.teamA;
  }

  resolveTargets(character, habit, action) {
    const tgt = (action && action.tgt) || habit.targetingParsed;
    if (!tgt || tgt.side === 'self') return [character];
    let targets = selectTargets(character, this.alliesOf(character), this.enemiesOf(character), tgt);
    if (tgt.slot != null) targets = targets.filter(c => c.slotPosition === Number(tgt.slot));
    return targets;
  }

  matchingPerTarget(character, spec) {
    if (!spec) return [];
    const pool = spec.side === 'enemy' ? this.enemiesOf(character) : this.alliesOf(character);
    return pool.filter(c => {
      if (!c) return false;
      if (spec.filter && spec.filter.troopsBelow != null && c.getHealthPercentage() >= spec.filter.troopsBelow) return false;
      if (spec.filter && spec.filter.troopsAbove != null && c.getHealthPercentage() <= spec.filter.troopsAbove) return false;
      if (spec.filter && spec.filter.retreatedPreviousRound && !c.retreatedLastRound) return false;
      return true;
    });
  }

  logChanceRoll(habit, target, chance, hit) {
    const label = habit && habit.name ? habit.name : 'effect';
    const who = target && target.name ? target.name : 'target';
    this.logAction(`  [${hit ? 'hit' : 'miss'}] ${label} → ${who} (${chance}%)`);
  }

  executeHabit(character, habit, phase, round) {
    const r = round || this.currentRound || 1;
    const blocks = (habit.getBlocksFor(r, phase) || []).filter(block => this.blockAllowed(character, block));
    if (!blocks.length) return;
    this.logAction(`${character.name} uses ${habit.name}`);
    for (const block of blocks) {
      if (!this.blockChanceHits(character, habit, block)) continue;
      for (const action of block.actions || []) this.runAction(character, habit, action, r);
    }
  }

  runAction(character, habit, raw, round) {
    if (raw.t === 'mod_command') {
      const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
      const value = Array.isArray(raw.pct) ? raw.pct[rankIndex] : raw.pct;
      character.commandMods[raw.field] = value;
      this.logAction(`  ➜ ${raw.command || 'command'} ${raw.field} = ${value}`);
      return;
    }
    if (raw.t === 'copy_status') {
      this.executeCopyStatus(character, habit, raw);
      return;
    }
    let repeats = 1;
    if (raw.perTarget) {
      repeats = this.matchingPerTarget(character, raw.perTarget).length;
      if (!repeats) return;
    }
    const targets = this.resolveTargets(character, habit, raw);
    if (!targets.length) return;
    const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
    for (let i = 0; i < repeats; i += 1) {
      for (const target of targets) {
        if (target.isDead) continue;
        let chance = resolveChance(raw, rankIndex, character);
        if (raw.chanceIf && raw.chanceIf.taunt && hasEffect(target, 'taunt')) chance *= raw.chanceIf.taunt;
        const rolled = chance < 100;
        const hit = !rolled || rollChance(chance);
        if (rolled) this.logChanceRoll(habit, target, chance, hit);
        if (!hit) continue;
        const actionResult = executeHabitAction(habit, { type: raw.t, data: raw }, character, [target], character.habitRank, {
          skipChance: true,
          round
        });
        this.logActionResult(character, habit, raw, target, actionResult);
      }
    }
  }

  executeCopyStatus(character, habit, raw) {
    const sourceSide = raw.from && raw.from.side === 'enemy' ? this.enemiesOf(character) : this.alliesOf(character);
    const statuses = (raw.from && raw.from.status) || [];
    const present = [];
    for (const src of sourceSide) {
      for (const st of statuses) if (hasEffect(src, st)) present.push(st);
    }
    if (!present.length) return;
    const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
    const chance = resolveChance(raw, rankIndex, character);
    for (const target of this.resolveTargets(character, habit, raw)) {
      if (target.isDead) continue;
      const rolled = chance < 100;
      const hit = !rolled || rollChance(chance);
      if (rolled) this.logChanceRoll(habit, target, chance, hit);
      if (!hit) continue;
      applyEffect(target, present[0].toUpperCase(), character.habitRank, character.name, { duration: raw.dur });
      this.logAction(`  ➜ copied ${present[0]} to ${target.name}`);
    }
  }

  logActionResult(character, habit, raw, target, actionResult) {
    const actionType = raw.t;
    if (actionType === 'mod' || actionType === 'stack') {
      for (const effect of actionResult.effects) this.logAction(`  ➜ ${effect.log}`);
    } else if (actionType === 'status') {
      applyEffect(target, (raw.st || '').toUpperCase(), character.habitRank, character.name, {
        duration: raw.dur,
        magnitude: raw.val,
        immunities: raw.immunities
      });
      this.logAction(`  ➜ ${(raw.st || '').toUpperCase()} applied to ${target.name}`);
    } else if (actionType === 'dmg') {
      for (const dmg of actionResult.damages) {
        const actualDamage = target.takeDamage(dmg.amount);
        this.logAction(`  ➜ ${character.name} deals ${actualDamage} ${(raw.dt || '').toUpperCase()} to ${target.name}`);
        if (target.isDead) this.logAction(`    ${target.name} fell`);
      }
    } else if (actionType === 'heal') {
      for (const heal of actionResult.heals) {
        this.logAction(`  ➜ ${character.name} heals ${target.name} for ${target.heal(heal.amount)} HP`);
      }
    }
  }

  checkVictory() {
    const teamAAlive = isTeamAlive(this.teamA);
    const teamBAlive = isTeamAlive(this.teamB);
    if (!teamAAlive && !teamBAlive) this.endBattle(null, 'Both teams eliminated');
    else if (!teamAAlive) this.endBattle('B', 'Team A eliminated');
    else if (!teamBAlive) this.endBattle('A', 'Team B eliminated');
  }

  endBattle(winner, reason) {
    this.isActive = false;
    this.isFinished = true;
    this.winner = winner;
    this.endReason = reason;
    this.logSeparator('BATTLE END');
    this.logInfo(`Round ${this.currentRound}/${this.maxRounds} — ${reason}`);
    this.logInfo(winner === 'A' ? 'TEAM A WINS' : winner === 'B' ? 'TEAM B WINS' : 'DRAW');
    this.logFinalStatus();
  }

  logSeparator(title = '') {
    const sep = '═'.repeat(55);
    if (title) {
      this.battleLog.push(sep, title, sep);
    } else this.battleLog.push(sep);
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
      const pos = char.positionName || getPositionName(char.slotPosition);
      this.logAction(`${pos} · ${char.name}: ${char.isDead ? 'down' : `${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)} HP`}`);
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
  }

  getActiveEffectString(character) {
    if (!character.activeEffects || !character.activeEffects.length) return 'no effects';
    return character.activeEffects
      .filter(e => (typeof e.isExpired === 'function' ? !e.isExpired() : e.duration > 0))
      .map(e => e.name)
      .join(', ') || 'no effects';
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
    return {
      winner: result.winner === 'A' ? 'Team A' : result.winner === 'B' ? 'Team B' : 'Draw',
      rounds: `${result.roundsPlayed}/${result.roundsMax}`,
      teamASurvivors: result.survivorsA.length,
      teamBSurvivors: result.survivorsB.length,
      reason: result.endReason
    };
  }

  isBattleActive() {
    return this.isActive && !this.isFinished;
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
      isDead: character.isDead
    };
  }
}

export { Battle };
