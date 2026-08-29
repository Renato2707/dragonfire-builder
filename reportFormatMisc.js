import { healRateOf } from './healRate.js';
import {
  ENHANCE_STAT, STAT_KEYS, CORE_STAT_NAMES, kitList, kitMatches, basePctFor,
  signedPct, findCharacter, splitTarget, cleanSkillName
} from './reportFormatKit.js';

export function isStackMag(mag) {
  return /\d+ stacks? of /.test(String(mag || ''));
}
export function scaledByStat(character, base, by) {
  if (base == null || !character || !by) return null;
  const key = ENHANCE_STAT[by];
  if (!key || typeof character.getModifiedStat !== 'function') return null;
  return Math.round(Number(base) * (1 + character.getModifiedStat(key) / 100) * 100) / 100;
}

export function formatMagnitude(stat, rawValue, isVanguard, extra, battle, source, skill) {
  const value = String(rawValue || '').trim();
  const signed = value.match(/^([+\-]?)([\d.]+%?)$/);
  const sign = signed ? (signed[1] || (String(signed[2]).startsWith('-') ? '-' : '+')) : '';
  const amount = signed ? signed[2] : value.replace(/^\++/, '');
  const scaled = signed
    ? `${sign === '-' ? '-' : '+'}${amount}${/%/.test(amount) ? '' : '%'}`
    : value;
  const enhance = String(extra || '').match(/enhanced by ([A-Za-z]+)/i);
  if (isVanguard && CORE_STAT_NAMES.has(stat) && !enhance) {
    return `+${String(amount).replace('%', '')} ${stat}`;
  }
  if (enhance) {
    const base = basePctFor(battle, source, skill, stat);
    if (base != null) {
      return `${signedPct(base)} ${stat} (enhanced by ${enhance[1]} → ${scaled})`;
    }
    return `${scaled} ${stat} (enhanced by ${enhance[1]})`;
  }
  if (signed) return `${sign === '-' ? '-' : '+'}${amount} ${stat}`;
  return `${value} ${stat}`;
}

export function parseDuration(extra) {
  const text = String(extra || '');
  if (/until the end of combat/i.test(text) || /end of combat/i.test(text)) return 'combat';
  if (/until the end of the round/i.test(text)) return 1;
  const rounds = text.match(/(\d+)\s+round/);
  return rounds ? Number(rounds[1]) : 'combat';
}

const PCT_MAG = /^([+\-]?\d+(?:\.\d+)?)(%?) (.+)$/;

export function combinePctMag(a, b) {
  const ma = String(a || '').match(PCT_MAG);
  const mb = String(b || '').match(PCT_MAG);
  if (!ma || !mb || ma[2] !== mb[2] || ma[3] !== mb[3]) return null;
  const sum = Math.round((Number(ma[1]) + Number(mb[1])) * 100) / 100;
  const signed = sum > 0 ? `+${sum}` : `${sum}`;
  return `${signed}${ma[2]} ${ma[3]}`;
}

export function mergeMags(mags) {
  const out = [];
  for (const mag of mags || []) {
    let merged = false;
    for (let i = 0; i < out.length; i += 1) {
      const combined = combinePctMag(out[i], mag);
      if (combined) {
        out[i] = combined;
        merged = true;
        break;
      }
      if (out[i] === mag) {
        merged = true;
        break;
      }
    }
    if (!merged) out.push(mag);
  }
  return out;
}

export function effectKey(effect) {
  return [effect.target, effect.skill, effect.source, effect.mag].join('|');
}

export function isRosterRow(line) {
  if (/^Team [AB]:$/.test(line) || /^Final Status/.test(line)) return true;
  return /^(Left Flank|Vanguard|Right Flank) · /.test(line);
}

export function isRetreatEvent(line) {
  return /^[A-Za-z][A-Za-z' -]* retreated$/.test(line);
}

export function lastTeamSnapshot(rows) {
  const filtered = (rows || []).filter(isRosterRow);
  let start = -1;
  for (let i = 0; i !== filtered.length; i += 1) {
    if (filtered[i] === 'Team A:') start = i;
  }
  return start >= 0 ? filtered.slice(start) : filtered;
}

export function parseRecoveryLine(battle, actor, skill, raw) {
  const split = splitTarget(battle, actor && raw);
  const caster = findCharacter(battle, actor);
  const rate = skill && skill !== 'Basic Attack' ? healRateOf(caster, skill) : null;
  const amount = Number((split.rest.match(/\+?(\d+)\s+Troop Capacity/i) || [])[1] || 0);
  const by = (split.rest.match(/enhanced by (\w+)/i) || [])[1];
  const scaled = scaledByStat(caster, rate, by);
  let detail = 'Recovery';
  if (rate != null && scaled != null && by) {
    detail = `Recovery +${rate}% (enhanced by ${by} → +${scaled}%)`;
  } else if (rate != null && by) {
    detail = `Recovery +${rate}%, enhanced by ${by}`;
  } else if (rate != null) {
    detail = `Recovery +${rate}%`;
  }
  return {
    type: 'recover',
    actor: actor || split.name,
    skill: skill && skill !== 'Basic Attack' ? skill : 'Recovery',
    target: split.name,
    amount,
    detail,
    tick: !skill || skill === 'Basic Attack'
  };
}
