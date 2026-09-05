import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyInitiativeOrder } from './hook-initiative-order.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { applyLinkedRetreated } from './hook-linked-retreated.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';
import { getDealerType } from './positionSystem.js';

applyInitiativeOrder(Battle);
applyVanguardLabel(Battle);
applyLinkedRetreated(Battle);

function dummy(id, name, team, slot, stats, breed) {
  return new Character({
    id, name, breed: breed || 'Warrior', rarity: 'Rare',
    stats: stats || { str: 50, inst: 50, int: 50, init: 40 },
    affinity: [], weaknesses: []
  }, team, slot, { level: 16, stars: 2, habitRank: 1 });
}

function loadKit(character, habits, cmd) {
  character.setHabits(loadDragonHabitsSync(habits, character.id));
  const kit = loadCommandSync(cmd, character.id);
  character.commandName = kit.name;
  character.vanguardName = VANGUARD_NAMES[character.id] || kit.name;
  character.setCommandKit(kit.command);
  character.setVanguardKit(kit.vanguard);
}

function setup(randomFn) {
  Math.random = randomFn;
  const habits = JSON.parse(fs.readFileSync('./data/bevlorin_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/bevlorin_vanguard_command.json', 'utf8'));

  const data = {
    id: 'bevlorin', name: 'Bevlorin', rarity: 'Rare', breed: 'Champion',
    stats: { str: 55, inst: 38, int: 58, init: 46 },
    affinity: ['spearmen'], weaknesses: []
  };
  const bev = new Character(data, 0, 1, { level: 16, stars: 10, habitRank: 1 });
  bev.setTroopType('spearmen');
  loadKit(bev, habits, cmd);

  const left = dummy('allyL', 'AllyL', 0, 0, { str: 90, inst: 30, int: 30, init: 30 });
  left.setTroopType('spearmen');
  const right = dummy('allyR', 'AllyR', 0, 2, { str: 30, inst: 90, int: 30, init: 80 });
  right.setTroopType('spearmen');

  const e0 = dummy('e0', 'EnemyL', 1, 0, { str: 30, inst: 35, int: 80, init: 20 }, 'Hunter');
  const e1 = dummy('e1', 'EnemyV', 1, 1, { str: 80, inst: 35, int: 30, init: 20 }, 'Warrior');
  const e2 = dummy('e2', 'EnemyR', 1, 2, { str: 30, inst: 80, int: 35, init: 20 }, 'Sentinel');
  for (const e of [e0, e1, e2]) e.setTroopType('spearmen');

  const battle = new Battle([left, bev, right], [e0, e1, e2], {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1
  });
  return { battle, bev, left, right, e0, e1, e2 };
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
fs.writeFileSync('/workspace/dragonfire-builder/bevlorin-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/bevlorin-raw.txt', (main.battle.battleLog || []).join('\n'));
console.log(report);

check("vanguard Champion's Vigor", report.includes("Champion's Vigor"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check("command Nature's Reckoning", report.includes("Nature's Reckoning"));
check('Fire Ward mag includes -5% Fire Damage Received', /1 stack of Fire Ward \(-5% Fire Damage Received\)/.test(report));
check('Initiative flat not %', /\+25 Initiative/.test(report) && !/\+25% Initiative/.test(report));
check('Recovery Dealt stays %', /\+15% Recovery Dealt/.test(report));
check('Right flank +8% Damage Dealt', report.includes('+8% Damage Dealt') && /AllyR/.test(report));
check("Dragon's Fury +4% Physical", report.includes('+4% Physical Damage Dealt'));
check('Vital Essence +10% Strength', report.includes('+10% Strength'));
check('Renewal recovery base/scaled', /Recovery \+17\.5% \(enhanced by Strength/.test(report));
check('engine flat init +25', main.bev.flatMods.init === 25);
check('engine recovery_dealt 15+15=30', main.bev.getPercentTotal('recovery_dealt') === 30);
check('engine right flank dmg_dealt +8', main.right.getPercentTotal('dmg_dealt') === 8);
check('fire-dealt -10% only fire dealer EnemyL', /Reduces Fire Damage Dealt of EnemyL by -10%/.test((main.battle.battleLog || []).join('\n')) && !/Reduces Fire Damage Dealt of EnemyV by -10%/.test((main.battle.battleLog || []).join('\n')));
check('Bountiful STR → AllyL', /Increases Strength of AllyL by /.test((main.battle.battleLog || []).join('\n')));
check('Bountiful INT → Bevlorin', /Increases Intelligence of Bevlorin by /.test((main.battle.battleLog || []).join('\n')));
check('Bountiful INST → AllyR', /Increases Instinct of AllyR by /.test((main.battle.battleLog || []).join('\n')));
check('Bountiful INIT → Bevlorin', /Increases Initiative of Bevlorin by /.test((main.battle.battleLog || []).join('\n')));

function setupFireDealers(randomFn) {
  Math.random = randomFn;
  const habits = JSON.parse(fs.readFileSync('./data/bevlorin_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/bevlorin_vanguard_command.json', 'utf8'));
  const data = { id: 'bevlorin', name: 'Bevlorin', rarity: 'Rare', breed: 'Champion', stats: { str: 55, inst: 38, int: 58, init: 46 }, affinity: ['spearmen'], weaknesses: [] };
  const bev = new Character(data, 0, 1, { level: 16, stars: 10, habitRank: 1 });
  bev.setTroopType('spearmen');
  loadKit(bev, habits, cmd);
  const left = dummy('allyL', 'AllyL', 0, 0, { str: 40, inst: 40, int: 40, init: 30 });
  left.setTroopType('spearmen');
  const right = dummy('allyR', 'AllyR', 0, 2, { str: 40, inst: 40, int: 40, init: 30 });
  right.setTroopType('spearmen');
  const e0 = dummy('e0', 'EnemyL', 1, 0, { str: 20, inst: 20, int: 90, init: 20 }, 'Hunter');
  const e1 = dummy('e1', 'EnemyV', 1, 1, { str: 20, inst: 20, int: 90, init: 20 }, 'Hunter');
  const e2 = dummy('e2', 'EnemyR', 1, 2, { str: 20, inst: 20, int: 90, init: 20 }, 'Hunter');
  for (const e of [e0, e1, e2]) e.setTroopType('spearmen');
  return { battle: new Battle([left, bev, right], [e0, e1, e2], { teamTroop: ['spearmen', 'spearmen'], defendingTeam: 1 }), bev, left, right, e0, e1, e2 };
}

const fire3 = setupFireDealers(() => 0);
fire3.battle.start();
fire3.battle.runRound();
const r1Reduce = ((fire3.battle.battleLog || []).join('\n').match(/Reduces Fire Damage Dealt of Enemy[LVR] by -10%/g) || []);
check('3 fire dealers: -10% applied to 3', r1Reduce.length === 3, 'count=' + r1Reduce.length);

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 misses 20% fire reduce', /\[miss\] Nature's Reckoning/.test(rawMiss) && !/Reduces Fire Damage Dealt/.test(rawMiss));
check('seed 0.99 still fires guaranteed R1 physical', /Deals \d+ Physical Damage/.test(rawMiss));

const retreat = setup(() => 0);
retreat.battle.start();
const linked = retreat.bev.links.fire_ward_ally;
check('Fire Ward linked ally at combat start', !!(linked && linked.name), 'linked=' + (linked && linked.name));
if (linked) {
  linked.takeDamage(linked.currentHealth);
  linked.noteDeath();
  linked.retreatedLastRound = true;
}
retreat.battle.runRound();
check('Fire Ward extra stack after linked retreat', (retreat.bev.stacks.fire_ward || 0) >= 2, 'stacks=' + (retreat.bev.stacks.fire_ward || 0));
for (let i = 0; i < 3; i += 1) retreat.battle.runRound();
check('Fire Ward does not stack every later round while ally stays dead', (retreat.bev.stacks.fire_ward || 0) === 2, 'stacks after extra rounds=' + (retreat.bev.stacks.fire_ward || 0));

const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
