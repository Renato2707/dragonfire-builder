import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyInitiativeOrder } from './hook-initiative-order.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { applyLinkedRetreated } from './hook-linked-retreated.js';
import { applyRetreatedPerTarget } from './hook-retreated-per-target.js';
import { applyAfterBasicTarget } from './hook-after-basic-target.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';
import { applyEffect, hasEffect } from './effects.js';
import { getDealerType } from './positionSystem.js';

applyInitiativeOrder(Battle);
applyVanguardLabel(Battle);
applyLinkedRetreated(Battle);
applyRetreatedPerTarget(Battle);
applyAfterBasicTarget(Battle);

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
  const habits = JSON.parse(fs.readFileSync('./data/seasmoke_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/seasmoke_vanguard_command.json', 'utf8'));

  const data = {
    id: 'seasmoke', name: 'Seasmoke', rarity: 'Legendary', breed: 'Champion',
    stats: { str: 52, inst: 49, int: 57, init: 60 },
    affinity: ['cavalry', 'archers'], weaknesses: ['siege']
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const sea = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  sea.setTroopType('cavalry');
  loadKit(sea, habits, cmd);

  const left = extras.noLeft ? null : dummy(
    'allyL', 'AllyL', 0, extras.leftSlot != null ? extras.leftSlot : 0,
    extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }
  );
  if (left) left.setTroopType('cavalry');
  const right = extras.noRight ? null : dummy(
    'allyR', 'AllyR', 0, extras.rightSlot != null ? extras.rightSlot : 2,
    extras.rightStats || { str: 40, inst: 40, int: 40, init: 30 }
  );
  if (right) right.setTroopType('cavalry');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('shieldbearers');
    return e;
  };

  const e0 = extras.e0 === false ? null : makeEnemy(
    'e0', 'EnemyL', 0,
    extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 },
    extras.e0Breed || 'Hunter'
  );
  const e1 = extras.e1 === false ? null : makeEnemy(
    'e1', 'EnemyV', 1,
    extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 },
    extras.e1Breed || 'Warrior'
  );
  const e2 = extras.e2 === false ? null : makeEnemy(
    'e2', 'EnemyR', 2,
    extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 },
    extras.e2Breed || 'Sentinel'
  );

  const teamA = extras.slot === 2
    ? [left, right, sea].filter(Boolean)
    : extras.slot === 0
      ? [sea, left, right].filter(Boolean)
      : [left, sea, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['cavalry', 'shieldbearers'],
    defendingTeam: extras.defendingTeam != null ? extras.defendingTeam : 1,
    verbose: false
  });
  return { battle, sea, left, right, e0, e1, e2 };
}

function dumpEngine(label, sea, left, right, e0, e1, e2) {
  const lines = [];
  const snap = (c) => {
    if (!c) return null;
    return {
      name: c.name,
      str: c.getModifiedStat('str'),
      inst: c.getModifiedStat('inst'),
      int: c.getModifiedStat('int'),
      init: c.getModifiedStat('init'),
      strPct: c.getPercentTotal('str'),
      instPct: c.getPercentTotal('inst'),
      intPct: c.getPercentTotal('int'),
      initPct: c.getPercentTotal('init'),
      fireDealt: c.getPercentTotal('fire_dealt'),
      recRecv: c.getPercentTotal('recovery_received'),
      dmgRecv: c.getPercentTotal('dmg_received'),
      flat: { ...c.flatMods },
      stacks: { ...c.stacks },
      dealer: getDealerType(c),
      breed: c.breed,
      hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth)
    };
  };
  lines.push('===== ' + label + ' =====');
  for (const c of [sea, left, right, e0, e1, e2]) {
    if (c) lines.push(JSON.stringify(snap(c)));
  }
  return lines.join('\n');
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

function rN(raw, n) {
  return (raw.split('Start of Round ' + n)[1] || '').split('Start of Round ' + (n + 1))[0] || '';
}

function rFmt(report, n) {
  return (report.split('• Round ' + n)[1] || '').split('• Round ' + (n + 1))[0] || '';
}

function cmdChunk(raw, n) {
  const chunk = rN(raw, n);
  const after = (chunk.split('Seasmoke activates Cleansing Wrath')[1] || '');
  return after.split('Seasmoke launches')[0].split('Seasmoke activates')[0];
}

function fireAmt(text, name) {
  const m = text.match(new RegExp('Deals (\\d+) Fire Damage to ' + name));
  return m ? Number(m[1]) : null;
}

