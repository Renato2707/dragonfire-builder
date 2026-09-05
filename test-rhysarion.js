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
  const habits = JSON.parse(fs.readFileSync('./data/rhysarion_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/rhysarion_vanguard_command.json', 'utf8'));

  const data = {
    id: 'rhysarion', name: 'Rhysarion', rarity: 'Epic', breed: 'Champion',
    stats: { str: 59, inst: 47, int: 61, init: 41 },
    affinity: ['spearmen', 'shieldbearers', 'siege'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const rhy = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  rhy.setTroopType('spearmen');
  loadKit(rhy, habits, cmd);

  const left = extras.noLeft ? null : dummy(
    'allyL', 'AllyL', 0, extras.leftSlot != null ? extras.leftSlot : 0,
    extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }
  );
  if (left) left.setTroopType('spearmen');
  const right = extras.noRight ? null : dummy(
    'allyR', 'AllyR', 0, extras.rightSlot != null ? extras.rightSlot : 2,
    extras.rightStats || { str: 40, inst: 40, int: 40, init: 30 }
  );
  if (right) right.setTroopType('spearmen');

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
    ? [left, right, rhy].filter(Boolean)
    : extras.slot === 0
      ? [rhy, left, right].filter(Boolean)
      : [left, rhy, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['spearmen', 'shieldbearers'],
    defendingTeam: extras.defendingTeam != null ? extras.defendingTeam : 1,
    verbose: false
  });
  return { battle, rhy, left, right, e0, e1, e2 };
}

function dumpEngine(label, rhy, left, right, e0, e1, e2) {
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
      dmgDealt: c.getPercentTotal('dmg_dealt'),
      recDealt: c.getPercentTotal('recovery_dealt'),
      recRecv: c.getPercentTotal('recovery_received'),
      dmgRecv: c.getPercentTotal('dmg_received'),
      flat: { ...c.flatMods },
      dealer: getDealerType(c),
      breed: c.breed,
      hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth)
    };
  };
  lines.push('===== ' + label + ' =====');
  for (const c of [rhy, left, right, e0, e1, e2]) {
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
  const after = (chunk.split('Rhysarion activates Dawnsong')[1] || '');
  return after.split('Rhysarion launches')[0];
}

function fireAmt(text, name) {
  const m = text.match(new RegExp('Deals (\\d+) Fire Damage to ' + name));
  return m ? Number(m[1]) : null;
}

const kitCmd = JSON.parse(fs.readFileSync('./data/rhysarion_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/rhysarion_habits.json', 'utf8'));

