// main.js

import { loadDragons, getDragon, getAllDragons } from './data.js';
import { Character, SLOT_NAMES, DEFAULT_LEVEL, DEFAULT_STARS, DEFAULT_HABIT_RANK } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { troopAdvantageSign, TROOP_ADVANTAGE_PCT } from './troopAdvantage.js';

const SLOTS = [0, 1, 2];
const BAR = '═'.repeat(55);
const CORE_STAT_NAMES = new Set(['Strength', 'Instinct', 'Intelligence', 'Initiative']);
const TROOP_TYPES = [
  { id: '', label: '—' },
  { id: 'shieldbearers', label: 'Shieldbearers' },
  { id: 'archers', label: 'Archers' },
  { id: 'spearmen', label: 'Spearmen' },
  { id: 'cavalry', label: 'Cavalry' },
  { id: 'siege', label: 'Siege' }
];

let dragonsData = [];
let currentBattle = null;
let formationHeader = '';

document.addEventListener('DOMContentLoaded', async () => {
  dragonsData = await loadDragons();
  if (!dragonsData) {
    document.getElementById('error').textContent = 'Erro ao carregar dados dos dragões';
    return;
  }
  populateSlotSelects();
  fillTroopSelect(document.getElementById('teamA-troop'));
  fillTroopSelect(document.getElementById('teamB-troop'));
  SLOTS.forEach(slot => {
    ['teamA', 'teamB'].forEach(prefix => {
      document.getElementById(`${prefix}-slot-${slot}`).addEventListener('change', onFormationChange);
    });
  });
  document.getElementById('btnStartBattle').addEventListener('click', startBattle);
  document.getElementById('btnNextRound').addEventListener('click', nextRound);
  document.getElementById('btnReset').addEventListener('click', reset);
  onFormationChange();
});

function fillTroopSelect(select) {
  select.innerHTML = '';
  TROOP_TYPES.forEach(troop => {
    const option = document.createElement('option');
    option.value = troop.id;
    option.textContent = troop.label;
    select.appendChild(option);
  });
}

function formatAffinities(dragon) {
  const list = (dragon.affinity || []).map(name => {
    const found = TROOP_TYPES.find(troop => troop.id === String(name).toLowerCase().replace(/[\s_-]/g, ''));
    return found && found.label ? found.label : name;
  });
  return list.length ? list.join('/') : '—';
}

function dragonOptionLabel(dragon) {
  return `${dragon.name} (${dragon.rarity}, ${dragon.breed}, ${formatAffinities(dragon)})`;
}

function fillDragonSelect(select) {
  select.innerHTML = '<option value="">—</option>';
  getAllDragons()
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(dragon => {
      const option = document.createElement('option');
      option.value = dragon.id;
      option.textContent = dragonOptionLabel(dragon);
      select.appendChild(option);
    });
}

function fillLevelSelect(select) {
  select.innerHTML = '';
  for (let level = 1; level <= 50; level += 1) {
    const option = document.createElement('option');
    option.value = String(level);
    option.textContent = `Lv ${level}`;
    if (level === DEFAULT_LEVEL) option.selected = true;
    select.appendChild(option);
  }
}

function fillStarSelect(select) {
  select.innerHTML = '';
  for (let stars = 1; stars <= 10; stars += 1) {
    const option = document.createElement('option');
    option.value = String(stars);
    option.textContent = `${stars}★`;
    if (stars === DEFAULT_STARS) option.selected = true;
    select.appendChild(option);
  }
}

function fillHabitSelect(select) {
  select.innerHTML = '';
  for (let rank = 1; rank <= 5; rank += 1) {
    const option = document.createElement('option');
    option.value = String(rank);
    option.textContent = `Lvl ${rank}`;
    if (rank === DEFAULT_HABIT_RANK) option.selected = true;
    select.appendChild(option);
  }
}

