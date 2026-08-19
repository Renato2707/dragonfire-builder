// habitParser.js
// Timing canônico: phase + rounds [1..10]

import { rollChance, calculateFinalDamage } from './utils.js';

const ALL_ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const PHASES = {
  COMBAT_START: 'combat_start',
  ROUND_START: 'round_start',
  TURN: 'turn',
  AFTER_BASIC_ATTACK: 'after_basic_attack',
  LOW_HEALTH: 'low_health'
};

const TRIGGER_TYPES = {
  COMBAT_START: PHASES.COMBAT_START,
  EACH_ROUND: PHASES.TURN,
  EACH_ACTION: PHASES.TURN,
  ODD_ROUNDS: 'odd',
  EVEN_ROUNDS: 'even',
  AFTER_ATTACK: PHASES.AFTER_BASIC_ATTACK,
  LOW_HEALTH: PHASES.LOW_HEALTH
};

const TRIGGER_MAP = {
  'Start of Combat': { phase: PHASES.COMBAT_START, rounds: [1] },
  'Each Action / Round': { phase: PHASES.TURN, rounds: ALL_ROUNDS },
  'Each Round': { phase: PHASES.TURN, rounds: ALL_ROUNDS },
  'Odd Rounds': { phase: PHASES.TURN, rounds: [1, 3, 5, 7, 9] },
  'Odd-Numbered Rounds': { phase: PHASES.TURN, rounds: [1, 3, 5, 7, 9] },
  'Even Rounds': { phase: PHASES.TURN, rounds: [2, 4, 6, 8, 10] },
  'After Basic Attack': { phase: PHASES.AFTER_BASIC_ATTACK, rounds: ALL_ROUNDS },
  'Low Health': { phase: PHASES.LOW_HEALTH, rounds: ALL_ROUNDS }
};

const ACTION_TYPES = {
  MOD: 'mod',
  STATUS: 'status',
  DAMAGE: 'dmg',
  HEAL: 'heal',
  STACK: 'stack',
  COPY_STATUS: 'copy_status',
  MOD_COMMAND: 'mod_command'
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
  const mapped = TRIGGER_MAP[habitTrigger];
  if (mapped) return { phase: mapped.phase, rounds: mapped.rounds.slice() };
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
  else if (lower.includes('flank')) {
    if (lower.includes('left')) targeting.position = 'left_flank';
    else if (lower.includes('right')) targeting.position = 'right_flank';
    else targeting.position = 'flank';
  }
  if (lower.includes('lowest')) targeting.select = 'lowest_troops';
  else if (lower.includes('highest')) targeting.select = 'highest_troops';
  else if (lower.includes('random')) targeting.select = 'random';
  return targeting;
}

function parseDuration(durationString) {
  if (!durationString) return 1;
  const lower = durationString.toLowerCase();
  if (lower.includes('whole combat') || lower.includes('permanent')) return 'combat';
  if (lower.includes('instant') || lower.includes('immediate')) return 0;
  const match = durationString.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 1;
}

function resolveChance(actionRaw, rankIndex) {
  if (actionRaw.chance == null) return 100;
  if (Array.isArray(actionRaw.chance)) {
    return actionRaw.chance[rankIndex] ?? actionRaw.chance[0] ?? 100;
  }
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
    this.effectType = habitData.effectType;
    this.duration = habitData.duration;
    this.description = habitData.description;
    this.scaling = habitData.scaling || [];
    this.scalingRaw = habitData.scalingRaw;
    this.structured = habitData.structured || [];
    this.parsedActions = [];
    this.blocks = [];
    this.targetingParsed = parseTargeting(this.targeting);
    this.durationParsed = parseDuration(this.duration);
    this.parseActions();
    this.triggerType = this.blocks[0] ? this.blocks[0].phase : PHASES.TURN;
  }

  parseActions() {
    if (!this.structured || this.structured.length === 0) {
      console.warn(`Habit ${this.name} não tem structured`);
      return;
    }
    for (const item of this.structured) {
      const timing = normalizeTiming(item, this.trigger);
      this.blocks.push({
        phase: timing.phase,
        rounds: timing.rounds,
        requires: item.requires || null,
        actions: item.actions || []
      });
      for (const action of item.actions || []) {
        this.parsedActions.push({
          when: timing.phase,
          phase: timing.phase,
          rounds: timing.rounds,
          requires: item.requires || null,
          type: action.t,
          data: action,
          chance: action.chance ? (Array.isArray(action.chance) ? action.chance[0] : action.chance) : 100
        });
      }
    }
  }

  getBlocksFor(round, phase) {
    return this.blocks.filter(block => block.phase === phase && block.rounds.includes(round));
  }

  getActionByRank(rank) {
    const rankIndex = Math.max(0, Math.min(4, rank - 1));
    return this.parsedActions.map(action => ({
      ...action,
      rankIndex,
      rankValue: this.getScalingValue(action, rankIndex)
    }));
  }

  getScalingValue(action, rankIndex) {
    if (action.data && action.data.mods) {
      const values = {};
      for (const mod of action.data.mods) {
        if (Array.isArray(mod.pct)) values[mod.stat] = mod.pct[rankIndex];
        else if (typeof mod.pct === 'number') values[mod.stat] = mod.pct;
        else if (mod.fixed) values[mod.stat] = Array.isArray(mod.fixed) ? mod.fixed[rankIndex] : mod.fixed;
      }
      return values;
    }
    if (action.data && action.data.chance) {
      return Array.isArray(action.data.chance) ? action.data.chance[rankIndex] : action.data.chance;
    }
    if (action.data && Array.isArray(action.data.pct)) return action.data.pct[rankIndex];
    if (action.data && action.data.val) return action.data.val;
    return null;
  }

  shouldTrigger(battleRound, battlePhase) {
    return this.blocks.some(block => block.phase === battlePhase && block.rounds.includes(battleRound));
  }

  getDescription() {
    return `${this.name} (★${this.unlockStar}): ${this.trigger || this.triggerType} → ${this.targeting}`;
  }
}