check('JSON command name Dawnsong not Dawnysong', kitCmd.name === 'Dawnsong' && kitCmd.name !== 'Dawnysong');
check('JSON no Dawnysong anywhere in command kit', !JSON.stringify(kitCmd).includes('Dawnysong'));
check('JSON R1,4,7 physical 70% 2 adjacency', kitCmd.command[0].rounds.join() === '1,4,7' && kitCmd.command[0].actions[0].dt === 'physical' && kitCmd.command[0].actions[0].pct === 70 && kitCmd.command[0].actions[0].tgt.count === 2 && kitCmd.command[0].actions[0].tgt.select === 'adjacency');
check('JSON R2,5,8 fire 20% 3 any Control 1.5x via pct 30', kitCmd.command[1].rounds.join() === '2,5,8' && kitCmd.command[1].actions[0].dt === 'fire' && kitCmd.command[1].actions[0].pct === 20 && kitCmd.command[1].actions[0].ifBonus.status === 'control' && kitCmd.command[1].actions[0].ifBonus.pct === 30 && kitCmd.command[1].actions[0].tgt.count === 3 && kitCmd.command[1].actions[0].tgt.select === 'any');
check('JSON command has no Recovery (Echoing Melody habit-mod only)', !JSON.stringify(kitCmd.command).includes('heal') && !JSON.stringify(kitCmd.command).toLowerCase().includes('recovery'));
check('JSON vanguard recovery_dealt 15% and init flat 25', kitCmd.vanguard[0].actions[0].mods[0].stat === 'recovery_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 15 && kitCmd.vanguard[0].actions[0].mods[1].stat === 'init' && kitCmd.vanguard[0].actions[0].mods[1].fixed === 25);
check('JSON vanguard right flank slot 2 +8% dmg_dealt', kitCmd.vanguard[0].actions[1].mods[0].stat === 'dmg_dealt' && kitCmd.vanguard[0].actions[1].mods[0].pct === 8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON Ebbing Fury table -27.5/25 not prose-only', kitHab.habits[0].name === 'Ebbing Fury' && kitHab.habits[0].scaling[0].values[0] === -27.5 && kitHab.habits[0].scaling[1].values[0] === 25 && kitHab.habits[0].scaling[0].values[4] === -55 && kitHab.habits[0].scaling[1].values[4] === 50);
check('JSON Ebbing Fury hits both teams R1 and Recovery R4', kitHab.habits[0].structured[0].rounds.join() === '1' && kitHab.habits[0].structured[0].actions[0].tgt.side === 'enemy' && kitHab.habits[0].structured[0].actions[1].tgt.side === 'ally' && kitHab.habits[0].structured[1].rounds.join() === '4' && kitHab.habits[0].structured[1].actions[0].t === 'heal' && kitHab.habits[0].structured[1].actions[0].scaleStat === 'str');
check('JSON Sharp Resolve STR/INT 16/19.2/22.4/27.2/32', kitHab.habits[1].name === 'Sharp Resolve' && kitHab.habits[1].scaling[0].values.join() === '16,19.2,22.4,27.2,32' && kitHab.habits[1].scaling[1].values.join() === '16,19.2,22.4,27.2,32');
check('JSON Echoing Melody requires Dawnsong not Dawnysong', kitHab.habits[2].name === 'Echoing Melody' && kitHab.habits[2].structured[0].requires.command === 'Dawnsong' && kitHab.habits[2].structured[0].rounds.join() === '2,5,8' && kitHab.habits[2].structured[0].actions[0].t === 'heal' && kitHab.habits[2].structured[0].actions[0].pct[0] === 60 && kitHab.habits[2].structured[0].actions[0].scaleStat === 'int' && kitHab.habits[2].structured[0].actions[0].tgt.excludeSelf === true && kitHab.habits[2].structured[0].actions[0].tgt.count === 2);
check('JSON no Dawnysong in habits', !JSON.stringify(kitHab).includes('Dawnysong'));
check('JSON Unbroken Devotion 20% not Dawnseeker 15%', kitHab.habits[3].name === 'Unbroken Devotion' && kitHab.habits[3].scaling[0].values[0] === 20 && kitHab.habits[3].scaling[0].values[4] === 40 && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 20 && kitHab.habits[3].structured[0].actions[0].tgt.excludeSelf === true && kitHab.habits[3].structured[0].actions[0].tgt.count === 2);
check('JSON Inspiring Melody chance table 20/26/32/40/50 one-roll both', kitHab.habits[4].name === 'Inspiring Melody' && kitHab.habits[4].structured[0].chance.join() === '20,26,32,40,50' && kitHab.habits[4].structured[0].actions[0].mods[0].stat === 'init' && kitHab.habits[4].structured[0].actions[0].mods[0].pct === 20 && kitHab.habits[4].structured[0].actions[0].scaleStat === 'int' && kitHab.habits[4].structured[0].actions[1].st === 'resistance' && kitHab.habits[4].structured[0].actions[1].val === 15 && kitHab.habits[4].structured[0].actions[0].dur === 3 && kitHab.habits[4].structured[0].actions[1].dur === 3 && kitHab.habits[4].structured[0].actions[0].tgt.select === 'adjacency' && kitHab.habits[4].structured[0].actions[0].tgt.excludeSelf === true);
check("vanguardNames Rhysarion Champion's Vigor", VANGUARD_NAMES.rhysarion === "Champion's Vigor");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/rhysarion-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/rhysarion-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Rhysarion lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Rhysarion|Champion|Dawnsong|Dawnysong|Ebbing|Sharp Resolve|Echoing|Unbroken|Inspiring|Vigor/.test(line)) {
    console.log(line);
  }
}
console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.rhy, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Champion's Vigor", report.includes("Champion's Vigor"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Dawnsong (Vanguard)', !/Dawnsong \(Vanguard\)/.test(raw) && !/Dawnsong \(Vanguard\)/.test(report));
check('command Dawnsong in report', report.includes('Dawnsong'));
check('command Dawnsong in raw log', /Rhysarion activates Dawnsong/.test(raw));
check('log never Dawnysong', !/Dawnysong/.test(raw) && !/Dawnysong/.test(report));
check('Ebbing Fury', report.includes('Ebbing Fury'));
check('Sharp Resolve', report.includes('Sharp Resolve'));
check('Echoing Melody', report.includes('Echoing Melody'));
check('Unbroken Devotion', report.includes('Unbroken Devotion'));
check('Inspiring Melody', report.includes('Inspiring Melody'));
check('10 rounds played', /• Round 10/.test(report));

