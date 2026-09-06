import { getDragon } from './data.js';

const SLOTS = [0, 1, 2];
const PREFIX = [
  { id: 'teamA', teamId: 0 },
  { id: 'teamB', teamId: 1 }
];

function injectCss() {
  if (document.getElementById('dfb-habit-slots-css')) return;
  const style = document.createElement('style');
  style.id = 'dfb-habit-slots-css';
  style.textContent = '.habit-slots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin-top:6px;grid-column:2/-1}.habit-slots select{padding:4px;font-size:0.72em}';
  document.head.appendChild(style);
}

function fillRank(select, selected) {
  select.innerHTML = '';
  for (let rank = 1; rank <= 5; rank += 1) {
    const option = document.createElement('option');
    option.value = String(rank);
    option.textContent = String(rank);
    if (rank === selected) option.selected = true;
    select.appendChild(option);
  }
}

function ensureBox(prefix, slot) {
  const hostId = `${prefix}-hrs-${slot}`;
  if (document.getElementById(hostId)) return;
  const habit = document.getElementById(`${prefix}-habit-${slot}`);
  if (!habit) return;
  const box = document.createElement('div');
  box.id = hostId;
  box.className = 'habit-slots';
  const fallback = Number(habit.value) || 1;
  for (let i = 1; i <= 5; i += 1) {
    const sel = document.createElement('select');
    sel.id = `${prefix}-hr-${slot}-${i}`;
    sel.title = `Hábito ${i}`;
    fillRank(sel, fallback);
    sel.addEventListener('change', collect);
    box.appendChild(sel);
  }
  habit.insertAdjacentElement('afterend', box);
  habit.addEventListener('change', () => {
    const value = habit.value;
    for (let i = 1; i <= 5; i += 1) {
      const sel = document.getElementById(`${prefix}-hr-${slot}-${i}`);
      if (sel && !sel.disabled) sel.value = value;
    }
    collect();
  });
}

function syncUnlocks(prefix, slot) {
  const idEl = document.getElementById(`${prefix}-slot-${slot}`);
  const starEl = document.getElementById(`${prefix}-stars-${slot}`);
  if (!idEl || !starEl) return;
  const dragon = idEl.value ? getDragon(idEl.value) : null;
  const stars = Number(starEl.value) || 2;
  const habits = (dragon && dragon.habits) || [];
  for (let i = 1; i <= 5; i += 1) {
    const sel = document.getElementById(`${prefix}-hr-${slot}-${i}`);
    if (!sel) continue;
    const habit = habits[i - 1];
    const unlocked = !!(habit && (habit.unlockStar || 2) <= stars);
    sel.disabled = !unlocked;
    sel.title = habit ? `${habit.name} (${habit.unlockStar}★)` : `Hábito ${i}`;
  }
}

function collect() {
  const out = {};
  PREFIX.forEach(({ id, teamId }) => {
    SLOTS.forEach(slot => {
      syncUnlocks(id, slot);
      const dragonEl = document.getElementById(`${id}-slot-${slot}`);
      const dragon = dragonEl && dragonEl.value ? getDragon(dragonEl.value) : null;
      const fallback = Number((document.getElementById(`${id}-habit-${slot}`) || {}).value) || 1;
      const ranks = {};
      ((dragon && dragon.habits) || []).forEach((habit, index) => {
        const el = document.getElementById(`${id}-hr-${slot}-${index + 1}`);
        ranks[habit.name] = el && !el.disabled ? (Number(el.value) || fallback) : fallback;
      });
      out[`${teamId}:${slot}`] = ranks;
    });
  });
  globalThis.__dfbPendingRanks = out;
}

function bootPanel() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('teamA-habit-0')) return;
  injectCss();
  PREFIX.forEach(({ id }) => SLOTS.forEach(slot => ensureBox(id, slot)));
  collect();
  ['teamA', 'teamB'].forEach(prefix => {
    SLOTS.forEach(slot => {
      ['slot', 'stars', 'habit'].forEach(kind => {
        const el = document.getElementById(`${prefix}-${kind}-${slot}`);
        if (el) el.addEventListener('change', collect);
      });
    });
  });
  const start = document.getElementById('btnStartBattle');
  if (start) start.addEventListener('click', collect, true);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(bootPanel, 0));
  } else {
    setTimeout(bootPanel, 0);
  }
}