function physAmt(text, name) {
  const m = text.match(new RegExp('Deals (\\d+) Physical Damage to ' + name));
  return m ? Number(m[1]) : null;
}

const kitCmd = JSON.parse(fs.readFileSync('./data/seasmoke_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/seasmoke_habits.json', 'utf8'));

check('JSON command name Cleansing Wrath', kitCmd.name === 'Cleansing Wrath');
check('JSON command cleanse remove positive x3', kitCmd.command[0].actions.length === 3 && kitCmd.command[0].actions.every(a => a.st === 'cleanse' && a.remove === 'positive' && a.chance === 20 && a.tgt.select === 'any' && a.tgt.count === 1));
check('JSON command R3,6,9 fire 190% same lane', kitCmd.command[1].rounds.join() === '3,6,9' && kitCmd.command[1].actions[0].dt === 'fire' && kitCmd.command[1].actions[0].pct === 190 && kitCmd.command[1].actions[0].tgt.select === 'same_lane');
check('JSON command has no Infectious Wrath / physical double-dip', !JSON.stringify(kitCmd.command).toLowerCase().includes('infectious') && !JSON.stringify(kitCmd.command).includes('physical') && !JSON.stringify(kitCmd.command).includes('"stack"'));
check('JSON vanguard STR/INT/INST +15 flats', kitCmd.vanguard[0].actions[0].mods[0].fixed === 15 && kitCmd.vanguard[0].actions[0].mods[1].fixed === 15 && kitCmd.vanguard[0].actions[0].mods[2].fixed === 15 && kitCmd.vanguard[0].actions[0].mods[0].stat === 'str');
check('JSON vanguard right flank -8% dmg_received slot 2', kitCmd.vanguard[0].actions[1].mods[0].stat === 'dmg_received' && kitCmd.vanguard[0].actions[1].mods[0].pct === -8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON Clever Maneuver 22/12.5 table both Instinct', kitHab.habits[0].name === 'Clever Maneuver' && kitHab.habits[0].scaling[0].values.join() === '22,26.4,30.8,37.4,44' && kitHab.habits[0].scaling[1].values.join() === '12.5,15,17.5,21.25,25' && kitHab.habits[0].structured[0].actions[0].scaleStat === 'inst');
check("JSON Wind's Favor 12.5 not Dawnseeker 8", kitHab.habits[1].name === "Wind's Favor" && kitHab.habits[1].scaling[0].values[0] === 12.5 && kitHab.habits[1].scaling[0].values[4] === 25 && kitHab.habits[1].structured[0].actions[0].scaleStat === 'init');
check('JSON Infectious Wrath on_cleanse stack max 3 -15% / R3 physical 30% panic 2x', kitHab.habits[2].name === 'Infectious Wrath' && kitHab.habits[2].structured[0].phase === 'on_cleanse' && kitHab.habits[2].structured[0].actions[0].maxStacks === 3 && kitHab.habits[2].structured[0].actions[0].mods[0].pct[0] === -15 && kitHab.habits[2].structured[1].rounds.join() === '3,6,9' && kitHab.habits[2].structured[1].actions[0].dt === 'physical' && kitHab.habits[2].structured[1].actions[0].pct[0] === 30 && kitHab.habits[2].structured[1].actions[0].ifBonus.status === 'panic' && kitHab.habits[2].structured[1].actions[0].ifBonus.mult === 2 && kitHab.habits[2].structured[1].actions[0].ifBonus.on === 'target');
check('JSON Cunning Ferocity INT enhanced Instinct, Fire Dealt not', kitHab.habits[3].name === 'Cunning Ferocity' && kitHab.habits[3].structured[0].actions[0].mods[0].stat === 'int' && kitHab.habits[3].structured[0].actions[0].scaleStat === 'inst' && kitHab.habits[3].structured[0].actions[1].mods[0].stat === 'fire_dealt' && kitHab.habits[3].structured[0].actions[1].scaleStat == null && kitHab.habits[3].scaling[0].values.join() === '7.5,9,10.5,12.75,15' && kitHab.habits[3].scaling[1].values.join() === '5,6,7,8.5,10');
check('JSON Loyal Bond separate 10/10 rolls hp bands', kitHab.habits[4].name === 'Loyal Bond' && kitHab.habits[4].structured[0].chance.join() === '10,13,16,20,25' && kitHab.habits[4].structured[1].chance.join() === '10,13,16,20,25' && kitHab.habits[4].structured[0].actions[0].st === 'advantage' && kitHab.habits[4].structured[0].actions[0].tgt.hpAbove === 50 && kitHab.habits[4].structured[1].actions[0].st === 'resistance' && kitHab.habits[4].structured[1].actions[0].tgt.hpBelow === 50 && kitHab.habits[4].structured[0].actions[0].tgt.excludeSelf === true);
check("vanguardNames Seasmoke Champion's Brilliance", VANGUARD_NAMES.seasmoke === "Champion's Brilliance");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/seasmoke-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/seasmoke-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Seasmoke lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Seasmoke|Champion|Cleansing|Clever|Wind|Infectious|Cunning|Loyal|Cleanses/.test(line)) {
    console.log(line);
  }
}
console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.sea, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Champion's Brilliance", report.includes("Champion's Brilliance"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Cleansing Wrath (Vanguard)', !/Cleansing Wrath \(Vanguard\)/.test(raw) && !/Cleansing Wrath \(Vanguard\)/.test(report));
check('command Cleansing Wrath in report', report.includes('Cleansing Wrath'));
check('command Cleansing Wrath in raw log', /Seasmoke activates Cleansing Wrath/.test(raw));
check('Clever Maneuver', report.includes('Clever Maneuver'));
check("Wind's Favor", report.includes("Wind's Favor"));
check('Infectious Wrath', report.includes('Infectious Wrath') || /Infectious Wrath/.test(raw));
check('Cunning Ferocity', report.includes('Cunning Ferocity'));
check('Loyal Bond', report.includes('Loyal Bond'));
check('10 rounds played', /• Round 10/.test(report));

