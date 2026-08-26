import { SLOT_NAMES } from './character.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { healRateOf } from './healRate.js';

const BAR = '═'.repeat(55);
const DASH = '- '.repeat(27).trim();
const CORE_STAT_NAMES = new Set(['Strength', 'Instinct', 'Intelligence', 'Initiative']);

function isBar(line) {
  return /^═+$/.test(String(line || '').trim());
}

function nameTag(name) {
  return `[ ${name} ]`;
}

function findCharacter(battle, name) {
  if (!battle || !name) return null;
  return (battle.allCharacters || []).find(c => c && c.name === name) || null;
}

function laneOf(battle, name) {
  const character = findCharacter(battle, name);
  return character ? (character.positionName || SLOT_NAMES[character.slotPosition] || '') : '';
}

function laneSuffix(battle, name) {
  const lane = laneOf(battle, name);
  return lane ? ` (${lane})` : '';
}

function fromPhrase(battle, source, target) {
  if (!source) return '';
  if (source === target) return 'from itself';
  return `from ${nameTag(source)}${laneSuffix(battle, source)}`;
}

function vanguardTitle(battle, actorName) {
  const character = findCharacter(battle, actorName);
  if (!character) return 'Vanguard';
  return VANGUARD_NAMES[character.id] || 'Vanguard';
}

