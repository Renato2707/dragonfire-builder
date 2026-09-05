import { SLOT_NAMES } from './character.js';
import { VANGUARD_NAMES } from './vanguardNames.js';

export const BAR = '═'.repeat(55);
export const DASH = '- '.repeat(27).trim();
export const CORE_STAT_NAMES = new Set(['Strength', 'Instinct', 'Intelligence', 'Initiative']);
export const ENHANCE_STAT = {
  Strength: 'str',
  Instinct: 'inst',
  Intelligence: 'int',
  Initiative: 'init'
};
export const STAT_KEYS = {
  Strength: 'str',
  Instinct: 'inst',
  Intelligence: 'int',
  Initiative: 'init',
  'Damage Dealt': 'dmg_dealt',
  'Damage Received': 'dmg_received',
  'Fire Damage Dealt': 'fire_dealt',
  'Fire Damage Received': 'fire_received',
  'Physical Damage Dealt': 'physical_dealt',
  'Physical Damage Received': 'physical_received',
  'Tactical Damage Dealt': 'tactical_dealt',
  'Tactical Damage Received': 'tactical_received',
  'Recovery Dealt': 'recovery_dealt',
  'Recovery Received': 'recovery_received'
};

export const STAT_LABELS = Object.fromEntries(Object.entries(STAT_KEYS).map(([label, key]) => [key, label]));

export function isBar(line) {
  return /^═+$/.test(String(line || '').trim());
}

export function nameTag(name) {
  return `[ ${name} ]`;
}

export function findCharacter(battle, name) {
  if (!battle || !name) return null;
  return (battle.allCharacters || []).find(c => c && c.name === name) || null;
}

export function laneOf(battle, name) {
  const character = findCharacter(battle, name);
  return character ? (character.positionName || SLOT_NAMES[character.slotPosition] || '') : '';
}

export function laneSuffix(battle, name) {
  const lane = laneOf(battle, name);
  return lane ? ` (${lane})` : '';
}

export function fromPhrase(battle, source, target) {
  if (!source) return '';
  if (source === target) return 'from itself';
  return `from ${nameTag(source)}${laneSuffix(battle, source)}`;
}

export function vanguardTitle(battle, actorName) {
  const character = findCharacter(battle, actorName);
  if (!character) return 'Vanguard';
  return character.vanguardName || VANGUARD_NAMES[character.id] || 'Vanguard';
}

export function cleanSkillName(skillName) {
  return String(skillName || '').replace(/\s*\(Vanguard\)$/i, '').trim();
}

export function isVanguardSkill(battle, actor, skillName) {
  const clean = cleanSkillName(skillName);
  if (!clean || /^Vanguard$/i.test(clean)) return true;
  const title = vanguardTitle(battle, actor);
  if (title && title.toLowerCase() === clean.toLowerCase()) return true;
  return Object.values(VANGUARD_NAMES).some(name => name.toLowerCase() === clean.toLowerCase());
}

export function splitTarget(battle, raw) {
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

export function kitList(character) {
  if (!character) return [];
  return [
    ...(character.parsedHabits || []),
    character.commandKit,
    character.vanguardKit
  ].filter(Boolean);
}

export function kitMatches(character, habit, skill) {
  const want = cleanSkillName(skill).toLowerCase();
  if (!want || !habit) return false;
  const habitName = String(habit.name || '');
  if (habitName.toLowerCase() === want) return true;
  const isVanguardKit = habit === (character && character.vanguardKit) || / Vanguard$/i.test(habitName);
  if (isVanguardKit) {
    const titles = [
      character && character.vanguardName,
      character && character.id && VANGUARD_NAMES[character.id]
    ];
    return titles.some(name => name && String(name).toLowerCase() === want);
  }
  const habitBare = habitName.replace(/ Vanguard$/i, '');
  return habitBare.toLowerCase() === want;
}

export function basePctFor(battle, sourceName, skill, statLabel) {
  const character = findCharacter(battle, sourceName);
  const key = STAT_KEYS[statLabel] || String(statLabel || '').toLowerCase().replace(/\s+/g, '_');
  if (!character || !key) return null;
  const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
  for (const habit of kitList(character)) {
    if (!kitMatches(character, habit, skill)) continue;
    const blocks = habit.blocks || habit.structured || [];
    for (const block of blocks) {
      for (const action of block.actions || []) {
        for (const mod of action.mods || []) {
          if (mod.stat !== key) continue;
          const arr = mod.fixed != null ? mod.fixed : mod.pct;
          if (Array.isArray(arr)) return arr[rankIndex];
          if (typeof arr === 'number') return arr;
        }
      }
    }
  }
  return null;
}

export function signedPct(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return String(value);
  const rounded = Math.round(amount * 100) / 100;
  if (rounded > 0) return `+${rounded}%`;
  return `${rounded}%`;
}


export function stackMag(battle, sourceName, skill, stackName, count) {
  const base = count === 1 ? `1 stack of ${stackName}` : `${count} stacks of ${stackName}`;
  const character = findCharacter(battle, sourceName);
  if (!character) return base;
  const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
  const want = String(stackName || '').toLowerCase().replace(/\s+/g, '_');
  const collect = (requireSkill) => {
    const parts = [];
    for (const habit of kitList(character)) {
      const nameMatch = String(habit && habit.name || '').toLowerCase() === String(skill || '').toLowerCase();
      if (requireSkill && !kitMatches(character, habit, skill) && !nameMatch) continue;
      for (const block of habit.blocks || habit.structured || []) {
        for (const action of block.actions || []) {
          if (action.t !== 'stack') continue;
          const id = String(action.id || '').toLowerCase();
          if (id && id !== want) continue;
          for (const mod of action.mods || []) {
            const arr = mod.fixed != null ? mod.fixed : mod.pct;
            const per = Array.isArray(arr) ? arr[rankIndex] : arr;
            if (typeof per !== 'number') continue;
            const label = STAT_LABELS[mod.stat] || mod.stat;
            const total = per * count;
            const basic = action.excludeBasic || mod.excludeBasic ? ' (excluding Basic Attacks)' : '';
            if (mod.fixed != null) {
              parts.push(`${total > 0 ? '+' : ''}${total} ${label}${basic}`);
            } else {
              parts.push(`${signedPct(total)} ${label}${basic}`);
            }
          }
          if (parts.length) return `${base} (${parts.join(', ')})`;
        }
      }
    }
    return null;
  };
  return collect(true) || collect(false) || base;
}
