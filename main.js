// main.js

import { loadDragons, getDragon, getAllDragons } from './data.js';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';

let dragonsData = [];
let selectedTeamA = [];
let selectedTeamB = [];
let currentBattle = null;

document.addEventListener('DOMContentLoaded', async () => {
  dragonsData = await loadDragons();
  if (!dragonsData) {
    document.getElementById('error').textContent = 'Erro ao carregar dados dos dragões';
    return;
  }
  populateDragonSelect();
  document.getElementById('btnAddTeamA').addEventListener('click', addToTeamA);
  document.getElementById('btnAddTeamB').addEventListener('click', addToTeamB);
  document.getElementById('btnRemoveTeamA').addEventListener('click', removeFromTeamA);
  document.getElementById('btnRemoveTeamB').addEventListener('click', removeFromTeamB);
  document.getElementById('btnStartBattle').addEventListener('click', startBattle);
  document.getElementById('btnNextRound').addEventListener('click', nextRound);
  document.getElementById('btnReset').addEventListener('click', reset);
});

function populateDragonSelect() {
  const selectA = document.getElementById('dragonSelect');
  const selectB = document.getElementById('dragonSelectB');
  selectA.innerHTML = '<option value="">-- Selecione um dragão --</option>';
  selectB.innerHTML = '<option value="">-- Selecione um dragão --</option>';
  getAllDragons().forEach(dragon => {
    const optionA = document.createElement('option');
    optionA.value = dragon.id;
    optionA.textContent = `${dragon.name} (${dragon.rarity} - ${dragon.breed})`;
    selectA.appendChild(optionA);
    const optionB = document.createElement('option');
    optionB.value = dragon.id;
    optionB.textContent = `${dragon.name} (${dragon.rarity} - ${dragon.breed})`;
    selectB.appendChild(optionB);
  });
}

function addToTeamA() {
  const dragonId = document.getElementById('dragonSelect').value;
  if (!dragonId || selectedTeamA.length >= 3 || selectedTeamA.some(d => d.id === dragonId)) return;
  selectedTeamA.push(getDragon(dragonId));
  updateTeamDisplay();
}

function addToTeamB() {
  const dragonId = document.getElementById('dragonSelectB').value;
  if (!dragonId || selectedTeamB.length >= 3 || selectedTeamB.some(d => d.id === dragonId)) return;
  selectedTeamB.push(getDragon(dragonId));
  updateTeamDisplay();
}

function removeFromTeamA() {
  const index = document.getElementById('teamAList').selectedIndex;
  if (index >= 0) {
    selectedTeamA.splice(index, 1);
    updateTeamDisplay();
  }
}

function removeFromTeamB() {
  const index = document.getElementById('teamBList').selectedIndex;
  if (index >= 0) {
    selectedTeamB.splice(index, 1);
    updateTeamDisplay();
  }
}

function updateTeamDisplay() {
  const listA = document.getElementById('teamAList');
  const listB = document.getElementById('teamBList');
  listA.innerHTML = '';
  selectedTeamA.forEach((dragon, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `${dragon.name} (${dragon.rarity})`;
    listA.appendChild(option);
  });
  listB.innerHTML = '';
  selectedTeamB.forEach((dragon, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `${dragon.name} (${dragon.rarity})`;
    listB.appendChild(option);
  });
  document.getElementById('btnStartBattle').disabled = selectedTeamA.length !== 3 || selectedTeamB.length !== 3;
  document.getElementById('teamACount').textContent = selectedTeamA.length;
  document.getElementById('teamBCount').textContent = selectedTeamB.length;
}

async function loadKit(character) {
  try {
    const habitRes = await fetch(`./data/${character.id}_habits.json`);
    if (habitRes.ok) {
      const habitData = await habitRes.json();
      character.setHabits(loadDragonHabitsSync(habitData, character.id));
      character.setHabitRank(3);
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

async function startBattle() {
  if (selectedTeamA.length !== 3 || selectedTeamB.length !== 3) return;
  const teamA = selectedTeamA.map((dragon, idx) => new Character(dragon, 0, idx));
  const teamB = selectedTeamB.map((dragon, idx) => new Character(dragon, 1, idx));
  for (const character of [...teamA, ...teamB]) await loadKit(character);
  currentBattle = new Battle(teamA, teamB);
  currentBattle.start();
  currentBattle.runRound();
  updateBattleDisplay();
  document.getElementById('dragonSelect').disabled = true;
  document.getElementById('dragonSelectB').disabled = true;
  document.getElementById('btnAddTeamA').disabled = true;
  document.getElementById('btnAddTeamB').disabled = true;
  document.getElementById('btnRemoveTeamA').disabled = true;
  document.getElementById('btnRemoveTeamB').disabled = true;
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

function updateBattleDisplay() {
  const logElement = document.getElementById('battleLog');
  logElement.textContent = currentBattle.getLog();
  logElement.scrollTop = logElement.scrollHeight;
  const teamAStatus = document.getElementById('teamAStatus');
  const teamBStatus = document.getElementById('teamBStatus');
  teamAStatus.innerHTML = '';
  currentBattle.teamA.forEach(char => {
    const div = document.createElement('div');
    div.className = `character-status ${char.isDead ? 'dead' : ''}`;
    const percent = char.getHealthPercentage();
    div.innerHTML = `<div class="name">${char.name}</div><div class="health">${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)}</div><div class="bar" style="width: ${percent}%"></div>`;
    teamAStatus.appendChild(div);
  });
  teamBStatus.innerHTML = '';
  currentBattle.teamB.forEach(char => {
    const div = document.createElement('div');
    div.className = `character-status ${char.isDead ? 'dead' : ''}`;
    const percent = char.getHealthPercentage();
    div.innerHTML = `<div class="name">${char.name}</div><div class="health">${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)}</div><div class="bar" style="width: ${percent}%"></div>`;
    teamBStatus.appendChild(div);
  });
}

function reset() {
  currentBattle = null;
  selectedTeamA = [];
  selectedTeamB = [];
  document.getElementById('battleLog').textContent = '';
  document.getElementById('teamAStatus').innerHTML = '';
  document.getElementById('teamBStatus').innerHTML = '';
  document.getElementById('dragonSelect').disabled = false;
  document.getElementById('dragonSelectB').disabled = false;
  document.getElementById('btnAddTeamA').disabled = false;
  document.getElementById('btnAddTeamB').disabled = false;
  document.getElementById('btnRemoveTeamA').disabled = false;
  document.getElementById('btnRemoveTeamB').disabled = false;
  document.getElementById('btnStartBattle').disabled = true;
  document.getElementById('btnNextRound').disabled = true;
  updateTeamDisplay();
}