async function loadDragonHabits(dragonId) {
  try {
    const response = await fetch(`./data/${dragonId}_habits.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    return (data.habits || []).map(habitData => new Habit(habitData, dragonId));
  } catch (error) {
    console.error(`Falha ao carregar habits de ${dragonId}:`, error);
    return [];
  }
}

function loadDragonHabitsSync(habitData, dragonId) {
  return (habitData.habits || []).map(h => new Habit(h, dragonId));
}

function executeHabitAction(habit, actionData, attacker, targets, rank = 1) {
  const result = {
    success: true,
    missed: false,
    chance: 100,
    executed: 0,
    log: [],
    damages: [],
    heals: [],
    effects: []
  };

  const rankIndex = Math.max(0, Math.min(4, rank - 1));
  const raw = actionData.data || actionData;
  const chance = resolveChance(raw, rankIndex);
  result.chance = chance;

  if (!rollChance(chance)) {
    result.success = false;
    result.missed = true;
    result.log.push(`chance ${chance}% falhou`);
    return result;
  }

  const scalingValue = habit.getScalingValue(actionData, rankIndex);
  const actionType = raw.t || actionData.type;

  if (actionType === 'mod' || actionType === 'stack') {
    result.effects = executeModAction(habit, actionData, targets, scalingValue);
    result.executed = result.effects.length;
  } else if (actionType === 'status') {
    result.effects = executeStatusAction(habit, actionData, targets, scalingValue);
    result.executed = result.effects.length;
  } else if (actionType === 'dmg') {
    result.damages = executeDamageAction(habit, actionData, attacker, targets, scalingValue);
    result.executed = result.damages.length;
  } else if (actionType === 'heal') {
    result.heals = executeHealAction(habit, actionData, attacker, targets, scalingValue);
    result.executed = result.heals.length;
  }

  return result;
}

function executeModAction(habit, actionData, targets, scalingValue) {
  const effects = [];
  if (!scalingValue) return effects;
  const raw = actionData.data || actionData;
  const duration = raw.dur == null ? 'combat' : raw.dur;

  for (const target of targets) {
    if (!target || target.isDead) continue;
    for (const stat in scalingValue) {
      const value = scalingValue[stat];
      if (typeof target.addStatModifier === 'function') {
        target.addStatModifier(stat, value, duration);
      }
      effects.push({
        target: target.name,
        stat,
        value,
        duration,
        log: `${target.name}: ${stat} ${value > 0 ? '+' : ''}${value}%`
      });
    }
  }
  return effects;
}

function executeStatusAction(habit, actionData, targets, scalingValue) {
  const effects = [];
  const actionRaw = actionData.data || actionData;
  const statusType = actionRaw.st;
  const duration = actionRaw.dur || 2;
  for (const target of targets) {
    if (!target || target.isDead) continue;
    effects.push({
      target: target.name,
      statusType,
      duration,
      log: `${target.name}: ${statusType} aplicado (${duration} rodadas)`
    });
  }
  return effects;
}

function executeDamageAction(habit, actionData, attacker, targets, scalingValue) {
  const damages = [];
  const raw = actionData.data || actionData;
  const damageType = (raw.dt || 'physical').toUpperCase();
  const rate = typeof scalingValue === 'number' ? scalingValue : 0;
  for (const target of targets) {
    if (!target || target.isDead) continue;
    const amount = calculateFinalDamage(attacker, target, damageType, rate);
    damages.push({
      target: target.name,
      amount,
      log: `${target.name}: Dano -${amount}`
    });
  }
  return damages;
}

function executeHealAction(habit, actionData, attacker, targets, scalingValue) {
  const heals = [];
  const rate = typeof scalingValue === 'number' ? scalingValue : 0;
  for (const target of targets) {
    if (!target || target.isDead) continue;
    let amount = target.maxHealth * (rate / 100);
    if (typeof attacker.getRecoveryDealtMultiplier === 'function') {
      amount *= attacker.getRecoveryDealtMultiplier();
    }
    if (typeof target.getRecoveryReceivedMultiplier === 'function') {
      amount *= target.getRecoveryReceivedMultiplier();
    }
    amount = Math.max(1, Math.round(amount));
    heals.push({
      target: target.name,
      amount,
      log: `${target.name}: Cura +${amount}`
    });
  }
  return heals;
}

export {
  ALL_ROUNDS,
  PHASES,
  TRIGGER_TYPES,
  TRIGGER_MAP,
  ACTION_TYPES,
  normalizeTiming,
  parseTargeting,
  parseDuration,
  Habit,
  loadDragonHabits,
  loadDragonHabitsSync,
  executeHabitAction,
  executeModAction,
  executeStatusAction,
  executeDamageAction,
  executeHealAction
};
