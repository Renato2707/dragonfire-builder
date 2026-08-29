import {
  BAR, DASH, nameTag, findCharacter, laneSuffix, fromPhrase
} from './reportFormatKit.js';
import { isStackMag, effectKey, lastTeamSnapshot, combinePctMag, activationMags } from './reportFormatMisc.js';
import { parseLog } from './reportFormatParse.js';

export function stillActive(effect, atRound) {
  if (effect.round > atRound) return false;
  if (effect.dur === 'combat') return true;
  if (typeof effect.dur === 'number') return effect.round + effect.dur - 1 >= atRound;
  return true;
}

export function snapshotFor(effects, name, atRound, beforeSeq) {
  const seen = new Set();
  const out = [];
  const stackAt = {};
  for (const effect of effects) {
    if (effect.target !== name) continue;
    if (effect.seq >= beforeSeq) continue;
    if (!stillActive(effect, atRound)) continue;
    if (isStackMag(effect.mag)) {
      const key = [effect.target, effect.skill, effect.source, 'stack'].join('|');
      if (stackAt[key] != null) {
        out[stackAt[key]] = effect;
        continue;
      }
      stackAt[key] = out.length;
      seen.add(key);
      out.push(effect);
      continue;
    }
    const key = effectKey(effect);
    if (seen.has(key)) {
      const idx = out.findIndex(item => item.target === effect.target && item.skill === effect.skill && item.source === effect.source && item.round === effect.round);
      if (idx >= 0 && out[idx].round === effect.round) {
        const combined = combinePctMag(out[idx].mag, effect.mag);
        if (combined) out[idx] = { ...out[idx], mag: combined };
      }
      continue;
    }
    seen.add(key);
    out.push(effect);
  }
  return out;
}

export function minSeq(bucket, effects, name, round) {
  let min = Infinity;
  for (const action of bucket.actions || []) {
    if (action.effect) min = Math.min(min, action.effect.seq);
  }
  for (const effect of effects) {
    if (effect.source === name && effect.round === round && effect.turn) {
      min = Math.min(min, effect.seq);
    }
  }
  return min;
}

export function formatEffect(battle, effect) {
  return `  ${nameTag(effect.target)} is under the effect of ${nameTag(effect.skill)} ${fromPhrase(battle, effect.source, effect.target)}. ${effect.mag}`;
}

export function groupActions(actions) {
  const groups = [];
  let current = null;
  for (const action of actions || []) {
    if (action.type === 'uses') {
      current = { skill: action.skill, actor: action.actor, extra: action.extra, items: [] };
      groups.push(current);
      continue;
    }
    if (!current) {
      current = { skill: action.skill || 'effect', actor: action.actor, items: [] };
      groups.push(current);
    }
    current.items.push(action);
  }
  return groups;
}

export function orderForRound(pack) {
  if (pack.turnOrder && pack.turnOrder.length) return pack.turnOrder;
  return (pack.actors || []).map(actor => actor.name);
}

