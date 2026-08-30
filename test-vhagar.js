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
  const habits = JSON.parse(fs.readFileSync('./data/vhagar_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/vhagar_vanguard_command.json', 'utf8'));
  const data = {
    id: 'vhagar', name: 'Vhagar', rarity: 'Legendary', breed: 'Warrior',
    stats: { str: 72, inst: 48, int: 40, init: 42 },
    affinity: ['cavalry', 'spearmen'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const vh = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  vh.setTroopType('cavalry');
  loadKit(vh, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 30, inst: 55, int: 50, init: 30 }, extras.leftBreed || 'Hunter');
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 60, inst: 30, int: 30, init: 30 }, extras.rightBreed || 'Warrior');
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

  const battle = new Battle([left, vh, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['cavalry', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, vh, left, right, e0, e1, e2 };
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
  const after = chunk.split('Vhagar activates Fiery Bonds')[1] || '';
  return after.split('Vhagar launches')[0].split('Vhagar activates')[0];
}

function stacksOf(ch, id) {
  if (!ch) return 0;
  if (typeof ch.getStacks === 'function') return ch.getStacks(id) || 0;
  if (ch.stacks && ch.stacks[id] != null) return ch.stacks[id];
  return 0;
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/vhagar_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/vhagar_habits.json', 'utf8'));

check('JSON command Fiery Bonds', kitCmd.name === 'Fiery Bonds');
check('JSON each-round Taunt 25% x2 if Burn', kitCmd.command[0].actions[0].st === 'taunt' && kitCmd.command[0].actions[0].chance === 25 && kitCmd.command[0].actions[0].chanceIf.burn === 2 && kitCmd.command[0].actions[0].tgt.count === 3);
check('JSON even physical adj +120', kitCmd.command[1].rounds.join() === '2,4,6,8,10' && kitCmd.command[1].actions[0].dt === 'physical' && kitCmd.command[1].actions[0].pct === 120 && kitCmd.command[1].actions[0].tgt.select === 'adjacency');
check('JSON vanguard dmg_received -8 self', kitCmd.vanguard[0].actions[0].mods[0].pct === -8);
check('JSON vanguard tactical +16 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].pct === 16 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === 'Ancestral Shield|Battle Leader|Eclipse Cover|Blazing Onslaught|Skyward Titan');
check('JSON Ancestral Shield R1 phys/tac -12 3r + R4 recovery +15', kitHab.habits[0].structured[0].rounds.join() === '1' && kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === -12 && kitHab.habits[0].structured[1].rounds.join() === '4' && kitHab.habits[0].structured[1].actions[0].mods[0].pct[0] === 15);
check('JSON Battle Leader prefer R physical 12.5 excludeBasic', kitHab.habits[1].structured[0].actions[0].tgt.select === 'prefer_lane:R' && kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 12.5 && kitHab.habits[1].structured[0].actions[0].excludeBasic === true);
check('JSON Eclipse Cover 17.5% R3-7 Advantage/Weakened highest troops', kitHab.habits[2].structured[0].rounds.join() === '3,4,5,6,7' && kitHab.habits[2].structured[0].chance[0] === 17.5);
check('JSON Blazing Onslaught L fire / R physical received +18', kitHab.habits[3].structured[0].actions[0].tgt.select === 'prefer_lane:L' && kitHab.habits[3].structured[0].actions[1].tgt.select === 'prefer_lane:R' && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 18);
check('JSON Skyward Titan Bulwark 30% onReach 3 physical 100', kitHab.habits[4].structured[0].actions[0].id === 'bulwark' && kitHab.habits[4].structured[0].actions[0].chance === 30 && kitHab.habits[4].structured[0].actions[0].onReach.stacks === 3);
check("vanguardNames Vhagar Warrior's Resilience", VANGUARD_NAMES.vhagar === "Warrior's Resilience");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/vhagar-report.txt', report);
fs.writeFileSync('./tmp/vhagar-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Vhagar lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Vhagar|Warrior's Resilience|Fiery Bonds|Ancestral Shield|Battle Leader|Eclipse Cover|Blazing Onslaught|Skyward Titan|Taunt|Bulwark|Advantage|Weakened/.test(line)) {
    console.log(line);
  }
}

check("vanguard Warrior's Resilience", report.includes("Warrior's Resilience"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Fiery Bonds (Vanguard)', !/Fiery Bonds \(Vanguard\)/.test(raw) && !/Fiery Bonds \(Vanguard\)/.test(report));
check('command Fiery Bonds', report.includes('Fiery Bonds') && /Vhagar activates Fiery Bonds/.test(raw));
check('Ancestral Shield', report.includes('Ancestral Shield') || /Ancestral Shield/.test(raw));
check('Battle Leader', report.includes('Battle Leader') || /Battle Leader/.test(raw));
check('Eclipse Cover', report.includes('Eclipse Cover') || /Eclipse Cover/.test(raw));
check('Blazing Onslaught', report.includes('Blazing Onslaught') || /Blazing Onslaught/.test(raw));
check('Skyward Titan', report.includes('Skyward Titan') || /Skyward Titan/.test(raw) || /Bulwark/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Damage Received -8%', /-8% Damage Received/.test(report));
check('vanguard Tactical Damage Dealt +16%', /\+16% Tactical Damage Dealt/.test(report));
check("left flank Warrior's Resilience", /\[ AllyL \] is under the effect of \[ Warrior's Resilience \]/.test(report));
check("right flank no Warrior's Resilience", !/\[ AllyR \] is under the effect of \[ Warrior's Resilience \]/.test(report));

check('R1 no even physical', !/Deals \d+ Physical Damage/.test(cmdChunk(raw, 1)));
check('R2 physical adj +120', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 2)));
check('R4 physical', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 4)));
check('R4 Ancestral Shield recovery', /Ancestral Shield/.test(rN(raw, 4)) || main.vh.getPercentTotal('recovery_received') === 15);
check('R6 physical', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 6)));

check('engine self dmg_received vanguard -8', main.vh.getPercentTotal('dmg_received') === -8, 'recv=' + main.vh.getPercentTotal('dmg_received'));
check('engine left tactical +16', main.left.getPercentTotal('tactical_dealt') === 16, 'tac=' + main.left.getPercentTotal('tactical_dealt'));
check('engine right no tactical vanguard', main.right.getPercentTotal('tactical_dealt') === 0);
check('engine Battle Leader right physical +12.5', main.right.getPercentTotal('physical_dealt') === 12.5, 'R phys=' + main.right.getPercentTotal('physical_dealt'));
check('engine Blazing Onslaught L fire +18 / R phys recv +18', main.e0.getPercentTotal('fire_received') === 18 && main.e2.getPercentTotal('physical_received') === 18, 'e0 fire=' + main.e0.getPercentTotal('fire_received') + ' e2 phys=' + main.e2.getPercentTotal('physical_received'));
check('engine Ancestral Shield recovery +15 after R4', main.vh.getPercentTotal('recovery_received') === 15, 'rec=' + main.vh.getPercentTotal('recovery_received'));
check('seed 0 Taunt or Bulwark or Advantage', hasEffect(main.e0, 'taunt') || hasEffect(main.e1, 'taunt') || stacksOf(main.vh, 'bulwark') > 0 || hasEffect(main.vh, 'advantage') || /Taunt/.test(raw) || /Bulwark/.test(raw) || /Advantage/.test(raw));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Shield + Leader + Blazing + Bonds', /Ancestral Shield/.test(rawR1) && /Battle Leader/.test(rawR1) && /Blazing Onslaught/.test(rawR1) && /Fiery Bonds/.test(rawR1));
check('R1 no Eclipse Cover (R3-7)', !/Eclipse Cover/.test(rawR1));

const miss = setup(() => 0.99);
miss.battle.start();
for (let i = 0; i < 2; i += 1) miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still even physical (dmg not chance)', /Deals \d+ Physical Damage/.test(rawMiss));
check('seed 0.99 still vanguard + Shield + Leader + Blazing', miss.vh.getPercentTotal('dmg_received') === -8 && miss.left.getPercentTotal('tactical_dealt') === 16 && miss.right.getPercentTotal('physical_dealt') === 12.5 && /Ancestral Shield/.test(rawMiss) && /Battle Leader/.test(rawMiss) && /Blazing Onslaught/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
for (let i = 0; i < 3; i += 1) lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Eclipse / Blazing / Skyward', !/Eclipse Cover/.test(rawStars) && !/Blazing Onslaught/.test(rawStars) && !/Skyward Titan/.test(rawStars) && !/Bulwark/.test(rawStars));
check('5\u2605 still Shield + Leader + Bonds', /Ancestral Shield/.test(rawStars) && /Battle Leader/.test(rawStars) && /Fiery Bonds/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
for (let i = 0; i < 3; i += 1) midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Skyward Titan', !/Skyward Titan/.test(rawMidS) && !/Bulwark/.test(rawMidS));
check('8\u2605 still Eclipse + Blazing', /Eclipse Cover/.test(rawMidS) && /Blazing Onslaught/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
