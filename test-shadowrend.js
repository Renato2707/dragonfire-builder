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
import { hasEffect, getEffect } from './effects.js';
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
  const habits = JSON.parse(fs.readFileSync('./data/shadowrend_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/shadowrend_vanguard_command.json', 'utf8'));

  const data = {
    id: 'shadowrend', name: 'Shadowrend', rarity: 'Rare', breed: 'Warrior',
    stats: { str: 57, inst: 57, int: 41, init: 41 },
    affinity: ['shieldbearers', 'siege'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const sh = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  sh.setTroopType('shieldbearers');
  loadKit(sh, habits, cmd);

  const left = extras.noLeft ? null : dummy(
    'allyL', 'AllyL', 0, extras.leftSlot != null ? extras.leftSlot : 0,
    extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }
  );
  if (left) left.setTroopType('shieldbearers');
  const right = extras.noRight ? null : dummy(
    'allyR', 'AllyR', 0, extras.rightSlot != null ? extras.rightSlot : 2,
    extras.rightStats || { str: 40, inst: 40, int: 40, init: 30 }
  );
  if (right) right.setTroopType('shieldbearers');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
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
    ? [left, right, sh].filter(Boolean)
    : extras.slot === 0
      ? [sh, left, right].filter(Boolean)
      : [left, sh, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['shieldbearers', 'spearmen'],
    defendingTeam: extras.defendingTeam != null ? extras.defendingTeam : 1,
    verbose: false
  });
  return { battle, sh, left, right, e0, e1, e2 };
}

function dumpEngine(label, sh, left, right, e0, e1, e2) {
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
      physDealt: c.getPercentTotal('physical_dealt'),
      tacDealt: c.getPercentTotal('tactical_dealt'),
      dmgRecv: c.getPercentTotal('dmg_received'),
      flat: { ...c.flatMods },
      stacks: { ...c.stacks },
      dealer: getDealerType(c),
      breed: c.breed,
      hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth)
    };
  };
  lines.push('===== ' + label + ' =====');
  for (const c of [sh, left, right, e0, e1, e2]) {
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
  const after = (chunk.split('Shadowrend activates Eclipse Fervor')[1] || '');
  return after.split('Shadowrend launches')[0].split('Shadowrend activates')[0];
}

function ehChunk(raw) {
  const chunk = rN(raw, 9);
  const after = (chunk.split('Shadowrend activates Event Horizon')[1] || '');
  return after.split('Shadowrend launches')[0].split('Shadowrend activates')[0];
}

const kitCmd = JSON.parse(fs.readFileSync('./data/shadowrend_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/shadowrend_habits.json', 'utf8'));