function populateSlotSelects() {
  SLOTS.forEach(slot => {
    ['teamA', 'teamB'].forEach(prefix => {
      fillDragonSelect(document.getElementById(`${prefix}-slot-${slot}`));
      fillLevelSelect(document.getElementById(`${prefix}-level-${slot}`));
      fillStarSelect(document.getElementById(`${prefix}-stars-${slot}`));
      fillHabitSelect(document.getElementById(`${prefix}-habit-${slot}`));
    });
  });
}

function readNumber(id, fallback) {
  const value = Number(document.getElementById(id).value);
  return Number.isFinite(value) ? value : fallback;
}

function readTroop(prefix) {
  return document.getElementById(`${prefix}-troop`).value || null;
}

function troopLabel(id) {
  const found = TROOP_TYPES.find(troop => troop.id === id);
  return found && found.id ? found.label : '—';
}

function teamTroopOf(team) {
  return team && team[0] ? team[0].troopType : null;
}

function advantagePhrase(ownTroop, enemyTroop) {
  const sign = troopAdvantageSign(ownTroop, enemyTroop);
  if (!sign) return '';
  if (sign > 0) return ` Advantage (+${TROOP_ADVANTAGE_PCT}% DMG)`;
  return ` Disadvantage (−${TROOP_ADVANTAGE_PCT}% DMG)`;
}

function affinityLine(character) {
  const pct = typeof character.getTroopAffinityPct === 'function' ? character.getTroopAffinityPct() : 0;
  if (pct > 0) return '  +20% to Dragon Stats';
  if (pct < 0) return '  −20% to Dragon Stats';
  return '';
}

function formatTeamFormation(title, team, enemyTroop) {
  const troop = teamTroopOf(team);
  const lines = [
    `${title}:  ${troopLabel(troop)}${advantagePhrase(troop, enemyTroop)}`
  ];
  SLOTS.forEach(slot => {
    const character = team.find(c => c.slotPosition === slot);
    if (!character) {
      lines.push(`  ${SLOT_NAMES[slot]} · —`);
      return;
    }
    const cap = Math.round(character.maxHealth);
    lines.push(
      `  ${SLOT_NAMES[slot]} · ${character.name}: ${cap}/${cap} Troop Capacity${affinityLine(character)}`
    );
  });
  return lines.join('\n');
}

function formatTroopFormation(battle) {
  return [
    BAR,
    'Troop Formation',
    BAR,
    formatTeamFormation('Team A', battle.teamA, teamTroopOf(battle.teamB)),
    formatTeamFormation('Team B', battle.teamB, teamTroopOf(battle.teamA)),
    ''
  ].join('\n');
}

function findCharacter(battle, name) {
  if (!battle || !name) return null;
  return (battle.allCharacters || []).find(c => c && c.name === name) || null;
}

function nameTag(name) {
  return `[ ${name} ]`;
}

function actorTag(name, battle) {
  const character = findCharacter(battle, name);
  const lane = character ? (character.positionName || SLOT_NAMES[character.slotPosition] || '') : '';
  return lane ? `${nameTag(name)} (${lane})` : nameTag(name);
}

function fromPhrase(source, target) {
  if (!source) return '';
  if (source === target) return 'from itself';
  return `from ${nameTag(source)}`;
}

function isBar(line) {
  return /^═+$/.test(String(line || '').trim());
}

function skillLabel(raw) {
  const text = String(raw || '').trim();
  if (/\(Vanguard\)$/i.test(text) || text === 'Vanguard') return 'Vanguard';
  return text;
}

function formatMagnitude(stat, rawValue, isVanguard) {
  const value = String(rawValue || '').trim();
  const numeric = value.replace('%', '');
  if (isVanguard && CORE_STAT_NAMES.has(stat)) return `${numeric} ${stat}`;
  if (value.includes('%')) return `${value} ${stat}`;
  return `${value} ${stat}`;
}

function effectLine(target, skill, source, magnitude) {
  return `  ${nameTag(target)} is under the effect of ${nameTag(skill)} ${fromPhrase(source, target)}. ${magnitude}`;
}

