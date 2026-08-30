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
  const habits = JSON.parse(fs.readFileSync('./data/thunderstrike_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/thunderstrike_vanguard_command.json', 'utf8'));
  const data = {
    id: 'thunderstrike', name: 'Thunderstrike', rarity: 'Legendary', breed: 'Warrior',
    stats: { str: 68, inst: 48, int: 40, init: 50 },
    affinity: ['cavalry', 'spearmen'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const th = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  th.setTroopType('cavalry');
  loadKit(th, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }, extras.leftBreed || 'Sentinel');
  if (left) left.setTroopType('spearmen');
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

  const battle = new Battle([left, th, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['cavalry', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, th, left, right, e0, e1, e2 };
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
  const after = chunk.split('Thunderstrike activates Tail Whip')[1] || '';
  return after.split('Thunderstrike launches')[0].split('Thunderstrike activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/thunderstrike_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/thunderstrike_habits.json', 'utf8'));

check('JSON command Tail Whip', kitCmd.name === 'Tail Whip');
check('JSON odd physical same_lane +100', kitCmd.command[0].rounds.join() === '1,3,5,7,9' && kitCmd.command[0].actions[0].dt === 'physical' && kitCmd.command[0].actions[0].pct === 100 && kitCmd.command[0].actions[0].tgt.select === 'same_lane');
check('JSON command has no even-round lash (habit Barbed Lash)', kitCmd.command.length === 1);
check('JSON vanguard physical +16 self', kitCmd.vanguard[0].actions[0].mods[0].stat === 'physical_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT flat 20 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].mods[1].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Battle Rush|Dragon's Might|Barbed Lash|Armor Break|Staggering Assault");
check('JSON Battle Rush R1 self INIT 25 + adj INST -15 scale str', kitHab.habits[0].structured[0].rounds.join() === '1' && kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === 25 && kitHab.habits[0].structured[0].actions[1].scaleStat === 'str' && kitHab.habits[0].structured[0].actions[1].tgt.select === 'adjacency');
check("JSON Dragon's Might physical_dealt 8 combat", kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 8);
check('JSON Barbed Lash even physical 50 + bleed 25%', kitHab.habits[2].structured[0].rounds.join() === '2,4,6,8,10' && kitHab.habits[2].structured[0].actions[0].pct[0] === 50 && kitHab.habits[2].structured[0].actions[1].st === 'bleed' && kitHab.habits[2].structured[0].actions[1].chance[0] === 25);
check('JSON Armor Break physical_received 4.8 same_lane', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 4.8 && kitHab.habits[3].structured[0].actions[0].tgt.select === 'same_lane');
check('JSON Staggering Assault 10% same_lane dur 1 / 2 if Advantage', kitHab.habits[4].structured[0].actions[0].chance[0] === 10 && kitHab.habits[4].structured[0].actions[0].dur === 1 && kitHab.habits[4].structured[0].actions[0].ifBonus.dur === 2);
check("vanguardNames Thunderstrike Warrior's Zeal", VANGUARD_NAMES.thunderstrike === "Warrior's Zeal");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/thunderstrike-report.txt', report);
fs.writeFileSync('./tmp/thunderstrike-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Thunderstrike lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Thunderstrike|Warrior's Zeal|Tail Whip|Battle Rush|Dragon's Might|Barbed Lash|Armor Break|Staggering Assault|Bleed|Stagger/.test(line)) {
    console.log(line);
  }
}

check("vanguard Warrior's Zeal", report.includes("Warrior's Zeal"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Tail Whip (Vanguard)', !/Tail Whip \(Vanguard\)/.test(raw) && !/Tail Whip \(Vanguard\)/.test(report));
check('command Tail Whip', report.includes('Tail Whip') && /Thunderstrike activates Tail Whip/.test(raw));
check('Battle Rush', report.includes('Battle Rush') || /Battle Rush/.test(raw));
check("Dragon's Might", report.includes("Dragon's Might") || /Dragon's Might/.test(raw));
check('Barbed Lash', report.includes('Barbed Lash') || /Barbed Lash/.test(raw));
check('Armor Break', report.includes('Armor Break') || /Armor Break/.test(raw));
check('Staggering Assault', report.includes('Staggering Assault') || /Staggering Assault/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Physical Damage Dealt +16%', /\+16% Physical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank Warrior's Zeal", /\[ AllyL \] is under the effect of \[ Warrior's Zeal \]/.test(report));
check("right flank no Warrior's Zeal", !/\[ AllyR \] is under the effect of \[ Warrior's Zeal \]/.test(report));

check('R1 physical +100', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 1)));
check('R2 Barbed Lash physical', /Deals \d+ Physical Damage/.test(rN(raw, 2)));
check('R3 physical +100', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 3)));
check('R4 Barbed Lash', /Barbed Lash/.test(rN(raw, 4)) || /Deals \d+ Physical Damage/.test(rN(raw, 4)));
check('R5 physical +100', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 5)));

check('engine self physical_dealt 16+8=24', main.th.getPercentTotal('physical_dealt') === 24, 'phys=' + main.th.getPercentTotal('physical_dealt'));
check('engine left flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right no vanguard flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0);
check('engine Armor Break same-lane EnemyV +4.8 phys received', main.e1.getPercentTotal('physical_received') === 4.8, 'e1=' + main.e1.getPercentTotal('physical_received'));
check('engine Battle Rush self INIT +25', main.th.getPercentTotal('init') === 25, 'init=' + main.th.getPercentTotal('init'));
check('seed 0 Bleed or Stagger somewhere', hasEffect(main.e1, 'bleed') || hasEffect(main.e1, 'stagger') || /Bleed/.test(raw) || /Stagger/.test(raw));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Rush + Might + Armor + Whip', /Battle Rush/.test(rawR1) && /Dragon's Might/.test(rawR1) && /Armor Break/.test(rawR1) && /Tail Whip/.test(rawR1));
check('R1 no Barbed Lash (even only)', !/Barbed Lash/.test(rawR1));

const miss = setup(() => 0.99);
miss.battle.start();
for (let i = 0; i < 2; i += 1) miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still odd/even physical (dmg not chance)', /Deals \d+ Physical Damage/.test(rawMiss));
check('seed 0.99 misses 25% Bleed and 10% Stagger', !hasEffect(miss.e1, 'bleed') && !hasEffect(miss.e1, 'stagger'));
check('seed 0.99 still vanguard + Rush + Might + Armor', miss.th.getPercentTotal('physical_dealt') === 24 && miss.left.flatMods.inst === 20 && /Battle Rush/.test(rawMiss) && /Dragon's Might/.test(rawMiss) && /Armor Break/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
for (let i = 0; i < 2; i += 1) lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Barbed / Armor / Staggering', !/Barbed Lash/.test(rawStars) && !/Armor Break/.test(rawStars) && !/Staggering Assault/.test(rawStars));
check("5\u2605 still Rush + Might + Whip", /Battle Rush/.test(rawStars) && /Dragon's Might/.test(rawStars) && /Tail Whip/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
for (let i = 0; i < 2; i += 1) midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Staggering Assault', !/Staggering Assault/.test(rawMidS));
check('8\u2605 still Barbed Lash + Armor Break', /Barbed Lash/.test(rawMidS) && /Armor Break/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
