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

export const battlePart4 = {
  runAction(character, habit, raw, round) {
    if (raw.requires && !this.blockAllowed(character, raw)) return;
    if (raw.t === 'mod_command') {
      const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
      const value = Array.isArray(raw.pct) ? raw.pct[rankIndex] : raw.pct;
      character.commandMods[raw.field] = {
        value,
        duration: raw.dur == null ? 1 : raw.dur
      };
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
          attacker: character,
          prey: this.getPrey(character),
          allies: this.alliesOf(character),
          enemies: this.enemiesOf(character),
          defending: this.isDefending(character)
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
          allies: extras.allies,
          enemies: extras.enemies,
          defending: extras.defending
        });
        this.logActionResult(character, habit, raw, target, actionResult);
        if (raw.tgt && raw.tgt.linkAs) character.links[raw.tgt.linkAs] = target;
        if (actionResult.onReachActions && actionResult.onReachActions.length) {
          for (const item of actionResult.onReachActions) {
            this.logAction(`${character.name} reaches ${item.threshold} stack(s) of ${formatStackName(item.stackId)}`);
            this.runAction(character, habit, item.action, round);
          }
        }
      }
    }
  },
  executeCopyStatus(character, habit, raw) {
    const pools = this.teamPools(character);
    const sourceSide = ((raw.from && raw.from.side === 'enemy') ? pools.enemies : pools.allies)
      .filter(c => c && !c.isDead);
    const statuses = [].concat((raw.from && raw.from.status) || [])
      .map(s => String(s).toLowerCase().replace(/-/g, '_'));
    let chosen = null;
    let source = null;
    let magnitude = null;
    for (const src of sourceSide) {
      for (const st of statuses) {
        if (!hasEffect(src, st)) continue;
        chosen = st;
        source = src;
        const fx = getEffect(src, st);
        if (fx) {
          const mag = fx.damageBonus || fx.damagePenalty || fx.defenseBonus || fx.defensePenalty;
          magnitude = mag || mag === 0 ? mag : null;
        }
        break;
      }
      if (chosen) break;
    }
    if (!chosen || !source) return;
    const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
    const chance = resolveChance(raw, rankIndex, character);
    const targets = this.resolveTargets(character, habit, raw)
      .filter(t => t && !t.isDead && t !== source)
      .sort((a, b) => (hasEffect(a, chosen) ? 1 : 0) - (hasEffect(b, chosen) ? 1 : 0));
    if (!targets.length) return;
    for (const target of targets) {
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
      const magText = magnitude != null ? ` (${formatSignedPercent(magnitude)})` : '';
      this.logAction(`Copies ${statusName}${magText} from ${source.name} to ${target.name} ${formatDuration(raw.dur)}`);
    }
  }
};