check('JSON command name Eclipse Fervor', kitCmd.name === 'Eclipse Fervor');
check('JSON command Panic 25% rate 20 adj 1 dur 2', kitCmd.command[0].rounds.join() === '1,2,3,4,5,6,7,8,9,10' && kitCmd.command[0].actions[0].st === 'panic' && kitCmd.command[0].actions[0].chance === 25 && kitCmd.command[0].actions[0].rate === 20 && kitCmd.command[0].actions[0].dur === 2 && kitCmd.command[0].actions[0].tgt.select === 'adjacency' && kitCmd.command[0].actions[0].tgt.count === 1);
check('JSON command R4,7,9,10 physical 80% 2 adj', kitCmd.command[1].rounds.join() === '4,7,9,10' && kitCmd.command[1].actions[0].dt === 'physical' && kitCmd.command[1].actions[0].pct === 80 && kitCmd.command[1].actions[0].tgt.select === 'adjacency' && kitCmd.command[1].actions[0].tgt.count === 2);
check('JSON command has no Event Horizon 100%/tactical double-dip', !JSON.stringify(kitCmd.command).includes('100') && !JSON.stringify(kitCmd.command).toLowerCase().includes('tactical') && kitCmd.command.length === 2);
check('JSON vanguard physical_dealt +16% self', kitCmd.vanguard[0].actions[0].mods[0].stat === 'physical_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT +20 flats left flank slot 0', kitCmd.vanguard[0].actions[1].mods[0].stat === 'inst' && kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].mods[1].stat === 'init' && kitCmd.vanguard[0].actions[1].mods[1].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON Midnight Aura 40/48/56/68/80 enhanced Initiative R7-10', kitHab.habits[0].name === 'Midnight Aura' && kitHab.habits[0].scaling[0].values.join() === '40,48,56,68,80' && kitHab.habits[0].structured[0].rounds.join() === '7,8,9,10' && kitHab.habits[0].structured[0].actions[0].scaleStat === 'init' && kitHab.habits[0].structured[0].actions[0].dur === 1 && kitHab.habits[0].structured[0].actions[0].tgt.count === 3);
check('JSON Nimble Resilience -4/5 table % not flat', kitHab.habits[1].name === 'Nimble Resilience' && kitHab.habits[1].scaling[0].values.join() === '-4,-4.8,-5.6,-6.8,-8' && kitHab.habits[1].scaling[1].values.join() === '5,6,7,8.5,10' && kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === -4 && kitHab.habits[1].structured[0].actions[0].mods[1].pct[0] === 5 && kitHab.habits[1].structured[0].actions[0].mods[0].fixed == null);
check('JSON Fueled R1-6 chance 10 val 10 not 20', kitHab.habits[2].name === 'Fueled by Darkness' && kitHab.habits[2].structured[0].rounds.join() === '1,2,3,4,5,6' && kitHab.habits[2].structured[0].chance.join() === '10,12,14,17,20' && kitHab.habits[2].structured[0].actions[0].val === 10 && kitHab.habits[2].structured[0].actions[0].st === 'advantage');
check('JSON Fueled R7-10 doubled chance 20', kitHab.habits[2].structured[1].rounds.join() === '7,8,9,10' && kitHab.habits[2].structured[1].chance.join() === '20,24,28,34,40' && kitHab.habits[2].structured[1].actions[0].val === 10);
check('JSON Midnight Mastery 7/8.4/9.8/11.9/14 R7-10', kitHab.habits[3].name === 'Midnight Mastery' && kitHab.habits[3].scaling[0].values.join() === '7,8.4,9.8,11.9,14' && kitHab.habits[3].structured[0].rounds.join() === '7,8,9,10' && kitHab.habits[3].structured[0].actions[0].mods[0].stat === 'physical_dealt' && kitHab.habits[3].structured[0].actions[0].mods[1].stat === 'tactical_dealt');
check('JSON Event Horizon R9 phys+tac 100 any lane requires Eclipse Fervor', kitHab.habits[4].name === 'Event Horizon' && kitHab.habits[4].structured[0].requires.command === 'Eclipse Fervor' && kitHab.habits[4].structured[0].rounds.join() === '9' && kitHab.habits[4].structured[0].actions[0].dt === 'physical' && kitHab.habits[4].structured[0].actions[1].dt === 'tactical' && kitHab.habits[4].structured[0].actions[0].pct[0] === 100 && kitHab.habits[4].scaling[0].values.join() === '100,130,160,200,250' && kitHab.habits[4].structured[0].actions[0].tgt.count === 3 && kitHab.habits[4].structured[0].actions[0].tgt.select === 'any');
check("vanguardNames Shadowrend Warrior's Zeal", VANGUARD_NAMES.shadowrend === "Warrior's Zeal");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/shadowrend-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/shadowrend-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Shadowrend lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Shadowrend|Warrior's Zeal|Eclipse|Midnight|Nimble|Fueled|Event Horizon|Panic|Advantage/.test(line)) {
    console.log(line);
  }
}
console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.sh, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Warrior's Zeal", report.includes("Warrior's Zeal"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Eclipse Fervor (Vanguard)', !/Eclipse Fervor \(Vanguard\)/.test(raw) && !/Eclipse Fervor \(Vanguard\)/.test(report));
check('command Eclipse Fervor in report', report.includes('Eclipse Fervor'));
check('command Eclipse Fervor in raw log', /Shadowrend activates Eclipse Fervor/.test(raw));
check('Midnight Aura', report.includes('Midnight Aura'));
check('Nimble Resilience', report.includes('Nimble Resilience'));
check('Fueled by Darkness', report.includes('Fueled by Darkness'));
check('Midnight Mastery', report.includes('Midnight Mastery'));
check('Event Horizon', report.includes('Event Horizon') || /Event Horizon/.test(raw));
check('10 rounds played', /• Round 10/.test(report));

