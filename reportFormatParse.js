import {
  isBar, nameTag, findCharacter, laneSuffix, fromPhrase, vanguardTitle,
  cleanSkillName, isVanguardSkill, splitTarget, stackMag
} from './reportFormatKit.js';
import {
  formatMagnitude, parseDuration, parseRecoveryLine, isRetreatEvent, isRosterRow
} from './reportFormatMisc.js';

export function parseLog(battle) {
  const lines = battle.battleLog || [];
  const effects = [];
  const rounds = [];
  let phase = 'combat_start';
  let round = 0;
  let actor = null;
  let skill = null;
  let vanguard = false;
  let seq = 0;
  let endKind = null;
  let skipRoster = false;

  const ensureRound = number => {
    let found = rounds.find(r => r.number === number);
    if (!found) {
      found = { number, turnOrder: [], actors: [], roster: [], ticks: [] };
      rounds.push(found);
    }
    if (!found.ticks) found.ticks = [];
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
      turn: phase === 'turns' || phase === 'round_start'
    };
    effects.push(effect);
    if ((phase === 'turns' || phase === 'round_start') && actor) {
      actorBucket(round || 1, actor).actions.push({ type: 'effect', effect });
    }
  };

  const pushAction = (name, action) => {
    if (!name) return;
    actorBucket(round || 1, name).actions.push(action);
  };

  let i = 0;
  while (i !== lines.length) {
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
    if (isBar(line) || !line) {
      skipRoster = false;
      i += 1;
      continue;
    }

    let match = line.match(/^Turn order: (.+)$/);
    if (match) {
      const names = match[1].split(/\s*→\s*/).map(s => s.trim()).filter(Boolean);
      if (round) ensureRound(round).turnOrder = names;
      if (phase === 'round_start') phase = 'turns';
      i += 1;
      continue;
    }

    match = line.match(/^Applies Recovery to (.+)$/);
    if (match) {
      const heal = parseRecoveryLine(battle, actor, skill, match[1]);
      if (heal.tick) ensureRound(round || 1).ticks.push(heal);
      else if (actor) pushAction(actor, heal);
      else ensureRound(round || 1).ticks.push(heal);
      i += 1;
      continue;
    }

    if (isRetreatEvent(line)) {
      i += 1;
      continue;
    }

    if (skipRoster && isRosterRow(line)) {
      i += 1;
      continue;
    }

    if (isRosterRow(line)) {
      if (round) ensureRound(round).roster.push(line);
      i += 1;
      continue;
    }

    match = line.match(/^(.+?) activates (.+)$/);
    if (match) {
      actor = match[1];
      vanguard = isVanguardSkill(battle, actor, match[2]);
      skill = vanguard ? vanguardTitle(battle, actor) : cleanSkillName(match[2]);
      if (!vanguard && (phase === 'turns' || phase === 'round_start')) {
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

    match = line.match(/^(.+?) cannot (act|activate Commands or Habits|launch a Basic Attack) \((.+)\)/);
    if (match) {
      actorBucket(round || 1, match[1]).cannot = `${match[2]} (${match[3]})`;
      i += 1;
      continue;
    }

    match = line.match(/^Deals (\d+) (.+) to (.+)$/);
    if (match) {
      if (actor) {
        pushAction(actor, {
          type: 'damage',
          actor,
          skill,
          target: match[3],
          amount: Number(match[1]),
          dtype: match[2]
        });
      }
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
      const excludeBasic = /excluding Basic Attacks/i.test(match[2]);
      const stat = match[2].replace(/ \(excluding Basic Attacks\)/i, '');
      let mag = formatMagnitude(stat, match[4], vanguard, match[5], battle, actor, skill);
      if (excludeBasic && !/excluding Basic Attacks/i.test(mag)) {
        mag = `${mag} (excluding Basic Attacks)`;
      }
      pushEffect(match[3], mag, match[5]);
      i += 1;
      continue;
    }

    match = line.match(/^Afflicts (.+) with (.+)$/);
    if (match) {
      const split = splitTarget(battle, match[1]);
      pushEffect(split.name, [match[2], split.rest].filter(Boolean).join(' '), match[2]);
      i += 1;
      continue;
    }

    match = line.match(/^Grants (.+) to (.+)$/);
    if (match) {
      const split = splitTarget(battle, match[2]);
      pushEffect(split.name, [match[1], split.rest].filter(Boolean).join(' '), match[2]);
      i += 1;
      continue;
    }

    match = line.match(/^Copies (.+?) from (.+) to (.+?)(?:\s+((?:for|until) .+))?$/);
    if (match) {
      pushEffect(match[3].trim(), match[1].trim(), match[4] || '');
      i += 1;
      continue;
    }

    match = line.match(/^(.+?) gains (\d+) stacks? of (.+?) \(now (\d+)\)(.*)$/);
    if (match) {
      const n = Number(match[4]);
      actor = actor || match[1];
      skill = skill || match[3];
      pushEffect(match[1], stackMag(battle, actor, skill, match[3], n), match[5]);
      i += 1;
      continue;
    }

    i += 1;
  }

  return { effects, rounds, endKind };
}