function rewriteLine(battle, line, ctx) {
  const text = String(line || '').trim();
  if (!text) return { text: '', section: ctx.section };

  let match = text.match(/^(.+?) activates (.+)$/);
  if (match) {
    const actor = match[1];
    const rawSkill = match[2];
    const vanguard = /\(Vanguard\)$/i.test(rawSkill) || rawSkill === 'Vanguard';
    const skill = skillLabel(rawSkill);
    ctx.actor = actor;
    ctx.skill = skill;
    ctx.vanguard = vanguard;
    if (vanguard) ctx.section = 'prep';
    else if (ctx.section === 'prep') ctx.section = 'combat';
    return {
      text: `  ${actorTag(actor, battle)} uses [ ${skill} ].`,
      section: ctx.section
    };
  }

  match = text.match(/^(.+?) launches a 2nd Basic Attack/);
  if (match) {
    ctx.actor = match[1];
    ctx.skill = 'Basic Attack';
    ctx.vanguard = false;
    ctx.section = 'combat';
    return { text: `  ${actorTag(match[1], battle)} uses [ Basic Attack ] (Double-Strike) to attack.`, section: 'combat' };
  }

  match = text.match(/^(.+?) launches a Basic Attack/);
  if (match) {
    ctx.actor = match[1];
    ctx.skill = 'Basic Attack';
    ctx.vanguard = false;
    ctx.section = 'combat';
    return { text: `  ${actorTag(match[1], battle)} uses [ Basic Attack ] to attack.`, section: 'combat' };
  }

  match = text.match(/^Deals (\d+) (.+) to (.+)$/);
  if (match) {
    ctx.section = 'combat';
    return {
      text: `  Deals ${match[1]} ${match[2]} against ${actorTag(match[3], battle)}. ${nameTag(match[3])} takes ${match[1]} losses.`,
      section: 'combat'
    };
  }

  match = text.match(/^(Increases|Reduces) (.+) of (.+?) by ([+\-][\d.]+%?)(?:\s+(.+))?$/);
  if (match) {
    const stat = match[2].replace(/ \(excluding Basic Attacks\)/, '');
    const target = match[3];
    const magnitude = formatMagnitude(stat, match[4], ctx.vanguard);
    const skill = ctx.skill || 'effect';
    const source = ctx.actor || target;
    return {
      text: effectLine(target, skill, source, magnitude),
      section: ctx.section
    };
  }

  match = text.match(/^Afflicts (.+) with (.+)$/);
  if (match) {
    const skill = ctx.skill || 'effect';
    const source = ctx.actor || match[1];
    return {
      text: `  ${nameTag(match[1])} is under the effect of ${nameTag(skill)} ${fromPhrase(source, match[1])}. ${match[2]}`,
      section: ctx.section
    };
  }

  match = text.match(/^Grants (.+) to (.+)$/);
  if (match) {
    const skill = ctx.skill || 'effect';
    const source = ctx.actor || match[2];
    return {
      text: `  ${nameTag(match[2])} is under the effect of ${nameTag(skill)} ${fromPhrase(source, match[2])}. ${match[1]}`,
      section: ctx.section
    };
  }

  match = text.match(/^Applies Recovery to (.+) \((.+)\)(.*)$/);
  if (match) {
    return { text: `  ${nameTag(match[1])} gains ${match[2]} Recovery.`, section: ctx.section };
  }

  match = text.match(/^Turn order: (.+)$/);
  if (match) return { text: `  Turn order: ${match[1]}`, section: 'combat' };

  if (/^Team [AB]:$/.test(text) || /Troop Capacity/.test(text) || /^Final Status/.test(text)) {
    return { text: `  ${text}`, section: ctx.section };
  }

  return { text: `  ${text}`, section: ctx.section };
}

