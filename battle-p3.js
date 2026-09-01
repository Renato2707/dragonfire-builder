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

export const battlePart3 = {
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
  },
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
  },
  executeBasicAttack(attacker, defender, extra = false) {
    const damageType = this.selectDamageType(attacker);
    const rawDamage = calculateFinalDamage(attacker, defender, damageType, 0, { basic: true });
    this.logAction(extra
      ? `${attacker.name} launches a 2nd Basic Attack (Double-Strike)`
      : `${attacker.name} launches a Basic Attack`);
    const actualDamage = this.dealDamage(defender, rawDamage, { type: damageType, basic: true, source: attacker });
    if (!actualDamage) return;
    this.logAction(`Deals ${actualDamage} ${formatDamageTypeName(damageType)} to ${defender.name}`);
    if (defender.isDead) this.logAction(`${defender.name} retreated`);
  },
  selectDamageType(attacker) {
    const str = attacker.getModifiedStat('str');
    const inst = attacker.getModifiedStat('inst');
    const int = attacker.getModifiedStat('int');
    if (str >= inst && str >= int) return 'PHYSICAL';
    if (int >= str && int >= inst) return 'FIRE';
    return 'TACTICAL';
  },
  alliesOf(character) {
    return character.teamId === 0 ? this.teamA : this.teamB;
  },
  enemiesOf(character) {
    return character.teamId === 0 ? this.teamB : this.teamA;
  },
  teamPools(character) {
    const allies = this.alliesOf(character);
    const enemies = this.enemiesOf(character);
    if (!character.confusedThisActivation) return { allies, enemies };
    return {
      allies: enemies.filter(c => c && c !== character),
      enemies: allies.filter(c => c && c !== character)
    };
  },
  confusionFlips(character) {
    const fx = getEffect(character, 'confusion');
    if (!fx) return false;
    const chance = fx.confusionChance != null ? fx.confusionChance : 50;
    const hit = rollChance(chance);
    this.logAction(`[${hit ? 'hit' : 'miss'}] Confusion → ${character.name} (${chance}%)`);
    if (hit) this.logAction(`${character.name} mistakes Allies for Enemies (Confusion)`);
    return hit;
  },
  withConfusion(character, fn) {
    const prev = character.confusedThisActivation;
    character.confusedThisActivation = this.confusionFlips(character);
    try {
      return fn();
    } finally {
      character.confusedThisActivation = prev || false;
    }
  },
  resolveTargets(character, habit, action) {
    const tgt = (action && action.tgt) || habit.targetingParsed;
    if (!tgt || tgt.side === 'self') return [character];
    const pools = this.teamPools(character);
    let targets = selectTargets(character, pools.allies, pools.enemies, tgt);
    if (tgt.slot != null) targets = targets.filter(c => c.slotPosition === Number(tgt.slot));
    return targets;
  },
  matchingPerTarget(character, spec) {
    if (!spec) return [];
    const pool = spec.side === 'enemy'
      ? this.enemiesOf(character)
      : spec.side === 'self'
        ? [character]
        : this.alliesOf(character);
    return pool.filter(c => {
      if (!c || c.isDead) return false;
      if (spec.status && !hasEffect(c, spec.status)) return false;
      if (spec.dealer && getDealerType(c) !== String(spec.dealer).toLowerCase()) return false;
      if (spec.filter && spec.filter.troopsBelow != null && c.getHealthPercentage() >= spec.filter.troopsBelow) return false;
      if (spec.filter && spec.filter.troopsAbove != null && c.getHealthPercentage() <= spec.filter.troopsAbove) return false;
      if (spec.filter && spec.filter.retreatedPreviousRound && !c.retreatedLastRound) return false;
      return true;
    });
  },
  runBlockActions(character, habit, block, round) {
    let times = 1;
    if (block.repeatPer) {
      times = this.matchingPerTarget(character, block.repeatPer).length;
      if (!times) return;
    }
    for (let i = 0; i < times; i += 1) {
      for (const action of block.actions || []) this.runAction(character, habit, action, round);
    }
  },
  logChanceRoll(habit, target, chance, hit) {
    const label = habit && habit.name ? habit.name : 'effect';
    const who = target && target.name ? target.name : 'target';
    this.logAction(`[${hit ? 'hit' : 'miss'}] ${label} → ${who} (${chance}%)`);
  },
  executeHabit(character, habit, phase, round) {
    const r = round || this.currentRound || 1;
    const blocks = (habit.getBlocksFor(r, phase) || []).filter(block => this.blockAllowed(character, block));
    const pending = this.pendingBlocks(character, habit, blocks);
    if (!pending.length) return;
    character.lastBuffTarget = character.lastBuffTarget || null;
    this.withConfusion(character, () => {
      this.logAction(`${character.name} activates ${habit.name}`);
      for (const block of pending) {
        if ((block.oncePerRound || block.oncePerCombat) && block.onceWhen !== 'success') this.consumeOnce(character, habit, block);
        if (!this.blockChanceHits(character, habit, block)) continue;
        this.runBlockActions(character, habit, block, r);
        if ((block.oncePerRound || block.oncePerCombat) && block.onceWhen === 'success') this.consumeOnce(character, habit, block);
      }
    });
  }
};
