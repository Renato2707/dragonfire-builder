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
  const habits = JSON.parse(fs.readFileSync('./data/arrax_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/arrax_vanguard_command.json', 'utf8'));
  const data = {
    id: 'arrax', name: 'Arrax', rarity: 'Legendary', breed: 'Warrior',
    stats: { str: 66, inst: 50, int: 40, init: 44 },
    affinity: ['spearmen', 'archers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const ar = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  ar.setTroopType(extras.troop || 'archers');
  loadKit(ar, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 30, inst: 55, int: 50, init: 30 }, extras.leftBreed || 'Hunter');
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 55, inst: 30, int: 30, init: 30 }, extras.rightBreed || 'Warrior');
  if (right) right.setTroopType('spearmen');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 }, extras.e0Breed || 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 }, extras.e1Breed || 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 }, extras.e2Breed || 'Sentinel');

  const battle = new Battle([left, ar, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: [extras.troop || 'archers', extras.troop || 'archers'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, ar, left, right, e0, e1, e2 };
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
  const after = chunk.split('Arrax activates Sudden Strike')[1] || '';
  return after.split('Arrax launches')[0].split('Arrax activates')[0];
}

function stacksOf(ch, id) {
  if (!ch) return 0;
  if (typeof ch.getStacks === 'function') return ch.getStacks(id) || 0;
  if (ch.stacks && ch.stacks[id] != null) return ch.stacks[id];
  return 0;
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/arrax_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/arrax_habits.json', 'utf8'));

check('JSON command Sudden Strike', kitCmd.name === 'Sudden Strike');
check('JSON Weakened 25% x2 if Bleed R2,4,6,8', kitCmd.command[0].rounds.join() === '2,4,6,8' && kitCmd.command[0].actions[0].st === 'weakened' && kitCmd.command[0].actions[0].chance === 25 && kitCmd.command[0].actions[0].chanceIf.bleed === 2);
check('JSON physical adj 2x +40 R2,4,5,6,8', kitCmd.command[1].rounds.join() === '2,4,5,6,8' && kitCmd.command[1].actions[0].dt === 'physical' && kitCmd.command[1].actions[0].pct === 40);
check('JSON vanguard dmg_received -8 self', kitCmd.vanguard[0].actions[0].mods[0].pct === -8);
check('JSON vanguard tactical +16 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].pct === 16 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === 'Headlong Into Danger|Stone Bulwark|Adaptive Guard|Fire Ward|Turn the Line');
check('JSON Headlong R4 STR 25 INIT 10 phys 25 / recv 10 INST -40', kitHab.habits[0].structured[0].rounds.join() === '4' && kitHab.habits[0].structured[0].actions[0].mods[0].pct === 25 && kitHab.habits[0].structured[0].actions[0].mods[3].pct[0] === 10);
check('JSON Stone Bulwark -2.5 other allies', kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === -2.5 && kitHab.habits[1].structured[0].actions[0].tgt.excludeSelf === true);
check('JSON Adaptive Guard archers tac / shieldbearers fire R4', kitHab.habits[2].structured[0].requires.troop === 'archers' && kitHab.habits[2].structured[1].requires.troop === 'shieldbearers');
check('JSON Fire Ward stack self + adj + linkedRetreated', kitHab.habits[3].structured[0].actions[0].id === 'fire_ward' && kitHab.habits[3].structured[1].requires.linkedRetreated === 'fire_ward_ally');
check('JSON Turn the Line R4 phys recv +9 adj 2', kitHab.habits[4].structured[0].rounds.join() === '4' && kitHab.habits[4].structured[0].actions[0].mods[0].pct[0] === 9);
check("vanguardNames Arrax Warrior's Resilience", VANGUARD_NAMES.arrax === "Warrior's Resilience");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/arrax-report.txt', report);
fs.writeFileSync('./tmp/arrax-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Arrax lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Arrax|Warrior's Resilience|Sudden Strike|Headlong Into Danger|Stone Bulwark|Adaptive Guard|Fire Ward|Turn the Line|Weakened/.test(line)) {
    console.log(line);
  }
}

check("vanguard Warrior's Resilience", report.includes("Warrior's Resilience"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Sudden Strike (Vanguard)', !/Sudden Strike \(Vanguard\)/.test(raw) && !/Sudden Strike \(Vanguard\)/.test(report));
check('command Sudden Strike', report.includes('Sudden Strike') && /Arrax activates Sudden Strike/.test(raw));
check('Headlong Into Danger', report.includes('Headlong Into Danger') || /Headlong Into Danger/.test(raw));
check('Stone Bulwark', report.includes('Stone Bulwark') || /Stone Bulwark/.test(raw));
check('Adaptive Guard', report.includes('Adaptive Guard') || /Adaptive Guard/.test(raw));
check('Fire Ward', report.includes('Fire Ward') || /Fire Ward/.test(raw));
check('Turn the Line', report.includes('Turn the Line') || /Turn the Line/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Damage Received -8%', /-8% Damage Received/.test(report));
check('vanguard Tactical Damage Dealt +16%', /\+16% Tactical Damage Dealt/.test(report));
check("left flank Warrior's Resilience", /\[ AllyL \] is under the effect of \[ Warrior's Resilience \]/.test(report));
check("right flank no Warrior's Resilience", !/\[ AllyR \] is under the effect of \[ Warrior's Resilience \]/.test(report));

check('R1 no Sudden Strike dmg', !/Deals \d+ Physical Damage/.test(cmdChunk(raw, 1)));
check('R2 physical adj', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 2)));
check('R4 Headlong + Adaptive + Turn', /Headlong Into Danger/.test(rN(raw, 4)) && /Adaptive Guard/.test(rN(raw, 4)) && /Turn the Line/.test(rN(raw, 4)));
check('R5 physical (odd extra)', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 5)));

check('engine self dmg_received vanguard -8', main.ar.getPercentTotal('dmg_received') === -8, 'recv=' + main.ar.getPercentTotal('dmg_received'));
check('engine left tactical +16', main.left.getPercentTotal('tactical_dealt') === 16, 'tac=' + main.left.getPercentTotal('tactical_dealt'));
check('engine Headlong STR +25 INIT +10 phys +25 INST -40', main.ar.getPercentTotal('str') === 25 && main.ar.getPercentTotal('init') === 10 && main.ar.getPercentTotal('physical_dealt') === 25 && main.ar.getPercentTotal('inst') === -40, JSON.stringify({ str: main.ar.getPercentTotal('str'), init: main.ar.getPercentTotal('init'), phys: main.ar.getPercentTotal('physical_dealt'), inst: main.ar.getPercentTotal('inst') }));
check('engine Stone Bulwark other allies tac/fire recv -2.5', main.left.getPercentTotal('tactical_received') === -2.5 && main.right.getPercentTotal('fire_received') === -2.5 && main.ar.getPercentTotal('tactical_received') !== -2.5, 'L=' + main.left.getPercentTotal('tactical_received') + ' self=' + main.ar.getPercentTotal('tactical_received'));
check('engine Adaptive Guard archers tactical_received -9', main.ar.getPercentTotal('tactical_received') === -9 || main.left.getPercentTotal('tactical_received') === -11.5, 'self tacRecv=' + main.ar.getPercentTotal('tactical_received') + ' L=' + main.left.getPercentTotal('tactical_received'));
check('engine Fire Ward stack on self', stacksOf(main.ar, 'fire_ward') >= 1 || main.ar.getPercentTotal('fire_received') === -5, 'stacks=' + stacksOf(main.ar, 'fire_ward') + ' fr=' + main.ar.getPercentTotal('fire_received'));
check('seed 0 Weakened somewhere', hasEffect(main.e0, 'weakened') || hasEffect(main.e1, 'weakened') || hasEffect(main.e2, 'weakened') || /Weakened/.test(raw));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Bulwark + Fire Ward no Headlong', /Stone Bulwark/.test(rawR1) && /Fire Ward/.test(rawR1) && !/Headlong Into Danger/.test(rawR1));

const miss = setup(() => 0.99);
miss.battle.start();
for (let i = 0; i < 4; i += 1) miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R2/R4 physical', /Deals \d+ Physical Damage/.test(rawMiss));
check('seed 0.99 still vanguard + Headlong + Bulwark', miss.ar.getPercentTotal('dmg_received') === -8 && miss.left.getPercentTotal('tactical_dealt') === 16 && miss.ar.getPercentTotal('str') === 25 && /Headlong Into Danger/.test(rawMiss) && /Stone Bulwark/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
for (let i = 0; i < 4; i += 1) lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Adaptive / Fire Ward / Turn', !/Adaptive Guard/.test(rawStars) && !/Fire Ward/.test(rawStars) && !/Turn the Line/.test(rawStars));
check('5\u2605 still Headlong + Bulwark + Strike', /Headlong Into Danger/.test(rawStars) && /Stone Bulwark/.test(rawStars) && /Sudden Strike/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
for (let i = 0; i < 4; i += 1) midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Turn the Line', !/Turn the Line/.test(rawMidS));
check('8\u2605 still Adaptive + Fire Ward', /Adaptive Guard/.test(rawMidS) && /Fire Ward/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
