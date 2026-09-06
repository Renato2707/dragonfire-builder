import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';
import { hasEffect } from './effects.js';

applyVanguardLabel(Battle);

function dummy(id, name, team, slot, stats, breed, options) {
  return new Character({
    id, name, breed: breed || 'Warrior', rarity: 'Rare',
    stats: stats || { str: 50, inst: 50, int: 50, init: 40 },
    affinity: [], weaknesses: []
  }, team, slot, options || { level: 16, stars: 2, habitRank: 1 });
}

function loadKit(character, habits, cmd) {
  character.setHabits(loadDragonHabitsSync(habits, character.id));
  const kit = loadCommandSync(cmd, character.id);
  character.commandName = kit.name;
  character.vanguardName = VANGUARD_NAMES[character.id] || kit.name;
  character.setCommandKit(kit.command);
  character.setVanguardKit(kit.vanguard);
}

function setup(randomFn, extras = {}) {
  Math.random = randomFn;
  const habits = JSON.parse(fs.readFileSync('./data/syrax_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/syrax_vanguard_command.json', 'utf8'));
  const data = {
    id: 'syrax', name: 'Syrax', rarity: 'Legendary', breed: 'Sentinel',
    stats: { str: 40, inst: 64, int: 58, init: 53 },
    affinity: ['spearmen', 'archers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const sx = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  sx.setTroopType('spearmen');
  loadKit(sx, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 55, int: 50, init: 30 }, extras.leftBreed || 'Hunter');
  if (left) left.setTroopType('spearmen');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 55, inst: 30, int: 30, init: 30 }, extras.rightBreed || 'Warrior');
  if (right) {
    right.setTroopType('spearmen');
    if (extras.chipRight) right.currentHealth = Math.floor(right.maxHealth * 0.55);
  }

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 }, extras.e0Breed || 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 }, extras.e1Breed || 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 }, extras.e2Breed || 'Sentinel');

  const battle = new Battle([left, sx, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, sx, left, right, e0, e1, e2 };
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

function rN(raw, n) {
  return (raw.split('Start of Round ' + n)[1] || '').split('Start of Round ' + (n + 1))[0] || '';
}

function cmdChunk(raw, n) {
  const chunk = rN(raw, n);
  const after = chunk.split('Syrax activates Blazing Fury')[1] || '';
  return after.split('Syrax launches')[0].split('Syrax activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/syrax_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/syrax_habits.json', 'utf8'));

check('JSON command Blazing Fury', kitCmd.name === 'Blazing Fury');
check('JSON each-round 20% fire_dealt + First-Strike prefer fire dealer', kitCmd.command[0].chance === 20 && kitCmd.command[0].rounds.length === 10 && kitCmd.command[0].actions[0].mods[0].stat === 'fire_dealt' && kitCmd.command[0].actions[0].mods[0].pct === 10 && kitCmd.command[0].actions[0].dur === 2 && kitCmd.command[0].actions[0].tgt.select === 'prefer_dealer:fire' && kitCmd.command[0].actions[1].st === 'first_strike');
check('JSON tactical adjacency +110 R1,4,6,9', kitCmd.command[1].rounds.join() === '1,4,6,9' && kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 110 && kitCmd.command[1].actions[0].tgt.select === 'adjacency');
check('JSON command has no built-in R2 recovery (habit Strategic Revival)', !JSON.stringify(kitCmd.command).includes('heal'));
check('JSON vanguard tactical +16 self', kitCmd.vanguard[0].actions[0].mods[0].stat === 'tactical_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT flat 20 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].mods[1].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Mindful Synergy|Flight Mastery|Strategic Revival|Tactical Inferno|Mother's Mercy");
check('JSON Mindful Synergy INT/INST 6.5 scale init 3 allies', kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === 6.5 && kitHab.habits[0].structured[0].actions[0].scaleStat === 'init' && kitHab.habits[0].structured[0].actions[0].tgt.count === 3);
check('JSON Flight Mastery ally +6 / enemy -6 scale inst', kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 6 && kitHab.habits[1].structured[0].actions[1].mods[0].pct[0] === -6 && kitHab.habits[1].structured[0].actions[0].scaleStat === 'inst');
check('JSON Strategic Revival R2,5,8 heal lowest troops 1.5x if Slow', kitHab.habits[2].structured[0].rounds.join() === '2,5,8' && kitHab.habits[2].structured[0].actions[0].t === 'heal' && kitHab.habits[2].structured[0].actions[0].pct[0] === 50 && kitHab.habits[2].structured[0].actions[0].ifBonus.anyEnemyStatus === 'slow' && kitHab.habits[2].structured[0].actions[0].ifBonus.mult === 1.5 && kitHab.habits[2].structured[0].actions[0].tgt.select === 'lowest:troops');
check('JSON Strategic Revival resistance 25% 2r last_buff', kitHab.habits[2].structured[0].actions[1].st === 'resistance' && kitHab.habits[2].structured[0].actions[1].chance[0] === 25 && kitHab.habits[2].structured[0].actions[1].val === 20);
check('JSON Tactical Inferno R1 prefer L tactical / R fire 18% 3r', kitHab.habits[3].structured[0].rounds.join() === '1' && kitHab.habits[3].structured[0].actions[0].tgt.select === 'prefer_lane:L' && kitHab.habits[3].structured[0].actions[1].tgt.select === 'prefer_lane:R' && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 18 && kitHab.habits[3].structured[0].actions[0].dur === 3);
check("JSON Mother's Mercy 14% cleanse 2 neg + 1 control prefer_control", kitHab.habits[4].structured[0].actions[0].chance[0] === 14 && kitHab.habits[4].structured[0].actions[0].negative === 2 && kitHab.habits[4].structured[0].actions[0].control === 1 && kitHab.habits[4].structured[0].actions[0].tgt.select === 'prefer_control');
check("vanguardNames Syrax Sentinel's Wit", VANGUARD_NAMES.syrax === "Sentinel's Wit");

const main = setup(() => 0, { chipRight: true });
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/syrax-report.txt', report);
fs.writeFileSync('./tmp/syrax-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Syrax lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Syrax|Sentinel's Wit|Blazing Fury|Mindful Synergy|Flight Mastery|Strategic Revival|Tactical Inferno|Mother's Mercy|First-Strike|First Strike|Resistance/.test(line)) {
    console.log(line);
  }
}

check("vanguard Sentinel's Wit", report.includes("Sentinel's Wit"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Blazing Fury (Vanguard)', !/Blazing Fury \(Vanguard\)/.test(raw) && !/Blazing Fury \(Vanguard\)/.test(report));
check('command Blazing Fury', report.includes('Blazing Fury') && /Syrax activates Blazing Fury/.test(raw));
check('Mindful Synergy', report.includes('Mindful Synergy') || /Mindful Synergy/.test(raw));
check('Flight Mastery', report.includes('Flight Mastery') || /Flight Mastery/.test(raw));
check('Strategic Revival', report.includes('Strategic Revival') || /Strategic Revival/.test(raw));
check('Tactical Inferno', report.includes('Tactical Inferno') || /Tactical Inferno/.test(raw));
check("Mother's Mercy", report.includes("Mother's Mercy") || /Mother's Mercy/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Tactical Damage Dealt +16%', /\+16% Tactical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank Sentinel's Wit", /\[ AllyL \] is under the effect of \[ Sentinel's Wit \]/.test(report));
check("right flank no Sentinel's Wit", !/\[ AllyR \] is under the effect of \[ Sentinel's Wit \]/.test(report));

check('R1 tactical adjacency', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 1)));
check('R2 no tactical command (recovery round)', !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 2)));
check('R3 no tactical command', !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 3)));
check('R4 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 4)));
check('R6 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 6)));
check('R9 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 9)));
check('R2 Strategic Revival recovery', /Strategic Revival/.test(rN(raw, 2)) || /Recovers \d+/.test(rN(raw, 2)) || /Recovery/.test(rN(raw, 2)));
check('R5 Strategic Revival', /Strategic Revival/.test(rN(raw, 5)) || /Recovers \d+/.test(rN(raw, 5)) || /Recovery/.test(rN(raw, 5)));
check('R8 Strategic Revival', /Strategic Revival/.test(rN(raw, 8)) || /Recovers \d+/.test(rN(raw, 8)) || /Recovery/.test(rN(raw, 8)));

check('engine self tactical_dealt +16', main.sx.getPercentTotal('tactical_dealt') === 16, 'tac=' + main.sx.getPercentTotal('tactical_dealt'));
check('engine left flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right no vanguard flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0);
check('seed 0 First-Strike on fire-prefer ally', hasEffect(main.left, 'first_strike') || hasEffect(main.sx, 'first_strike') || hasEffect(main.right, 'first_strike') || /First-Strike|First Strike/.test(raw));
check('seed 0 Mother Mercy attempt or cleanse line', /Mother's Mercy/.test(raw) || /Cleanse/.test(raw));

const r1 = setup(() => 0, { chipRight: true });
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Mindful + Flight + Inferno + Fury', /Mindful Synergy/.test(rawR1) && /Flight Mastery/.test(rawR1) && /Tactical Inferno/.test(rawR1) && /Blazing Fury/.test(rawR1));
check('R1 no Strategic Revival (R2/5/8 only)', !/Strategic Revival/.test(rawR1));
check('R1 Tactical Inferno left tactical / right fire', r1.left.getPercentTotal('tactical_dealt') === 18 && r1.right.getPercentTotal('fire_dealt') === 18, 'L tac=' + r1.left.getPercentTotal('tactical_dealt') + ' R fire=' + r1.right.getPercentTotal('fire_dealt'));

const miss = setup(() => 0.99, { chipRight: true });
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R1 tactical (not chance)', /Deals \d+ Tactical Damage/.test(rawMiss));
check('seed 0.99 misses 20% First-Strike', /\[miss\]/.test(rawMiss) || (!hasEffect(miss.left, 'first_strike') && !hasEffect(miss.sx, 'first_strike') && !hasEffect(miss.right, 'first_strike')));
check('seed 0.99 still vanguard + Mindful + Flight + Inferno', miss.sx.getPercentTotal('tactical_dealt') === 16 && miss.left.flatMods.inst === 20 && /Mindful Synergy/.test(rawMiss) && /Flight Mastery/.test(rawMiss) && /Tactical Inferno/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5, chipRight: true });
lowStars.battle.start();
for (let i = 0; i < 2; i += 1) lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Strategic / Inferno / Mercy', !/Strategic Revival/.test(rawStars) && !/Tactical Inferno/.test(rawStars) && !/Mother's Mercy/.test(rawStars));
check('5\u2605 still Mindful + Flight + Fury', /Mindful Synergy/.test(rawStars) && /Flight Mastery/.test(rawStars) && /Blazing Fury/.test(rawStars));

const midStars = setup(() => 0, { stars: 8, chipRight: true });
midStars.battle.start();
for (let i = 0; i < 2; i += 1) midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check("8\u2605 no Mother's Mercy", !/Mother's Mercy/.test(rawMidS));
check('8\u2605 still Strategic Revival + Inferno', /Strategic Revival/.test(rawMidS) && /Tactical Inferno/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
