// main.js

import { loadDragons, getDragon, getAllDragons } from './data.js';
import { Character, SLOT_NAMES, DEFAULT_LEVEL, DEFAULT_STARS, DEFAULT_HABIT_RANK } from './character.js';
import { Battle } from './battle.js';
import { applyInitiativeOrder } from './hook-initiative-order.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { troopAdvantageSign, TROOP_ADVANTAGE_PCT } from './troopAdvantage.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';

applyInitiativeOrder(Battle);

const SLOTS = [0, 1, 2];
const BAR = '═'.repeat(55);
const DASH = '- '.repeat(27).trim();
const FORMATIONS_KEY = 'dfb-formations';
const LAST_KEY = '_last';
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

async function boot() {
  dragonsData = await loadDragons();
  if (!dragonsData) {
    setStatus('Erro ao carregar dados dos dragões', true);
    return;
  }
  populateSlotSelects();
  fillTroopSelect(document.getElementById('teamA-troop'));
  fillTroopSelect(document.getElementById('teamB-troop'));
  SLOTS.forEach(slot => {
    ['teamA', 'teamB'].forEach(prefix => {
      ['slot', 'level', 'stars', 'habit'].forEach(kind => {
        document.getElementById(`${prefix}-${kind}-${slot}`).addEventListener('change', onFormationChange);
      });
    });
  });
  document.getElementById('teamA-troop').addEventListener('change', onFormationChange);
  document.getElementById('teamB-troop').addEventListener('change', onFormationChange);
  document.getElementById('defending-team').addEventListener('change', onFormationChange);
  document.getElementById('btnStartBattle').addEventListener('click', startBattle);
  document.getElementById('btnNextRound').addEventListener('click', nextRound);
  document.getElementById('btnReset').addEventListener('click', reset);
  document.getElementById('btnSaveFormation').addEventListener('click', saveNamedFormation);
  document.getElementById('btnLoadFormation').addEventListener('click', loadSelectedFormation);
  document.getElementById('btnDeleteFormation').addEventListener('click', deleteSelectedFormation);
  document.getElementById('saved-formation').addEventListener('change', () => {
    const name = document.getElementById('saved-formation').value;
    if (!name) return;
    document.getElementById('formation-name').value = name;
    loadNamed(name);
  });
  refreshFormationList();
  const last = readStore()[LAST_KEY];
  if (last) applyFormation(last);
  onFormationChange();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

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
    '• Troop Formation',
    DASH,
    'This section shows how both teams were set up at the beginning',
    BAR,
    formatTeamFormation('Team A', battle.teamA, teamTroopOf(battle.teamB)),
    formatTeamFormation('Team B', battle.teamB, teamTroopOf(battle.teamA)),
    ''
  ].join('\n');
}

function snapshotTeam(prefix) {
  return {
    troop: readTroop(prefix),
    slots: SLOTS.map(slot => ({
      id: document.getElementById(`${prefix}-slot-${slot}`).value || '',
      level: document.getElementById(`${prefix}-level-${slot}`).value,
      stars: document.getElementById(`${prefix}-stars-${slot}`).value,
      habit: document.getElementById(`${prefix}-habit-${slot}`).value
    }))
  };
}

function snapshotFormation() {
  return {
    defending: document.getElementById('defending-team').value,
    teamA: snapshotTeam('teamA'),
    teamB: snapshotTeam('teamB')
  };
}

function applyTeam(prefix, data) {
  if (!data) return;
  if (data.troop != null) document.getElementById(`${prefix}-troop`).value = data.troop || '';
  (data.slots || []).forEach((slot, index) => {
    const id = document.getElementById(`${prefix}-slot-${index}`);
    const level = document.getElementById(`${prefix}-level-${index}`);
    const stars = document.getElementById(`${prefix}-stars-${index}`);
    const habit = document.getElementById(`${prefix}-habit-${index}`);
    if (id && slot.id != null) id.value = slot.id;
    if (level && slot.level != null) level.value = String(slot.level);
    if (stars && slot.stars != null) stars.value = String(slot.stars);
    if (habit && slot.habit != null) habit.value = String(slot.habit);
  });
}