check('vanguard Strength +15 flat not %', /\+15 Strength/.test(report) && !/\+15% Strength/.test(report));
check('vanguard Intelligence +15 flat not %', /\+15 Intelligence/.test(report) && !/\+15% Intelligence/.test(report));
check('vanguard Instinct +15 flat not %', /\+15 Instinct/.test(report) && !/\+15% Instinct/.test(report));
check('right flank -8% Damage Received', report.includes('-8% Damage Received') && /AllyR/.test(report));
check("left flank no Champion's Brilliance dmg received", !/\[ AllyL \] is under the effect of \[ Champion's Brilliance \]/.test(report) || !/-8% Damage Received/.test((report.split('[ AllyL ]')[1] || '').split('[ AllyR ]')[0] || ''));

check('Clever Maneuver +22% Intelligence enhanced Instinct', /\+22% Intelligence \(enhanced by Instinct → /.test(report));
check('Clever Maneuver +12.5% Initiative enhanced Instinct', /\+12\.5% Initiative \(enhanced by Instinct → /.test(report));
check("Wind's Favor +12.5% Initiative enhanced Initiative not +8%", /\+12\.5% Initiative \(enhanced by Initiative → /.test(report) && !/\+8% Initiative \(enhanced by Initiative/.test(report));
check('Cunning Ferocity +7.5% Intelligence enhanced Instinct', /\+7\.5% Intelligence \(enhanced by Instinct → /.test(report));
check('Cunning Ferocity Fire Dealt +5% not enhanced', /\+5% Fire Damage Dealt/.test(report) && !/\+5% Fire Damage Dealt \(enhanced by /.test(report));

check('R3 command fire same lane', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 3)));
check('R6 command fire', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 6)));
check('R9 command fire', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 9)));
check('R1 no command fire', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 1)));
check('R3 Infectious Wrath physical 2 adj', (rN(raw, 3).match(/Deals \d+ Physical Damage to Enemy/g) || []).length === 2);
check('R6 Infectious Wrath physical', /Deals \d+ Physical Damage/.test(rN(raw, 6)));
check('R9 Infectious Wrath physical', /Deals \d+ Physical Damage/.test(rN(raw, 9)));
check('R1 no Infectious Wrath activate', !/Seasmoke activates Infectious Wrath/.test(rN(raw, 1)));
check('R1 three 20% cleanse rolls', (cmdChunk(raw, 1).match(/\[hit\] Cleansing Wrath/g) || []).length === 3);
check('R1 Loyal Bond Advantage 2 other allies', /Grants Advantage/.test(rN(raw, 1)) && /AllyL/.test(rN(raw, 1)) && /AllyR/.test(rN(raw, 1)));
check('R1 Loyal Bond no Resistance at full HP', !/Grants Resistance/.test(rN(raw, 1)));

