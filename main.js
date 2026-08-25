// main.js

import { loadDragons, getDragon, getAllDragons } from './data.js';
import { Character, SLOT_NAMES, DEFAULT_LEVEL, DEFAULT_STARS, DEFAULT_HABIT_RANK } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';

const SLOTS = [0, 1, 2];
const TROOP_TYPES = [
  { id: '', label: '—' },
  { id: 'archers', label: 'Archers' },
  { id: 'shieldbearers', label: 'Shieldbearers' },
  { id: 'spearmen', label: 'Spearmen' },
  { id: 'cavalry', label: 'Cavalry' },
  { id: 'siege', label: 'Siege' }
];

let dragonsData = [];
let currentBattle = null;

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

function fillDragonSelect(select) {
  select.innerHTML = '<option value="">—</option>';
  getAllDragons().forEach(dragon => {
    const option = document.createElement('option');
    option.value = dragon.id;
    option.textContent = dragon.name;
    select.appendChild(option);
  });
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
    option.textContent = `H${rank}`;
    if (rank === DEFAULT_HABIT_RANK) option.selected = true;
    select.appendChild(option);
  }
}

function populateSlotSelects() {
  SLOTS.forEach(slot => {
    ['teamA', 'teamB'].forEach(prefix => {
      fillDragonSelect(document.getElementById(`${prefix}-slot-${slot}`));
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

function readTeam(prefix) {
  return SLOTS.map(slot => {
    const id = document.getElementById(`${prefix}-slot-${slot}`).value;
    if (!id) return null;
    return {
      dragon: getDragon(id),
      slot,
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
  SLOTS.forEach(slot => {
    ['teamA', 'teamB'].forEach(prefix => {
      document.getElementById(`${prefix}-slot-${slot}`).disabled = disabled;
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
      level: DEFAULT_LEVEL,
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
    teamTroop: [readTroop('teamA'), readTroop('teamB')]
  });
  currentBattle.start();
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

function renderStatus(container, team) {
  container.innerHTML = '';
  const troop = team[0] ? troopLabel(team[0].troopType) : '—';
  const header = document.createElement('div');
  header.className = 'health';
  header.textContent = `Tropa: ${troop}`;
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
    div.innerHTML = `<div class="name">${SLOT_NAMES[slot]} · ${char.name}</div><div class="health">Nv ${char.level} · ${char.stars}★ · H${char.habitRank} · ${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)}</div><div class="bar" style="width: ${percent}%"></div>`;
    container.appendChild(div);
  });
}

function updateBattleDisplay() {
  const logElement = document.getElementById('battleLog');
  logElement.textContent = currentBattle.getLog();
  logElement.scrollTop = logElement.scrollHeight;
  renderStatus(document.getElementById('teamAStatus'), currentBattle.teamA);
  renderStatus(document.getElementById('teamBStatus'), currentBattle.teamB);
}

function resetProgressSelects() {
  document.getElementById('teamA-troop').value = '';
  document.getElementById('teamB-troop').value = '';
  SLOTS.forEach(slot => {
    ['teamA', 'teamB'].forEach(prefix => {
      document.getElementById(`${prefix}-slot-${slot}`).value = '';
      document.getElementById(`${prefix}-stars-${slot}`).value = String(DEFAULT_STARS);
      document.getElementById(`${prefix}-habit-${slot}`).value = String(DEFAULT_HABIT_RANK);
    });
  });
}

function reset() {
  currentBattle = null;
  document.getElementById('battleLog').textContent = 'Monte a formação. Tropa do time liga hábitos como Adaptive Guard.';
  document.getElementById('teamAStatus').innerHTML = '';
  document.getElementById('teamBStatus').innerHTML = '';
  resetProgressSelects();
  setSlotsDisabled(false);
  document.getElementById('btnStartBattle').disabled = true;
  document.getElementById('btnNextRound').disabled = true;
  document.getElementById('btnReset').disabled = true;
  document.getElementById('error').textContent = '';
}
