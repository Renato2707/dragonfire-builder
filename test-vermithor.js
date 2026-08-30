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
  const habits = JSON.parse(fs.readFileSync('./data/vermithor_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/vermithor_vanguard_command.json', 'utf8'));
  const data = {
    id: 'vermithor', name: 'Vermithor', rarity: 'Legendary', breed: 'Champion',
    stats: { str: 58, inst: 62, int: 35, init: 57 },
    affinity: ['spearmen', 'shieldbearers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const vm = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  vm.setTroopType('spearmen');
  loadKit(vm, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, { str: 40, inst: 40, int: 40, init: 30 }, 'Hunter');
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, { str: 55, inst: 30, int: 30, init: 30 }, 'Warrior');
  if (right) right.setTroopType('cavalry');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, { str: 30, inst: 35, int: 80, init: 20 }, 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, { str: 80, inst: 35, int: 30, init: 20 }, 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, { str: 30, inst: 80, int: 35, init: 20 }, 'Sentinel');

  const battle = new Battle([left, vm, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, vm, left, right, e0, e1, e2 };
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
  const after = chunk.split('Vermithor activates Bronze Assault')[1] || '';
  return after.split('Vermithor launches')[0].split('Vermithor activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/vermithor_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/vermithor_habits.json', 'utf8'));

check('JSON command Bronze Assault from dragons.json', kitCmd.name === 'Bronze Assault');
check('JSON even physical +30 and tactical +60 adj 2', kitCmd.command[0].rounds.join() === '2,4,6,8' && kitCmd.command[0].actions[0].dt === 'physical' && kitCmd.command[0].actions[0].pct === 30 && kitCmd.command[0].actions[1].dt === 'tactical' && kitCmd.command[0].actions[1].pct === 60);
check('JSON odd Protect 30% other adj ally', kitCmd.command[1].rounds.join() === '1,3,5,7,9' && kitCmd.command[1].actions[0].st === 'protect' && kitCmd.command[1].actions[0].chance === 30 && kitCmd.command[1].actions[0].tgt.excludeSelf === true);
check('JSON vanguard STR/INT/INST flat 15 self', kitCmd.vanguard[0].actions[0].mods[0].fixed === 15 && kitCmd.vanguard[0].actions[0].mods[1].fixed === 15 && kitCmd.vanguard[0].actions[0].mods[2].fixed === 15);
check('JSON vanguard dmg_received -8 RIGHT slot 2', kitCmd.vanguard[0].actions[1].mods[0].pct === -8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON habit names from dragons.json', kitHab.habits.map(h => h.name).join('|') === "Noble Sacrifice|Nimble Resilience|Bronze Bulwark|Fury's Poise|Vengeful Fury");
check("vanguardNames Vermithor Champion's Brilliance", VANGUARD_NAMES.vermithor === "Champion's Brilliance");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/vermithor-report.txt', report);
fs.writeFileSync('./tmp/vermithor-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Vermithor lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Vermithor|Champion's Brilliance|Bronze Assault|Protect/.test(line)) console.log(line);
}

check("vanguard Champion's Brilliance", report.includes("Champion's Brilliance"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Bronze Assault (Vanguard)', !/Bronze Assault \(Vanguard\)/.test(raw) && !/Bronze Assault \(Vanguard\)/.test(report));
check('command Bronze Assault', report.includes('Bronze Assault') && /Vermithor activates Bronze Assault/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));
check('vanguard Strength +15 flat not %', /\+15 Strength/.test(report) && !/\+15% Strength/.test(report));
check('vanguard Intelligence +15 flat not %', /\+15 Intelligence/.test(report) && !/\+15% Intelligence/.test(report));
check('vanguard Instinct +15 flat not %', /\+15 Instinct/.test(report) && !/\+15% Instinct/.test(report));
check('vanguard Damage Received -8%', /-8% Damage Received/.test(report));
check("right flank Champion's Brilliance", /\[ AllyR \] is under the effect of \[ Champion's Brilliance \]/.test(report));
check("left flank no Champion's Brilliance", !/\[ AllyL \] is under the effect of \[ Champion's Brilliance \]/.test(report));

check('R1 no even dual dmg', !/Deals \d+ Physical Damage/.test(cmdChunk(raw, 1)));
check('R2 physical + tactical adj', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 2)) && /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 2)));
check('R4 dual dmg', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 4)));
check('R6 dual dmg', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 6)));
check('R8 dual dmg', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 8)));

check('engine self flats +15', main.vm.flatMods.str === 15 && main.vm.flatMods.int === 15 && main.vm.flatMods.inst === 15, JSON.stringify(main.vm.flatMods));
check('engine right dmg_received -8', main.right.getPercentTotal('dmg_received') === -8, 'R recv=' + main.right.getPercentTotal('dmg_received'));
check('engine left no vanguard recv', main.left.getPercentTotal('dmg_received') === 0);
check('seed 0 Protect on other ally', hasEffect(main.left, 'protect') || hasEffect(main.right, 'protect') || /Protect/.test(raw));

const miss = setup(() => 0.99);
miss.battle.start();
for (let i = 0; i < 2; i += 1) miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R2 dual dmg (dmg not chance)', /Deals \d+ Physical Damage/.test(rawMiss) && /Deals \d+ Tactical Damage/.test(rawMiss));
check('seed 0.99 still vanguard', miss.vm.flatMods.str === 15 && miss.right.getPercentTotal('dmg_received') === -8);

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
