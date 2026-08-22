// habitParser.js

import { rollChance, calculateFinalDamage } from './utils.js';
import { hasActiveId } from './utils.js';

const ALL_ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PHASES = {
  COMBAT_START: 'combat_start',
  ROUND_START: 'round_start',
  TURN: 'turn',
  AFTER_BASIC_ATTACK: 'after_basic_attack',
  LOW_HEALTH: 'low_health'
};

function normalizeTiming(item) {
  if (item.phase && Array.isArray(item.rounds) && item.rounds.length) {
    return { phase: item.phase, rounds: item.rounds.slice() };
  }
  return { phase: PHASES.TURN, rounds: ALL_ROUNDS.slice() };
}

function parseTargeting(targetingString) {
  if (!targetingString) return { side: 'self', count: 1 };
  const lower = targetingString.toLowerCase();
  const targeting = { side: 'self', count: 1, select: 'any' };
  if (lower.includes('self')) targeting.side = 'self';
  else if (lower.includes('ally')) targeting.side = 'ally';
  else if (lower.includes('enemy')) targeting.side = 'enemy';
  return targeting;
}

function resolveChance(actionRaw, rankIndex, character) {
  if (actionRaw && actionRaw.chanceField && character && character.commandMods[actionRaw.chanceField] != null) {
    return character.commandMods[actionRaw.chanceField];
  }
  if (!actionRaw || actionRaw.chance == null) return 100;
  if (Array.isArray(actionRaw.chance)) return actionRaw.chance[rankIndex] ?? actionRaw.chance[0] ?? 100;
  return actionRaw.chance;
}

class Habit {
  constructor(habitData, dragonId) {
    this.dragonId = dragonId;
    this.name = habitData.name;
    this.unlockStar = habitData.unlockStar || 0;
    this.structured = habitData.structured || [];
    this.blocks = [];
    this.parsedActions = [];
    this.targetingParsed = parseTargeting(habitData.targeting);
    this.parseActions();
    this.triggerType = this.blocks[0] ? this.blocks[0].phase : PHASES.TURN;
  }

  parseActions() {
    for (const item of this.structured || []) {
      const timing = normalizeTiming(item);
      this.blocks.push({
        phase: timing.phase,
        rounds: timing.rounds,
        requires: item.requires || null,
        chance: item.chance != null ? item.chance : null,
        actions: item.actions || []
      });
    }
  }

  getBlocksFor(round, phase) {
    return this.blocks.filter(block => block.phase === phase && block.rounds.includes(round));
  }

  getScalingValue(action, rankIndex) {
    const data = action.data || action;
    if (data.mods) {
      let mods = data.mods;
      if (data.pick === 'random' && mods.length) {
        mods = [mods[Math.floor(Math.random() * mods.length)]];
      }
      const values = {};
      const flags = {};
      for (const mod of mods) {
        if (mod.fixed != null) {
          values[mod.stat] = Array.isArray(mod.fixed) ? mod.fixed[rankIndex] : mod.fixed;
          flags[mod.stat] = true;
        } else if (Array.isArray(mod.pct)) values[mod.stat] = mod.pct[rankIndex];
        else if (typeof mod.pct === 'number') values[mod.stat] = mod.pct;
      }
      values.__fixed = flags;
      return values;
    }
    if (Array.isArray(data.pct)) return data.pct[rankIndex];
    if (typeof data.pct === 'number') return data.pct;
    if (data.val) return data.val;
    return null;
  }

  shouldTrigger(battleRound, battlePhase) {
    return this.blocks.some(block => block.phase === battlePhase && block.rounds.includes(battleRound));
  }
}

function loadDragonHabitsSync(habitData, dragonId) {
  return (habitData.habits || []).map(h => new Habit(h, dragonId));
}

function loadCommandSync(data, dragonId) {
  if (!data) return null;
  return {
    name: data.name,
    command: new Habit({ name: data.name, structured: data.command || [], unlockStar: 0 }, dragonId),
    vanguard: new Habit({ name: `${data.name} Vanguard`, structured: data.vanguard || [], unlockStar: 0 }, dragonId)
  };
}

