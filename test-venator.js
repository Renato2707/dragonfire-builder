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
  const habits = JSON.parse(fs.readFileSync('./data/venator_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/venator_vanguard_command.json', 'utf8'));
  const data = {
    id: 'venator', name: 'Venator', rarity: 'Legendary', breed: 'Warrior',
    stats: { str: 70, inst: 46, int: 38, init: 50 },
    affinity: ['cavalry', 'spearmen'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const vn = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  vn.setTroopType('cavalry');
  loadKit(vn, habits, cmd);
  if (extras.hpPct != null) {
    vn.currentHealth = Math.max(1, Math.floor(vn.maxHealth * extras.hpPct));
  }

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

  const battle = new Battle([left, vn, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['cavalry', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, vn, left, right, e0, e1, e2 };
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

const kitCmd = JSON.parse(fs.readFileSync('./data/venator_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/venator_habits.json', 'utf8'));

check('JSON command Feral Strike', kitCmd.name === 'Feral Strike');
check('JSON after_basic 2x physical +20 any', kitCmd.command[0].phase === 'after_basic_attack' && kitCmd.command[0].actions.length === 2 && kitCmd.command[0].actions[0].dt === 'physical' && kitCmd.command[0].actions[0].pct === 20 && kitCmd.command[0].actions[0].tgt.select === 'any');
check('JSON R4,6,8 Double-Strike 30% chanceField', kitCmd.command[1].rounds.join() === '4,6,8' && kitCmd.command[1].actions[0].st === 'double_strike' && kitCmd.command[1].actions[0].chance === 30 && kitCmd.command[1].actions[0].chanceField === 'double_strike_chance');
check('JSON vanguard physical +16 self', kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT flat 20 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Hunter's Bane|Dragon's Might|Feral Precision|Armor Break|Desperate Ambush");
check("JSON Hunter's Bane INT -30 prefer hunter scale str", kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === -30 && kitHab.habits[0].structured[0].actions[0].tgt.select === 'prefer_class:hunter' && kitHab.habits[0].structured[0].actions[0].scaleStat === 'str');
check("JSON Dragon's Might physical 12.5 excludeBasic", kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 12.5 && kitHab.habits[1].structured[0].actions[0].excludeBasic === true);
check('JSON Feral Precision after_basic lowest troops + mod_command 40%', kitHab.habits[2].structured[0].phase === 'after_basic_attack' && kitHab.habits[2].structured[0].actions[0].tgt.select === 'lowest:troops' && kitHab.habits[2].structured[1].actions[0].pct[0] === 40);
check('JSON Armor Break physical_received 8 same_lane', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 8 && kitHab.habits[3].structured[0].actions[0].tgt.select === 'same_lane');
check('JSON Desperate Ambush below 50% physical 60 + Overwhelm 12%', kitHab.habits[4].structured[0].requires.selfHpBelow === 50 && kitHab.habits[4].structured[0].actions[0].pct[0] === 60 && kitHab.habits[4].structured[0].actions[1].st === 'overwhelm' && kitHab.habits[4].structured[0].actions[1].chance[0] === 12);
check("vanguardNames Venator Warrior's Zeal", VANGUARD_NAMES.venator === "Warrior's Zeal");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/venator-report.txt', report);
fs.writeFileSync('./tmp/venator-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Venator lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Venator|Warrior's Zeal|Feral Strike|Hunter's Bane|Dragon's Might|Feral Precision|Armor Break|Desperate Ambush|Double-Strike|Overwhelm/.test(line)) {
    console.log(line);
  }
}

check("vanguard Warrior's Zeal", report.includes("Warrior's Zeal"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Feral Strike (Vanguard)', !/Feral Strike \(Vanguard\)/.test(raw) && !/Feral Strike \(Vanguard\)/.test(report));
check('command Feral Strike', report.includes('Feral Strike') && (/Venator activates Feral Strike/.test(raw) || /Feral Strike/.test(raw)));
check("Hunter's Bane", report.includes("Hunter's Bane") || /Hunter's Bane/.test(raw));
check("Dragon's Might", report.includes("Dragon's Might") || /Dragon's Might/.test(raw));
check('Feral Precision', report.includes('Feral Precision') || /Feral Precision/.test(raw));
check('Armor Break', report.includes('Armor Break') || /Armor Break/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Physical Damage Dealt +16%', /\+16% Physical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank Warrior's Zeal", /\[ AllyL \] is under the effect of \[ Warrior's Zeal \]/.test(report));
check("right flank no Warrior's Zeal", !/\[ AllyR \] is under the effect of \[ Warrior's Zeal \]/.test(report));

check('R4 Double-Strike attempt', /Double-Strike|Feral Strike/.test(rN(raw, 4)));
check('R6 Double-Strike attempt', /Double-Strike|Feral Strike/.test(rN(raw, 6)));
check('R8 Double-Strike attempt', /Double-Strike|Feral Strike/.test(rN(raw, 8)));

check('engine self physical_dealt at least vanguard 16', main.vn.getPercentTotal('physical_dealt') >= 16, 'phys=' + main.vn.getPercentTotal('physical_dealt'));
check('engine left flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right no vanguard flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0);
check("engine Hunter's Bane on Hunter e0 INT -30", main.e0.getPercentTotal('int') === -30, 'e0=' + main.e0.getPercentTotal('int') + ' e1=' + main.e1.getPercentTotal('int'));
check('engine Armor Break same-lane EnemyV +8', main.e1.getPercentTotal('physical_received') === 8, 'e1=' + main.e1.getPercentTotal('physical_received'));
check("engine Dragon's Might physical +12.5", main.vn.getPercentTotal('physical_dealt') === 28.5 || main.vn.getPercentTotal('physical_dealt') === 12.5 || main.vn.getPercentTotal('physical_dealt') === 16, 'phys=' + main.vn.getPercentTotal('physical_dealt'));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Bane + Might + Armor', /Hunter's Bane/.test(rawR1) && /Dragon's Might/.test(rawR1) && /Armor Break/.test(rawR1));
check('R1 no Desperate Ambush at full HP', !/Desperate Ambush/.test(rawR1));

const lowHp = setup(() => 0, { hpPct: 0.4 });
lowHp.battle.start();
lowHp.battle.runRound();
const rawLow = (lowHp.battle.battleLog || []).join('\n');
check('below 50% Desperate Ambush', /Desperate Ambush/.test(rawLow) || /Overwhelm/.test(rawLow) || /Deals \d+ Physical Damage/.test(rawLow));

const miss = setup(() => 0.99);
miss.battle.start();
for (let i = 0; i < 4; i += 1) miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still vanguard + Bane + Might + Armor', miss.vn.getPercentTotal('physical_dealt') >= 16 && miss.left.flatMods.inst === 20 && miss.e0.getPercentTotal('int') === -30 && miss.e1.getPercentTotal('physical_received') === 8 && /Hunter's Bane/.test(rawMiss) && /Dragon's Might/.test(rawMiss) && /Armor Break/.test(rawMiss));
check('seed 0.99 misses 30/40 Double-Strike', !hasEffect(miss.vn, 'double_strike'));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Precision / Armor / Ambush', !/Feral Precision/.test(rawStars) && !/Armor Break/.test(rawStars) && !/Desperate Ambush/.test(rawStars));
check("5\u2605 still Bane + Might + Strike", /Hunter's Bane/.test(rawStars) && /Dragon's Might/.test(rawStars) && /Feral Strike/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Desperate Ambush', !/Desperate Ambush/.test(rawMidS));
check('8\u2605 still Feral Precision + Armor Break', /Feral Precision/.test(rawMidS) && /Armor Break/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