export function formatBattleReport(battle, formationText) {
  const parsed = parseLog(battle);
  const hp = {};
  for (const character of battle.allCharacters || []) {
    hp[character.name] = Math.round(character.maxHealth);
  }

  const applyDamage = (name, amount) => {
    hp[name] = Math.max(0, (hp[name] || 0) - amount);
    return hp[name];
  };
  const applyHeal = (name, amount) => {
    const character = findCharacter(battle, name);
    const cap = character ? Math.round(character.maxHealth) : 99999;
    hp[name] = Math.min(cap, (hp[name] || 0) + amount);
    return hp[name];
  };

  const out = [];
  out.push(formationText || '');
  out.push(BAR);
  out.push('• Preparations');
  out.push(DASH);
  out.push('Any special global effects will be listed here, such as effects from City Upgrades, Boosts, etc.');
  out.push(BAR);
  out.push('Combat Phase (The Battle Itself)');
  out.push(DASH);
  out.push('Every action in each round of the battle is listed here, in the order they happened.');
  out.push(DASH);

  for (const pack of parsed.rounds) {
    const order = orderForRound(pack);
    out.push(BAR);
    out.push(`• Round ${pack.number}`);
    out.push(BAR);
    if (order.length) out.push(`Turn order: ${order.join(' → ')}`);
    for (const name of order) {
      const bucket = pack.actors.find(a => a.name === name) || { name, actions: [], cannot: null };
      const cut = minSeq(bucket, parsed.effects, name, pack.number);
      out.push(DASH);
      out.push(`${nameTag(name)}${laneSuffix(battle, name)}:`);
      out.push(DASH);
      for (const effect of snapshotFor(parsed.effects, name, pack.number, cut)) {
        out.push(formatEffect(battle, effect));
      }
      if (bucket.cannot) out.push(`  ${name} cannot ${bucket.cannot}`);

      for (const group of groupActions(bucket.actions)) {
        const damages = group.items.filter(item => item.type === 'damage');
        const recovers = group.items.filter(item => item.type === 'recover');
        const rolls = group.items.filter(item => item.type === 'roll');
        const fx = group.items.filter(item => item.type === 'effect');

        for (const roll of rolls) {
          out.push(`  [${roll.result}] ${roll.skill} → ${roll.target} (${roll.chance})`);
        }

        if (recovers.length) {
          for (const heal of recovers) {
            const left = applyHeal(heal.target, heal.amount);
            out.push(`  ${nameTag(heal.actor)} uses [ ${heal.skill} ].`);
            out.push(`  ${nameTag(heal.target)} is under the effect of [ ${heal.skill} ] ${fromPhrase(battle, heal.actor, heal.target)}.`);
            out.push(`  ${heal.detail}. +${heal.amount} Troop gained.`);
            out.push(`  ${nameTag(heal.target)} recovers ${heal.amount} troops (${left} remaining).`);
          }
        } else if (damages.length) {
          for (const hit of damages) {
            const left = applyDamage(hit.target, hit.amount);
            const atk = hit.skill || group.skill || 'Basic Attack';
            out.push(`  ${nameTag(hit.actor || name)} uses [ ${atk} ] to attack ${nameTag(hit.target)}${laneSuffix(battle, hit.target)}.`);
            out.push(`  Deals ${hit.amount} ${hit.dtype} against ${nameTag(hit.target)}.`);
            out.push(`  ${nameTag(hit.target)} takes ${hit.amount} losses (${left} remaining).`);
          }
        }
        if (!recovers.length && fx.length) {
          const targets = [];
          for (const item of fx) {
            if (!targets.includes(item.effect.target)) targets.push(item.effect.target);
          }
          const list = targets.map(target => `${nameTag(target)}${laneSuffix(battle, target)}`).join(', ');
          out.push(`  ${nameTag(name)} activates [ ${group.skill} ] affecting ${list}.`);
          const mags = activationMags(fx);
          if (mags.length) out.push(`  ${mags.join(' ')}`);
        } else if (!recovers.length && !damages.length && group.skill && group.skill !== 'Basic Attack') {
          out.push(`  ${nameTag(name)} activates [ ${group.skill} ].`);
        }
      }
    }

    if (pack.ticks && pack.ticks.length) {
      for (const heal of pack.ticks) {
        const left = applyHeal(heal.target, heal.amount);
        out.push(`  ${nameTag(heal.target)} is under the effect of [ Recovery ] from itself. ${heal.detail}. +${heal.amount} Troop gained.`);
        out.push(`  ${nameTag(heal.target)} recovers ${heal.amount} troops (${left} remaining).`);
      }
    }

    const roster = lastTeamSnapshot(pack.roster);
    if (roster.length) {
      out.push(BAR);
      for (const row of roster) out.push(`  ${row}`);
    }
  }

  if (parsed.endKind) {
    out.push(BAR);
    out.push(parsed.endKind === 'stalemate' ? 'Stalemate' : 'Combat End');
    out.push(BAR);
    if (parsed.endKind === 'stalemate') {
      out.push('  Maximum 10 rounds reached');
      out.push('  Draw');
    }
    out.push('  Final Status:');
    const last = parsed.rounds[parsed.rounds.length - 1];
    const roster = last ? lastTeamSnapshot(last.roster) : [];
    for (const row of roster) out.push(`  ${row}`);
  }

  return out.filter((line, index) => !(line === '' && index === 0)).join('\n');
}
