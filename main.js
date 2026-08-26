// main.js

import { loadDragons, getDragon, getAllDragons } from './data.js';
import { Character, SLOT_NAMES, DEFAULT_LEVEL, DEFAULT_STARS, DEFAULT_HABIT_RANK } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { troopAdvantageSign, TROOP_ADVANTAGE_PCT } from './troopAdvantage.js';

const SLOTS = [0, 1, 2];
const BAR = '═'.repeat(55);
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

function tagged(name, battle) {
  const character = findCharacter(battle, name);
  if (!character) return `[ ${name} ]`;
  const lane = character.positionName || SLOT_NAMES[character.slotPosition] || '';
  return `[ ${name} ] (${lane})`;
}

function isBar(line) {
  return /^═+$/.test(String(line || '').trim());
}

function rewriteLine(battle, line) {
  const raw = String(line || '');
  const text = raw.trim();
  if (!text) return '';

  let match = text.match(/^(.+?) activates (.+)$/);
  if (match) return `  ${tagged(match[1], battle)} uses [ ${match[2]} ]`;

  match = text.match(/^(.+?) launches a 2nd Basic Attack/);
  if (match) return `  ${tagged(match[1], battle)} uses [ Basic Attack ] (Double-Strike)`;

  match = text.match(/^(.+?) launches a Basic Attack/);
  if (match) return `  ${tagged(match[1], battle)} uses [ Basic Attack ]`;

  match = text.match(/^Deals (\d+) (.+) to (.+)$/);
  if (match) {
    return `  Deals ${match[1]} ${match[2]} against ${tagged(match[3], battle)}. ${tagged(match[3], battle)} takes ${match[1]} losses.`;
  }

  match = text.match(/^Increases (.+) of (.+) by (.+)$/);
  if (match) return `  ${tagged(match[2], battle)} is under the effect: ${match[1]} ${match[3]}.`;

  match = text.match(/^Reduces (.+) of (.+) by (.+)$/);
  if (match) return `  ${tagged(match[2], battle)} is under the effect: ${match[1]} ${match[3]}.`;

  match = text.match(/^Afflicts (.+) with (.+)$/);
  if (match) return `  ${tagged(match[1], battle)} is afflicted with ${match[2]}.`;

  match = text.match(/^Grants (.+) to (.+)$/);
  if (match) return `  ${tagged(match[2], battle)} is granted ${match[1]}.`;

  match = text.match(/^Applies Recovery to (.+) \((.+)\)(.*)$/);
  if (match) return `  Applies Recovery to ${tagged(match[1], battle)} (${match[2]})${match[3] || ''}`;

  match = text.match(/^Turn order: (.+)$/);
  if (match) return `  Turn order: ${match[1]}`;

  if (/^Team [AB]:$/.test(text) || /Troop Capacity/.test(text) || /^Final Status/.test(text)) {
    return raw.startsWith('  ') ? raw : `  ${text}`;
  }

  return raw.startsWith('  ') ? raw : `  ${text}`;
}

function formatBattleReport(battle) {
  const lines = battle.battleLog || [];
  const out = [];
  let i = 0;
  let skipRoster = false;

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] || '';

    if (isBar(line) && next === 'Start of Combat') {
      out.push(BAR, 'Preparations', BAR);
      i += 3;
      skipRoster = true;
      continue;
    }
    if (isBar(line) && /^Start of Round /.test(next)) {
      const number = (next.match(/Round (\d+)/) || [])[1] || '';
      out.push(BAR, `Round ${number}`, BAR);
      i += 3;
      skipRoster = false;
      continue;
    }
    if (isBar(line) && next === 'Combat End') {
      out.push(BAR, 'Combat End', BAR);
      i += 3;
      skipRoster = false;
      continue;
    }
    if (isBar(line)) {
      if (skipRoster) {
        skipRoster = false;
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (skipRoster && (/^Team [AB]:$/.test(line) || /Troop Capacity/.test(line))) {
      i += 1;
      continue;
    }
    const rewritten = rewriteLine(battle, line);
    if (rewritten !== '') out.push(rewritten);
    i += 1;
  }
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