check('vanguard Initiative +25 flat not %', /\+25 Initiative/.test(report) && !/\+25% Initiative/.test(report));
check('vanguard Recovery Dealt +15%', /\+15% Recovery Dealt/.test(report));
check('right flank +8% Damage Dealt', report.includes('+8% Damage Dealt') && /AllyR/.test(report));
check("left flank no Champion's Vigor dmg dealt", !/\[ AllyL \] is under the effect of \[ Champion's Vigor \]/.test(report) || !/\+8% Damage Dealt/.test((report.split('[ AllyL ]')[1] || '').split('[ AllyR ]')[0] || ''));

check('Sharp Resolve +16% Strength', /\+16% Strength/.test(report));
check('Sharp Resolve +16% Intelligence', /\+16% Intelligence/.test(report));
check('Unbroken Devotion +20% Recovery Received', /\+20% Recovery Received/.test(report));
check('Ebbing Fury -27.5% Damage Dealt', /-27\.5% Damage Dealt/.test(report) || /-27.5% Damage Dealt/.test(raw));
check('Echoing Melody recovery base and scaled', /Recovery \+60% \(enhanced by Intelligence/.test(report));
check('Inspiring Melody INIT enhanced INT', /\+20% Initiative \(enhanced by Intelligence → /.test(report));
check('Inspiring Melody Resistance', /Resistance/.test(report));

check('R1 physical command 2 enemies', (cmdChunk(raw, 1).match(/Deals \d+ Physical Damage to Enemy/g) || []).length === 2);
check('R1 no fire command', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 1)));
check('R2 fire command 3 enemies', (cmdChunk(raw, 2).match(/Deals \d+ Fire Damage to Enemy/g) || []).length === 3);
check('R2 no physical command', !/Deals \d+ Physical Damage/.test(cmdChunk(raw, 2)));
check('R4 physical command', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 4)));
check('R5 fire command', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 5)));
check('R7 physical command', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 7)));
check('R8 fire command', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 8)));
check('R3 no Dawnsong dmg', !/Deals \d+ (Physical|Fire) Damage/.test(cmdChunk(raw, 3)));
check('R2 Echoing Melody recovery 2 other allies', (rN(raw, 2).match(/Applies Recovery to Ally[LR]/g) || []).length === 2 && !/Applies Recovery to Rhysarion/.test(rN(raw, 2)));
check('R5,8 Echoing Melody recovery', /Applies Recovery to Ally/.test(rN(raw, 5)) && /Applies Recovery to Ally/.test(rN(raw, 8)));
check('R1 no Echoing Melody recovery', !/Echoing Melody/.test(rN(raw, 1)) && !/Applies Recovery to Ally/.test(cmdChunk(raw, 1)));
check('R1 Ebbing Fury both teams', /Reduces Damage Dealt of /.test(rN(raw, 1)) && /Ebbing Fury/.test(rN(raw, 1)));
check('R4 Ebbing Fury Recovery 3 allies', /Ebbing Fury/.test(rN(raw, 4)) && (rN(raw, 4).match(/Applies Recovery to /g) || []).length >= 3);
check('R1 Inspiring Melody hit 20%', /\[hit\] Inspiring Melody/.test(rN(raw, 1)));

check('engine vanguard init flat +25', main.rhy.flatMods.init === 25, 'init=' + main.rhy.flatMods.init);
check('engine vanguard recovery_dealt 15', main.rhy.getPercentTotal('recovery_dealt') === 15, 'recDealt=' + main.rhy.getPercentTotal('recovery_dealt'));
check('engine right flank dmg_dealt +8', main.right.getPercentTotal('dmg_dealt') === 8, 'right=' + main.right.getPercentTotal('dmg_dealt'));
check('engine left NOT right-flank buff', main.left.getPercentTotal('dmg_dealt') === 0, 'left=' + main.left.getPercentTotal('dmg_dealt'));
check('engine Sharp Resolve STR 16', main.rhy.getPercentTotal('str') === 16, 'strPct=' + main.rhy.getPercentTotal('str'));
check('engine Sharp Resolve INT 16', main.rhy.getPercentTotal('int') === 16, 'intPct=' + main.rhy.getPercentTotal('int'));
check('engine Unbroken Devotion allies +20 rec recv', main.left.getPercentTotal('recovery_received') === 20 && main.right.getPercentTotal('recovery_received') === 20, 'L=' + main.left.getPercentTotal('recovery_received') + ' R=' + main.right.getPercentTotal('recovery_received'));
check('engine Unbroken Devotion not on self', main.rhy.getPercentTotal('recovery_received') === 0, 'self=' + main.rhy.getPercentTotal('recovery_received'));
check('engine Ebbing Fury expired by R10', main.rhy.getPercentTotal('dmg_dealt') === 0 && main.e1.getPercentTotal('dmg_dealt') === 0, 'self=' + main.rhy.getPercentTotal('dmg_dealt') + ' e1=' + main.e1.getPercentTotal('dmg_dealt'));