function formatBattleReport(battle) {
  const lines = battle.battleLog || [];
  const prep = [];
  const combat = [];
  const ctx = { actor: null, skill: null, vanguard: false, section: 'prep' };
  let i = 0;
  let skipRoster = false;
  let combatHeader = false;

  const push = item => {
    if (!item || !item.text) return;
    if (item.section === 'prep') prep.push(item.text);
    else combat.push(item.text);
  };

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] || '';

    if (isBar(line) && next === 'Start of Combat') {
      i += 3;
      skipRoster = true;
      ctx.section = 'prep';
      continue;
    }
    if (isBar(line) && /^Start of Round /.test(next)) {
      const number = (next.match(/Round (\d+)/) || [])[1] || '';
      if (!combatHeader) {
        combat.push(BAR, 'Combat Phase', BAR);
        combatHeader = true;
      }
      combat.push(BAR, `Round ${number}`, BAR);
      i += 3;
      skipRoster = false;
      ctx.section = 'combat';
      continue;
    }
    if (isBar(line) && next === 'Combat End') {
      combat.push(BAR, 'Combat End', BAR);
      i += 3;
      skipRoster = false;
      ctx.section = 'combat';
      continue;
    }
    if (isBar(line)) {
      if (skipRoster) skipRoster = false;
      i += 1;
      continue;
    }
    if (skipRoster && (/^Team [AB]:$/.test(line) || /Troop Capacity/.test(line))) {
      i += 1;
      continue;
    }
    push(rewriteLine(battle, line, ctx));
    i += 1;
  }

  const out = [BAR, 'Preparations', BAR];
  if (prep.length) out.push(...prep);
  else out.push('  (no city upgrades / boosts)');
  if (combat.length) out.push(...combat);
  return out.join('\n');
}

function readTeam(prefix) {
  return SLOTS.map(slot => {
    const id = document.getElementById(`${prefix}-slot-${slot}`).value;
    if (!id) return null;
    return {
      dragon: getDragon(id),
      slot,
      level: readNumber(`${prefix}-level-${slot}`, DEFAULT_LEVEL),
      stars: readNumber(`${prefix}-stars-${slot}`, DEFAULT_STARS),
      habitRank: readNumber(`${prefix}-habit-${slot}`, DEFAULT_HABIT_RANK)
    };
  });
}

function teamReady(entries) {
  if (entries.some(entry => !entry)) return false;
  const ids = entries.map(entry => entry.dragon.id);
  return new Set(ids).size === 3;
}

function onFormationChange() {
  const teamA = readTeam('teamA');
  const teamB = readTeam('teamB');
  const duplicateA = teamA.filter(Boolean).length === 3 && !teamReady(teamA);
  const duplicateB = teamB.filter(Boolean).length === 3 && !teamReady(teamB);
  const error = document.getElementById('error');
  if (duplicateA || duplicateB) {
    error.textContent = 'Cada time: um dragão por posição, sem repetir.';
  } else {
    error.textContent = '';
  }
  document.getElementById('btnStartBattle').disabled = !teamReady(teamA) || !teamReady(teamB);
}

function setSlotsDisabled(disabled) {
  document.getElementById('teamA-troop').disabled = disabled;
  document.getElementById('teamB-troop').disabled = disabled;
  document.getElementById('defending-team').disabled = disabled;
  SLOTS.forEach(slot => {
    ['teamA', 'teamB'].forEach(prefix => {
      document.getElementById(`${prefix}-slot-${slot}`).disabled = disabled;
      document.getElementById(`${prefix}-level-${slot}`).disabled = disabled;
      document.getElementById(`${prefix}-stars-${slot}`).disabled = disabled;
      document.getElementById(`${prefix}-habit-${slot}`).disabled = disabled;
    });
  });
}

async function loadKit(character) {
  try {
    const habitRes = await fetch(`./data/${character.id}_habits.json`);
    if (habitRes.ok) {
      const habitData = await habitRes.json();
      character.setHabits(loadDragonHabitsSync(habitData, character.id));
    }
  } catch (error) {
    console.warn(`Habits: ${character.name}`, error);
  }
  try {
    const cmdRes = await fetch(`./data/${character.id}_vanguard_command.json`);
    if (cmdRes.ok) {
      const cmdData = await cmdRes.json();
      const kit = loadCommandSync(cmdData, character.id);
      character.commandName = kit.name;
      character.setCommandKit(kit.command);
      character.setVanguardKit(kit.vanguard);
    }
  } catch (error) {
    console.warn(`Vanguard/Command: ${character.name}`, error);
  }
}