check('engine vanguard flats +15', main.sea.flatMods.str === 15 && main.sea.flatMods.int === 15 && main.sea.flatMods.inst === 15, JSON.stringify(main.sea.flatMods));
check('engine right flank dmg_received -8', main.right.getPercentTotal('dmg_received') === -8, 'right=' + main.right.getPercentTotal('dmg_received'));
check('engine left NOT right-flank received', main.left.getPercentTotal('dmg_received') === 0, 'left=' + main.left.getPercentTotal('dmg_received'));
check('engine Cunning Ferocity allies fire_dealt +5 not scaled', main.left.getPercentTotal('fire_dealt') === 5 && main.right.getPercentTotal('fire_dealt') === 5, 'L=' + main.left.getPercentTotal('fire_dealt') + ' R=' + main.right.getPercentTotal('fire_dealt'));
check('engine Cunning Ferocity not on self fire', main.sea.getPercentTotal('fire_dealt') === 0, 'self=' + main.sea.getPercentTotal('fire_dealt'));
check('engine Cunning Ferocity allies INT enhanced > 7.5', main.left.getPercentTotal('int') > 7.5 && main.right.getPercentTotal('int') > 7.5, 'L=' + main.left.getPercentTotal('int') + ' R=' + main.right.getPercentTotal('int'));

const hitCl = setup(() => 0);
hitCl.battle.start();
applyEffect(hitCl.e0, 'ADVANTAGE', 1, 'seed', { duration: 20 });
applyEffect(hitCl.e0, 'RESISTANCE', 1, 'seed', { duration: 20 });
applyEffect(hitCl.e0, 'FIRST_STRIKE', 1, 'seed', { duration: 20 });
applyEffect(hitCl.e1, 'ADVANTAGE', 1, 'seed', { duration: 20 });
applyEffect(hitCl.e2, 'BURN', 1, 'seed', { duration: 20 });
applyEffect(hitCl.e2, 'WEAKENED', 1, 'seed', { duration: 20 });
check('pre-cleanse EnemyL has 3 positives', hasEffect(hitCl.e0, 'advantage') && hasEffect(hitCl.e0, 'resistance') && hasEffect(hitCl.e0, 'first_strike'));
hitCl.battle.runRound();
const rawHitCl = (hitCl.battle.battleLog || []).join('\n');
check('seed 0 hits 20% cleanse', /\[hit\] Cleansing Wrath → EnemyL \(20%\)/.test(rawHitCl));
check('seed 0 Cleanses Advantage', /Cleanses Advantage from EnemyL/.test(rawHitCl));
check('seed 0 Cleanses Resistance', /Cleanses Resistance from EnemyL/.test(rawHitCl));
check('seed 0 Cleanses First-Strike', /Cleanses First-Strike from EnemyL/.test(rawHitCl));
check('seed 0 EnemyL positives gone', !hasEffect(hitCl.e0, 'advantage') && !hasEffect(hitCl.e0, 'resistance') && !hasEffect(hitCl.e0, 'first_strike'));
check('seed 0 Burn not cleansed (not positive)', hasEffect(hitCl.e2, 'burn'));
check('seed 0 Weakened not cleansed (negative)', hasEffect(hitCl.e2, 'weakened'));
check('seed 0 EnemyV Advantage kept (not selected)', hasEffect(hitCl.e1, 'advantage'));
check('formatted report shows Cleanses', /Cleanses Advantage/.test(formatBattleReport(hitCl.battle, '')));
check('Infectious Wrath 3 stacks on 3 successful strips', (hitCl.e0.getStackCount && hitCl.e0.getStackCount('infectious_wrath')) === 3, 'stacks=' + (hitCl.e0.stacks && hitCl.e0.stacks.infectious_wrath));
check('Infectious Wrath -15% rec recv per stack = -45', hitCl.e0.getPercentTotal('recovery_received') === -45, 'recRecv=' + hitCl.e0.getPercentTotal('recovery_received'));
check('no stack on EnemyV (not cleansed)', !hitCl.e1.stacks || !hitCl.e1.stacks.infectious_wrath);

const missCl = setup(() => 0.99);
missCl.battle.start();
applyEffect(missCl.e0, 'ADVANTAGE', 1, 'seed', { duration: 20 });
missCl.battle.runRound();
const rawMissCl = (missCl.battle.battleLog || []).join('\n');
check('seed 0.99 misses 20% cleanse', /\[miss\] Cleansing Wrath/.test(rawMissCl) && !/Cleanses Advantage/.test(rawMissCl));
check('seed 0.99 Advantage remains', hasEffect(missCl.e0, 'advantage'));
check('seed 0.99 no Infectious Wrath stack', !missCl.e0.stacks || !missCl.e0.stacks.infectious_wrath);
check('seed 0.99 still vanguard flats', missCl.sea.flatMods.str === 15);
check('seed 0.99 still R1 no command fire', !/Deals \d+ Fire Damage/.test(cmdChunk(rawMissCl, 1)));

