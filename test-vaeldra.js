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
  const habits = JSON.parse(fs.readFileSync('./data/vaeldra_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/vaeldra_vanguard_command.json', 'utf8'));
  const data = {
    id: 'vaeldra', name: 'Vaeldra', rarity: 'Legendary', breed: 'Warrior',
    stats: { str: 62, inst: 44, int: 50, init: 46 },
    affinity: ['spearmen', 'cavalry'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const va = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  va.setTroopType('spearmen');
  loadKit(va, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 30, inst: 55, int: 50, init: 30 }, extras.leftBreed || 'Hunter');
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 60, inst: 30, int: 30, init: 30 }, extras.rightBreed || 'Warrior');
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

  const battle = new Battle([left, va, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, va, left, right, e0, e1, e2 };
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
  const after = chunk.split('Vaeldra activates Lure')[1] || '';
  return after.split('Vaeldra launches')[0].split('Vaeldra activates')[0];
}

function anyStatus(ctx, st) {
  return [ctx.e0, ctx.e1, ctx.e2].some(e => e && hasEffect(e, st));
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/vaeldra_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/vaeldra_habits.json', 'utf8'));

check('JSON command Lure', kitCmd.name === 'Lure');
check('JSON each-round 25% Taunt 3 enemies 2r', kitCmd.command[0].actions[0].st === 'taunt' && kitCmd.command[0].actions[0].chance === 25 && kitCmd.command[0].actions[0].tgt.count === 3 && kitCmd.command[0].actions[0].dur === 2);
check('JSON odd physical adj 2 targets +45', kitCmd.command[1].rounds.join() === '1,3,5,7,9' && kitCmd.command[1].actions[0].dt === 'physical' && kitCmd.command[1].actions[0].pct === 45 && kitCmd.command[1].actions[0].tgt.count === 2 && kitCmd.command[1].actions[0].tgt.select === 'adjacency');
check('JSON vanguard dmg_received -8 self', kitCmd.vanguard[0].actions[0].mods[0].pct === -8);
check('JSON vanguard tactical +16 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].stat === 'tactical_dealt' && kitCmd.vanguard[0].actions[1].mods[0].pct === 16 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Dragon's Valor|Ensnare|Tempting Distraction|Infernal Force|Siren's Call");
check("JSON Dragon's Valor rank1 -5 / +8.5 (levels not body)", kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === -5 && kitHab.habits[0].structured[0].actions[0].mods[1].pct[0] === 8.5);
check('JSON Ensnare R1 adj INST/INIT -18 scale int', kitHab.habits[1].structured[0].actions[0].tgt.select === 'adjacency' && kitHab.habits[1].structured[0].actions[0].scaleStat === 'int' && kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === -18);
check('JSON Tempting Distraction on_taunt last_taunt +6', kitHab.habits[2].structured[0].phase === 'on_taunt' && kitHab.habits[2].structured[0].actions[0].tgt.select === 'last_taunt' && kitHab.habits[2].structured[0].actions[0].mods[0].pct[0] === 6);
check('JSON Infernal Force prefer L fire / R physical 12 3r', kitHab.habits[3].structured[0].actions[0].tgt.select === 'prefer_lane:L' && kitHab.habits[3].structured[0].actions[1].tgt.select === 'prefer_lane:R' && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 12);
check("JSON Siren's Call phys_recv -10 + R1-3 taunt/stagger 40%", kitHab.habits[4].structured[0].actions[0].mods[0].pct[0] === -10 && kitHab.habits[4].structured[1].rounds.join() === '1,2,3' && kitHab.habits[4].structured[1].chance[0] === 40 && kitHab.habits[4].structured[1].actions[0].ifAlready.st === 'stagger');
check("vanguardNames Vaeldra Warrior's Resilience", VANGUARD_NAMES.vaeldra === "Warrior's Resilience");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/vaeldra-report.txt', report);
fs.writeFileSync('./tmp/vaeldra-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Vaeldra lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Vaeldra|Warrior's Resilience|Lure|Dragon's Valor|Ensnare|Tempting Distraction|Infernal Force|Siren's Call|Taunt|Stagger/.test(line)) {
    console.log(line);
  }
}

check("vanguard Warrior's Resilience", report.includes("Warrior's Resilience"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Lure (Vanguard)', !/Lure \(Vanguard\)/.test(raw) && !/Lure \(Vanguard\)/.test(report));
check('command Lure', report.includes('Lure') && /Vaeldra activates Lure/.test(raw));
check("Dragon's Valor", report.includes("Dragon's Valor") || /Dragon's Valor/.test(raw));
check('Ensnare', report.includes('Ensnare') || /Ensnare/.test(raw));
check('Infernal Force', report.includes('Infernal Force') || /Infernal Force/.test(raw));
check("Siren's Call", report.includes("Siren's Call") || /Siren's Call/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Damage Received -8%', /-8% Damage Received/.test(report));
check('vanguard Tactical Damage Dealt +16%', /\+16% Tactical Damage Dealt/.test(report));
check("left flank Warrior's Resilience", /\[ AllyL \] is under the effect of \[ Warrior's Resilience \]/.test(report));
check("right flank no Warrior's Resilience", !/\[ AllyR \] is under the effect of \[ Warrior's Resilience \]/.test(report));

check('R1 physical adj', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 1)));
check('R2 no odd physical (taunt-only command round)', !/Deals \d+ Physical Damage/.test(cmdChunk(raw, 2)));
check('R3 physical adj', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 3)));
check('R5 physical adj', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 5)));

check('engine self dmg_received includes vanguard -8 + valor -5', main.va.getPercentTotal('dmg_received') <= -8, 'recv=' + main.va.getPercentTotal('dmg_received'));
check("engine Dragon's Valor STR +8.5", main.va.getPercentTotal('str') === 8.5, 'str=' + main.va.getPercentTotal('str'));
check('engine left tactical_dealt +16', main.left.getPercentTotal('tactical_dealt') === 16, 'tac=' + main.left.getPercentTotal('tactical_dealt'));
check('engine right no tactical vanguard', main.right.getPercentTotal('tactical_dealt') === 0);
check('engine Infernal Force L fire / R physical +12', main.left.getPercentTotal('fire_dealt') === 12 && main.right.getPercentTotal('physical_dealt') === 12, 'L fire=' + main.left.getPercentTotal('fire_dealt') + ' R phys=' + main.right.getPercentTotal('physical_dealt'));
check('engine Siren physical_received -10 self', main.va.getPercentTotal('physical_received') === -10, 'physRecv=' + main.va.getPercentTotal('physical_received'));
check('seed 0 Taunt or Stagger somewhere', anyStatus(main, 'taunt') || anyStatus(main, 'stagger') || /Taunt/.test(raw) || /Stagger/.test(raw));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Valor + Ensnare + Infernal + Siren + Lure', /Dragon's Valor/.test(rawR1) && /Ensnare/.test(rawR1) && /Infernal Force/.test(rawR1) && /Siren's Call/.test(rawR1) && /Lure/.test(rawR1));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R1 physical (dmg not chance)', /Deals \d+ Physical Damage/.test(rawMiss));
check('seed 0.99 still vanguard + Valor + Ensnare + Infernal + Siren recv', miss.va.getPercentTotal('dmg_received') <= -8 && miss.va.getPercentTotal('str') === 8.5 && miss.left.getPercentTotal('tactical_dealt') === 16 && /Dragon's Valor/.test(rawMiss) && /Ensnare/.test(rawMiss) && /Infernal Force/.test(rawMiss) && /Siren's Call/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Tempting / Infernal / Siren', !/Tempting Distraction/.test(rawStars) && !/Infernal Force/.test(rawStars) && !/Siren's Call/.test(rawStars));
check("5\u2605 still Valor + Ensnare + Lure", /Dragon's Valor/.test(rawStars) && /Ensnare/.test(rawStars) && /Lure/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check("8\u2605 no Siren's Call", !/Siren's Call/.test(rawMidS));
check('8\u2605 still Infernal Force', /Infernal Force/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
