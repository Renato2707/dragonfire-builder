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
  const habits = JSON.parse(fs.readFileSync('./data/antares_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/antares_vanguard_command.json', 'utf8'));
  const data = {
    id: 'antares', name: 'Antares', rarity: 'Legendary', breed: 'Hunter',
    stats: { str: 48, inst: 42, int: 68, init: 52 },
    affinity: ['archers', 'cavalry'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const an = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  an.setTroopType('archers');
  loadKit(an, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }, extras.leftBreed || 'Sentinel');
  if (left) left.setTroopType('spearmen');
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

  const battle = new Battle([left, an, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['archers', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, an, left, right, e0, e1, e2 };
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
  const after = chunk.split('Antares activates Relentless Pursuit')[1] || '';
  return after.split('Antares launches')[0].split('Antares activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/antares_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/antares_habits.json', 'utf8'));

check('JSON command Relentless Pursuit', kitCmd.name === 'Relentless Pursuit');
check('JSON each-round Vulnerable 20% adj', kitCmd.command[0].actions[0].st === 'vulnerable' && kitCmd.command[0].actions[0].chance === 20 && kitCmd.command[0].actions[0].val === 10);
check('JSON R3,6,9 fire adj 2x +65', kitCmd.command[1].rounds.join() === '3,6,9' && kitCmd.command[1].actions[0].dt === 'fire' && kitCmd.command[1].actions[0].pct === 65);
check('JSON vanguard fire +16 self', kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard STR/INIT flat 20 RIGHT slot 2', kitCmd.vanguard[0].actions[1].tgt.slot === 2 && kitCmd.vanguard[0].actions[1].mods[0].fixed === 20);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Blazing Onslaught|Dragon's Flair|Fiery Precision|Dragon's Intellect|Redemption");
check('JSON Blazing Onslaught L fire / R physical +11', kitHab.habits[0].structured[0].actions[0].tgt.select === 'prefer_lane:L' && kitHab.habits[0].structured[0].actions[1].tgt.select === 'prefer_lane:R' && kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === 11);
check("JSON Dragon's Flair fire_dealt 8", kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 8);
check('JSON Fiery Precision fire 20 filter slow', kitHab.habits[2].structured[0].actions[0].tgt.filter.status === 'slow' && kitHab.habits[2].structured[0].actions[0].pct[0] === 20);
check("JSON Dragon's Intellect recv -4 / INT +5", kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === -4 && kitHab.habits[3].structured[0].actions[0].mods[1].pct[0] === 5);
check('JSON Redemption INT/INIT +6 + immunity 10%', kitHab.habits[4].structured[0].actions[0].mods[0].pct[0] === 6 && kitHab.habits[4].structured[1].actions[0].st === 'immunity' && kitHab.habits[4].structured[1].actions[0].chance[0] === 10);
check("vanguardNames Antares Hunter's Wrath", VANGUARD_NAMES.antares === "Hunter's Wrath");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/antares-report.txt', report);
fs.writeFileSync('./tmp/antares-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Antares lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Antares|Hunter's Wrath|Relentless Pursuit|Blazing Onslaught|Dragon's Flair|Fiery Precision|Dragon's Intellect|Redemption|Vulnerable/.test(line)) {
    console.log(line);
  }
}

check("vanguard Hunter's Wrath", report.includes("Hunter's Wrath"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Relentless Pursuit (Vanguard)', !/Relentless Pursuit \(Vanguard\)/.test(raw) && !/Relentless Pursuit \(Vanguard\)/.test(report));
check('command Relentless Pursuit', report.includes('Relentless Pursuit') && /Antares activates Relentless Pursuit/.test(raw));
check('Blazing Onslaught', report.includes('Blazing Onslaught') || /Blazing Onslaught/.test(raw));
check("Dragon's Flair", report.includes("Dragon's Flair") || /Dragon's Flair/.test(raw));
check("Dragon's Intellect", report.includes("Dragon's Intellect") || /Dragon's Intellect/.test(raw));
check('Redemption', report.includes('Redemption') || /Redemption/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Fire Damage Dealt +16%', /\+16% Fire Damage Dealt/.test(report));
check('vanguard Strength +20 flat not %', /\+20 Strength/.test(report) && !/\+20% Strength/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("right flank Hunter's Wrath", /\[ AllyR \] is under the effect of \[ Hunter's Wrath \]/.test(report));
check("left flank no Hunter's Wrath", !/\[ AllyL \] is under the effect of \[ Hunter's Wrath \]/.test(report));

check('R3 fire adj', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 3)));
check('R6 fire', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 6)));
check('R9 fire', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 9)));
check('R1 no R3-fire command', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 1)));

check('engine self fire_dealt 16+8=24', main.an.getPercentTotal('fire_dealt') === 24, 'fire=' + main.an.getPercentTotal('fire_dealt'));
check('engine right flats +20', main.right.flatMods.str === 20 && main.right.flatMods.init === 20, JSON.stringify(main.right.flatMods));
check('engine left no vanguard flats', (main.left.flatMods.str || 0) === 0 && (main.left.flatMods.init || 0) === 0);
check('engine Blazing L fire recv +11 / R phys recv +11', main.e0.getPercentTotal('fire_received') === 11 && main.e2.getPercentTotal('physical_received') === 11, 'e0=' + main.e0.getPercentTotal('fire_received') + ' e2=' + main.e2.getPercentTotal('physical_received'));
check("engine Intellect + Redemption INT 5+6=11 / recv -4", main.an.getPercentTotal('int') === 11 && main.an.getPercentTotal('dmg_received') === -4, 'int=' + main.an.getPercentTotal('int') + ' recv=' + main.an.getPercentTotal('dmg_received'));
check('engine Redemption INIT +6', main.an.getPercentTotal('init') === 6, 'init=' + main.an.getPercentTotal('init'));
check('seed 0 Vulnerable or Immunity', hasEffect(main.e0, 'vulnerable') || hasEffect(main.e1, 'vulnerable') || hasEffect(main.e2, 'vulnerable') || hasEffect(main.an, 'immunity') || /Vulnerable/.test(raw) || /Immunity/.test(raw));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Onslaught + Flair + Intellect + Redemption + Pursuit', /Blazing Onslaught/.test(rawR1) && /Dragon's Flair/.test(rawR1) && /Dragon's Intellect/.test(rawR1) && /Redemption/.test(rawR1) && /Relentless Pursuit/.test(rawR1));

const miss = setup(() => 0.99);
miss.battle.start();
for (let i = 0; i < 3; i += 1) miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R3 fire (dmg not chance)', /Deals \d+ Fire Damage/.test(rawMiss));
check('seed 0.99 still vanguard + Onslaught + Flair + Intellect', miss.an.getPercentTotal('fire_dealt') === 24 && miss.right.flatMods.str === 20 && miss.e0.getPercentTotal('fire_received') === 11 && /Blazing Onslaught/.test(rawMiss) && /Dragon's Flair/.test(rawMiss) && /Dragon's Intellect/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Precision / Intellect / Redemption', !/Fiery Precision/.test(rawStars) && !/Dragon's Intellect/.test(rawStars) && !/Redemption/.test(rawStars));
check("5\u2605 still Onslaught + Flair + Pursuit", /Blazing Onslaught/.test(rawStars) && /Dragon's Flair/.test(rawStars) && /Relentless Pursuit/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Redemption', !/Redemption/.test(rawMidS));
check("8\u2605 still Precision + Intellect", /Fiery Precision/.test(rawMidS) && /Dragon's Intellect/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
