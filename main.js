// main.js

import { loadDragons, getDragon, getAllDragons } from './data.js';
import { Character, SLOT_NAMES, DEFAULT_LEVEL, DEFAULT_STARS, DEFAULT_HABIT_RANK } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';

const SLOTS = [0, 1, 2];

let dragonsData = [];
let currentBattle = null;

document.addEventListener('DOMContentLoaded', async () => {
  dragonsData = await loadDragons();
  if (!dragonsData) {
    document.getElementById('error').textContent = 'Erro ao carregar dados dos dragões';
    return;
  }
  populateSlotSelects();
  SLOTS.forEach(slot => {
    document.getElementById(`teamA-slot-${slot}`).addEventListener('change', onFormationChange);
    document.getElementById(`teamB-slot-${slot}`).addEventListener('change', onFormationChange);
  });
  document.getElementById('btnStartBattle').addEventListener('click', startBattle);
  document.getElementById('btnNextRound').addEventListener('click', nextRound);
  document.getElementById('btnReset').addEventListener('click', reset);
  onFormationChange();
});

function fillSelect(select) {
  select.innerHTML = '<option value="">—</option>';
  getAllDragons().forEach(dragon => {
    const option = document.createElement('option');
    option.value = dragon.id;
    option.textContent = dragon.name;
    select.appendChild(option);
  });
}

function populateSlotSelects() {
  SLOTS.forEach(slot => {
    fillSelect(document.getElementById(`teamA-slot-${slot}`));
    fillSelect(document.getElementById(`teamB-slot-${slot}`));
  });
}

function readTeam(prefix) {
  return SLOTS.map(slot => {
    const id = document.getElementById(`${prefix}-slot-${slot}`).value;
    return id ? { dragon: getDragon(id), slot } : null;
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
  SLOTS.forEach(slot => {
    document.getElementById(`teamA-slot-${slot}`).disabled = disabled;
    document.getElementById(`teamB-slot-${slot}`).disabled = disabled;
  });
}

async function loadKit(character) {
  try {
    const habitRes = await fetch(`./data/${character.id}_habits.json`);
    if (habitRes.ok) {
      const habitData = await habitRes.json();
      character.setHabits(loadDragonHabitsSync(habitData, character.id));
      character.setHabitRank(DEFAULT_HABIT_RANK);
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
  return readTeam(prefix).map(entry => new Character(entry.dragon, teamId, entry.slot, {
    level: DEFAULT_LEVEL,
    stars: DEFAULT_STARS,
    habitRank: DEFAULT_HABIT_RANK
  }));
}

async function startBattle() {
  const teamA = buildTeam('teamA', 0);
  const teamB = buildTeam('teamB', 1);
  if (teamA.length !== 3 || teamB.length !== 3) return;
  for (const character of [...teamA, ...teamB]) await loadKit(character);
  currentBattle = new Battle(teamA, teamB);
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

function reset() {
  currentBattle = null;
  document.getElementById('battleLog').textContent = 'Monte Left Flank, Vanguard e Right Flank em cada time.';
  document.getElementById('teamAStatus').innerHTML = '';
  document.getElementById('teamBStatus').innerHTML = '';
  SLOTS.forEach(slot => {
    document.getElementById(`teamA-slot-${slot}`).value = '';
    document.getElementById(`teamB-slot-${slot}`).value = '';
  });
  setSlotsDisabled(false);
  document.getElementById('btnStartBattle').disabled = true;
  document.getElementById('btnNextRound').disabled = true;
  document.getElementById('btnReset').disabled = true;
  document.getElementById('error').textContent = '';
}
