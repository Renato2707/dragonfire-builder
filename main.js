// main.js
// Responsabilidade: Ponto de entrada. Gerencia UI, carrega dados, coordena simulação

import { loadDragons, getDragon, getAllDragons } from './data.js';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync } from './habitParser.js';

let dragonsData = [];
let selectedTeamA = [];
let selectedTeamB = [];
let currentBattle = null;

// Executar ao carregar página
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Inicializando aplicação...');
  
  // Carregar dragões
  dragonsData = await loadDragons();
  if (!dragonsData) {
    document.getElementById('error').textContent = 'Erro ao carregar dados dos dragões';
    return;
  }

  // Populat lista de dragões
  populateDragonSelect();
  
  // Setup event listeners
  document.getElementById('btnAddTeamA').addEventListener('click', addToTeamA);
  document.getElementById('btnAddTeamB').addEventListener('click', addToTeamB);
  document.getElementById('btnRemoveTeamA').addEventListener('click', removeFromTeamA);
  document.getElementById('btnRemoveTeamB').addEventListener('click', removeFromTeamB);
  document.getElementById('btnStartBattle').addEventListener('click', startBattle);
  document.getElementById('btnNextRound').addEventListener('click', nextRound);
  document.getElementById('btnReset').addEventListener('click', reset);

  console.log('✓ Aplicação pronta');
});

function populateDragonSelect() {
  const selectA = document.getElementById('dragonSelect');
  const selectB = document.getElementById('dragonSelectB');
  
  selectA.innerHTML = '<option value="">-- Selecione um dragão --</option>';
  selectB.innerHTML = '<option value="">-- Selecione um dragão --</option>';

  const dragons = getAllDragons();
  if (dragons.length === 0) {
    console.error('Nenhum dragão carregado');
    selectA.innerHTML = '<option value="">ERRO: Dragões não carregados</option>';
    selectB.innerHTML = '<option value="">ERRO: Dragões não carregados</option>';
    return;
  }

  dragons.forEach(dragon => {
    const optionA = document.createElement('option');
    optionA.value = dragon.id;
    optionA.textContent = `${dragon.name} (${dragon.rarity} - ${dragon.breed})`;
    selectA.appendChild(optionA);

    const optionB = document.createElement('option');
    optionB.value = dragon.id;
    optionB.textContent = `${dragon.name} (${dragon.rarity} - ${dragon.breed})`;
    selectB.appendChild(optionB);
  });

  console.log(`✓ ${dragons.length} dragões populados em ambos os selects`);
}

function addToTeamA() {
  const select = document.getElementById('dragonSelect');
  const dragonId = select.value;

  if (!dragonId) {
    alert('Selecione um dragão');
    return;
  }

  if (selectedTeamA.length >= 3) {
    alert('Time A já tem 3 dragões');
    return;
  }

  if (selectedTeamA.some(d => d.id === dragonId)) {
    alert('Dragão já está em Time A');
    return;
  }

  const dragon = getDragon(dragonId);
  selectedTeamA.push(dragon);
  updateTeamDisplay();
}

function addToTeamB() {
  const select = document.getElementById('dragonSelectB');
  const dragonId = select.value;

  if (!dragonId) {
    alert('Selecione um dragão');
    return;
  }

  if (selectedTeamB.length >= 3) {
    alert('Time B já tem 3 dragões');
    return;
  }

  if (selectedTeamB.some(d => d.id === dragonId)) {
    alert('Dragão já está em Time B');
    return;
  }

  const dragon = getDragon(dragonId);
  selectedTeamB.push(dragon);
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

  // Habilitar/desabilitar botão de batalha
  const btnStart = document.getElementById('btnStartBattle');
  btnStart.disabled = selectedTeamA.length !== 3 || selectedTeamB.length !== 3;

  document.getElementById('teamACount').textContent = selectedTeamA.length;
  document.getElementById('teamBCount').textContent = selectedTeamB.length;
}

