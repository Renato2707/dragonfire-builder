import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';

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
  const habits = JSON.parse(fs.readFileSync('./data/tessarion_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/tessarion_vanguard_command.json', 'utf8'));
  const data = {
    id: 'tessarion', name: 'Tessarion', rarity: 'Legendary', breed: 'Champion',
    stats: { str: 55, inst: 52, int: 58, init: 48 },
    affinity: ['cavalry', 'spearmen'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const ts = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  ts.setTroopType('cavalry');
  loadKit(ts, habits, cmd);
  if (extras.hpPct != null) {
    ts.currentHealth = Math.max(1, Math.floor(ts.maxHealth * extras.hpPct));
  }

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 30, inst: 40, int: 90, init: 30 }, extras.leftBreed || 'Hunter');
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 40, inst: 30, int: 30, init: 30 }, extras.rightBreed || 'Warrior');
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

  const battle = new Battle([left, ts, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['cavalry', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, ts, left, right, e0, e1, e2 };
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
  const after = chunk.split('Tessarion activates Cobalt Flame')[1] || '';
  return after.split('Tessarion launches')[0].split('Tessarion activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/tessarion_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/tessarion_habits.json', 'utf8'));

check('JSON command Cobalt Flame', kitCmd.name === 'Cobalt Flame');
check('JSON fire +95 R1,4,7 prefer physical dealer', kitCmd.command[0].rounds.join() === '1,4,7' && kitCmd.command[0].actions[0].dt === 'fire' && kitCmd.command[0].actions[0].pct === 95 && kitCmd.command[0].actions[0].tgt.select === 'prefer_dealer:physical');
check('JSON 50% dmg_dealt -10 doubled if physical', kitCmd.command[0].actions[1].mods[0].pct === -10 && kitCmd.command[0].actions[1].chance === 50 && kitCmd.command[0].actions[1].ifBonus.pct === -20);
check('JSON physical same_lane +60 R3,6,9', kitCmd.command[1].rounds.join() === '3,6,9' && kitCmd.command[1].actions[0].dt === 'physical' && kitCmd.command[1].actions[0].pct === 60 && kitCmd.command[1].actions[0].tgt.select === 'same_lane');
check('JSON vanguard STR/INT/INST flat 15 self', kitCmd.vanguard[0].actions[0].mods.every(m => m.fixed === 15));
check('JSON vanguard dmg_received -8 right slot 2', kitCmd.vanguard[0].actions[1].mods[0].pct === -8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === 'Sharpened Beauty|Blazing Leader|Molten Armor|Clever Maneuver|The Blue Queen');
check('JSON Sharpened Beauty 7% doubled if HP>75 or Advantage', kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === 7 && kitHab.habits[0].structured[0].actions[0].ifBonus.mult === 2);
check('JSON Blazing Leader prefer L fire 10', kitHab.habits[1].structured[0].actions[0].tgt.select === 'prefer_lane:L' && kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 10);
check('JSON Molten Armor odd 25% 2 other allies', kitHab.habits[2].structured[0].rounds.join() === '1,3,5,7,9' && kitHab.habits[2].structured[0].chance[0] === 25 && kitHab.habits[2].structured[0].actions[0].tgt.excludeSelf === true);
check('JSON Clever Maneuver highest:int scale inst', kitHab.habits[3].structured[0].actions[0].tgt.select === 'highest:int' && kitHab.habits[3].structured[0].actions[0].scaleStat === 'inst' && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 18);
check('JSON Blue Queen odd 40% fire dealer excludeSelf doubled >75%', kitHab.habits[4].structured[0].chance[0] === 40 && kitHab.habits[4].structured[0].actions[0].tgt.select === 'dealer:fire' && kitHab.habits[4].structured[0].actions[0].ifBonus.mult === 2);
check("vanguardNames Tessarion Champion's Brilliance", VANGUARD_NAMES.tessarion === "Champion's Brilliance");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/tessarion-report.txt', report);
fs.writeFileSync('./tmp/tessarion-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Tessarion lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Tessarion|Champion's Brilliance|Cobalt Flame|Sharpened Beauty|Blazing Leader|Molten Armor|Clever Maneuver|Blue Queen/.test(line)) {
    console.log(line);
  }
}