check('vanguard Physical Damage Dealt +16%', /\+16% Physical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check('left flank Warrior\'s Zeal flats', /\[ AllyL \] is under the effect of \[ Warrior's Zeal \]/.test(report) && /\+20 Instinct/.test(report));
check("right flank no Warrior's Zeal INST/INIT", !/\[ AllyR \] is under the effect of \[ Warrior's Zeal \]/.test(report));

check('Nimble Resilience -4% Damage Received', /-4% Damage Received/.test(report));
check('Nimble Resilience +5% Initiative not flat +5', /\+5% Initiative/.test(report) && !/\+5 Initiative/.test(report.split('Nimble Resilience')[1] || ''));

check('Midnight Aura +40% Strength enhanced Initiative', /\+40% Strength \(enhanced by Initiative → /.test(report));
check('Midnight Aura +40% Instinct enhanced Initiative', /\+40% Instinct \(enhanced by Initiative → /.test(report));
check('Midnight Mastery +7% Physical Damage Dealt not enhanced', /\+7% Physical Damage Dealt/.test(report) && !/\+7% Physical Damage Dealt \(enhanced by /.test(report));
check('Midnight Mastery +7% Tactical Damage Dealt not enhanced', /\+7% Tactical Damage Dealt/.test(report));

check('Advantage +10% not Seasmoke +20%', /Advantage \(\+10%\)/.test(report) && !/Advantage \(\+20%\)/.test(report));

check('R1 command Panic no physical', /Afflicts EnemyL with Panic/.test(cmdChunk(raw, 1)) && !/Deals \d+ Physical Damage/.test(cmdChunk(raw, 1)));
check('R4 command physical 2 adj', (cmdChunk(raw, 4).match(/Deals \d+ Physical Damage to Enemy/g) || []).length === 2);
check('R7 command physical', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 7)));
check('R9 command physical', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 9)));
check('R10 command physical', /Deals \d+ Physical Damage/.test(cmdChunk(raw, 10)));
check('R2 no command physical', !/Deals \d+ Physical Damage/.test(cmdChunk(raw, 2)));
check('R1 hit 25% Panic', /\[hit\] Eclipse Fervor → EnemyL \(25%\)/.test(cmdChunk(raw, 1)));

check('R1 no Midnight Aura', !/Shadowrend activates Midnight Aura/.test(rN(raw, 1)));
check('R6 no Midnight Aura', !/Shadowrend activates Midnight Aura/.test(rN(raw, 6)));
check('R7 Midnight Aura', /Shadowrend activates Midnight Aura/.test(rN(raw, 7)));
check('R8 Midnight Aura', /Shadowrend activates Midnight Aura/.test(rN(raw, 8)));
check('R9 Midnight Aura', /Shadowrend activates Midnight Aura/.test(rN(raw, 9)));
check('R10 Midnight Aura', /Shadowrend activates Midnight Aura/.test(rN(raw, 10)));
check('R1 no Midnight Mastery', !/Shadowrend activates Midnight Mastery/.test(rN(raw, 1)));
check('R7 Midnight Mastery', /Shadowrend activates Midnight Mastery/.test(rN(raw, 7)));

check('R9 Event Horizon physical 3', (ehChunk(raw).match(/Deals \d+ Physical Damage to Enemy/g) || []).length === 3);
check('R9 Event Horizon tactical 3', (ehChunk(raw).match(/Deals \d+ Tactical Damage to Enemy/g) || []).length === 3);
check('R9 command chunk no tactical', !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 9)));
check('R1 no Event Horizon', !/Shadowrend activates Event Horizon/.test(rN(raw, 1)));
check('R8 no Event Horizon', !/Shadowrend activates Event Horizon/.test(rN(raw, 8)));

check('engine vanguard self physical_dealt +16', main.sh.getPercentTotal('physical_dealt') >= 16, 'self=' + main.sh.getPercentTotal('physical_dealt'));
check('engine left INST/INIT flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right NOT left-flank flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0, JSON.stringify(main.right.flatMods));
check('engine Nimble dmg_received -4% not flat', main.sh.getPercentTotal('dmg_received') === -4 && (main.sh.flatMods.init || 0) === 0, 'dmgRecv=' + main.sh.getPercentTotal('dmg_received') + ' initPct=' + main.sh.getPercentTotal('init') + ' flat=' + JSON.stringify(main.sh.flatMods));
check('engine Nimble init +5%', main.sh.getPercentTotal('init') === 5, 'initPct=' + main.sh.getPercentTotal('init'));

check('R1 Fueled 10% hit seed 0', /\[hit\] Fueled by Darkness → .+ \(10%\)/.test(rN(raw, 1)));
check('R7 Fueled 20% hit seed 0', /\[hit\] Fueled by Darkness → .+ \(20%\)/.test(rN(raw, 7)));

// ---- Extra: Panic hit / miss 25% ----
const hitP = setup(() => 0);
hitP.battle.start();
hitP.battle.runRound();
const rawHitP = (hitP.battle.battleLog || []).join('\n');
check('seed 0 hits 25% Panic', /\[hit\] Eclipse Fervor → EnemyL \(25%\)/.test(rawHitP));
check('seed 0 EnemyL has Panic', hasEffect(hitP.e0, 'panic'));
check('seed 0 Panic rate 20', getEffect(hitP.e0, 'panic') && getEffect(hitP.e0, 'panic').damageRate === 20, 'rate=' + (getEffect(hitP.e0, 'panic') && getEffect(hitP.e0, 'panic').damageRate));
check('formatted report shows Panic', /Panic \(Damage Rate: \+20%\)/.test(formatBattleReport(hitP.battle, '')));

const missP = setup(() => 0.99);
missP.battle.start();
missP.battle.runRound();
const rawMissP = (missP.battle.battleLog || []).join('\n');
check('seed 0.99 misses 25% Panic', /\[miss\] Eclipse Fervor/.test(rawMissP) && !/Afflicts .+ with Panic/.test(rawMissP));
check('seed 0.99 EnemyL no Panic', !hasEffect(missP.e0, 'panic'));
check('seed 0.99 still vanguard flats', missP.left.flatMods.inst === 20);
check('seed 0.99 still Nimble %', missP.sh.getPercentTotal('dmg_received') === -4);

// ---- Extra: empty adjacency ----
const emptyAdj = setup(() => 0, { slot: 0, noLeft: true, noRight: true, e0: false, e1: false });
emptyAdj.battle.start();
emptyAdj.battle.runRound();
emptyAdj.battle.runRound();
emptyAdj.battle.runRound();
emptyAdj.battle.runRound();
const rawEmpty = (emptyAdj.battle.battleLog || []).join('\n');
check('empty adjacency: no Panic afflict', !/Afflicts .+ with Panic/.test(rawEmpty));
check('empty adjacency: no command physical R4', !/Deals \d+ Physical Damage/.test(cmdChunk(rawEmpty, 4)));
check('empty adjacency: still Eclipse Fervor activate', /Shadowrend activates Eclipse Fervor/.test(rawEmpty));
check('empty adjacency: still Nimble', emptyAdj.sh.getPercentTotal('dmg_received') === -4);

// ---- Extra: Midnight Aura only R7-10; Fueled 10% vs 20% ----
const early = setup(() => 0);
early.battle.start();
for (let i = 0; i < 6; i += 1) early.battle.runRound();
check('after R6 no Midnight Aura STR on allies', early.left.getPercentTotal('str') === 0 && early.right.getPercentTotal('str') === 0, 'Lstr=' + early.left.getPercentTotal('str') + ' Rstr=' + early.right.getPercentTotal('str'));
check('after R6 no Midnight Mastery phys dealt', early.left.getPercentTotal('physical_dealt') === 0, 'Lphys=' + early.left.getPercentTotal('physical_dealt'));
early.battle.runRound();
const earlyRaw = (early.battle.battleLog || []).join('\n');
check('R7 Midnight Aura hits 3 allies including self', /Increases Strength of AllyL/.test(rN(earlyRaw, 7)) && /Increases Strength of Shadowrend/.test(rN(earlyRaw, 7)) && /Increases Strength of AllyR/.test(rN(earlyRaw, 7)));
check('R7 Midnight Aura enhanced by Initiative in log', /enhanced by Initiative/.test(rN(earlyRaw, 7)));
check('R7 Midnight Mastery phys+tac on 3 allies', /Increases Physical Damage Dealt of Shadowrend/.test(rN(earlyRaw, 7)) && /Increases Tactical Damage Dealt of AllyR/.test(rN(earlyRaw, 7)));
check('R7 Midnight Aura expires EoR on living', early.sh.getPercentTotal('str') === 0 && early.right.getPercentTotal('str') === 0, 'self=' + early.sh.getPercentTotal('str') + ' R=' + early.right.getPercentTotal('str'));

const mid = setup(() => 0.15);
mid.battle.start();
mid.battle.runRound();
const rawMid1 = (mid.battle.battleLog || []).join('\n');
check('seed 0.15 R1 Fueled 10% miss', /\[miss\] Fueled by Darkness → .+ \(10%\)/.test(rawMid1));
check('seed 0.15 R1 no Advantage grant', !/Grants Advantage/.test(rawMid1));
check('seed 0.15 R1 Panic still hits 25%', /\[hit\] Eclipse Fervor → EnemyL \(25%\)/.test(rawMid1));
for (let i = 0; i < 6; i += 1) mid.battle.runRound();
const rawMid7 = (mid.battle.battleLog || []).join('\n');
check('seed 0.15 R7 Fueled 20% hit', /\[hit\] Fueled by Darkness → .+ \(20%\)/.test(rN(rawMid7, 7)));
check('seed 0.15 R7 Grants Advantage +10%', /Grants Advantage \(\+10%\)/.test(rN(rawMid7, 7)));
const adv = getEffect(mid.left, 'advantage') || getEffect(mid.sh, 'advantage');
check('seed 0.15 Advantage magnitude +10 not +20', adv && adv.damageBonus === 10, 'bonus=' + (adv && adv.damageBonus));

// ---- Extra: Event Horizon R9 both types; below 10★ none ----
const eh = setup(() => 0);
eh.battle.start();
for (let i = 0; i < 9; i += 1) eh.battle.runRound();
const rawEh = (eh.battle.battleLog || []).join('\n');
check('R9 Event Horizon both damage types', /Deals \d+ Physical Damage/.test(ehChunk(rawEh)) && /Deals \d+ Tactical Damage/.test(ehChunk(rawEh)));
check('formatted R9 Event Horizon', /Event Horizon/.test(rFmt(formatBattleReport(eh.battle, ''), 9)));

const lowStar = setup(() => 0, { stars: 8 });
lowStar.battle.start();
for (let i = 0; i < 9; i += 1) lowStar.battle.runRound();
const rawLow = (lowStar.battle.battleLog || []).join('\n');
check('below 10★ no Event Horizon', !/Shadowrend activates Event Horizon/.test(rawLow));
check('below 10★ still R9 command physical 80%', /Deals \d+ Physical Damage/.test(cmdChunk(rawLow, 9)));
check('below 10★ still Midnight Aura', /Shadowrend activates Midnight Aura/.test(rN(rawLow, 7)));
check('8★ still Fueled by Darkness', /Fueled by Darkness/.test(rawLow));

const veryLow = setup(() => 0, { stars: 4 });
veryLow.battle.start();
veryLow.battle.runRound();
const rawVery = (veryLow.battle.battleLog || []).join('\n');
check('4★ no Fueled by Darkness', !/Fueled by Darkness/.test(rawVery));
check('4★ no Midnight Mastery', !/Midnight Mastery/.test(rawVery));
check('4★ still Nimble Resilience', /Nimble Resilience/.test(rawVery));
check('4★ still Eclipse Fervor', /Eclipse Fervor/.test(rawVery));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
if (failed.length) process.exit(1);