async function startBattle() {
  if (selectedTeamA.length !== 3 || selectedTeamB.length !== 3) {
    alert('Ambos os times precisam de exatamente 3 dragões');
    return;
  }

  // Criar instâncias de Character
  const teamA = selectedTeamA.map((dragon, idx) => 
    new Character(dragon, 0, idx)
  );
  const teamB = selectedTeamB.map((dragon, idx) => 
    new Character(dragon, 1, idx)
  );

  // Carregar habits para cada character
  console.log('Carregando habits...');
  for (let character of [...teamA, ...teamB]) {
    try {
      // Tentar carregar habits do dragão
      const response = await fetch(`./data/${character.id}_habits.json`);
      if (response.ok) {
        const habitData = await response.json();
        const habits = loadDragonHabitsSync(habitData, character.id);
        character.setHabits(habits);
        character.setHabitRank(3);  // Default rank 3 (★6)
        console.log(`✓ ${character.name}: ${habits.length} habits carregadas`);
      } else {
        console.warn(`Sem habits encontradas para ${character.name}`);
      }
    } catch (error) {
      console.warn(`Erro ao carregar habits de ${character.name}:`, error);
    }
  }

  // Criar e iniciar batalha
  currentBattle = new Battle(teamA, teamB);
  currentBattle.start();
  currentBattle.runRound(); // Primeira rodada

  updateBattleDisplay();
  
  // Desabilitar seleção
  document.getElementById('dragonSelect').disabled = true;
  document.getElementById('dragonSelectB').disabled = true;
  document.getElementById('btnAddTeamA').disabled = true;
  document.getElementById('btnAddTeamB').disabled = true;
  document.getElementById('btnRemoveTeamA').disabled = true;
  document.getElementById('btnRemoveTeamB').disabled = true;
  document.getElementById('btnStartBattle').disabled = true;

  // Habilitar controles de batalha
  document.getElementById('btnNextRound').disabled = false;
  document.getElementById('btnReset').disabled = false;
}

function nextRound() {
  if (!currentBattle || !currentBattle.isActive) {
    alert('Batalha já terminou');
    return;
  }

  const continues = currentBattle.runRound();
  updateBattleDisplay();

  if (!continues) {
    document.getElementById('btnNextRound').disabled = true;
  }
}

function updateBattleDisplay() {
  const logElement = document.getElementById('battleLog');
  logElement.textContent = currentBattle.getLog();
  logElement.scrollTop = logElement.scrollHeight; // Scroll para o final

  // Atualizar status dos times
  const teamAStatus = document.getElementById('teamAStatus');
  const teamBStatus = document.getElementById('teamBStatus');

  teamAStatus.innerHTML = '';
  currentBattle.teamA.forEach(char => {
    const div = document.createElement('div');
    div.className = `character-status ${char.isDead ? 'dead' : ''}`;
    const percent = char.getHealthPercentage();
    div.innerHTML = `
      <div class="name">${char.name}</div>
      <div class="health">${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)}</div>
      <div class="bar" style="width: ${percent}%"></div>
      ${char.activeEffects.length > 0 ? `<div class="effects">${char.activeEffects.map(e => e.name).join(', ')}</div>` : ''}
    `;
    teamAStatus.appendChild(div);
  });

  teamBStatus.innerHTML = '';
  currentBattle.teamB.forEach(char => {
    const div = document.createElement('div');
    div.className = `character-status ${char.isDead ? 'dead' : ''}`;
    const percent = char.getHealthPercentage();
    div.innerHTML = `
      <div class="name">${char.name}</div>
      <div class="health">${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)}</div>
      <div class="bar" style="width: ${percent}%"></div>
      ${char.activeEffects.length > 0 ? `<div class="effects">${char.activeEffects.map(e => e.name).join(', ')}</div>` : ''}
    `;
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

  // Re-habilitar seleção
  document.getElementById('dragonSelect').disabled = false;
  document.getElementById('dragonSelectB').disabled = false;
  document.getElementById('btnAddTeamA').disabled = false;
  document.getElementById('btnAddTeamB').disabled = false;
  document.getElementById('btnRemoveTeamA').disabled = false;
  document.getElementById('btnRemoveTeamB').disabled = false;
  document.getElementById('btnStartBattle').disabled = true;
  document.getElementById('btnNextRound').disabled = true;
  document.getElementById('btnReset').disabled = false;

  updateTeamDisplay();
}

console.log('main.js carregado');
