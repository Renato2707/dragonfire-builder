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

export const battlePart2 = {
  blockAllowed(character, block) {
    const req = block && block.requires;
    if (!req) return true;
    if (req.command && !this.hasCommand(character, req.command)) return false;
    if (req.troop && this.troopOf(character) !== String(req.troop).toLowerCase().replace(/[\s_-]/g, '')) return false;
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
      const hitType = String(ctx.type || '').toLowerCase();
      const isBasic = !!ctx.basic;
      if (want === 'basic') {
        if (!isBasic) return false;
      } else {
        if (isBasic) return false;
        if (hitType !== want) return false;
        if (req.excludeBasic && isBasic) return false;
      }
    }
    if (req.linkAs) {
      const linked = character.links && character.links[req.linkAs];
      const src = this.damageContext && this.damageContext.linkSource;
      if (!linked || linked !== src) return false;
    }
    if (req.linkEvent) {
      const ev = this.damageContext && this.damageContext.linkEvent;
      const want = String(req.linkEvent).toLowerCase();
      if (want === 'tactical_or_recovery') {
        if (ev !== 'tactical' && ev !== 'recovery') return false;
      } else if (ev !== want) return false;
    }
    return true;
  },
  onceKey(habit, block) {
    const name = (habit && habit.name) || 'kit';
    if (block.onceGroup) return `${name}:${block.onceGroup}`;
    return `${name}:${block.phase}`;
  },
  pendingBlocks(character, habit, blocks) {
    return (blocks || []).filter(block => {
      const key = this.onceKey(habit, block);
      if (block.oncePerCombat && character.oncePerCombatFired && character.oncePerCombatFired[key]) return false;
      if (block.oncePerRound && character.oncePerRoundFired[key]) return false;
      return true;
    });
  },
  consumeOnce(character, habit, block) {
    const key = this.onceKey(habit, block);
    if (block.oncePerRound) character.oncePerRoundFired[key] = true;
    if (block.oncePerCombat) {
      if (!character.oncePerCombatFired) character.oncePerCombatFired = {};
      character.oncePerCombatFired[key] = true;
    }
  },
  blockChanceHits(character, habit, block) {
    if (block.chance == null) return true;
    const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
    let chance = resolveChance({ chance: block.chance }, rankIndex, character);
    const first = (block.actions || [])[0];
    const targets = first ? this.resolveTargets(character, habit, first) : [character];
    const target = targets[0] || character;
    chance = applyChanceIf(chance, block.chanceIf, target, {
      attacker: character,
      prey: this.getPrey(character),
      allies: this.alliesOf(character),
      enemies: this.enemiesOf(character),
      defending: this.isDefending(character)
    });
    const hit = rollChance(chance);
    this.logChanceRoll(habit, target, chance, hit);
    return hit;
  },
  executeVanguard(character) {
    if (character.slotPosition !== POSITIONS.VANGUARD) return;
    const kit = character.vanguardKit;
    if (!kit) return;
    const label = character.commandName
      ? `${character.commandName} (Vanguard)`
      : (kit.name || 'Vanguard');
    this.executeKit(character, kit, PHASES.COMBAT_START, 1, label);
  },
  executeCommand(character) {
    const kit = character.commandKit;
    if (!kit || !canUseAbilities(character)) return;
    const label = character.commandName || kit.name || 'Command';
    const fired = this.executeKit(character, kit, PHASES.TURN, this.currentRound, label);
    if (fired) character.commandUsedThisRound = label;
  },
  executeKit(character, habitLike, phase, round, label) {
    if (!habitLike || typeof habitLike.getBlocksFor !== 'function') return false;
    const blocks = habitLike.getBlocksFor(round, phase).filter(block => this.blockAllowed(character, block));
    const pending = this.pendingBlocks(character, habitLike, blocks);
    if (!pending.length) return false;
    character.lastDamageTargets = [];
    character.lastDamageTarget = null;
    character.lastBuffTarget = null;
    return this.withConfusion(character, () => {
      this.logAction(`${character.name} activates ${label}`);
      for (const block of pending) {
        if ((block.oncePerRound || block.oncePerCombat) && block.onceWhen !== 'success') this.consumeOnce(character, habitLike, block);
        if (!this.blockChanceHits(character, habitLike, block)) continue;
        this.runBlockActions(character, habitLike, block, round);
        if ((block.oncePerRound || block.oncePerCombat) && block.onceWhen === 'success') this.consumeOnce(character, habitLike, block);
      }
      return true;
    });
  },
  executeHabitsForPhase(phase, characters, round) {
    const r = round || (phase === PHASES.COMBAT_START ? 1 : this.currentRound);
    for (const character of characters) {
      if (!character || character.isDead) continue;
      const free = phase === PHASES.COMBAT_START
        || phase === PHASES.ON_SELF_FIRST_DAMAGE
        || phase === PHASES.ON_ALLY_FIRE_DAMAGE
        || phase === PHASES.ON_TAUNT
        || phase === PHASES.ON_LINK_PROC;
      if (!free && !canUseAbilities(character)) continue;
      for (const habit of character.getHabitsForPhase(r, phase)) {
        this.executeHabit(character, habit, phase, r);
      }
    }
  },
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
  },
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
};
