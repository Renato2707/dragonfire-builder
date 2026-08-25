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
    this.logSeparator('Start of Combat');
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
    this.logSeparator(`Start of Round ${this.currentRound}`);
    for (const character of this.allCharacters) updateEffects(character);
    this.executeHabitsForPhase(PHASES.ROUND_START, this.allCharacters, this.currentRound);
  }

  phaseCalculateInitiative() {
    const order = sortByInitiative(this.allCharacters.filter(c => !c.isDead));
    this.logAction(`Turn order: ${order.map(c => c.name).join(' → ')}`);
    return order;
  }

  phaseEndOfRound() {
    for (const character of this.allCharacters) {
      if (!character.isDead) {
        const ticks = processDamageEffects(character, name => this.allCharacters.find(c => c.name === name));
        for (const tick of ticks) {
          if (character.isDead) break;
          if (tryEvade(character)) {
            this.logAction(`${character.name} Evades the ${formatDamageTypeName(tick.damageType)} from ${tick.name}`);
            continue;
          }
          const actual = this.dealDamage(character, tick.amount, { type: tick.damageType, basic: false });
          this.logAction(`${character.name} takes ${actual} ${formatDamageTypeName(tick.damageType)} from ${tick.name}`);
          if (character.isDead) this.logAction(`${character.name} retreated`);
        }
        const recovery = processHealingEffects(character);
        if (recovery > 0) {
          this.logAction(`Applies Recovery to ${character.name} (+${recovery} Troop Capacity)`);
          this.notifyPreyRecovery(character);
        } else if (hasEffect(character, 'nullify_recovery')) {
          const hasHot = (character.activeEffects || []).some(e => e.id === 'recovery' && !e.isExpired());
          if (hasHot) this.logAction(`${character.name} cannot receive Recovery (Nullify Recovery)`);
        }
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

  hasCommand(character, name) {
    if (!name) return false;
    const want = String(name).toLowerCase();
    const kitName = character.commandKit && character.commandKit.name;
    const named = character.commandName;
    return (named && String(named).toLowerCase() === want)
      || (kitName && String(kitName).toLowerCase() === want);
  }

  notifyPreyRecovery(recovered) {
    if (!recovered) return;
    for (const hunter of this.allCharacters) {
      if (!hunter || hunter.isDead) continue;
      if (this.getPrey(hunter) !== recovered) continue;
      this.executeHabitsForPhase(PHASES.ON_PREY_RECOVERY, [hunter], this.currentRound);
    }
  }

  getPrey(character) {
    const linked = character.links && character.links.prey;
    if (linked && !linked.isDead && hasEffect(linked, 'prey')) return linked;
    return this.enemiesOf(character).find(c => c && !c.isDead && hasEffect(c, 'prey')) || null;
  }

  dealDamage(target, amount, info = {}) {
    const actual = target.takeDamage(amount);
    if (actual > 0) this.notifyDamage(target, info);
    return actual;
  }

  notifyDamage(target, info = {}) {
    if (!target) return;
    const type = String(info.type || '').toLowerCase();
    const basic = !!info.basic;
    const firstSelf = !target.receivedDamageThisRound;
    target.receivedDamageThisRound = true;
    const prev = this.damageContext;
    this.damageContext = { type, basic, victim: target };
    try {
      if (firstSelf && !target.isDead) {
        this.executeHabitsForPhase(PHASES.ON_SELF_FIRST_DAMAGE, [target], this.currentRound);
      }
      if (type === 'fire') {
        const allies = this.alliesOf(target).filter(c => c && !c.isDead);
        this.executeHabitsForPhase(PHASES.ON_ALLY_FIRE_DAMAGE, allies, this.currentRound);
      }
    } finally {
      this.damageContext = prev || null;
    }
  }

  hasLeastTroops(character) {
    const hp = character.currentHealth;
    return this.allCharacters.filter(c => c && !c.isDead).every(c => c.currentHealth >= hp);
  }

  blockAllowed(character, block) {
    const req = block && block.requires;
    if (!req) return true;
    if (req.command && !this.hasCommand(character, req.command)) return false;
    if (req.troop && this.troopOf(character) !== req.troop) return false;
    if (req.linkedRetreated) {
      const linked = character.links && character.links[req.linkedRetreated];
      if (!linked || !(linked.retreatedLastRound || linked.isDead)) return false;
    }
    const hp = typeof character.getHealthPercentage === 'function' ? character.getHealthPercentage() : 100;
    if (req.troopsBelow != null && !(hp < Number(req.troopsBelow))) return false;
    if (req.selfHpBelow != null && !(hp < Number(req.selfHpBelow))) return false;
    if (req.selfHpAtLeast != null && !(hp >= Number(req.selfHpAtLeast))) return false;
    if (req.pve != null && !!req.pve !== !!this.pve) return false;
    const prey = this.getPrey(character);
    if (req.noPrey && prey) return false;
    if (req.hasPrey && !prey) return false;
    if (req.preyHpAbove != null) {
      if (!prey || prey.getHealthPercentage() <= Number(req.preyHpAbove)) return false;
    }
    if (req.anyEnemyDealerFire) {
      const hasFire = this.enemiesOf(character).some(c => c && !c.isDead && getDealerType(c) === 'fire');
      if (!hasFire) return false;
    }
    if (req.stacks) {
      const id = req.stacks.id;
      const min = req.stacks.min != null ? req.stacks.min : 1;
      const count = typeof character.getStackCount === 'function' ? character.getStackCount(id) : 0;
      if (count < min) return false;
    }
    if (req.leastTroops && !this.hasLeastTroops(character)) return false;
    if (req.selfStatus && !hasEffect(character, req.selfStatus)) return false;
    if (req.damageType) {
      const ctx = this.damageContext;
      if (!ctx) return false;
      const want = String(req.damageType).toLowerCase();
      if (want === 'basic') {
        if (!ctx.basic) return false;
      } else {
        if (String(ctx.type || '').toLowerCase() !== want) return false;
        if (req.excludeBasic && ctx.basic) return false;
      }
    }
    return true;
  }

  onceKey(habit, block) {
    const req = block.requires ? JSON.stringify(block.requires) : '';
    return `${(habit && habit.name) || 'kit'}:${block.phase}:${req}`;
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
    if (character.slotPosition !== POSITIONS.VANGUARD) return;
    const kit = character.vanguardKit;
    if (!kit) return;
    const label = character.commandName
      ? `${character.commandName} (Vanguard)`
      : (kit.name || 'Vanguard');
    this.executeKit(character, kit, PHASES.COMBAT_START, 1, label);
  }

  executeCommand(character) {
    const kit = character.commandKit;
    if (!kit || !canUseAbilities(character)) return;
    const label = character.commandName || kit.name || 'Command';
    const fired = this.executeKit(character, kit, PHASES.TURN, this.currentRound, label);
    if (fired) character.commandUsedThisRound = label;
  }

  executeKit(character, habitLike, phase, round, label) {
    if (!habitLike || typeof habitLike.getBlocksFor !== 'function') return false;
    const blocks = habitLike.getBlocksFor(round, phase).filter(block => this.blockAllowed(character, block));
    if (!blocks.length) return false;
    return this.withConfusion(character, () => {
      this.logAction(`${character.name} activates ${label}`);
      for (const block of blocks) {
        if (block.oncePerRound) {
          const key = this.onceKey(habitLike, block);
          if (character.oncePerRoundFired[key]) continue;
        }
        if (!this.blockChanceHits(character, habitLike, block)) continue;
        for (const action of block.actions || []) this.runAction(character, habitLike, action, round);
        if (block.oncePerRound) character.oncePerRoundFired[this.onceKey(habitLike, block)] = true;
      }
      return true;
    });
  }

  executeHabitsForPhase(phase, characters, round) {
    const r = round || (phase === PHASES.COMBAT_START ? 1 : this.currentRound);
    for (const character of characters) {
      if (!character || character.isDead) continue;
      const free = phase === PHASES.COMBAT_START
        || phase === PHASES.ON_SELF_FIRST_DAMAGE
        || phase === PHASES.ON_ALLY_FIRE_DAMAGE
        || phase === PHASES.ON_TAUNT;
      if (!free && !canUseAbilities(character)) continue;
      for (const habit of character.getHabitsForPhase(r, phase)) {
        this.executeHabit(character, habit, phase, r);
      }
    }
  }

  executeCharacterAction(character) {
    character.lastCleanse = null;
    if (!canUseAbilities(character)) {
      if (hasEffect(character, 'overwhelm')) {
        this.logAction(`${character.name} cannot activate Commands or Habits (Overwhelm)`);
      }
    } else {
      this.executeCommand(character);
      if (character.isDead) return;
      this.executeHabitsForPhase(PHASES.TURN, [character], this.currentRound);
    }
    if (character.isDead) return;
    if (character.getHealthPercentage() < 50 && canUseAbilities(character)) {
      this.executeHabitsForPhase(PHASES.LOW_HEALTH, [character], this.currentRound);
    }
    if (character.isDead) return;
    this.resolveBasicAttacks(character);
  }

  resolveBasicAttacks(character) {
    if (!canAttack(character)) {
      this.logAction(`${character.name} cannot launch a Basic Attack (Stagger)`);
      return;
    }
    this.performOneBasic(character, false);
    if (character.isDead) return;
    if (!hasEffect(character, 'double_strike')) return;
    if (!canAttack(character)) {
      this.logAction(`${character.name} cannot launch a 2nd Basic Attack (Stagger)`);
      return;
    }
    this.performOneBasic(character, true);
  }

  selectBasicAttackTarget(character) {
    const pools = this.teamPools(character);
    const alive = pools.enemies.filter(c => c && !c.isDead && c !== character);
    if (!alive.length) return null;
    const taunt = getEffect(character, 'taunt');
    if (taunt && taunt.appliedBy) {
      const forced = alive.find(c => c.name === taunt.appliedBy || c.id === taunt.appliedBy);
      if (forced) return forced;
    }
    return alive[Math.floor(Math.random() * alive.length)];
  }

  performOneBasic(character, extra) {
    return this.withConfusion(character, () => {
      const defender = this.selectBasicAttackTarget(character);
      if (!defender) {
        if (character.confusedThisActivation) {
          this.logAction(`${character.name} finds no mistaken target (Confusion)`);
        }
        return false;
      }
      character.lastBasicTarget = defender;
      this.executeBasicAttack(character, defender, extra);
      character.lastDamageTarget = defender;
      if (!character.isDead && canUseAbilities(character)) {
        const kit = character.commandKit;
        const label = character.commandName || (kit && kit.name) || 'Command';
        this.executeKit(character, kit, PHASES.AFTER_BASIC_ATTACK, this.currentRound, label);
        this.executeHabitsForPhase(PHASES.AFTER_BASIC_ATTACK, [character], this.currentRound);
      }
      return true;
    });
  }

  executeBasicAttack(attacker, defender, extra = false) {
    const damageType = this.selectDamageType(attacker);
    const rawDamage = calculateFinalDamage(attacker, defender, damageType, 0, { basic: true });
    this.logAction(extra
      ? `${attacker.name} launches a 2nd Basic Attack (Double-Strike)`
      : `${attacker.name} launches a Basic Attack`);
    if (tryEvade(defender)) {
      this.logAction(`${defender.name} Evades the ${formatDamageTypeName(damageType)}`);
      return;
    }
    const actualDamage = this.dealDamage(defender, rawDamage, { type: damageType, basic: true });
    this.logAction(`Deals ${actualDamage} ${formatDamageTypeName(damageType)} to ${defender.name}`);
    if (defender.isDead) this.logAction(`${defender.name} retreated`);
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

  teamPools(character) {
    const allies = this.alliesOf(character);
    const enemies = this.enemiesOf(character);
    if (!character.confusedThisActivation) return { allies, enemies };
    return {
      allies: enemies.filter(c => c && c !== character),
      enemies: allies.filter(c => c && c !== character)
    };
  }

  confusionFlips(character) {
    const fx = getEffect(character, 'confusion');
    if (!fx) return false;
    const chance = fx.confusionChance != null ? fx.confusionChance : 50;
    const hit = rollChance(chance);
    this.logAction(`[${hit ? 'hit' : 'miss'}] Confusion → ${character.name} (${chance}%)`);
    if (hit) this.logAction(`${character.name} mistakes Allies for Enemies (Confusion)`);
    return hit;
  }

  withConfusion(character, fn) {
    const prev = character.confusedThisActivation;
    character.confusedThisActivation = this.confusionFlips(character);
    try {
      return fn();
    } finally {
      character.confusedThisActivation = prev || false;
    }
  }

  resolveTargets(character, habit, action) {
    const tgt = (action && action.tgt) || habit.targetingParsed;
    if (!tgt || tgt.side === 'self') return [character];
    const pools = this.teamPools(character);
    let targets = selectTargets(character, pools.allies, pools.enemies, tgt);
    if (tgt.slot != null) targets = targets.filter(c => c.slotPosition === Number(tgt.slot));
    return targets;
  }

  matchingPerTarget(character, spec) {
    if (!spec) return [];
    const pools = this.teamPools(character);
    const pool = spec.side === 'enemy' ? pools.enemies : pools.allies;
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
    this.logAction(`[${hit ? 'hit' : 'miss'}] ${label} → ${who} (${chance}%)`);
  }

  executeHabit(character, habit, phase, round) {
    const r = round || this.currentRound || 1;
    const blocks = (habit.getBlocksFor(r, phase) || []).filter(block => this.blockAllowed(character, block));
    if (!blocks.length) return;
    this.withConfusion(character, () => {
      this.logAction(`${character.name} activates ${habit.name}`);
      for (const block of blocks) {
        if (block.oncePerRound) {
          const key = this.onceKey(habit, block);
          if (character.oncePerRoundFired[key]) continue;
        }
        if (!this.blockChanceHits(character, habit, block)) continue;
        for (const action of block.actions || []) this.runAction(character, habit, action, r);
        if (block.oncePerRound) character.oncePerRoundFired[this.onceKey(habit, block)] = true;
      }
    });
  }

  runAction(character, habit, raw, round) {
    if (raw.requires && !this.blockAllowed(character, raw)) return;
    if (raw.t === 'mod_command') {
      const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
      const value = Array.isArray(raw.pct) ? raw.pct[rankIndex] : raw.pct;
      character.commandMods[raw.field] = value;
      this.logAction(`${raw.command || 'Command'} gains: ${raw.field} ${formatSignedPercent(value)}`);
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
        const extras = {
          prey: this.getPrey(character),
          allies: this.alliesOf(character)
        };
        chance = applyChanceIf(chance, raw.chanceIf, target, extras);
        const rolled = chance < 100;
        const hit = !rolled || rollChance(chance);
        if (rolled) this.logChanceRoll(habit, target, chance, hit);
        if (!hit) continue;
        const actionResult = executeHabitAction(habit, { type: raw.t, data: raw }, character, [target], character.habitRank, {
          skipChance: true,
          round,
          prey: extras.prey,
          allies: extras.allies
        });
        this.logActionResult(character, habit, raw, target, actionResult);
        if (raw.tgt && raw.tgt.linkAs) character.links[raw.tgt.linkAs] = target;
        if (actionResult.onReachActions && actionResult.onReachActions.length) {
          for (const item of actionResult.onReachActions) {
            this.logAction(`${character.name} reaches stack threshold`);
            this.runAction(character, habit, item.action, round);
          }
        }
      }
    }
  }

  executeCopyStatus(character, habit, raw) {
    const pools = this.teamPools(character);
    const sourceSide = raw.from && raw.from.side === 'enemy' ? pools.enemies : pools.allies;
    const statuses = (raw.from && raw.from.status) || [];
    let chosen = null;
    let magnitude = null;
    for (const src of sourceSide) {
      for (const st of statuses) {
        if (!hasEffect(src, st)) continue;
        chosen = st;
        const fx = getEffect(src, st);
        if (fx) {
          magnitude = fx.damageBonus || fx.damagePenalty || fx.defenseBonus || fx.defensePenalty || null;
        }
        break;
      }
      if (chosen) break;
    }
    if (!chosen) return;
    const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
    const chance = resolveChance(raw, rankIndex, character);
    for (const target of this.resolveTargets(character, habit, raw)) {
      if (target.isDead) continue;
      const rolled = chance < 100;
      const hit = !rolled || rollChance(chance);
      if (rolled) this.logChanceRoll(habit, target, chance, hit);
      if (!hit) continue;
      const statusName = formatStatusName(chosen);
      const applied = applyEffect(target, chosen.toUpperCase(), character.habitRank, character.name, {
        duration: raw.dur,
        magnitude
      });
      if (!applied) {
        this.logAction(`${target.name} is Immune to ${statusName}`);
        continue;
      }
      const verb = isGrantedStatus(chosen) ? 'Grants' : 'Afflicts';
      const magText = magnitude != null ? ` (${formatSignedPercent(magnitude)})` : '';
      this.logAction(`${verb} ${statusName}${magText} to ${target.name} ${formatDuration(raw.dur)}`);
    }
  }

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
      let st = String(raw.st || '').toLowerCase().replace(/-/g, '_');
      let dur = raw.dur;
      if (raw.ifAlready && raw.ifAlready.st && hasEffect(target, st)) {
        st = String(raw.ifAlready.st).toLowerCase().replace(/-/g, '_');
        if (raw.ifAlready.dur != null) dur = raw.ifAlready.dur;
      }
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
      if (st === 'taunt') {
        character.lastTauntTarget = target;
        this.executeHabitsForPhase(PHASES.ON_TAUNT, [character], this.currentRound);
      }
    } else if (actionType === 'dmg') {
      for (const dmg of actionResult.damages) {
        if (tryEvade(target)) {
          this.logAction(`${target.name} Evades the ${formatDamageTypeName(raw.dt)}`);
          continue;
        }
        const actualDamage = this.dealDamage(target, dmg.amount, { type: raw.dt, basic: false });
        character.lastDamageTarget = target;
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
          this.notifyPreyRecovery(target);
        }
      }
    }
  }

  checkVictory() {
    const teamAAlive = isTeamAlive(this.teamA);
    const teamBAlive = isTeamAlive(this.teamB);
    if (!teamAAlive && !teamBAlive) this.endBattle(null, 'Both teams retreated');
    else if (!teamAAlive) this.endBattle('B', 'Team A retreated');
    else if (!teamBAlive) this.endBattle('A', 'Team B retreated');
  }

  endBattle(winner, reason) {
    this.isActive = false;
    this.isFinished = true;
    this.winner = winner;
    this.endReason = reason;
    this.logSeparator('Combat End');
    this.logInfo(`Round ${this.currentRound}/${this.maxRounds} — ${reason}`);
    this.logInfo(winner === 'A' ? 'Team A is victorious' : winner === 'B' ? 'Team B is victorious' : 'Draw');
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
      this.logAction(`${pos} · ${char.name}: ${formatTroopCapacity(char)}`);
    }
  }

  logRoundSummary() {
    this.logSeparator();
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
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
      .map(e => formatStatusName(e.id || e.name))
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