function executeHabitAction(habit, actionData, attacker, targets, rank = 1, options = {}) {
  const result = { success: true, missed: false, chance: 100, executed: 0, log: [], damages: [], heals: [], effects: [] };
  const rankIndex = Math.max(0, Math.min(4, rank - 1));
  const raw = actionData.data || actionData;
  result.chance = resolveChance(raw, rankIndex, attacker);
  if (!options.skipChance && !rollChance(result.chance)) {
    result.success = false;
    result.missed = true;
    return result;
  }
  const scalingValue = habit.getScalingValue(actionData, rankIndex);
  const actionType = raw.t || actionData.type;
  if (actionType === 'mod' || actionType === 'stack') {
    result.effects = executeModAction(habit, actionData, attacker, targets, scalingValue);
    result.executed = result.effects.length;
  } else if (actionType === 'status') {
    result.effects = targets.filter(t => t && !t.isDead).map(t => ({ target: t.name, statusType: raw.st }));
    result.executed = result.effects.length;
  } else if (actionType === 'dmg') {
    result.damages = executeDamageAction(habit, actionData, attacker, targets, scalingValue, options.round);
    result.executed = result.damages.length;
  } else if (actionType === 'heal') {
    result.heals = executeHealAction(habit, actionData, attacker, targets, scalingValue);
    result.executed = result.heals.length;
  }
  return result;
}

function executeModAction(habit, actionData, attacker, targets, scalingValue) {
  const effects = [];
  if (!scalingValue) return effects;
  const raw = actionData.data || actionData;
  const duration = raw.dur == null ? 'combat' : raw.dur;
  const flags = scalingValue.__fixed || {};
  const options = { excludeBasic: !!raw.excludeBasic, stackId: raw.id || null };
  for (const target of targets) {
    if (!target || target.isDead) continue;
    if (raw.t === 'stack' && typeof target.addStack === 'function') {
      const count = target.addStack(raw.id || 'stack', scalingValue, duration, { ...options, stacks: raw.stacks || 1 });
      if (raw.tgt && raw.tgt.linkAs && attacker) attacker.links[raw.tgt.linkAs] = target;
      effects.push({ target: target.name, log: `${target.name}: stack ${raw.id || ''} x${count}` });
    } else {
      for (const stat in scalingValue) {
        if (stat === '__fixed') continue;
        target.addStatModifier(stat, scalingValue[stat], duration, { ...options, fixed: !!flags[stat] });
        effects.push({ target: target.name, log: `${target.name}: ${stat} ${flags[stat] ? '+' : ''}${scalingValue[stat]}${flags[stat] ? '' : '%'}` });
      }
    }
  }
  return effects;
}

function executeDamageAction(habit, actionData, attacker, targets, scalingValue, round) {
  const damages = [];
  const raw = actionData.data || actionData;
  const damageType = (raw.dt || 'physical').toUpperCase();
  let rate = typeof scalingValue === 'number' ? scalingValue : 0;
  if (raw.ifBonus && raw.ifBonus.status && hasActiveId(attacker, raw.ifBonus.status)) {
    rate = raw.ifBonus.pct;
  }
  if (raw.roundBonus && round != null) {
    const bonus = raw.roundBonus[String(round)] ?? raw.roundBonus[round];
    if (bonus) rate *= bonus;
  }
  for (const target of targets) {
    if (!target || target.isDead) continue;
    damages.push({ target: target.name, amount: calculateFinalDamage(attacker, target, damageType, rate) });
  }
  return damages;
}

function executeHealAction(habit, actionData, attacker, targets, scalingValue) {
  const heals = [];
  const rate = typeof scalingValue === 'number' ? scalingValue : 0;
  for (const target of targets) {
    if (!target || target.isDead) continue;
    let amount = target.maxHealth * (rate / 100);
    if (typeof attacker.getRecoveryDealtMultiplier === 'function') amount *= attacker.getRecoveryDealtMultiplier();
    if (typeof target.getRecoveryReceivedMultiplier === 'function') amount *= target.getRecoveryReceivedMultiplier();
    heals.push({ target: target.name, amount: Math.max(1, Math.round(amount)) });
  }
  return heals;
}

export {
  ALL_ROUNDS,
  PHASES,
  normalizeTiming,
  parseTargeting,
  resolveChance,
  Habit,
  loadDragonHabitsSync,
  loadCommandSync,
  executeHabitAction
};