check("vanguard Champion's Brilliance", report.includes("Champion's Brilliance"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Cobalt Flame (Vanguard)', !/Cobalt Flame \(Vanguard\)/.test(raw) && !/Cobalt Flame \(Vanguard\)/.test(report));
check('command Cobalt Flame', report.includes('Cobalt Flame') && /Tessarion activates Cobalt Flame/.test(raw));
check('Sharpened Beauty', report.includes('Sharpened Beauty') || /Sharpened Beauty/.test(raw));
check('Blazing Leader', report.includes('Blazing Leader') || /Blazing Leader/.test(raw));
check('Molten Armor', report.includes('Molten Armor') || /Molten Armor/.test(raw));
check('Clever Maneuver', report.includes('Clever Maneuver') || /Clever Maneuver/.test(raw));
check('The Blue Queen', report.includes('The Blue Queen') || /The Blue Queen/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Strength +15 flat not %', /\+15 Strength/.test(report) && !/\+15% Strength/.test(report));
check('vanguard Intelligence +15 flat not %', /\+15 Intelligence/.test(report) && !/\+15% Intelligence/.test(report));
check('vanguard Instinct +15 flat not %', /\+15 Instinct/.test(report) && !/\+15% Instinct/.test(report));
check('vanguard Damage Received -8% right', /-8% Damage Received/.test(report));
check("right flank Champion's Brilliance", /\[ AllyR \] is under the effect of \[ Champion's Brilliance \]/.test(report));
check("left flank no Champion's Brilliance", !/\[ AllyL \] is under the effect of \[ Champion's Brilliance \]/.test(report));

check('R1 fire +95', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 1)));
check('R2 no Cobalt Flame dmg', !/Tessarion activates Cobalt Flame/.test(rN(raw, 2)) || (!/Deals \d+ Fire Damage/.test(cmdChunk(raw, 2)) && !/Deals \d+ Physical Damage/.test(cmdChunk(raw, 2))));
check('R3 physical +60', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 3)));
check('R4 fire +95', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 4)));
check('R6 physical +60', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 6)));
check('R7 fire +95', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 7)));
check('R9 physical +60', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 9)));

check('engine self flats +15', main.ts.flatMods.str === 15 && main.ts.flatMods.int === 15 && main.ts.flatMods.inst === 15, JSON.stringify(main.ts.flatMods));
check('engine right dmg_received -8', main.right.getPercentTotal('dmg_received') === -8, 'recv=' + main.right.getPercentTotal('dmg_received'));
check('engine left no vanguard recv', main.left.getPercentTotal('dmg_received') === 0 || main.left.getPercentTotal('dmg_received') !== -8);
check('engine Sharpened Beauty doubled at full HP (14)', main.ts.getPercentTotal('physical_dealt') === 14 && main.ts.getPercentTotal('fire_dealt') === 14, 'phys=' + main.ts.getPercentTotal('physical_dealt') + ' fire=' + main.ts.getPercentTotal('fire_dealt'));
check('engine Blazing Leader left fire +10', main.left.getPercentTotal('fire_dealt') === 10, 'L fire=' + main.left.getPercentTotal('fire_dealt'));
check('engine Clever Maneuver on highest INT (AllyL)', main.left.getPercentTotal('int') === 18 && main.left.getPercentTotal('init') === 9, 'L int=' + main.left.getPercentTotal('int') + ' init=' + main.left.getPercentTotal('init'));

const lowHp = setup(() => 0, { hpPct: 0.5 });
lowHp.battle.start();
lowHp.battle.runRound();
check('below 75% Sharpened Beauty not doubled (7)', lowHp.ts.getPercentTotal('physical_dealt') === 7 && lowHp.ts.getPercentTotal('fire_dealt') === 7, 'phys=' + lowHp.ts.getPercentTotal('physical_dealt') + ' fire=' + lowHp.ts.getPercentTotal('fire_dealt'));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R1 fire (dmg not chance)', /Deals \d+ Fire Damage/.test(rawMiss));
check('seed 0.99 still vanguard + Beauty + Leader + Maneuver', miss.ts.flatMods.str === 15 && miss.right.getPercentTotal('dmg_received') === -8 && /Sharpened Beauty/.test(rawMiss) && /Blazing Leader/.test(rawMiss) && /Clever Maneuver/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Molten / Maneuver / Blue Queen', !/Molten Armor/.test(rawStars) && !/Clever Maneuver/.test(rawStars) && !/The Blue Queen/.test(rawStars));
check('5\u2605 still Beauty + Leader + Flame', /Sharpened Beauty/.test(rawStars) && /Blazing Leader/.test(rawStars) && /Cobalt Flame/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no The Blue Queen', !/The Blue Queen/.test(rawMidS));
check('8\u2605 still Molten Armor + Clever Maneuver', /Molten Armor/.test(rawMidS) && /Clever Maneuver/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