function applyFormation(data) {
  if (!data) return;
  applyTeam('teamA', data.teamA);
  applyTeam('teamB', data.teamB);
  if (data.defending != null) document.getElementById('defending-team').value = String(data.defending);
}

function setStatus(text, isError) {
  const box = document.getElementById('formation-status');
  if (box) {
    box.textContent = text || '';
    box.style.color = isError ? '#b07070' : '#8a8a8a';
  }
  const error = document.getElementById('error');
  if (error && isError) error.textContent = text || '';
  else if (error && error.textContent === text) error.textContent = '';
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(FORMATIONS_KEY) || '{}') || {};
  } catch (error) {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(FORMATIONS_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    setStatus('Não deu para salvar neste navegador (localStorage bloqueado).', true);
    return false;
  }
}

function namedKeys(store) {
  return Object.keys(store || {}).filter(name => name !== LAST_KEY).sort((a, b) => a.localeCompare(b));
}

function refreshFormationList(selected) {
  const select = document.getElementById('saved-formation');
  const names = namedKeys(readStore());
  select.innerHTML = '<option value="">—</option>';
  names.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  if (selected) select.value = selected;
}

function nextDefaultName() {
  const names = namedKeys(readStore());
  let n = names.length + 1;
  let name = `Formação ${n}`;
  while (names.includes(name)) {
    n += 1;
    name = `Formação ${n}`;
  }
  return name;
}

function pickName() {
  return (document.getElementById('formation-name').value || '').trim()
    || document.getElementById('saved-formation').value
    || '';
}

function saveNamedFormation() {
  let name = pickName();
  if (!name) {
    name = nextDefaultName();
    document.getElementById('formation-name').value = name;
  }
  const store = readStore();
  store[name] = snapshotFormation();
  store[LAST_KEY] = store[name];
  if (!writeStore(store)) return;
  refreshFormationList(name);
  setStatus(`Formação "${name}" salva.`);
}

function loadNamed(name) {
  const store = readStore();
  if (!name || !store[name]) {
    setStatus('Escolha uma formação na lista ou digite o nome salvo.', true);
    return;
  }
  if (currentBattle) reset();
  applyFormation(store[name]);
  document.getElementById('formation-name').value = name;
  refreshFormationList(name);
  onFormationChange();
  setStatus(`Formação "${name}" carregada.`);
}

function loadSelectedFormation() {
  loadNamed(pickName());
}

function deleteSelectedFormation() {
  const name = pickName();
  if (!name) {
    setStatus('Escolha a formação para apagar.', true);
    return;
  }
  const store = readStore();
  if (!store[name]) {
    setStatus(`Não achei "${name}" para apagar.`, true);
    return;
  }
  delete store[name];
  writeStore(store);
  document.getElementById('formation-name').value = '';
  refreshFormationList();
  setStatus(`Formação "${name}" apagada.`);
}

function persistLast() {
  const store = readStore();
  store[LAST_KEY] = snapshotFormation();
  writeStore(store);
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
  persistLast();
  const teamA = readTeam('teamA');
  const teamB = readTeam('teamB');
  const duplicateA = teamA.filter(Boolean).length === 3 && !teamReady(teamA);
  const duplicateB = teamB.filter(Boolean).length === 3 && !teamReady(teamB);
  const error = document.getElementById('error');
  if (duplicateA || duplicateB) {
    error.textContent = 'Cada time: um dragão por posição, sem repetir.';
  } else if (error.textContent === 'Cada time: um dragão por posição, sem repetir.') {
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
      character.vanguardName = VANGUARD_NAMES[character.id] || kit.name;
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
  logElement.textContent = formatBattleReport(currentBattle, formationHeader);
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
