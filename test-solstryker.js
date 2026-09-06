import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';
import { applyEffect, hasEffect } from './effects.js';

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
  const habits = JSON.parse(fs.readFileSync('./data/solstryker_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/solstryker_vanguard_command.json', 'utf8'));
  const data = {
    id: 'solstryker', name: 'Solstryker', rarity: 'Rare', breed: 'Champion',
    stats: { str: 53, inst: 57, int: 39, init: 46 },
    affinity: ['archers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const so = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  so.setTroopType('archers');
  loadKit(so, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 });
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 40, inst: 40, int: 40, init: 30 });
  if (right) right.setTroopType('archers');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 }, 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 }, 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 }, 'Sentinel');

  const battle = new Battle([left, so, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['archers', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, so, left, right, e0, e1, e2 };
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

function rN(raw, n) {
  return (raw.split('Start of Round ' + n)[1] || '').split('Start of Round ' + (n + 1))[0] || '';
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/solstryker_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/solstryker_habits.json', 'utf8'));

check('JSON command Tactical Onslaught', kitCmd.name === 'Tactical Onslaught');
check('JSON odd after BA physical +30 last_basic + 20% -12 phys', kitCmd.command[0].phase === 'after_basic_attack' && kitCmd.command[0].rounds.join() === '1,3,5,7,9' && kitCmd.command[0].actions[0].dt === 'physical' && kitCmd.command[0].actions[0].pct === 30 && kitCmd.command[0].actions[0].tgt.select === 'last_basic' && kitCmd.command[0].actions[1].chance === 20 && kitCmd.command[0].actions[1].mods[0].stat === 'physical_dealt' && kitCmd.command[0].actions[1].mods[0].pct === -12 && kitCmd.command[0].actions[1].tgt.select === 'last_basic');
check('JSON even after BA tactical +12.5 x3 vuln x2', kitCmd.command[1].phase === 'after_basic_attack' && kitCmd.command[1].rounds.join() === '2,4,6,8,10' && kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 12.5 && kitCmd.command[1].actions[0].ifBonus.status === 'vulnerable' && kitCmd.command[1].actions[0].ifBonus.pct === 25 && kitCmd.command[1].actions[0].tgt.count === 3);
check('JSON vanguard STR/INT/INST flat 15', kitCmd.vanguard[0].actions[0].mods[0].fixed === 15 && kitCmd.vanguard[0].actions[0].mods[1].fixed === 15 && kitCmd.vanguard[0].actions[0].mods[2].fixed === 15);
check('JSON vanguard right slot 2 dmg_received -8', kitCmd.vanguard[0].actions[1].mods[0].stat === 'dmg_received' && kitCmd.vanguard[0].actions[1].mods[0].pct === -8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === 'Steady Erosion|Energy Drain|Oppressive Onslaught|Robust Insight|Amplified Drain');
check('JSON Steady Erosion all enemies stack max 10 scale STR', kitHab.habits[0].structured[0].phase === 'round_start' && kitHab.habits[0].structured[0].actions[0].id === 'steady_erosion' && kitHab.habits[0].structured[0].actions[0].maxStacks === 10 && kitHab.habits[0].structured[0].actions[0].scaleStat === 'str' && kitHab.habits[0].structured[0].actions[0].tgt.count === 'all');
check('JSON Energy Drain R1 adj 2 scale INST dur 3', kitHab.habits[1].structured[0].rounds.join() === '1' && kitHab.habits[1].structured[0].actions[0].scaleStat === 'inst' && kitHab.habits[1].structured[0].actions[0].dur === 3 && kitHab.habits[1].structured[0].actions[0].tgt.select === 'adjacency');
check('JSON Oppressive Onslaught overwhelm 10% dur 2', kitHab.habits[2].structured[0].actions[0].st === 'overwhelm' && kitHab.habits[2].structured[0].actions[0].chance[0] === 10 && kitHab.habits[2].structured[0].actions[0].dur === 2);
check('JSON Robust Insight +12.5 STR/INST combat', kitHab.habits[3].structured[0].phase === 'combat_start' && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 12.5 && kitHab.habits[3].structured[0].actions[0].mods[1].pct[0] === 12.5);
check('JSON Amplified Drain R4 adj 2 dur 5', kitHab.habits[4].structured[0].rounds.join() === '4' && kitHab.habits[4].structured[0].actions[0].dur === 5 && kitHab.habits[4].structured[0].actions[0].scaleStat === 'inst');
check("vanguardNames Solstryker Champion's Brilliance", VANGUARD_NAMES.solstryker === "Champion's Brilliance");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/solstryker-report.txt', report);
fs.writeFileSync('./tmp/solstryker-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Solstryker lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Solstryker|Champion's Brilliance|Tactical Onslaught|Steady Erosion|Energy Drain|Oppressive Onslaught|Robust Insight|Amplified Drain|Overwhelm/.test(line)) {
    console.log(line);
  }
}

check("vanguard Champion's Brilliance", report.includes("Champion's Brilliance"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Tactical Onslaught (Vanguard)', !/Tactical Onslaught \(Vanguard\)/.test(raw) && !/Tactical Onslaught \(Vanguard\)/.test(report));
check('command Tactical Onslaught', report.includes('Tactical Onslaught') && /Solstryker activates Tactical Onslaught/.test(raw));
check('Steady Erosion', report.includes('Steady Erosion') || /Steady Erosion/.test(raw));
check('Energy Drain', report.includes('Energy Drain') || /Energy Drain/.test(raw));
check('Oppressive Onslaught', report.includes('Oppressive Onslaught') || /Oppressive Onslaught/.test(raw));
check('Robust Insight', report.includes('Robust Insight') || /Robust Insight/.test(raw));
check('Amplified Drain', report.includes('Amplified Drain') || /Amplified Drain/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Strength +15 flat not %', /\+15 Strength/.test(report) && !/\+15% Strength/.test(report));
check('vanguard Intelligence +15 flat not %', /\+15 Intelligence/.test(report) && !/\+15% Intelligence/.test(report));
check('vanguard Instinct +15 flat not %', /\+15 Instinct/.test(report) && !/\+15% Instinct/.test(report));
check("right flank Champion's Brilliance -8% received", /\[ AllyR \] is under the effect of \[ Champion's Brilliance \]/.test(report) || /-8% Damage Received/.test(report));
check("left flank no Champion's Brilliance received", !/\[ AllyL \] is under the effect of \[ Champion's Brilliance \]/.test(report));

check('R1 after-BA physical', /Deals \d+ Physical Damage/.test(rN(raw, 1)));
check('R2 after-BA tactical 3', (rN(raw, 2).match(/Deals \d+ Tactical Damage/g) || []).length >= 3, 'tac=' + ((rN(raw, 2).match(/Deals \d+ Tactical Damage/g) || []).length));
check('R3 physical not tactical-3', /Deals \d+ Physical Damage/.test(rN(raw, 3)));
check('R4 Amplified Drain + even tactical', /Amplified Drain/.test(rN(raw, 4)) && (rN(raw, 4).match(/Deals \d+ Tactical Damage/g) || []).length >= 3);

check('engine self flats +15', main.so.flatMods.str === 15 && main.so.flatMods.int === 15 && main.so.flatMods.inst === 15, JSON.stringify(main.so.flatMods));
check('engine right dmg_received -8', main.right.getPercentTotal('dmg_received') === -8, 'R=' + main.right.getPercentTotal('dmg_received'));
check('engine left dmg_received 0', main.left.getPercentTotal('dmg_received') === 0, 'L=' + main.left.getPercentTotal('dmg_received'));
check('engine Robust Insight +12.5 STR/INST', main.so.getPercentTotal('str') === 12.5 && main.so.getPercentTotal('inst') === 12.5, 'str=' + main.so.getPercentTotal('str') + ' inst=' + main.so.getPercentTotal('inst'));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Steady Erosion stack on enemies', /Steady Erosion/.test(rawR1));
check('R1 Energy Drain STR/INIT down', /Energy Drain/.test(rawR1) && /Reduces Strength/.test(rawR1));
check('R1 Robust Insight', /Robust Insight/.test(rawR1));
check('R1 Overwhelm 10% hit seed 0', /\[hit\] Oppressive Onslaught → .+ \(10%\)/.test(rawR1) || hasEffect(r1.e0, 'overwhelm') || hasEffect(r1.e1, 'overwhelm') || hasEffect(r1.e2, 'overwhelm'));
check('R1 command physical after BA', /Tactical Onslaught/.test(rawR1) && /Deals \d+ Physical Damage/.test(rawR1));
check('R1 20% -12% phys hit seed 0', /\[hit\] Tactical Onslaught → .+ \(20%\)/.test(rawR1) || /Physical Damage Dealt/.test(rawR1));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 misses Overwhelm 10%', /\[miss\] Oppressive Onslaught/.test(rawMiss) && !hasEffect(miss.e0, 'overwhelm') && !hasEffect(miss.e1, 'overwhelm') && !hasEffect(miss.e2, 'overwhelm'));
check('seed 0.99 misses 20% phys down', /\[miss\] Tactical Onslaught/.test(rawMiss) || !/Reduces Physical Damage Dealt/.test(rawMiss));
check('seed 0.99 still vanguard + Robust + Erosion + Drain', miss.so.flatMods.str === 15 && miss.so.getPercentTotal('str') === 12.5 && /Steady Erosion/.test(rawMiss) && /Energy Drain/.test(rawMiss));

const low = setup(() => 0, { stars: 5 });
low.battle.start();
low.battle.runRound();
for (let i = 0; i < 3; i += 1) low.battle.runRound();
const rawLow = (low.battle.battleLog || []).join('\n');
check('5★ no Oppressive / Robust / Amplified', !/Oppressive Onslaught/.test(rawLow) && !/Robust Insight/.test(rawLow) && !/Amplified Drain/.test(rawLow));
check('5★ still Steady Erosion + Energy Drain + command', /Steady Erosion/.test(rawLow) && /Energy Drain/.test(rawLow) && /Tactical Onslaught/.test(rawLow));

const mid = setup(() => 0, { stars: 8 });
mid.battle.start();
for (let i = 0; i < 4; i += 1) mid.battle.runRound();
const rawMid = (mid.battle.battleLog || []).join('\n');
check('8★ no Amplified Drain', !/Amplified Drain/.test(rawMid));
check('8★ still Robust Insight', /Robust Insight/.test(rawMid));

const vuln = setup(() => 0);
vuln.battle.start();
vuln.battle.runRound();
try { applyEffect(vuln.e0, 'VULNERABLE', 1, 'seed', { duration: 10, damageBonus: 10 }); } catch (e) {}
try { applyEffect(vuln.e1, 'vulnerable', 1, 'seed', { duration: 10, damageBonus: 10 }); } catch (e) {}
try { applyEffect(vuln.e2, 'vulnerable', 1, 'seed', { duration: 10, damageBonus: 10 }); } catch (e) {}
vuln.battle.runRound();
const rawVuln = (vuln.battle.battleLog || []).join('\n');
const base = setup(() => 0);
base.battle.start();
base.battle.runRound();
base.battle.runRound();
const rawBase = (base.battle.battleLog || []).join('\n');
const dmgV = [...rN(rawVuln, 2).matchAll(/Deals (\d+) Tactical Damage/g)].map(m => Number(m[1]));
const dmgB = [...rN(rawBase, 2).matchAll(/Deals (\d+) Tactical Damage/g)].map(m => Number(m[1]));
check('Vulnerable even-round tactical 2x', dmgV.length && dmgB.length && dmgV[0] > dmgB[0], 'vuln=' + (dmgV[0] || 0) + ' base=' + (dmgB[0] || 0));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