// ---- Extra: Inspiring Melody hit / miss ----
const hitMel = setup(() => 0);
hitMel.battle.start();
hitMel.battle.runRound();
const rawHitMel = (hitMel.battle.battleLog || []).join('\n');
check('seed 0 hits 20% Inspiring Melody', /\[hit\] Inspiring Melody/.test(rawHitMel));
check('seed 0 Inspiring Melody INIT + Resistance same roll', /Increases Initiative of Ally[LR] by /.test(rawHitMel) && /Grants Resistance/.test(rawHitMel));
check('seed 0 still fires R1 physical Dawnsong', /Deals \d+ Physical Damage/.test(cmdChunk(rawHitMel, 1)));

const missMel = setup(() => 0.99);
missMel.battle.start();
missMel.battle.runRound();
const rawMissMel = (missMel.battle.battleLog || []).join('\n');
check('seed 0.99 misses 20% Inspiring Melody', /\[miss\] Inspiring Melody/.test(rawMissMel) && !/Increases Initiative of Ally/.test(rawMissMel) && !/Grants Resistance/.test(rawMissMel));
check('seed 0.99 still fires R1 physical Dawnsong', /Deals \d+ Physical Damage/.test(cmdChunk(rawMissMel, 1)));
check('seed 0.99 still vanguard init flat', missMel.rhy.flatMods.init === 25);

// ---- Extra: Ebbing Fury both teams after R1; Recovery R4 ----
const ebb = setup(() => 0);
ebb.battle.start();
ebb.battle.runRound();
check('R1 Ebbing Fury dmg_dealt -27.5 both teams (AllyR nets -19.5 with +8 vanguard)',
  ebb.rhy.getPercentTotal('dmg_dealt') === -27.5
  && ebb.left.getPercentTotal('dmg_dealt') === -27.5
  && ebb.right.getPercentTotal('dmg_dealt') === -19.5
  && ebb.e0.getPercentTotal('dmg_dealt') === -27.5
  && ebb.e1.getPercentTotal('dmg_dealt') === -27.5
  && ebb.e2.getPercentTotal('dmg_dealt') === -27.5,
  [ebb.rhy, ebb.left, ebb.right, ebb.e0, ebb.e1, ebb.e2].map(c => c.name + '=' + c.getPercentTotal('dmg_dealt')).join(' '));
ebb.battle.runRound();
ebb.battle.runRound();
ebb.battle.runRound();
const rawEbb = (ebb.battle.battleLog || []).join('\n');
check('R4 Ebbing Fury Recovery present', /Applies Recovery to /.test(rN(rawEbb, 4)) && /Ebbing Fury/.test(rN(rawEbb, 4)));
check('R4 Ebbing Fury dmg_dealt expired',
  ebb.rhy.getPercentTotal('dmg_dealt') === 0 && ebb.e1.getPercentTotal('dmg_dealt') === 0,
  'self=' + ebb.rhy.getPercentTotal('dmg_dealt') + ' e1=' + ebb.e1.getPercentTotal('dmg_dealt'));

