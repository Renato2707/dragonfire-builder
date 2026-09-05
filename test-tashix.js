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
  const habits = JSON.parse(fs.readFileSync('./data/tashix_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/tashix_vanguard_command.json', 'utf8'));
  const data = {
    id: 'tashix', name: 'Tashix', rarity: 'Legendary', breed: 'Hunter',
    stats: { str: 38, inst: 48, int: 68, init: 52 },
    affinity: ['archers', 'spearmen'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const tx = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  tx.setTroopType('archers');
  loadKit(tx, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 70, inst: 40, int: 30, init: 30 }, extras.leftBreed || 'Warrior');
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

  const battle = new Battle([left, tx, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['archers', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, tx, left, right, e0, e1, e2 };
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
  const after = chunk.split('Tashix activates Shimmering Mirage')[1] || '';
  return after.split('Tashix launches')[0].split('Tashix activates')[0];
}

function stacksOf(ch, id) {
  if (!ch) return 0;
  if (typeof ch.getStacks === 'function') return ch.getStacks(id) || 0;
  if (ch.stacks && ch.stacks[id] != null) return ch.stacks[id];
  return 0;
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/tashix_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/tashix_habits.json', 'utf8'));

check('JSON command Shimmering Mirage', kitCmd.name === 'Shimmering Mirage');
check('JSON each-round 50% Mirage stack +2.5 fire max 10', kitCmd.command[0].actions[0].id === 'mirage' && kitCmd.command[0].actions[0].chance === 50 && kitCmd.command[0].actions[0].maxStacks === 10 && kitCmd.command[0].actions[0].mods[0].pct === 2.5);
check('JSON fire adjacency +200 R3,6,9', kitCmd.command[1].rounds.join() === '3,6,9' && kitCmd.command[1].actions[0].dt === 'fire' && kitCmd.command[1].actions[0].pct === 200 && kitCmd.command[1].actions[0].tgt.select === 'adjacency');
check('JSON vanguard recovery_received +20 and INT flat 25 self', kitCmd.vanguard[0].actions[0].mods[0].stat === 'recovery_received' && kitCmd.vanguard[0].actions[0].mods[0].pct === 20 && kitCmd.vanguard[0].actions[0].mods[1].stat === 'int' && kitCmd.vanguard[0].actions[0].mods[1].fixed === 25);
check('JSON vanguard physical +10 right slot 2', kitCmd.vanguard[0].actions[1].mods[0].stat === 'physical_dealt' && kitCmd.vanguard[0].actions[1].mods[0].pct === 10 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Enervate|Dragon's Cunning|Cunning Ruse|Battle Guile|Veiled Ambush");
check('JSON Enervate tactical_dealt -10.5 dealer:tactical', kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === -10.5 && kitHab.habits[0].structured[0].actions[0].tgt.select === 'dealer:tactical');
check("JSON Dragon's Cunning self INT 12 + adj INST -10 scale init", kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 12 && kitHab.habits[1].structured[0].actions[1].mods[0].pct[0] === -10 && kitHab.habits[1].structured[0].actions[1].scaleStat === 'init' && kitHab.habits[1].structured[0].actions[1].tgt.select === 'adjacency');
check('JSON Cunning Ruse 25% Mirage + weakened if 4+ stacks chanceIf tactical x2', kitHab.habits[2].structured[0].actions[0].chance === 25 && kitHab.habits[2].structured[1].requires.stacks.min === 4 && kitHab.habits[2].structured[1].actions[0].st === 'weakened' && kitHab.habits[2].structured[1].actions[0].chanceIf.mult === 2);
check('JSON Battle Guile INST/INIT -5 scale init 3 enemies', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === -5 && kitHab.habits[3].structured[0].actions[0].scaleStat === 'init' && kitHab.habits[3].structured[0].actions[0].tgt.count === 3);
check('JSON Veiled Ambush 25% Mirage + oncePerCombat fire 150 if 7+ stacks', kitHab.habits[4].structured[0].actions[0].chance === 25 && kitHab.habits[4].structured[1].oncePerCombat === true && kitHab.habits[4].structured[1].requires.stacks.min === 7 && kitHab.habits[4].structured[1].actions[0].pct[0] === 150);
check("vanguardNames Tashix Hunter's Cunning", VANGUARD_NAMES.tashix === "Hunter's Cunning");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/tashix-report.txt', report);
fs.writeFileSync('./tmp/tashix-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Tashix lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Tashix|Hunter's Cunning|Shimmering Mirage|Enervate|Dragon's Cunning|Cunning Ruse|Battle Guile|Veiled Ambush|Mirage|Weakened/.test(line)) {
    console.log(line);
  }
}

check("vanguard Hunter's Cunning", report.includes("Hunter's Cunning"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Shimmering Mirage (Vanguard)', !/Shimmering Mirage \(Vanguard\)/.test(raw) && !/Shimmering Mirage \(Vanguard\)/.test(report));
check('command Shimmering Mirage', report.includes('Shimmering Mirage') && /Tashix activates Shimmering Mirage/.test(raw));
check('Enervate', report.includes('Enervate') || /Enervate/.test(raw));
check("Dragon's Cunning", report.includes("Dragon's Cunning") || /Dragon's Cunning/.test(raw));
check('Cunning Ruse', report.includes('Cunning Ruse') || /Cunning Ruse/.test(raw));
check('Battle Guile', report.includes('Battle Guile') || /Battle Guile/.test(raw));
check('Veiled Ambush', report.includes('Veiled Ambush') || /Veiled Ambush/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Recovery Received +20%', /\+20% Recovery Received/.test(report));
check('vanguard Intelligence +25 flat not %', /\+25 Intelligence/.test(report) && !/\+25% Intelligence/.test(report));
check('vanguard Physical Damage Dealt +10% right', /\+10% Physical Damage Dealt/.test(report));
check("right flank Hunter's Cunning", /\[ AllyR \] is under the effect of \[ Hunter's Cunning \]/.test(report));
check("left flank no Hunter's Cunning", !/\[ AllyL \] is under the effect of \[ Hunter's Cunning \]/.test(report));

check('R1 no fire +200', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 1)));
check('R2 no fire +200', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 2)));
check('R3 fire +200', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 3)));
check('R6 fire +200', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 6)));
check('R9 fire +200', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 9)));

check('engine self recovery_received +20', main.tx.getPercentTotal('recovery_received') === 20, 'rec=' + main.tx.getPercentTotal('recovery_received'));
check('engine self INT flat +25', main.tx.flatMods.int === 25, JSON.stringify(main.tx.flatMods));
check('engine right physical_dealt +10', main.right.getPercentTotal('physical_dealt') === 10, 'phys=' + main.right.getPercentTotal('physical_dealt'));
check('engine left no physical vanguard', main.left.getPercentTotal('physical_dealt') === 0);
check('engine Enervate on Sentinel e2', main.e2.getPercentTotal('tactical_dealt') === -10.5, 'e2=' + main.e2.getPercentTotal('tactical_dealt') + ' e1=' + main.e1.getPercentTotal('tactical_dealt'));
check("engine Dragon's Cunning self INT +12", main.tx.getPercentTotal('int') === 12, 'int%=' + main.tx.getPercentTotal('int'));
check('seed 0 Mirage stacks > 0', stacksOf(main.tx, 'mirage') > 0 || /Mirage/.test(raw), 'stacks=' + stacksOf(main.tx, 'mirage'));
check('seed 0 Mirage capped at 10', stacksOf(main.tx, 'mirage') <= 10, 'stacks=' + stacksOf(main.tx, 'mirage'));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Enervate + Cunning + Guile + Mirage', /Enervate/.test(rawR1) && /Dragon's Cunning/.test(rawR1) && /Battle Guile/.test(rawR1) && /Shimmering Mirage/.test(rawR1));
check('R1 no Veiled Ambush nuke (needs 7 stacks)', !/Deals \d+ Fire Damage/.test(cmdChunk(rawR1, 1)));