function buildTeam(prefix, teamId) {
  const troop = readTroop(prefix);
  return readTeam(prefix).map(entry => {
    const character = new Character(entry.dragon, teamId, entry.slot, {
      level: entry.level,
      stars: entry.stars,
      habitRank: entry.habitRank
    });
    character.setTroopType(troop);
    return character;
  });
}

async function startBattle() {
  const teamA = buildTeam('teamA', 0);
  const teamB = buildTeam('teamB', 1);
  if (teamA.length !== 3 || teamB.length !== 3) return;
  for (const character of [...teamA, ...teamB]) await loadKit(character);
  currentBattle = new Battle(teamA, teamB, {
    teamTroop: [readTroop('teamA'), readTroop('teamB')],
    defendingTeam: Number(document.getElementById('defending-team').value)
  });
  currentBattle.start();
  formationHeader = formatTroopFormation(currentBattle);
  currentBattle.runRound();
  updateBattleDisplay();
  setSlotsDisabled(true);
  document.getElementById('btnStartBattle').disabled = true;
  document.getElementById('btnNextRound').disabled = false;
  document.getElementById('btnReset').disabled = false;
}

function nextRound() {
  if (!currentBattle || !currentBattle.isActive) return;
  const continues = currentBattle.runRound();
  updateBattleDisplay();
  if (!continues) document.getElementById('btnNextRound').disabled = true;
}

function affinityNote(character) {
  const pct = typeof character.getTroopAffinityPct === 'function' ? character.getTroopAffinityPct() : 0;
  if (pct > 0) return ' · +20% to Dragon Stats';
  if (pct < 0) return ' · −20% to Dragon Stats';
  return '';
}

function renderStatus(container, team, enemyTroop) {
  container.innerHTML = '';
  const troop = teamTroopOf(team);
  const header = document.createElement('div');
  header.className = 'health';
  header.textContent = `Tropa: ${troopLabel(troop)}${advantagePhrase(troop, enemyTroop)}`;
  header.style.marginBottom = '8px';
  container.appendChild(header);
  SLOTS.forEach(slot => {
    const char = team.find(c => c.slotPosition === slot);
    const div = document.createElement('div');
    if (!char) {
      div.className = 'character-status';
      div.innerHTML = `<div class="name">${SLOT_NAMES[slot]}</div><div class="health">—</div>`;
      container.appendChild(div);
      return;
    }
    div.className = `character-status ${char.isDead ? 'dead' : ''}`;
    const percent = char.getHealthPercentage();
    div.innerHTML = `<div class="name">${SLOT_NAMES[slot]} · ${char.name}</div><div class="health">Lv ${char.level} · ${char.stars}★ · Lvl ${char.habitRank} · ${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)}${affinityNote(char)}</div><div class="bar" style="width: ${percent}%"></div>`;
    container.appendChild(div);
  });
}

function updateBattleDisplay() {
  const logElement = document.getElementById('battleLog');
  logElement.textContent = formationHeader + formatBattleReport(currentBattle);
  logElement.scrollTop = logElement.scrollHeight;
  renderStatus(document.getElementById('teamAStatus'), currentBattle.teamA, teamTroopOf(currentBattle.teamB));
  renderStatus(document.getElementById('teamBStatus'), currentBattle.teamB, teamTroopOf(currentBattle.teamA));
}

function reset() {
  currentBattle = null;
  formationHeader = '';
  document.getElementById('battleLog').textContent = 'Monte a formação. Tropa do time liga Affinity (+20%) só nos dragões que têm essa tropa.';
  document.getElementById('teamAStatus').innerHTML = '';
  document.getElementById('teamBStatus').innerHTML = '';
  setSlotsDisabled(false);
  onFormationChange();
  document.getElementById('btnNextRound').disabled = true;
  document.getElementById('btnReset').disabled = true;
}
