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
  const habits = JSON.parse(fs.readFileSync('./data/shadowsong_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/shadowsong_vanguard_command.json', 'utf8'));
  const data = {
    id: 'shadowsong', name: 'Shadowsong', rarity: 'Epic', breed: 'Hunter',
    stats: { str: 52, inst: 46, int: 61, init: 47 },
    affinity: ['cavalry'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const ss = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  ss.setTroopType('cavalry');
  loadKit(ss, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0);
  if (left) left.setTroopType('cavalry');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2);
  if (right) right.setTroopType('cavalry');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 }, 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 }, 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 }, 'Sentinel');

  const battle = new Battle([left, ss, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['cavalry', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, ss, left, right, e0, e1, e2 };
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
  const after = chunk.split('Shadowsong activates Breath of Fire')[1] || '';
  return after.split('Shadowsong launches')[0].split('Shadowsong activates')[0];
}

function fireHits(text) {
  return [...String(text || '').matchAll(/Deals (\d+) Fire Damage to Enemy/g)].map(m => Number(m[1]));
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/shadowsong_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/shadowsong_habits.json', 'utf8'));

check('JSON command Breath of Fire', kitCmd.name === 'Breath of Fire');
check('JSON fire 2 adj R2,5,8 +100 / +150 panic', kitCmd.command[0].rounds.join() === '2,5,8' && kitCmd.command[0].actions[0].dt === 'fire' && kitCmd.command[0].actions[0].pct === 100 && kitCmd.command[0].actions[0].ifBonus.status === 'panic' && kitCmd.command[0].actions[0].ifBonus.pct === 150 && kitCmd.command[0].actions[0].tgt.count === 2 && kitCmd.command[0].actions[0].tgt.select === 'adjacency');
check('JSON vanguard fire +16 self', kitCmd.vanguard[0].actions[0].mods[0].stat === 'fire_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard STR/INIT +20 right slot 2', kitCmd.vanguard[0].actions[1].mods[0].stat === 'str' && kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].mods[1].stat === 'init' && kitCmd.vanguard[0].actions[1].mods[1].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Ensnare|Blazing Onslaught|Scorched Earth|Dragon's Intellect|Blazing Conductor");
check('JSON Ensnare R1 adj 2 scale INT dur 3', kitHab.habits[0].structured[0].rounds.join() === '1' && kitHab.habits[0].structured[0].actions[0].scaleStat === 'int' && kitHab.habits[0].structured[0].actions[0].dur === 3 && kitHab.habits[0].structured[0].actions[0].tgt.select === 'adjacency');
check('JSON Blazing Onslaught L fire / R phys excludeBasic', kitHab.habits[1].structured[0].actions[0].tgt.select === 'prefer_lane:L' && kitHab.habits[1].structured[0].actions[0].mods[0].stat === 'fire_received' && kitHab.habits[1].structured[0].actions[1].tgt.select === 'prefer_lane:R' && kitHab.habits[1].structured[0].actions[1].excludeBasic === true);
check('JSON Scorched Earth Vulnerable +15 chanceIf panic x2', kitHab.habits[2].structured[0].actions[0].st === 'vulnerable' && kitHab.habits[2].structured[0].actions[0].val === 15 && kitHab.habits[2].structured[0].actions[0].chanceIf.panic === 2);
check("JSON Dragon's Intellect -5 / +8.5 combat", kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === -5 && kitHab.habits[3].structured[0].actions[0].mods[1].pct[0] === 8.5);
check('JSON Blazing Conductor requires Breath of Fire R2,5,8 two targets', kitHab.habits[4].structured[0].requires.command === 'Breath of Fire' && kitHab.habits[4].structured[0].rounds.join() === '2,5,8' && kitHab.habits[4].structured[0].actions[2].tgt.excludeLastDmg === true);
check("vanguardNames Shadowsong Hunter's Wrath", VANGUARD_NAMES.shadowsong === "Hunter's Wrath");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/shadowsong-report.txt', report);
fs.writeFileSync('./tmp/shadowsong-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Shadowsong lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Shadowsong|Hunter's Wrath|Breath of Fire|Ensnare|Blazing|Scorched|Intellect|Conductor|Vulnerable|Burn/.test(line)) {
    console.log(line);
  }
}

check("vanguard Hunter's Wrath", report.includes("Hunter's Wrath"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Breath of Fire (Vanguard)', !/Breath of Fire \(Vanguard\)/.test(raw) && !/Breath of Fire \(Vanguard\)/.test(report));
check('command Breath of Fire', report.includes('Breath of Fire') && /Shadowsong activates Breath of Fire/.test(raw));
check('Ensnare', report.includes('Ensnare') || /Ensnare/.test(raw));
check('Blazing Onslaught', report.includes('Blazing Onslaught') || /Blazing Onslaught/.test(raw));
check('Scorched Earth', report.includes('Scorched Earth') || /Scorched Earth/.test(raw));
check("Dragon's Intellect", report.includes("Dragon's Intellect") || /Dragon's Intellect/.test(raw));
check('Blazing Conductor', report.includes('Blazing Conductor') || /Blazing Conductor/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Fire Damage Dealt +16%', /\+16% Fire Damage Dealt/.test(report));
check('vanguard Strength +20 flat not %', /\+20 Strength/.test(report) && !/\+20% Strength/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("right flank Hunter's Wrath", /\[ AllyR \] is under the effect of \[ Hunter's Wrath \]/.test(report));
check("left flank no Hunter's Wrath", !/\[ AllyL \] is under the effect of \[ Hunter's Wrath \]/.test(report));

check('R1 no Breath of Fire', !/Shadowsong activates Breath of Fire/.test(rN(raw, 1)));
check('R2 Breath of Fire 2 adj fire', fireHits(cmdChunk(raw, 2)).length === 2, 'hits=' + fireHits(cmdChunk(raw, 2)).length);
check('R3 no command fire', fireHits(cmdChunk(raw, 3)).length === 0);
check('R5 command fire', fireHits(cmdChunk(raw, 5)).length === 2);
check('R8 command fire', fireHits(cmdChunk(raw, 8)).length === 2);
check('R2 Blazing Conductor two different fires', /Shadowsong activates Blazing Conductor/.test(rN(raw, 2)));

check('engine self fire_dealt +16', main.ss.getPercentTotal('fire_dealt') === 16, 'fire=' + main.ss.getPercentTotal('fire_dealt'));
check('engine right flats +20', main.right.flatMods.str === 20 && main.right.flatMods.init === 20, JSON.stringify(main.right.flatMods));
check('engine left no flats', (main.left.flatMods.str || 0) === 0 && (main.left.flatMods.init || 0) === 0);
check("engine Dragon's Intellect dmg_received -5 int +8.5", main.ss.getPercentTotal('dmg_received') === -5 && main.ss.getPercentTotal('int') === 8.5, 'recv=' + main.ss.getPercentTotal('dmg_received') + ' int=' + main.ss.getPercentTotal('int'));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Ensnare hits 2 adj', /Reduces Instinct/.test(rawR1));
check('R1 Blazing Onslaught fire L + phys R', /Fire Damage Received/.test(rawR1) && /Physical Damage Received/.test(rawR1));
check('R1 Scorched Earth 10% hit seed 0', /\[hit\] Scorched Earth → .+ \(10%\)/.test(rawR1));
check('R1 Vulnerable +15%', hasEffect(r1.e0, 'vulnerable') || hasEffect(r1.e1, 'vulnerable') || hasEffect(r1.e2, 'vulnerable'));
check('R1 no Breath of Fire activate', !/Shadowsong activates Breath of Fire/.test(rawR1));

const r2 = setup(() => 0);
r2.battle.start();
r2.battle.runRound();
r2.battle.runRound();
const rawR2 = (r2.battle.battleLog || []).join('\n');
check('R2 command 2 fire + conductor extra fires', fireHits(rN(rawR2, 2)).length >= 3, 'fires=' + fireHits(rN(rawR2, 2)).length);
check('R2 Burn from conductor 40% seed 0', /Afflicts .+ with Burn/.test(rN(rawR2, 2)));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 misses Scorched Earth 10%', /\[miss\] Scorched Earth/.test(rawMiss) && !/Afflicts .+ with Vulnerable/.test(rawMiss));
check('seed 0.99 still Ensnare + Intellect + vanguard', /Ensnare/.test(rawMiss) && miss.ss.getPercentTotal('int') === 8.5 && miss.right.flatMods.str === 20);

const low = setup(() => 0, { stars: 8 });
low.battle.start();
low.battle.runRound();
low.battle.runRound();
const rawLow = (low.battle.battleLog || []).join('\n');
check('8★ no Blazing Conductor', !/Blazing Conductor/.test(rawLow));
check('8★ still Breath of Fire R2', /Shadowsong activates Breath of Fire/.test(rN(rawLow, 2)));
check('8★ still Ensnare', /Ensnare/.test(rawLow));

const panic = setup(() => 0);
panic.battle.start();
applyEffect(panic.e0, 'PANIC', 1, 'seed', { duration: 10, damageRate: 20 });
applyEffect(panic.e1, 'PANIC', 1, 'seed', { duration: 10, damageRate: 20 });
panic.battle.runRound();
panic.battle.runRound();
const rawPanic = (panic.battle.battleLog || []).join('\n');
const base = setup(() => 0);
base.battle.start();
base.battle.runRound();
base.battle.runRound();
const rawBase = (base.battle.battleLog || []).join('\n');
const dmgP = fireHits(cmdChunk(rawPanic, 2));
const dmgB = fireHits(cmdChunk(rawBase, 2));
check('Panic Breath of Fire 1.5x', dmgP.length && dmgB.length && dmgP[0] > dmgB[0], 'panic=' + (dmgP[0] || 0) + ' base=' + (dmgB[0] || 0));
check('Panic Scorched Earth rolls 20% not 10%', /\[hit\] Scorched Earth → .+ \(20%\)/.test(rawPanic) || /\(20%\)/.test(rN(rawPanic, 2)));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