const emptyCl = setup(() => 0);
emptyCl.battle.start();
emptyCl.battle.runRound();
const rawEmptyCl = (emptyCl.battle.battleLog || []).join('\n');
check('no buffs: Cleanses nothing', /Cleanses nothing from EnemyL/.test(rawEmptyCl));
check('no buffs: no Infectious Wrath stack', !emptyCl.e0.stacks || !emptyCl.e0.stacks.infectious_wrath);
check('no buffs: still 3 hit rolls', (cmdChunk(rawEmptyCl, 1).match(/\[hit\] Cleansing Wrath/g) || []).length === 3);

const twoBuff = setup(() => 0);
twoBuff.battle.start();
applyEffect(twoBuff.e0, 'ADVANTAGE', 1, 'seed', { duration: 20 });
applyEffect(twoBuff.e0, 'RESISTANCE', 1, 'seed', { duration: 20 });
twoBuff.battle.runRound();
check('2 successful cleanses → 2 stacks not 1', twoBuff.e0.stacks.infectious_wrath === 2, 'stacks=' + (twoBuff.e0.stacks && twoBuff.e0.stacks.infectious_wrath));
check('2 stacks rec recv -30', twoBuff.e0.getPercentTotal('recovery_received') === -30, 'recRecv=' + twoBuff.e0.getPercentTotal('recovery_received'));

const max3 = setup(() => 0);
max3.battle.start();
applyEffect(max3.e0, 'ADVANTAGE', 1, 'seed', { duration: 20 });
applyEffect(max3.e0, 'RESISTANCE', 1, 'seed', { duration: 20 });
applyEffect(max3.e0, 'FIRST_STRIKE', 1, 'seed', { duration: 20 });
max3.battle.runRound();
applyEffect(max3.e0, 'ADVANTAGE', 1, 'seed', { duration: 20 });
max3.battle.runRound();
check('max 3 stacks even with a 4th successful cleanse', max3.e0.stacks.infectious_wrath === 3, 'stacks=' + (max3.e0.stacks && max3.e0.stacks.infectious_wrath));
check('max 3 rec recv stays -45', max3.e0.getPercentTotal('recovery_received') === -45, 'recRecv=' + max3.e0.getPercentTotal('recovery_received'));

const lowStar = setup(() => 0, { stars: 4 });
lowStar.battle.start();
applyEffect(lowStar.e0, 'ADVANTAGE', 1, 'seed', { duration: 20 });
lowStar.battle.runRound();
lowStar.battle.runRound();
lowStar.battle.runRound();
const rawLow = (lowStar.battle.battleLog || []).join('\n');
check('below 6★ still cleanses positive', /Cleanses Advantage from EnemyL/.test(rawLow));
check('below 6★ no Infectious Wrath stack', !lowStar.e0.stacks || !lowStar.e0.stacks.infectious_wrath);
check('below 6★ still R3 fire 190%', /Deals \d+ Fire Damage/.test(cmdChunk(rawLow, 3)));
check('below 6★ no R3 Infectious Wrath', !/Seasmoke activates Infectious Wrath/.test(rN(rawLow, 3)));
check('below 6★ no Cunning Ferocity', !/Cunning Ferocity/.test(rawLow));
check('below 6★ no Loyal Bond', !/Loyal Bond/.test(rawLow));

function physOnR3(statusId) {
  const s = setup(() => 0);
  s.battle.start();
  if (statusId) applyEffect(s.e0, statusId, 1, 'seed', { duration: 20 });
  for (let i = 0; i < 3; i += 1) s.battle.runRound();
  const text = (s.battle.battleLog || []).join('\n');
  const chunk = (rN(text, 3).split('Seasmoke activates Infectious Wrath')[1] || '').split('Seasmoke launches')[0];
  return { s, raw: text, chunk, eL: physAmt(chunk, 'EnemyL'), eV: physAmt(chunk, 'EnemyV'), eR: physAmt(chunk, 'EnemyR') };
}

