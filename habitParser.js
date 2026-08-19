// habitParser.js

import { rollChance, calculateFinalDamage } from './utils.js';

const ALL_ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const PHASES = {
  COMBAT_START: 'combat_start',
  ROUND_START: 'round_start',
  TURN: 'turn',
  AFTER_BASIC_ATTACK: 'after_basic_attack',
  LOW_HEALTH: 'low_health'
};

function normalizeTiming(item, habitTrigger) {
  if (item.phase && Array.isArray(item.rounds) && item.rounds.length > 0) {
    return { phase: item.phase, rounds: item.rounds.slice() };
  }
  const when = item.when;
  if (when === 'combat_start') return { phase: PHASES.COMBAT_START, rounds: [1] };
  if (when === 'each') return { phase: PHASES.TURN, rounds: ALL_ROUNDS.slice() };
  if (when === 'odd') return { phase: PHASES.TURN, rounds: [1, 3, 5, 7, 9] };
  if (when === 'even') return { phase: PHASES.TURN, rounds: [2, 4, 6, 8, 10] };
  if (when === 'after_attack') return { phase: PHASES.AFTER_BASIC_ATTACK, rounds: item.rounds || ALL_ROUNDS.slice() };
  if (when === 'low_health') return { phase: PHASES.LOW_HEALTH, rounds: item.rounds || ALL_ROUNDS.slice() };
  if (when === 'rounds' && Array.isArray(item.rounds)) return { phase: PHASES.TURN, rounds: item.rounds.slice() };
  return { phase: PHASES.TURN, rounds: ALL_ROUNDS.slice() };
}

function parseTargeting(targetingString) {
  if (!targetingString) return { side: 'self', count: 1 };
  const lower = targetingString.toLowerCase();
  const targeting = { side: 'self', count: 1, select: 'any', position: null };
  if (lower.includes('self')) targeting.side = 'self';
  else if (lower.includes('ally') || lower.includes('allies')) targeting.side = 'ally';
  else if (lower.includes('enemy') || lower.includes('enemies')) targeting.side = 'enemy';
  const match = targetingString.match(/^(\d+)/);
  if (match) targeting.count = parseInt(match[1], 10);
  if (lower.includes('adjacent')) targeting.position = 'adjacent';
  else if (lower.includes('same lane')) targeting.position = 'same_lane';
  return targeting;
}

function resolveChance(actionRaw, rankIndex) {
  if (!actionRaw || actionRaw.chance == null) return 100;
  if (Array.isArray(actionRaw.chance)) return actionRaw.chance[rankIndex] ?? actionRaw.chance[0] ?? 100;
  return actionRaw.chance;
}

class Habit {
  constructor(habitData, dragonId) {
    this.dragonId = dragonId;
    this.name = habitData.name;
    this.slot = habitData.slot;
    this.unlockStar = habitData.unlockStar;
    this.trigger = habitData.trigger;
    this.targeting = habitData.targeting;
    this.structured = habitData.structured || [];
    this.parsedActions = [];
    this.blocks = [];
    this.targetingParsed = parseTargeting(this.targeting);
    this.parseActions();
    this.triggerType = this.blocks[0] ? this.blocks[0].phase : PHASES.TURN;
  }

  parseActions() {
    for (const item of this.structured || []) {
      const timing = normalizeTiming(item, this.trigger);
      this.blocks.push({
        phase: timing.phase,
        rounds: timing.rounds,
        requires: item.requires || null,
        actions: item.actions || []
      });
      for (const action of item.actions || []) {
        this.parsedActions.push({
          phase: timing.phase,
          rounds: timing.rounds,
          requires: item.requires || null,
          type: action.t,
          data: action
        });
      }
    }
  }

  getBlocksFor(round, phase) {
    return this.blocks.filter(block => block.phase === phase && block.rounds.includes(round));
  }

  getScalingValue(action, rankIndex) {
    const data = action.data || action;
    if (data.mods) {
      const values = {};
      for (const mod of data.mods) {
        if (Array.isArray(mod.pct)) values[mod.stat] = mod.pct[rankIndex];
        else if (typeof mod.pct === 'number') values[mod.stat] = mod.pct;
      }
      return values;
    }
    if (Array.isArray(data.pct)) return data.pct[rankIndex];
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

function executeHabitAction(habit, actionData, attacker, targets, rank = 1, options = {}) {
  const result = { success: true, missed: false, chance: 100, executed: 0, log: [], damages: [], heals: [], effects: [] };
  const rankIndex = Math.max(0, Math.min(4, rank - 1));
  const raw = actionData.data || actionData;
  result.chance = resolveChance(raw, rankIndex);
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
  const options = { excludeBasic: !!raw.excludeBasic, stackId: raw.id || null };
  for (const target of targets) {
    if (!target || target.isDead) continue;
    if (raw.t === 'stack' && typeof target.addStack === 'function') {
      const count = target.addStack(raw.id || 'stack', scalingValue, duration, { ...options, stacks: raw.stacks || 1 });
      if (raw.tgt && raw.tgt.linkAs && attacker) attacker.links[raw.tgt.linkAs] = target;
      effects.push({ target: target.name, log: `${target.name}: stack ${raw.id || ''} x${count}` });
    } else {
      for (const stat in scalingValue) {
        target.addStatModifier(stat, scalingValue[stat], duration, options);
        effects.push({ target: target.name, log: `${target.name}: ${stat} ${scalingValue[stat] > 0 ? '+' : ''}${scalingValue[stat]}%` });
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
  executeHabitAction
};
