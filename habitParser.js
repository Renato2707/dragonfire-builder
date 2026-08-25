// habitParser.js

import { rollChance, calculateFinalDamage, scaleByStat, statusConditionMet } from './utils.js';
import { getDealerType } from './positionSystem.js';

const ALL_ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PHASES = {
  COMBAT_START: 'combat_start',
  ROUND_START: 'round_start',
  TURN: 'turn',
  AFTER_BASIC_ATTACK: 'after_basic_attack',
  LOW_HEALTH: 'low_health',
  ON_PREY_RECOVERY: 'on_prey_recovery',
  ON_SELF_FIRST_DAMAGE: 'on_self_first_damage',
  ON_ALLY_FIRE_DAMAGE: 'on_ally_fire_damage',
  ON_TAUNT: 'on_taunt'
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

function ifBonusApplies(ifBonus, attacker, target, extras = {}) {
  if (!ifBonus) return false;
  if (ifBonus.preyRecoveredLastRound) {
    const prey = extras.prey;
    return !!(prey && prey.receivedRecoveryLastRound);
  }
  if (ifBonus.dealer && target) {
    return getDealerType(target) === String(ifBonus.dealer).toLowerCase();
  }
  if (ifBonus.status) {
    const who = ifBonus.on === 'self' ? attacker : null;
    if (who) return statusConditionMet(who, ifBonus.status);
    if (statusConditionMet(target, ifBonus.status)) return true;
    if (statusConditionMet(attacker, ifBonus.status)) return true;
  }
  return false;
}

function resolveIfBonusRate(rate, ifBonus, attacker, target, extras = {}) {
  if (!ifBonusApplies(ifBonus, attacker, target, extras)) return rate;
  if (ifBonus.mult != null) return Number(rate) * Number(ifBonus.mult);
  if (ifBonus.pct != null) return scaleByStat(ifBonus.pct, attacker, ifBonus.scaleStat);
  return rate;
}

function applyIfBonusValue(baseValue, ifBonus, attacker) {
  if (!ifBonus || ifBonus.pct == null) return baseValue;
  const bonus = scaleByStat(ifBonus.pct, attacker, ifBonus.scaleStat);
  if (typeof baseValue === 'number') return bonus;
  if (baseValue && typeof baseValue === 'object') {
    const out = { ...baseValue };
    for (const key of Object.keys(out)) {
      if (key === '__fixed') continue;
      if (typeof out[key] === 'number') out[key] = bonus;
    }
    return out;
  }
  return bonus;
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
        oncePerRound: !!item.oncePerRound,
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
    if (Array.isArray(data.val)) return data.val[rankIndex];
    if (typeof data.val === 'number') return data.val;
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
  const result = {
    success: true,
    missed: false,
    chance: 100,
    executed: 0,
    log: [],
    damages: [],
    heals: [],
    effects: [],
    magnitude: null,
    onReachActions: []
  };
  const rankIndex = Math.max(0, Math.min(4, rank - 1));
  const raw = actionData.data || actionData;
  result.chance = resolveChance(raw, rankIndex, attacker);
  if (!options.skipChance && !rollChance(result.chance)) {
    result.success = false;
    result.missed = true;
    return result;
  }
  const scalingValue = scaleByStat(habit.getScalingValue(actionData, rankIndex), attacker, raw.scaleStat);
  const rawVal = Array.isArray(raw.val) ? raw.val[rankIndex] : raw.val;
  result.magnitude = scaleByStat(rawVal, attacker, raw.scaleStat);
  if (result.magnitude == null && typeof scalingValue === 'number') result.magnitude = scalingValue;
  const actionType = raw.t || actionData.type;
  if (actionType === 'mod' || actionType === 'stack') {
    const modResult = executeModAction(habit, actionData, attacker, targets, scalingValue, rank);
    result.effects = modResult.effects;
    result.onReachActions = modResult.onReachActions;
    result.executed = result.effects.length;
  } else if (actionType === 'status') {
    const st = String(raw.st || '').toLowerCase().replace(/-/g, '_');
    result.effects = targets.filter(t => t && !t.isDead).map(t => ({ target: t.name, statusType: raw.st }));
    result.executed = result.effects.length;
    if (['burn', 'panic', 'bleed'].includes(st)) {
      result.damageRate = scaleByStat(
        raw.rate ?? (typeof scalingValue === 'number' ? scalingValue : 20),
        attacker,
        raw.scaleStat
      );
    }
    if (result.magnitude == null && typeof scalingValue === 'number' && ['advantage', 'weakened', 'vulnerable', 'resistance', 'evade'].includes(st)) {
      result.magnitude = scalingValue;
    }
  } else if (actionType === 'dmg') {
    result.damages = executeDamageAction(habit, actionData, attacker, targets, scalingValue, options.round, options);
    result.executed = result.damages.length;
  } else if (actionType === 'heal') {
    result.heals = executeHealAction(habit, actionData, attacker, targets, scalingValue, options);
    result.executed = result.heals.length;
  }
  return result;
}

function executeModAction(habit, actionData, attacker, targets, scalingValue, rank = 1) {
  const effects = [];
  const onReachActions = [];
  if (!scalingValue) return { effects, onReachActions };
  const raw = actionData.data || actionData;
  const duration = raw.dur == null ? 'combat' : raw.dur;
  const flags = scalingValue.__fixed || {};
  const options = {
    excludeBasic: !!raw.excludeBasic,
    stackId: raw.id || null,
    maxStacks: raw.maxStacks != null ? raw.maxStacks : null
  };
  for (const target of targets) {
    if (!target || target.isDead) continue;
    const value = ifBonusApplies(raw.ifBonus, attacker, target)
      ? applyIfBonusValue(scalingValue, raw.ifBonus, attacker)
      : scalingValue;
    const valueFlags = value.__fixed || flags;
    if (raw.t === 'stack' && typeof target.addStack === 'function') {
      const wantAdd = raw.stacks || 1;
      const before = typeof target.getStackCount === 'function' ? target.getStackCount(raw.id || 'stack') : 0;
      const stackResult = target.addStack(raw.id || 'stack', value, duration, {
        ...options,
        stacks: wantAdd
      });
      const count = stackResult.stacks != null ? stackResult.stacks : stackResult;
      const added = stackResult.added != null ? stackResult.added : wantAdd;
      if (raw.tgt && raw.tgt.linkAs && attacker) attacker.links[raw.tgt.linkAs] = target;
      if (added > 0) {
        effects.push({
          target: target.name,
          kind: 'stack',
          stackId: raw.id || 'stack',
          stacks: count,
          added,
          duration,
          enhancedBy: raw.scaleStat || null
        });
      }
      if (raw.onReach && count >= raw.onReach.stacks) {
        const once = raw.onReach.once !== false;
        const threshold = raw.onReach.stacks;
        const canFire = once
          ? (typeof target.markStackReached === 'function' ? target.markStackReached(raw.id || 'stack', threshold) : true)
          : true;
        if (canFire && before < threshold && count >= threshold) {
          for (const reachAction of raw.onReach.actions || []) {
            onReachActions.push({ caster: attacker, target, action: reachAction, rank });
          }
        }
      }
    } else {
      for (const stat in value) {
        if (stat === '__fixed') continue;
        target.addStatModifier(stat, value[stat], duration, { ...options, fixed: !!valueFlags[stat] });
        effects.push({
          target: target.name,
          kind: 'mod',
          stat,
          value: value[stat],
          duration,
          excludeBasic: !!raw.excludeBasic,
          enhancedBy: raw.scaleStat || null
        });
      }
    }
  }
  return { effects, onReachActions };
}

function executeDamageAction(habit, actionData, attacker, targets, scalingValue, round, extras = {}) {
  const damages = [];
  const raw = actionData.data || actionData;
  const damageType = (raw.dt || 'physical').toUpperCase();
  let baseRate = typeof scalingValue === 'number' ? scalingValue : 0;
  if (raw.roundBonus && round != null) {
    const bonus = raw.roundBonus[String(round)] ?? raw.roundBonus[round];
    if (bonus) baseRate *= bonus;
  }
  for (const target of targets) {
    if (!target || target.isDead) continue;
    const rate = resolveIfBonusRate(baseRate, raw.ifBonus, attacker, target, extras);
    damages.push({ target: target.name, amount: calculateFinalDamage(attacker, target, damageType, rate) });
  }
  return damages;
}

function executeHealAction(habit, actionData, attacker, targets, scalingValue, extras = {}) {
  const heals = [];
  const raw = actionData.data || actionData;
  let rate = typeof scalingValue === 'number' ? scalingValue : 0;
  for (const target of targets) {
    if (!target || target.isDead) continue;
    const usedRate = resolveIfBonusRate(rate, raw.ifBonus, attacker, target, extras);
    let amount = target.maxHealth * (usedRate / 100);
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
  ifBonusApplies,
  Habit,
  loadDragonHabitsSync,
  loadCommandSync,
  executeHabitAction
};