const noPanic = physOnR3(null);
const withPanic = physOnR3('PANIC');
check('Panic 2x Infectious Wrath physical vs no Panic', noPanic.eL != null && withPanic.eL != null && withPanic.eL > noPanic.eL, 'noPanicL=' + noPanic.eL + ' panicL=' + withPanic.eL);
check('Panic doubles rate 30% to 60%', noPanic.eL && withPanic.eL && Math.abs((withPanic.eL / noPanic.eL) - (1.6 / 1.3)) < 0.08, 'ratio=' + (noPanic.eL ? (withPanic.eL / noPanic.eL).toFixed(3) : 'n/a') + ' expect~' + (1.6 / 1.3).toFixed(3));

const mixPanic = setup(() => 0);
mixPanic.battle.start();
applyEffect(mixPanic.e0, 'PANIC', 1, 'seed', { duration: 20 });
for (let i = 0; i < 3; i += 1) mixPanic.battle.runRound();
const mixChunk = ((rN((mixPanic.battle.battleLog || []).join('\n'), 3).split('Seasmoke activates Infectious Wrath')[1] || '').split('Seasmoke launches')[0]);
const mixL = physAmt(mixChunk, 'EnemyL');
const mixV = physAmt(mixChunk, 'EnemyV');
check('mixed Panic: panicked EnemyL higher than clean EnemyV', mixL != null && mixV != null && mixL > mixV, 'L=' + mixL + ' V=' + mixV);

const casterPanic = setup(() => 0);
casterPanic.battle.start();
applyEffect(casterPanic.sea, 'PANIC', 1, 'seed', { duration: 20 });
for (let i = 0; i < 3; i += 1) casterPanic.battle.runRound();
const casterChunk = ((rN((casterPanic.battle.battleLog || []).join('\n'), 3).split('Seasmoke activates Infectious Wrath')[1] || '').split('Seasmoke launches')[0]);
const casterL = physAmt(casterChunk, 'EnemyL');
check('caster Panic does not 2x clean targets', noPanic.eL != null && casterL != null && Math.abs(casterL - noPanic.eL) <= 1, 'noPanic=' + noPanic.eL + ' casterPanic=' + casterL);

const bondLow = setup(() => 0);
bondLow.battle.start();
bondLow.left.currentHealth = bondLow.left.maxHealth * 0.4;
bondLow.right.currentHealth = bondLow.right.maxHealth * 0.4;
bondLow.battle.runRound();
const rawBond = (bondLow.battle.battleLog || []).join('\n');
check('Loyal Bond below 50%: Resistance not Advantage', /Grants Resistance/.test(rawBond) && !/Grants Advantage/.test(rawBond));
check('Loyal Bond Resistance -20%', /Resistance \(-20%\)/.test(rawBond) || /Resistance \(-20%\)/.test(formatBattleReport(bondLow.battle, '')));

const bondSplit = setup(() => 0);
bondSplit.battle.start();
bondSplit.left.currentHealth = bondSplit.left.maxHealth * 0.8;
bondSplit.right.currentHealth = bondSplit.right.maxHealth * 0.4;
bondSplit.battle.runRound();
const rawSplit = (bondSplit.battle.battleLog || []).join('\n');
check('Loyal Bond split bands: Advantage to high HP AllyL', /Grants Advantage \(\+20%\) to AllyL/.test(rawSplit));
check('Loyal Bond split bands: Resistance to low HP AllyR', /Grants Resistance \(-20%\) to AllyR/.test(rawSplit));
check('Loyal Bond does not self-buff Advantage', !/Grants Advantage \(\+20%\) to Seasmoke/.test(rawSplit));

const emptyAlly = setup(() => 0, { noLeft: true, noRight: true });
emptyAlly.battle.start();
emptyAlly.battle.runRound();
const rawEmptyAlly = (emptyAlly.battle.battleLog || []).join('\n');
check('empty adjacency: no Cunning Ferocity INT/Fire on anyone else', !/Increases Intelligence of Ally/.test(rawEmptyAlly) && !/Increases Fire Damage Dealt of /.test(rawEmptyAlly));
check('empty adjacency: Cunning Ferocity not on self fire', emptyAlly.sea.getPercentTotal('fire_dealt') === 0);
check('empty adjacency: still vanguard flats', emptyAlly.sea.flatMods.str === 15);
check('empty adjacency: still Cleansing Wrath', /Seasmoke activates Cleansing Wrath/.test(rawEmptyAlly));
check('empty adjacency: still Clever Maneuver', /Clever Maneuver/.test(rawEmptyAlly));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
if (failed.length) process.exit(1);
