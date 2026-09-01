const BREED_RE = /^(champion|warrior|hunter|sentinel)$/;
const TROOP_RE = /^(shieldbearers|archers|spearmen|cavalry|siege)$/;
const STAT_MAP = {
  strength: 'str',
  intelligence: 'int',
  initiative: 'init',
  instinct: 'inst'
};

const LINE_RE = /\[\s*([^\]]+?)\s*\]\s*\(\s*([+\-\u25b2\u25bc\u2191\u2193\u2197\u2198]?)\s*([0-9]+(?:\.[0-9]+)?)\s*%\s*\)/g;

function norm(s) {
  return String(s || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z]+/g, ' ').trim();
}

function signOf(mark) {
  return /[\-\u25bc\u2193\u2198]/.test(String(mark || '')) ? -1 : 1;
}

export function parsePreparations(text) {
  const mods = [];
  const blob = String(text || '');
  LINE_RE.lastIndex = 0;
  let match;
  while ((match = LINE_RE.exec(blob))) {
    const label = norm(match[1]);
    const value = signOf(match[2]) * Number(match[3]);
    if (!Number.isFinite(value) || !value) continue;
    if (/rss|non player|towns|castles|seats of power/.test(label)) continue;
    if (/^siege /.test(label) && /damage vs/.test(label)) continue;

    const parts = label.split(' ').filter(Boolean);
    let scope = 'all';
    let rest = label;
    if (parts[0] === 'all' && parts[1] === 'breeds') {
      scope = 'all';
      rest = parts.slice(2).join(' ');
    } else if (BREED_RE.test(parts[0])) {
      scope = parts[0];
      rest = parts.slice(1).join(' ');
    } else if (TROOP_RE.test(parts[0])) {
      scope = parts[0];
      rest = parts.slice(1).join(' ');
    }

    let stat = null;
    if (/incoming damage/.test(rest)) stat = 'dmg_received';
    else if (STAT_MAP[rest]) stat = STAT_MAP[rest];
    else if (rest === 'damage') stat = 'dmg_dealt';
    if (!stat) continue;
    mods.push({ scope, stat, value, raw: match[1].trim() });
  }
  return mods;
}

function troopOf(character) {
  return String(character.troopType || '').toLowerCase().replace(/[\s_-]/g, '');
}

function breedOf(character) {
  return String(character.breed || '').toLowerCase();
}

function applies(mod, character) {
  if (mod.scope === 'all') return true;
  if (BREED_RE.test(mod.scope)) return breedOf(character) === mod.scope;
  if (TROOP_RE.test(mod.scope)) return troopOf(character) === mod.scope;
  return false;
}

export function applyPreparations(team, text) {
  const mods = parsePreparations(text);
  const applied = [];
  for (const character of team || []) {
    for (const mod of mods) {
      if (!applies(mod, character)) continue;
      character.addStatModifier(mod.stat, mod.value, 'combat');
      applied.push(character.name + ': ' + mod.raw + ' ' + (mod.value > 0 ? '+' : '') + mod.value + '%');
    }
  }
  return { mods, applied };
}