function splitTarget(battle, raw) {
  const text = String(raw || '').trim();
  const names = ((battle && battle.allCharacters) || [])
    .map(c => c && c.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (text === name) return { name, rest: '' };
    if (text.startsWith(`${name} `)) return { name, rest: text.slice(name.length).trim() };
  }
  const match = text.match(/^([A-Za-z][A-Za-z'-]*)(?:\s+(.*))?$/);
  return { name: match ? match[1] : text, rest: (match && match[2]) || '' };
}

function formatMagnitude(stat, rawValue, isVanguard) {
  const value = String(rawValue || '').trim();
  const numeric = value.replace('%', '');
  if (isVanguard && CORE_STAT_NAMES.has(stat)) return `+${numeric} ${stat}`;
  if (value.startsWith('+') || value.startsWith('-')) {
    return value.includes('%') ? `${value} ${stat}` : `${value} ${stat}`;
  }
  return `${value} ${stat}`;
}

function parseDuration(extra) {
  const text = String(extra || '');
  if (/until the end of combat/i.test(text) || /end of combat/i.test(text)) return 'combat';
  const rounds = text.match(/(\d+)\s+round/);
  return rounds ? Number(rounds[1]) : 'combat';
}

function effectKey(effect) {
  return [effect.target, effect.skill, effect.source, effect.mag].join('|');
}

function parseLog(battle) {
  const lines = battle.battleLog || [];
  const effects = [];
  const rounds = [];
  let phase = 'combat_start';
  let round = 0;
  let actor = null;
  let skill = null;
  let vanguard = false;
  let turnOrder = [];
  let current = null;
  let seq = 0;
  let endKind = null;
  let skipRoster = false;

  const ensureRound = number => {
    let found = rounds.find(r => r.number === number);
    if (!found) {
      found = { number, turnOrder: [], actors: [], roster: [] };
      rounds.push(found);
    }
    return found;
  };

  const actorBucket = (number, name) => {
    const pack = ensureRound(number);
    let bucket = pack.actors.find(a => a.name === name);
    if (!bucket) {
      bucket = { name, actions: [], cannot: null };
      pack.actors.push(bucket);
    }
    return bucket;
  };

  const pushEffect = (target, mag, extra) => {
    if (!target || !skill) return;
    const effect = {
      seq: seq += 1,
      target,
      skill,
      source: actor || target,
      mag,
      round: round || 1,
      phase,
      vanguard,
      dur: parseDuration(extra),
      turn: phase === 'turns'
    };
    effects.push(effect);
    if (phase === 'turns' && actor) {
      actorBucket(round || 1, actor).actions.push({ type: 'effect', effect });
    }
  };

  const pushAction = (name, action) => {
    if (!name) return;
    actorBucket(round || 1, name).actions.push(action);
  };

  let i = 0;
  while (i < lines.length) {
    const line = String(lines[i] || '').trim();
    const next = String(lines[i + 1] || '').trim();

    if (isBar(line) && next === 'Start of Combat') {
      phase = 'combat_start';
      round = 0;
      skipRoster = true;
      i += 3;
      continue;
    }
    if (isBar(line) && /^Start of Round /.test(next)) {
      round = Number((next.match(/Round (\d+)/) || [])[1] || 0);
      phase = 'round_start';
      current = ensureRound(round);
      if (turnOrder.length) current.turnOrder = turnOrder.slice();
      skipRoster = false;
      i += 3;
      continue;
    }
    if (isBar(line) && next === 'Combat End') {
      const ahead = lines.slice(i, i + 10).join('\n');
      endKind = /Maximum \d+ rounds reached/.test(ahead) ? 'stalemate' : 'end';
      phase = 'end';
      i += 3;
      continue;
    }
    if (isBar(line)) {
      skipRoster = false;
      i += 1;
      continue;
    }
    if (!line) {
      i += 1;
      continue;
    }

    let match = line.match(/^Turn order: (.+)$/);
    if (match) {
      turnOrder = match[1].split(/\s*→\s*/).map(s => s.trim()).filter(Boolean);
      if (round) ensureRound(round).turnOrder = turnOrder.slice();
      if (phase === 'round_start') phase = 'turns';
      i += 1;
      continue;
    }

    if (skipRoster && (/^Team [AB]:$/.test(line) || /Troop Capacity/.test(line))) {
      i += 1;
      continue;
    }

    if (/^Team [AB]:$/.test(line) || /Troop Capacity/.test(line) || /retreated/.test(line)) {
      if (round) ensureRound(round).roster.push(line);
      i += 1;
      continue;
    }

    match = line.match(/^(.+?) activates (.+)$/);
    if (match) {
      actor = match[1];
      vanguard = /\(Vanguard\)$/i.test(match[2]) || match[2] === 'Vanguard';
      skill = vanguard ? vanguardTitle(battle, actor) : match[2];
      if (!vanguard && phase === 'turns') {
        pushAction(actor, { type: 'uses', actor, skill });
      }
      i += 1;
      continue;
    }

    match = line.match(/^(.+?) launches a 2nd Basic Attack/);
    if (match) {
      actor = match[1];
      skill = 'Basic Attack';
      vanguard = false;
      phase = 'turns';
      pushAction(actor, { type: 'uses', actor, skill: 'Basic Attack', extra: 'Double-Strike' });
      i += 1;
      continue;
    }

    match = line.match(/^(.+?) launches a Basic Attack/);
    if (match) {
      actor = match[1];
      skill = 'Basic Attack';
      vanguard = false;
      phase = 'turns';
      pushAction(actor, { type: 'uses', actor, skill: 'Basic Attack' });
      i += 1;
      continue;
    }

    match = line.match(/^(.+?) cannot act \((.+)\)/);
    if (match) {
      actorBucket(round || 1, match[1]).cannot = match[2];
      i += 1;
      continue;
    }

    match = line.match(/^Deals (\d+) (.+) to (.+)$/);
    if (match) {
      const target = match[3];
      const action = {
        type: 'damage',
        actor,
        skill,
        target,
        amount: Number(match[1]),
        dtype: match[2]
      };
      if (actor) pushAction(actor, action);
      i += 1;
      continue;
    }

    match = line.match(/^\[(hit|miss)\] (.+) → (.+) \(([\d.]+%)\)$/);
    if (match) {
      if (actor) {
        pushAction(actor, {
          type: 'roll',
          result: match[1],
          skill: match[2],
          target: match[3],
          chance: match[4]
        });
      }
      i += 1;
      continue;
    }

    match = line.match(/^(Increases|Reduces) (.+) of (.+?) by ([+\-][\d.]+%?)(?:\s+(.+))?$/);
    if (match) {
      const stat = match[2].replace(/ \(excluding Basic Attacks\)/, '');
      pushEffect(match[3], formatMagnitude(stat, match[4], vanguard), match[5]);
      i += 1;
      continue;
    }

    match = line.match(/^Afflicts (.+) with (.+)$/);
    if (match) {
      const split = splitTarget(battle, match[1]);
      const mag = [match[2], split.rest].filter(Boolean).join(' ');
      pushEffect(split.name, mag, match[2]);
      i += 1;
      continue;
    }

    match = line.match(/^Grants (.+) to (.+)$/);
    if (match) {
      const split = splitTarget(battle, match[2]);
      const mag = [match[1], split.rest].filter(Boolean).join(' ');
      pushEffect(split.name, mag, match[2]);
      i += 1;
      continue;
    }

    match = line.match(/^(.+?) gains (\d+) stacks? of (.+?) \(now (\d+)\)(.*)$/);
    if (match) {
      const n = Number(match[4]);
      const label = n === 1 ? `1 stack of ${match[3]}` : `${n} stacks of ${match[3]}`;
      actor = actor || match[1];
      skill = skill || match[3];
      pushEffect(match[1], label, match[5]);
      i += 1;
      continue;
    }

    match = line.match(/^Applies Recovery to (.+)$/);
    if (match) {
      const split = splitTarget(battle, match[1]);
      const sourceChar = findCharacter(battle, actor);
      const rate = healRateOf(sourceChar, skill);
      const amount = Number((split.rest.match(/\+?(\d+)\s+Troop Capacity/i) || [])[1] || 0);
      const by = (split.rest.match(/enhanced by (\w+)/i) || [])[1];
      const bits = [rate != null ? `Recovery +${rate}%` : 'Recovery'];
      if (by) bits.push(`enhanced by ${by}`);
      if (actor) {
        pushAction(actor, {
          type: 'recover',
          actor,
          skill,
          target: split.name,
          amount,
          detail: bits.join(', ')
        });
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  return { effects, rounds, turnOrder, endKind };
}

function stillActive(effect, atRound) {
  if (effect.dur === 'combat') return true;
  if (typeof effect.dur === 'number') return effect.round + effect.dur - 1 >= atRound;
  return true;
}

function snapshotFor(effects, name, atRound, beforeSeq) {
  const seen = new Set();
  const out = [];
  for (const effect of effects) {
    if (effect.target !== name) continue;
    if (effect.seq >= beforeSeq) continue;
    if (!stillActive(effect, atRound)) continue;
    const key = effectKey(effect);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(effect);
  }
  return out;
}

function firstSeqOfTurn(bucket) {
  const first = (bucket.actions || []).find(a => a.type === 'uses' || a.type === 'damage' || a.type === 'roll');
  if (first && first.effect) return first.effect.seq;
  if (bucket.actions && bucket.actions.length && bucket.actions[0].seq) return bucket.actions[0].seq;
  return Infinity;
}

function minSeq(bucket, effects, name, round) {
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

function formatEffect(battle, effect) {
  return `  ${nameTag(effect.target)} is under the effect of ${nameTag(effect.skill)} ${fromPhrase(battle, effect.source, effect.target)}. ${effect.mag}`;
}

export function formatBattleReport(battle, formationText) {
  const parsed = parseLog(battle);
  const hp = {};
  for (const character of battle.allCharacters || []) {
    hp[character.name] = Math.round(character.maxHealth);
  }

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
  if (parsed.turnOrder.length) out.push(`Turn order: ${parsed.turnOrder.join(' → ')}`);

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

  for (const pack of parsed.rounds) {
    out.push(BAR);
    out.push(`• Round ${pack.number}`);
    out.push(BAR);
    const order = pack.turnOrder.length ? pack.turnOrder : parsed.turnOrder;
    for (const name of order) {
      const bucket = pack.actors.find(a => a.name === name) || { name, actions: [], cannot: null };
      const cut = minSeq(bucket, parsed.effects, name, pack.number);
      out.push(`${nameTag(name)}${laneSuffix(battle, name)}:`);
      for (const effect of snapshotFor(parsed.effects, name, pack.number, cut)) {
        out.push(formatEffect(battle, effect));
      }
      if (bucket.cannot) {
        out.push(`  ${name} cannot act (${bucket.cannot})`);
      }
      for (const action of bucket.actions) {
        if (action.type === 'uses') {
          if (action.skill === 'Basic Attack') {
            continue;
          }
          out.push(`  ${nameTag(action.actor)} uses [ ${action.skill} ].`);
          continue;
        }
        if (action.type === 'effect') {
          out.push(formatEffect(battle, action.effect));
          continue;
        }
        if (action.type === 'roll') {
          out.push(`  [${action.result}] ${action.skill} → ${action.target} (${action.chance})`);
          continue;
        }
        if (action.type === 'recover') {
          const left = applyHeal(action.target, action.amount);
          out.push(`  ${nameTag(action.actor)} activates [ ${action.skill} ] ${action.actor === action.target ? 'on itself' : `affecting ${nameTag(action.target)}${laneSuffix(battle, action.target)}`}. ${action.detail}.`);
          out.push(`  ${nameTag(action.target)} recovers ${action.amount} troops (${left} remaining).`);
          continue;
        }
        if (action.type === 'damage') {
          const left = applyDamage(action.target, action.amount);
          const atk = action.skill === 'Basic Attack' || !action.skill
            ? 'Basic Attack'
            : action.skill;
          out.push(`  ${nameTag(action.actor)} uses [ ${atk} ] to attack ${nameTag(action.target)}${laneSuffix(battle, action.target)}.`);
          out.push(`  Deals ${action.amount} ${action.dtype} against ${nameTag(action.target)}.`);
          out.push(`  ${nameTag(action.target)} takes ${action.amount} losses (${left} remaining).`);
        }
      }
    }
    if (pack.roster.length) {
      out.push(BAR);
      for (const row of pack.roster) out.push(`  ${row}`);
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
    if (last && last.roster.length) {
      for (const row of last.roster) out.push(`  ${row}`);
    }
  }

  return out.filter((line, index) => !(line === '' && index === 0)).join('\n');
}
