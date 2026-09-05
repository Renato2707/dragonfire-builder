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
  const habits = JSON.parse(fs.readFileSync('./data/zivern_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/zivern_vanguard_command.json', 'utf8'));
  const data = {
    id: 'zivern', name: 'Zivern', rarity: 'Legendary', breed: 'Sentinel',
    stats: { str: 38, inst: 62, int: 58, init: 48 },
    affinity: ['spearmen', 'archers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const zv = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  zv.setTroopType('spearmen');
  loadKit(zv, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }, extras.leftBreed || 'Hunter');
  if (left) left.setTroopType('archers');
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

  const battle = new Battle([left, zv, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, zv, left, right, e0, e1, e2 };
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
  const after = chunk.split('Zivern activates Silent Shade')[1] || '';
  return after.split('Zivern launches')[0].split('Zivern activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/zivern_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/zivern_habits.json', 'utf8'));

check('JSON command Silent Shade', kitCmd.name === 'Silent Shade');
check('JSON R1,4,6,9 tactical_received +15 40% same_lane', kitCmd.command[0].rounds.join() === '1,4,6,9' && kitCmd.command[0].actions[0].mods[0].pct === 15 && kitCmd.command[0].actions[0].chance === 40 && kitCmd.command[0].actions[0].tgt.select === 'same_lane');
check('JSON R1,4,6,9 tactical adj 2x +75', kitCmd.command[1].rounds.join() === '1,4,6,9' && kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 75 && kitCmd.command[1].actions[0].tgt.count === 2);
check('JSON vanguard tactical +16 self', kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT flat 20 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === 'Battle Mastery|Keen Instinct|Fearsome Reach|Steel Shroud|Cloak of Terror');
check('JSON Battle Mastery STR/INST -5 scale int 3 enemies', kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === -5 && kitHab.habits[0].structured[0].actions[0].scaleStat === 'int' && kitHab.habits[0].structured[0].actions[0].tgt.count === 3);
check('JSON Keen Instinct INT/INST +16 self', kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 16 && kitHab.habits[1].structured[0].actions[0].mods[1].pct[0] === 16);
check('JSON Fearsome Reach odd 30% INST -15 + Panic 20', kitHab.habits[2].structured[0].rounds.join() === '1,3,5,7,9' && kitHab.habits[2].structured[0].chance[0] === 30 && kitHab.habits[2].structured[0].actions[1].st === 'panic');
check('JSON Steel Shroud -3.5 other allies excludeBasic', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === -3.5 && kitHab.habits[3].structured[0].actions[0].tgt.excludeSelf === true && kitHab.habits[3].structured[0].actions[0].excludeBasic === true);
check('JSON Cloak of Terror odd Overwhelm 10% x2 if Vulnerable', kitHab.habits[4].structured[0].actions[0].st === 'overwhelm' && kitHab.habits[4].structured[0].actions[0].chance[0] === 10 && kitHab.habits[4].structured[0].actions[0].chanceIf.mult === 2);
check("vanguardNames Zivern Sentinel's Wit", VANGUARD_NAMES.zivern === "Sentinel's Wit");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/zivern-report.txt', report);
fs.writeFileSync('./tmp/zivern-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Zivern lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Zivern|Sentinel's Wit|Silent Shade|Battle Mastery|Keen Instinct|Fearsome Reach|Steel Shroud|Cloak of Terror|Panic|Overwhelm/.test(line)) {
    console.log(line);
  }
}

check("vanguard Sentinel's Wit", report.includes("Sentinel's Wit"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Silent Shade (Vanguard)', !/Silent Shade \(Vanguard\)/.test(raw) && !/Silent Shade \(Vanguard\)/.test(report));
check('command Silent Shade', report.includes('Silent Shade') && /Zivern activates Silent Shade/.test(raw));
check('Battle Mastery', report.includes('Battle Mastery') || /Battle Mastery/.test(raw));
check('Keen Instinct', report.includes('Keen Instinct') || /Keen Instinct/.test(raw));
check('Fearsome Reach', report.includes('Fearsome Reach') || /Fearsome Reach/.test(raw));
check('Steel Shroud', report.includes('Steel Shroud') || /Steel Shroud/.test(raw));
check('Cloak of Terror', report.includes('Cloak of Terror') || /Cloak of Terror/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Tactical Damage Dealt +16%', /\+16% Tactical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank Sentinel's Wit", /\[ AllyL \] is under the effect of \[ Sentinel's Wit \]/.test(report));
check("right flank no Sentinel's Wit", !/\[ AllyR \] is under the effect of \[ Sentinel's Wit \]/.test(report));

check('R1 tactical adj', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 1)));
check('R2 no Silent Shade dmg', !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 2)));
check('R4 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 4)));
check('R6 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 6)));
check('R9 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 9)));

check('engine self tactical +16', main.zv.getPercentTotal('tactical_dealt') === 16, 'tac=' + main.zv.getPercentTotal('tactical_dealt'));
check('engine left flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right no vanguard flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0);
check('engine Keen Instinct INT/INST +16 self', main.zv.getPercentTotal('int') === 16 && main.zv.getPercentTotal('inst') === 16, 'int=' + main.zv.getPercentTotal('int') + ' inst=' + main.zv.getPercentTotal('inst'));
check('engine Battle Mastery enemies STR -5', main.e0.getPercentTotal('str') === -5 && main.e1.getPercentTotal('str') === -5 && main.e2.getPercentTotal('str') === -5, 'e0=' + main.e0.getPercentTotal('str'));
check('engine Steel Shroud other allies phys/tac recv -3.5', main.left.getPercentTotal('physical_received') === -3.5 && main.right.getPercentTotal('tactical_received') === -3.5 && main.zv.getPercentTotal('physical_received') === 0, 'L=' + main.left.getPercentTotal('physical_received') + ' self=' + main.zv.getPercentTotal('physical_received'));
check('seed 0 Panic or Overwhelm or tac recv', hasEffect(main.e0, 'panic') || hasEffect(main.e1, 'panic') || hasEffect(main.e0, 'overwhelm') || main.e1.getPercentTotal('tactical_received') === 15 || /Panic/.test(raw) || /Overwhelm/.test(raw));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Mastery + Keen + Shroud + Shade', /Battle Mastery/.test(rawR1) && /Keen Instinct/.test(rawR1) && /Steel Shroud/.test(rawR1) && /Silent Shade/.test(rawR1));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R1 tactical (dmg not chance)', /Deals \d+ Tactical Damage/.test(rawMiss));
check('seed 0.99 still vanguard + Mastery + Keen + Shroud', miss.zv.getPercentTotal('tactical_dealt') === 16 && miss.left.flatMods.inst === 20 && miss.zv.getPercentTotal('int') === 16 && miss.e0.getPercentTotal('str') === -5 && miss.left.getPercentTotal('physical_received') === -3.5 && /Battle Mastery/.test(rawMiss) && /Keen Instinct/.test(rawMiss) && /Steel Shroud/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Reach / Shroud / Cloak', !/Fearsome Reach/.test(rawStars) && !/Steel Shroud/.test(rawStars) && !/Cloak of Terror/.test(rawStars));
check('5\u2605 still Mastery + Keen + Shade', /Battle Mastery/.test(rawStars) && /Keen Instinct/.test(rawStars) && /Silent Shade/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Cloak of Terror', !/Cloak of Terror/.test(rawMidS));
check('8\u2605 still Reach + Shroud', /Fearsome Reach/.test(rawMidS) && /Steel Shroud/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
