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
  const habits = JSON.parse(fs.readFileSync('./data/velar_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/velar_vanguard_command.json', 'utf8'));
  const data = {
    id: 'velar', name: 'Velar', rarity: 'Legendary', breed: 'Sentinel',
    stats: { str: 42, inst: 64, int: 55, init: 52 },
    affinity: ['spearmen', 'archers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const vl = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  vl.setTroopType('spearmen');
  loadKit(vl, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }, extras.leftBreed || 'Hunter');
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 55, inst: 30, int: 30, init: 30 }, extras.rightBreed || 'Warrior');
  if (right) {
    right.setTroopType('cavalry');
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

  const battle = new Battle([left, vl, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, vl, left, right, e0, e1, e2 };
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
  const after = chunk.split('Velar activates Whirlwind')[1] || '';
  return after.split('Velar launches')[0].split('Velar activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/velar_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/velar_habits.json', 'utf8'));

check('JSON command Whirlwind', kitCmd.name === 'Whirlwind');
check('JSON R2,4,6,8 Advantage 20% 2 other allies', kitCmd.command[0].rounds.join() === '2,4,6,8' && kitCmd.command[0].actions[0].st === 'advantage' && kitCmd.command[0].actions[0].chance === 20 && kitCmd.command[0].actions[0].val === 15 && kitCmd.command[0].actions[0].tgt.excludeSelf === true && kitCmd.command[0].actions[0].tgt.count === 2);
check('JSON R3,5,7,9 tactical 3 enemies +45', kitCmd.command[1].rounds.join() === '3,5,7,9' && kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 45 && kitCmd.command[1].actions[0].tgt.count === 3);
check('JSON command has no recovery/cleanse (habit Breath)', !JSON.stringify(kitCmd.command).includes('heal') && !JSON.stringify(kitCmd.command).includes('cleanse'));
check('JSON vanguard tactical +16 self', kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT flat 20 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === 'Strategic Leader|Quick Reflexes|Gales of Power|Fierce Unity|Breath of Renewal');
check('JSON Strategic Leader prefer V tactical 10', kitHab.habits[0].structured[0].actions[0].tgt.select === 'prefer_lane:V' && kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === 10);
check('JSON Quick Reflexes INST/INIT 16 self', kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 16 && kitHab.habits[1].structured[0].actions[0].mods[1].pct[0] === 16);
check('JSON Gales R2,4,6,8 First-Strike/Slow 12% per target', kitHab.habits[2].structured[0].rounds.join() === '2,4,6,8' && kitHab.habits[2].structured[0].actions[0].st === 'first_strike' && kitHab.habits[2].structured[0].actions[0].chancePerTarget === true && kitHab.habits[2].structured[0].actions[1].st === 'slow');
check('JSON Fierce Unity STR/INST 5 scale init 3 allies', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 5 && kitHab.habits[3].structured[0].actions[0].scaleStat === 'init' && kitHab.habits[3].structured[0].actions[0].tgt.count === 3);
check('JSON Breath cleanse 12% all allies + heal 18 R2,4,6,8', kitHab.habits[4].structured[0].actions[0].chance[0] === 12 && kitHab.habits[4].structured[0].actions[0].types.includes('bleed') && kitHab.habits[4].structured[1].actions[0].pct[0] === 18 && kitHab.habits[4].structured[1].actions[0].scaleStat === 'init');
check("vanguardNames Velar Sentinel's Wit", VANGUARD_NAMES.velar === "Sentinel's Wit");

const main = setup(() => 0, { chipRight: true });
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/velar-report.txt', report);
fs.writeFileSync('./tmp/velar-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Velar lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Velar|Sentinel's Wit|Whirlwind|Strategic Leader|Quick Reflexes|Gales of Power|Fierce Unity|Breath of Renewal|Advantage|First-Strike|Slow/.test(line)) {
    console.log(line);
  }
}