// ---- Extra: Echoing Melody recovery base+scaled; gated below 6★ ----
const echo = setup(() => 0);
echo.battle.start();
echo.battle.runRound();
echo.battle.runRound();
const reportEcho = formatBattleReport(echo.battle, '');
check('Echoing Melody formatted Recovery +60% enhanced INT', /Recovery \+60% \(enhanced by Intelligence → /.test(reportEcho));
const lowStar = setup(() => 0, { stars: 4 });
lowStar.battle.start();
lowStar.battle.runRound();
lowStar.battle.runRound();
const rawLow = (lowStar.battle.battleLog || []).join('\n');
check('below 6★ no Echoing Melody', !/Echoing Melody/.test(rawLow) && !/Applies Recovery to Ally/.test(rN(rawLow, 2)));
check('below 6★ still Dawnsong fire R2', /Deals \d+ Fire Damage/.test(cmdChunk(rawLow, 2)));

// ---- Extra: empty adjacency R1 (no allies; R1 physical still hits vanguard-adjacent enemies) ----
const emptyAlly = setup(() => 0, { noLeft: true, noRight: true });
emptyAlly.battle.start();
emptyAlly.battle.runRound();
const rawEmptyAlly = (emptyAlly.battle.battleLog || []).join('\n');
check('empty ally adjacency: R1 physical still hits', /Deals \d+ Physical Damage to Enemy/.test(cmdChunk(rawEmptyAlly, 1)));
check('empty ally adjacency: Inspiring Melody no ally INIT', !/Increases Initiative of Ally/.test(rawEmptyAlly));
check('empty ally adjacency: no Unbroken Devotion targets', emptyAlly.rhy.getPercentTotal('recovery_received') === 0);

const emptyAdj = setup(() => 0, { slot: 0, noLeft: true, noRight: true, e0: false, e1: false });
emptyAdj.battle.start();
emptyAdj.battle.runRound();
const rawEmptyAdj = (emptyAdj.battle.battleLog || []).join('\n');
check('empty enemy adjacency R1: no physical Dawnsong hit', !/Deals \d+ Physical Damage/.test(cmdChunk(rawEmptyAdj, 1)) || cmdChunk(rawEmptyAdj, 1).trim() === '');
check('empty enemy adjacency R1: still activates Dawnsong', /Rhysarion activates Dawnsong/.test(rN(rawEmptyAdj, 1)));

// ---- Extra: Control on target → fire 1.5x (20%→30%) vs no Control 1.0x ----
function fireOnR2(statusId) {
  const s = setup(() => 0);
  s.battle.start();
  if (statusId) applyEffect(s.e1, statusId, 1, 'seed', { duration: 20 });
  s.battle.runRound();
  s.battle.runRound();
  const text = (s.battle.battleLog || []).join('\n');
  return { s, raw: text, dmg: fireAmt(cmdChunk(text, 2), 'EnemyV') };
}

const noCtrl = fireOnR2(null);
const withStun = fireOnR2('STUN');
check('Stun 1.5x Dawnsong fire vs no Control', noCtrl.dmg != null && withStun.dmg != null && withStun.dmg > noCtrl.dmg, 'noCtrl=' + noCtrl.dmg + ' stun=' + withStun.dmg);
check('Stun raises fire rate 20% to 30%', noCtrl.dmg && withStun.dmg && Math.abs((withStun.dmg / noCtrl.dmg) - (1.3 / 1.2)) < 0.08, 'ratio=' + (noCtrl.dmg ? (withStun.dmg / noCtrl.dmg).toFixed(3) : 'n/a') + ' expect~' + (1.3 / 1.2).toFixed(3));

for (const st of ['STAGGER', 'OVERWHELM', 'CONFUSION']) {
  const withSt = fireOnR2(st);
  check(st + ' counts as Control 1.5x fire', noCtrl.dmg != null && withSt.dmg != null && Math.abs((withSt.dmg / noCtrl.dmg) - (1.3 / 1.2)) < 0.08, 'noCtrl=' + noCtrl.dmg + ' ' + st + '=' + withSt.dmg);
}

// Burn is NOT Control — stay 1.0x
const withBurn = fireOnR2('BURN');
check('Burn is not Control (fire stays 1.0x)', noCtrl.dmg != null && withBurn.dmg != null && Math.abs(withBurn.dmg - noCtrl.dmg) <= 1, 'noCtrl=' + noCtrl.dmg + ' burn=' + withBurn.dmg);

// Mixed: only EnemyV has Stun; EnemyL/R stay 1.0x in the same R2
const mix = setup(() => 0);
mix.battle.start();
applyEffect(mix.e1, 'STUN', 1, 'seed', { duration: 20 });
mix.battle.runRound();
mix.battle.runRound();
const rawMix = (mix.battle.battleLog || []).join('\n');
const mixChunk = cmdChunk(rawMix, 2);
const mixV = fireAmt(mixChunk, 'EnemyV');
const mixL = fireAmt(mixChunk, 'EnemyL');
const mixR = fireAmt(mixChunk, 'EnemyR');
check('mixed Control: stunned EnemyV higher than clean flanks', mixV != null && mixL != null && mixR != null && mixV > mixL && mixV > mixR, 'V=' + mixV + ' L=' + mixL + ' R=' + mixR);

// Caster Stagger must NOT leak 1.5x onto clean targets
const caster = setup(() => 0);
caster.battle.start();
applyEffect(caster.rhy, 'STAGGER', 1, 'seed', { duration: 20 });
caster.battle.runRound();
caster.battle.runRound();
const rawCaster = (caster.battle.battleLog || []).join('\n');
const casterDmg = fireAmt(cmdChunk(rawCaster, 2), 'EnemyV');
check('caster Stagger does not 1.5x clean targets', noCtrl.dmg != null && casterDmg != null && Math.abs(casterDmg - noCtrl.dmg) <= 1, 'noCtrl=' + noCtrl.dmg + ' casterStagger=' + casterDmg);

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
if (failed.length) process.exit(1);
