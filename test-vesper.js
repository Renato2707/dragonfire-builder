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
  const habits = JSON.parse(fs.readFileSync('./data/vesper_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/vesper_vanguard_command.json', 'utf8'));
  const data = {
    id: 'vesper', name: 'Vesper', rarity: 'Legendary', breed: 'Sentinel',
    stats: { str: 40, inst: 66, int: 54, init: 50 },
    affinity: ['spearmen', 'archers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const vs = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  vs.setTroopType('spearmen');
  loadKit(vs, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }, extras.leftBreed || 'Hunter');
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 55, inst: 30, int: 30, init: 30 }, extras.rightBreed || 'Warrior');
  if (right) right.setTroopType('cavalry');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 }, extras.e0Breed || 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 }, extras.e1Breed || 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 }, extras.e2Breed || 'Sentinel');

  const battle = new Battle([left, vs, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, vs, left, right, e0, e1, e2 };
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
  const after = chunk.split('Vesper activates Eventide Strike')[1] || '';
  return after.split('Vesper launches')[0].split('Vesper activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/vesper_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/vesper_habits.json', 'utf8'));

check('JSON command Eventide Strike', kitCmd.name === 'Eventide Strike');
check('JSON each-round Slow 20% same_lane 2r', kitCmd.command[0].actions[0].st === 'slow' && kitCmd.command[0].actions[0].chance === 20 && kitCmd.command[0].actions[0].tgt.select === 'same_lane');
check('JSON tactical same_lane +70 R1,3,6,8', kitCmd.command[1].rounds.join() === '1,3,6,8' && kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 70);
check('JSON vanguard tactical +16 self', kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT flat 20 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Strategic Leader|Dragon's Insight|Savior's Waltz|Insightful Allies|Midnight Onslaught");
check('JSON Strategic Leader prefer V tactical 8', kitHab.habits[0].structured[0].actions[0].tgt.select === 'prefer_lane:V' && kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === 8);
check("JSON Dragon's Insight recv -4 / INST +5", kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === -4 && kitHab.habits[1].structured[0].actions[0].mods[1].pct[0] === 5);
check("JSON Savior's Waltz 12.5% Resistance self + adj", kitHab.habits[2].structured[0].chance[0] === 12.5 && kitHab.habits[2].structured[0].actions[0].st === 'resistance' && kitHab.habits[2].structured[0].actions[1].tgt.select === 'adjacency');
check('JSON Insightful Allies INST 8 scale inst 3 allies', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 8 && kitHab.habits[3].structured[0].actions[0].scaleStat === 'inst');
check('JSON Midnight Onslaught Confusion 24% R6-10 adj', kitHab.habits[4].structured[0].rounds.join() === '6,7,8,9,10' && kitHab.habits[4].structured[0].actions[0].st === 'confusion' && kitHab.habits[4].structured[0].actions[0].chance[0] === 24);
check("vanguardNames Vesper Sentinel's Wit", VANGUARD_NAMES.vesper === "Sentinel's Wit");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/vesper-report.txt', report);
fs.writeFileSync('./tmp/vesper-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Vesper lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Vesper|Sentinel's Wit|Eventide Strike|Strategic Leader|Dragon's Insight|Savior's Waltz|Insightful Allies|Midnight Onslaught|Slow|Confusion|Resistance/.test(line)) {
    console.log(line);
  }
}

check("vanguard Sentinel's Wit", report.includes("Sentinel's Wit"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Eventide Strike (Vanguard)', !/Eventide Strike \(Vanguard\)/.test(raw) && !/Eventide Strike \(Vanguard\)/.test(report));
check('command Eventide Strike', report.includes('Eventide Strike') && /Vesper activates Eventide Strike/.test(raw));
check('Strategic Leader', report.includes('Strategic Leader') || /Strategic Leader/.test(raw));
check("Dragon's Insight", report.includes("Dragon's Insight") || /Dragon's Insight/.test(raw));
check("Savior's Waltz", report.includes("Savior's Waltz") || /Savior's Waltz/.test(raw));
check('Insightful Allies', report.includes('Insightful Allies') || /Insightful Allies/.test(raw));
check('Midnight Onslaught', report.includes('Midnight Onslaught') || /Midnight Onslaught/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Tactical Damage Dealt +16%', /\+16% Tactical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank Sentinel's Wit", /\[ AllyL \] is under the effect of \[ Sentinel's Wit \]/.test(report));
check("right flank no Sentinel's Wit", !/\[ AllyR \] is under the effect of \[ Sentinel's Wit \]/.test(report));

check('R1 tactical +70', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 1)));
check('R2 no tactical command', !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 2)));
check('R3 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 3)));
check('R6 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 6)));
check('R8 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 8)));
check('R6-10 Midnight Onslaught', /Midnight Onslaught/.test(rN(raw, 6)) || /Confusion/.test(raw) || /Midnight Onslaught/.test(raw));

check('engine self tactical 16+8=24', main.vs.getPercentTotal('tactical_dealt') === 24, 'tac=' + main.vs.getPercentTotal('tactical_dealt'));
check('engine left flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right no vanguard flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0);
check("engine Dragon's Insight recv -4 / INST +5 plus Insightful +8", main.vs.getPercentTotal('dmg_received') === -4 && main.vs.getPercentTotal('inst') === 13, 'recv=' + main.vs.getPercentTotal('dmg_received') + ' inst=' + main.vs.getPercentTotal('inst'));
check('seed 0 Slow or Resistance or Confusion', hasEffect(main.e1, 'slow') || hasEffect(main.vs, 'resistance') || hasEffect(main.e0, 'confusion') || hasEffect(main.e2, 'confusion') || /Slow/.test(raw) || /Resistance/.test(raw) || /Confusion/.test(raw));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Leader + Insight + Allies + Eventide', /Strategic Leader/.test(rawR1) && /Dragon's Insight/.test(rawR1) && /Insightful Allies/.test(rawR1) && /Eventide Strike/.test(rawR1));
check('R1 no Midnight Onslaught (R6+)', !/Midnight Onslaught/.test(rawR1));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R1 tactical (dmg not chance)', /Deals \d+ Tactical Damage/.test(rawMiss));
check('seed 0.99 still vanguard + Leader + Insight + Allies', miss.vs.getPercentTotal('tactical_dealt') === 24 && miss.left.flatMods.inst === 20 && miss.vs.getPercentTotal('dmg_received') === -4 && /Strategic Leader/.test(rawMiss) && /Dragon's Insight/.test(rawMiss) && /Insightful Allies/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Waltz / Allies / Midnight', !/Savior's Waltz/.test(rawStars) && !/Insightful Allies/.test(rawStars) && !/Midnight Onslaught/.test(rawStars));
check("5\u2605 still Leader + Insight + Eventide", /Strategic Leader/.test(rawStars) && /Dragon's Insight/.test(rawStars) && /Eventide Strike/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
for (let i = 0; i < 6; i += 1) midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Midnight Onslaught', !/Midnight Onslaught/.test(rawMidS));
check("8\u2605 still Waltz + Allies", /Savior's Waltz/.test(rawMidS) && /Insightful Allies/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