check("vanguard Sentinel's Wit", report.includes("Sentinel's Wit"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Whirlwind (Vanguard)', !/Whirlwind \(Vanguard\)/.test(raw) && !/Whirlwind \(Vanguard\)/.test(report));
check('command Whirlwind', report.includes('Whirlwind') && /Velar activates Whirlwind/.test(raw));
check('Strategic Leader', report.includes('Strategic Leader') || /Strategic Leader/.test(raw));
check('Quick Reflexes', report.includes('Quick Reflexes') || /Quick Reflexes/.test(raw));
check('Gales of Power', report.includes('Gales of Power') || /Gales of Power/.test(raw));
check('Fierce Unity', report.includes('Fierce Unity') || /Fierce Unity/.test(raw));
check('Breath of Renewal', report.includes('Breath of Renewal') || /Breath of Renewal/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Tactical Damage Dealt +16%', /\+16% Tactical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank Sentinel's Wit", /\[ AllyL \] is under the effect of \[ Sentinel's Wit \]/.test(report));
check("right flank no Sentinel's Wit", !/\[ AllyR \] is under the effect of \[ Sentinel's Wit \]/.test(report));

check('R1 no Whirlwind dmg/advantage', !/Velar activates Whirlwind/.test(rN(raw, 1)) || (!/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 1)) && !/Advantage/.test(cmdChunk(raw, 1))));
check('R2 Advantage or Breath (even support)', /Whirlwind/.test(rN(raw, 2)) || /Breath of Renewal/.test(rN(raw, 2)) || /Advantage/.test(rN(raw, 2)) || /Recovers/.test(rN(raw, 2)));
check('R3 tactical 3 enemies', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 3)));
check('R5 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 5)));
check('R7 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 7)));
check('R9 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 9)));
check('R10 no even Whirlwind block', !/Velar activates Whirlwind/.test(rN(raw, 10)) || !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 10)));

check('engine self tactical 16 vanguard + 10 leader = 26', main.vl.getPercentTotal('tactical_dealt') === 26, 'tac=' + main.vl.getPercentTotal('tactical_dealt'));
check('engine left flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right no vanguard flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0);
check('engine Quick Reflexes INST/INIT +16 self', main.vl.getPercentTotal('inst') === 16 && main.vl.getPercentTotal('init') === 16, 'inst=' + main.vl.getPercentTotal('inst') + ' init=' + main.vl.getPercentTotal('init'));
check('engine Fierce Unity STR +5 on allies', main.vl.getPercentTotal('str') === 5 && main.left.getPercentTotal('str') === 5 && main.right.getPercentTotal('str') === 5, 'S=' + main.vl.getPercentTotal('str'));
check('seed 0 Advantage or First-Strike somewhere', hasEffect(main.left, 'advantage') || hasEffect(main.right, 'advantage') || hasEffect(main.vl, 'first_strike') || hasEffect(main.left, 'first_strike') || /Advantage/.test(raw) || /First-Strike/.test(raw));

const r1 = setup(() => 0, { chipRight: true });
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Leader + Reflexes + Unity', /Strategic Leader/.test(rawR1) && /Quick Reflexes/.test(rawR1) && /Fierce Unity/.test(rawR1));
check('R1 no Gales (even only)', !/Gales of Power/.test(rawR1));

const miss = setup(() => 0.99, { chipRight: true });
miss.battle.start();
for (let i = 0; i < 3; i += 1) miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R3 tactical (dmg not chance)', /Deals \d+ Tactical Damage/.test(rawMiss));
check('seed 0.99 still vanguard + Leader + Reflexes + Unity', miss.vl.getPercentTotal('tactical_dealt') === 26 && miss.left.flatMods.inst === 20 && /Strategic Leader/.test(rawMiss) && /Quick Reflexes/.test(rawMiss) && /Fierce Unity/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5, chipRight: true });
lowStars.battle.start();
for (let i = 0; i < 2; i += 1) lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Gales / Unity / Breath', !/Gales of Power/.test(rawStars) && !/Fierce Unity/.test(rawStars) && !/Breath of Renewal/.test(rawStars));
check('5\u2605 still Leader + Reflexes + Whirlwind', /Strategic Leader/.test(rawStars) && /Quick Reflexes/.test(rawStars) && /Whirlwind/.test(rawStars));

const midStars = setup(() => 0, { stars: 8, chipRight: true });
midStars.battle.start();
for (let i = 0; i < 2; i += 1) midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Breath of Renewal', !/Breath of Renewal/.test(rawMidS));
check('8\u2605 still Gales + Unity', /Gales of Power/.test(rawMidS) && /Fierce Unity/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
