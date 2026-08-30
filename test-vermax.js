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
  const habits = JSON.parse(fs.readFileSync('./data/vermax_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/vermax_vanguard_command.json', 'utf8'));
  const data = {
    id: 'vermax', name: 'Vermax', rarity: 'Legendary', breed: 'Warrior',
    stats: { str: 64, inst: 46, int: 42, init: 50 },
    affinity: ['cavalry', 'spearmen'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const vx = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  vx.setTroopType('cavalry');
  loadKit(vx, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 30, inst: 80, int: 55, init: 30 }, extras.leftBreed || 'Sentinel');
  if (left) left.setTroopType('spearmen');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 55, inst: 30, int: 30, init: 30 }, extras.rightBreed || 'Warrior');
  if (right) {
    right.setTroopType('spearmen');
    if (extras.chipRight) right.currentHealth = Math.floor(right.maxHealth * 0.6);
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

  const battle = new Battle([left, vx, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['cavalry', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, vx, left, right, e0, e1, e2 };
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

function stacksOf(ch, id) {
  if (!ch) return 0;
  if (typeof ch.getStacks === 'function') return ch.getStacks(id) || 0;
  if (ch.stacks && ch.stacks[id] != null) return ch.stacks[id];
  return 0;
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/vermax_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/vermax_habits.json', 'utf8'));

check('JSON command Spreading Blaze', kitCmd.name === 'Spreading Blaze');
check('JSON after_basic physical same_lane +50', kitCmd.command[0].phase === 'after_basic_attack' && kitCmd.command[0].actions[0].dt === 'physical' && kitCmd.command[0].actions[0].pct === 50 && kitCmd.command[0].actions[0].tgt.select === 'same_lane');
check('JSON 20% Spreading Blaze stack tactical ally', kitCmd.command[0].actions[1].id === 'spreading_blaze' && kitCmd.command[0].actions[1].chance === 20 && kitCmd.command[0].actions[1].maxStacks === 10 && kitCmd.command[0].actions[1].mods[0].pct === 2.5);
check('JSON extra stack roll if any enemy fire dealer', kitCmd.command[1].requires.anyEnemyDealerFire === true);
check('JSON vanguard physical +16 self', kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT flat 20 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Trial by Flame|Reactive Instincts|Rallying Flame|Dragon's Valor|Unyielding Resolve");
check('JSON Trial by Flame 3 exclusive HP bands', kitHab.habits[0].structured[0].actions.length === 3 && kitHab.habits[0].structured[0].actions[0].tgt.hpBelow === 75 && kitHab.habits[0].structured[0].actions[2].mods[0].pct[0] === -15);
check('JSON Reactive Instincts highest:inst scale str', kitHab.habits[1].structured[0].actions[0].tgt.select === 'highest:inst' && kitHab.habits[1].structured[0].actions[0].scaleStat === 'str' && kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 18);
check('JSON Rallying Flame base + repeatPer fire dealer', kitHab.habits[2].structured.length === 2 && kitHab.habits[2].structured[1].repeatPer.dealer === 'fire' && kitHab.habits[2].structured[0].actions[0].id === 'rallying_flame' && kitHab.habits[2].structured[0].actions[0].maxStacks === 4);
check("JSON Dragon's Valor -5 / +8.5", kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === -5 && kitHab.habits[3].structured[0].actions[0].mods[1].pct[0] === 8.5);
check('JSON Unyielding Resolve Advantage 20% 1.5x if Weakened', kitHab.habits[4].structured[0].actions[0].chance[0] === 20 && kitHab.habits[4].structured[0].actions[0].chanceIf.mult === 1.5);
check("vanguardNames Vermax Warrior's Zeal", VANGUARD_NAMES.vermax === "Warrior's Zeal");

const main = setup(() => 0, { chipRight: true });
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/vermax-report.txt', report);
fs.writeFileSync('./tmp/vermax-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Vermax lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Vermax|Warrior's Zeal|Spreading Blaze|Trial by Flame|Reactive Instincts|Rallying Flame|Dragon's Valor|Unyielding Resolve|Advantage/.test(line)) {
    console.log(line);
  }
}

check("vanguard Warrior's Zeal", report.includes("Warrior's Zeal"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Spreading Blaze (Vanguard)', !/Spreading Blaze \(Vanguard\)/.test(raw) && !/Spreading Blaze \(Vanguard\)/.test(report));
check('command Spreading Blaze', report.includes('Spreading Blaze') && (/Vermax activates Spreading Blaze/.test(raw) || /Spreading Blaze/.test(raw)));
check('Trial by Flame', report.includes('Trial by Flame') || /Trial by Flame/.test(raw));
check('Reactive Instincts', report.includes('Reactive Instincts') || /Reactive Instincts/.test(raw));
check('Rallying Flame', report.includes('Rallying Flame') || /Rallying Flame/.test(raw));
check("Dragon's Valor", report.includes("Dragon's Valor") || /Dragon's Valor/.test(raw));
check('Unyielding Resolve', report.includes('Unyielding Resolve') || /Unyielding Resolve/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Physical Damage Dealt +16%', /\+16% Physical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank Warrior's Zeal", /\[ AllyL \] is under the effect of \[ Warrior's Zeal \]/.test(report));
check("right flank no Warrior's Zeal", !/\[ AllyR \] is under the effect of \[ Warrior's Zeal \]/.test(report));

check('engine self physical_dealt at least vanguard 16', main.vx.getPercentTotal('physical_dealt') >= 16, 'phys=' + main.vx.getPercentTotal('physical_dealt'));
check('engine left flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right no vanguard flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0);
check('engine Reactive Instincts on highest INST AllyL', main.left.getPercentTotal('inst') === 18 && main.left.getPercentTotal('init') === 9, 'L inst=' + main.left.getPercentTotal('inst') + ' init=' + main.left.getPercentTotal('init'));
check("engine Dragon's Valor STR +8.5 / recv -5", main.vx.getPercentTotal('str') === 8.5 && main.vx.getPercentTotal('dmg_received') === -5, 'str=' + main.vx.getPercentTotal('str') + ' recv=' + main.vx.getPercentTotal('dmg_received'));
check('engine Trial by Flame right <75% fire_received -5', main.right.getPercentTotal('fire_received') === -5, 'R fr=' + main.right.getPercentTotal('fire_received'));
check('seed 0 Rallying Flame stack or Advantage', stacksOf(main.vx, 'rallying_flame') > 0 || hasEffect(main.vx, 'advantage') || /Rallying Flame/.test(raw) || /Advantage/.test(raw));

const r1 = setup(() => 0, { chipRight: true });
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Trial + Reactive + Rallying + Valor', /Trial by Flame/.test(rawR1) && /Reactive Instincts/.test(rawR1) && /Rallying Flame/.test(rawR1) && /Dragon's Valor/.test(rawR1));

const miss = setup(() => 0.99, { chipRight: true });
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still vanguard + Trial + Reactive + Valor', miss.vx.getPercentTotal('physical_dealt') >= 16 && miss.left.flatMods.inst === 20 && miss.vx.getPercentTotal('str') === 8.5 && /Trial by Flame/.test(rawMiss) && /Reactive Instincts/.test(rawMiss) && /Dragon's Valor/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5, chipRight: true });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Rallying / Valor / Unyielding', !/Rallying Flame/.test(rawStars) && !/Dragon's Valor/.test(rawStars) && !/Unyielding Resolve/.test(rawStars));
check('5\u2605 still Trial + Reactive + command', /Trial by Flame/.test(rawStars) && /Reactive Instincts/.test(rawStars) && /Spreading Blaze/.test(rawStars));

const midStars = setup(() => 0, { stars: 8, chipRight: true });
midStars.battle.start();
midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Unyielding Resolve', !/Unyielding Resolve/.test(rawMidS));
check("8\u2605 still Rallying + Valor", /Rallying Flame/.test(rawMidS) && /Dragon's Valor/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