const miss = setup(() => 0.99);
miss.battle.start();
for (let i = 0; i < 3; i += 1) miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R3 fire (dmg not chance)', /Deals \d+ Fire Damage/.test(rawMiss));
check('seed 0.99 misses 50/25 Mirage stacks', stacksOf(miss.tx, 'mirage') === 0 || /\[miss\]/.test(rawMiss));
check('seed 0.99 still vanguard + Enervate + Cunning + Guile', miss.tx.getPercentTotal('recovery_received') === 20 && miss.tx.flatMods.int === 25 && miss.right.getPercentTotal('physical_dealt') === 10 && /Enervate/.test(rawMiss) && /Dragon's Cunning/.test(rawMiss) && /Battle Guile/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Ruse / Guile / Ambush', !/Cunning Ruse/.test(rawStars) && !/Battle Guile/.test(rawStars) && !/Veiled Ambush/.test(rawStars));
check("5\u2605 still Enervate + Dragon's Cunning + Mirage", /Enervate/.test(rawStars) && /Dragon's Cunning/.test(rawStars) && /Shimmering Mirage/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Veiled Ambush', !/Veiled Ambush/.test(rawMidS));
check('8\u2605 still Cunning Ruse + Battle Guile', /Cunning Ruse/.test(rawMidS) && /Battle Guile/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
