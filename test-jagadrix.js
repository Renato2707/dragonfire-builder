import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyInitiativeOrder } from './hook-initiative-order.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { applyLinkedRetreated } from './hook-linked-retreated.js';
import { applyRetreatedPerTarget } from './hook-retreated-per-target.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';
import { applyEffect, hasEffect, getEffect } from './effects.js';
import { getDealerType } from './positionSystem.js';

applyInitiativeOrder(Battle);
applyVanguardLabel(Battle);
applyLinkedRetreated(Battle);
applyRetreatedPerTarget(Battle);

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
  const habits = JSON.parse(fs.readFileSync('./data/jagadrix_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/jagadrix_vanguard_command.json', 'utf8'));

  const data = {
    id: 'jagadrix', name: 'Jagadrix', rarity: 'Rare', breed: 'Hunter',
    stats: { str: 37, inst: 45, int: 59, init: 53 },
    affinity: ['spearmen'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const jag = new Character(data, 0, 1, { level: 16, stars, habitRank: 1 });
  jag.setTroopType('spearmen');
  loadKit(jag, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 });
  if (left) left.setTroopType('spearmen');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 40, inst: 40, int: 40, init: 30 });
  if (right) right.setTroopType('spearmen');

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

  const teamA = [left, jag, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, jag, left, right, e0, e1, e2 };
}

function dumpEngine(label, jag, left, right, e0, e1, e2) {
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
      dmgDealt: c.getPercentTotal('dmg_dealt'),
      tacDealt: c.getPercentTotal('tactical_dealt'),
      flat: { ...c.flatMods },
      dealer: getDealerType(c),
      breed: c.breed,
      nullify: hasEffect(c, 'nullify_recovery'),
      weakened: hasEffect(c, 'weakened'),
      damagePenalty: c.damagePenalty || 0,
      hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth)
    };
  };
  lines.push('===== ' + label + ' =====');
  for (const c of [jag, left, right, e0, e1, e2]) {
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

function echoesChunk(raw, n) {
  const chunk = rN(raw, n);
  return (chunk.split('Jagadrix activates Echoes of Deceit')[1] || '').split('Jagadrix launches')[0] || '';
}

function whispersChunk(raw, n) {
  const chunk = rN(raw, n);
  return (chunk.split('Jagadrix activates Cunning Whispers')[1] || '').split('Jagadrix activates')[0] || '';
}

function fireHits(text) {
  return [...String(text || '').matchAll(/Deals (\d+) Fire Damage to (\w+)/g)]
    .map(m => ({ amt: Number(m[1]), who: m[2] }));
}

const kitCmd = JSON.parse(fs.readFileSync('./data/jagadrix_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/jagadrix_habits.json', 'utf8'));

check('JSON command name Cunning Whispers', kitCmd.name === 'Cunning Whispers');
check('JSON no Echoes fire/shred on command', !JSON.stringify(kitCmd.command).includes('3,6,9') && !JSON.stringify(kitCmd.command).includes('highest'));
check('JSON vanguard fire_dealt +16%', kitCmd.vanguard[0].actions[0].mods[0].stat === 'fire_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard STR/INIT fixed 20 right flank', kitCmd.vanguard[0].actions[1].mods.every(m => m.fixed === 20) && kitCmd.vanguard[0].actions[1].mods.map(m => m.stat).join() === 'str,init' && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON command shred -15% same_lane 30% 2r scaleStat init', kitCmd.command[0].actions[0].mods[0].pct === -15 && kitCmd.command[0].actions[0].scaleStat === 'init' && kitCmd.command[0].actions[0].chance === 30 && kitCmd.command[0].actions[0].dur === 2 && kitCmd.command[0].actions[0].tgt.select === 'same_lane');
check('JSON command fire 120% R2,5,8 same_lane', kitCmd.command[1].rounds.join() === '2,5,8' && kitCmd.command[1].actions[0].dt === 'fire' && kitCmd.command[1].actions[0].pct === 120 && kitCmd.command[1].actions[0].tgt.select === 'same_lane');
check('JSON Enervate table -8 not Crimson -13.5', kitHab.habits[0].name === 'Enervate' && kitHab.habits[0].scaling[0].values[0] === -8 && kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === -8);
check('JSON Enervate dealer:tactical', kitHab.habits[0].structured[0].actions[0].tgt.select === 'dealer:tactical');
check('JSON Second Wind table 10/150 not prose 12/180', kitHab.habits[1].scaling[0].values[0] === 10 && kitHab.habits[1].scaling[1].values[0] === 150 && kitHab.habits[1].structured[0].actions[1].pct[0] === 150);
check('JSON Second Wind R6 self then Nullify Recovery', kitHab.habits[1].structured[0].rounds.join() === '6' && kitHab.habits[1].structured[0].actions[2].st === 'nullify_recovery');
check('JSON Whispering Sabotage 25% Weakened -10% same_lane 2r', kitHab.habits[2].structured[0].actions[0].st === 'weakened' && kitHab.habits[2].structured[0].actions[0].val === -10 && kitHab.habits[2].structured[0].actions[0].chance[0] === 25 && kitHab.habits[2].structured[0].actions[0].tgt.select === 'same_lane');
check('JSON Quick-Witted 12.5 not Feskar 16', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 12.5 && kitHab.habits[3].structured[0].actions[0].mods[1].pct[0] === 12.5);
check('JSON Echoes habit-mod R1 highest:inst -6 scaleStat init', kitHab.habits[4].structured[0].requires.command === 'Cunning Whispers' && kitHab.habits[4].structured[0].rounds.join() === '1' && kitHab.habits[4].structured[0].actions[0].tgt.select === 'highest:inst' && kitHab.habits[4].structured[0].actions[0].scaleStat === 'init' && kitHab.habits[4].structured[0].actions[0].mods[0].pct[0] === -6);
check('JSON Echoes R3,6,9 fire 30% dealer:tactical 2x Panic', kitHab.habits[4].structured[1].rounds.join() === '3,6,9' && kitHab.habits[4].structured[1].actions[0].dt === 'fire' && kitHab.habits[4].structured[1].actions[0].pct[0] === 30 && kitHab.habits[4].structured[1].actions[0].ifBonus.mult === 2 && kitHab.habits[4].structured[1].actions[0].ifBonus.status === 'panic' && kitHab.habits[4].structured[1].actions[0].tgt.select === 'dealer:tactical');
check("vanguardNames Jagadrix Hunter's Wrath", VANGUARD_NAMES.jagadrix === "Hunter's Wrath");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/jagadrix-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/jagadrix-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Jagadrix lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Jagadrix|Hunter|Cunning|Enervate|Second Wind|Whispering|Quick-Witted|Echoes|Wrath|Nullify|Weakened/.test(line)) {
    console.log(line);
  }
}
console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.jag, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Hunter's Wrath", report.includes("Hunter's Wrath"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Cunning Whispers (Vanguard)', !/Cunning Whispers \(Vanguard\)/.test(raw) && !/Cunning Whispers \(Vanguard\)/.test(report));
check('command Cunning Whispers', report.includes('Cunning Whispers'));
check('not Antares Relentless Pursuit', !report.includes('Relentless Pursuit'));
check('not Caraxes Infernal Burst', !report.includes('Infernal Burst'));
check('Enervate', report.includes('Enervate'));
check('Second Wind', report.includes('Second Wind'));
check('Whispering Sabotage', report.includes('Whispering Sabotage'));
check('Quick-Witted', report.includes('Quick-Witted'));
check('Echoes of Deceit', report.includes('Echoes of Deceit'));
check('10 rounds played', /• Round 10/.test(report));

check('vanguard fire dealt +16%', report.includes('+16% Fire Damage Dealt'));
check('right flank +20 Strength flat not %', /\+20 Strength/.test(report) && !/\+20% Strength/.test(report));
check('right flank +20 Initiative flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank no Hunter's Wrath flats", !/\[ AllyL \] is under the effect of \[ Hunter's Wrath \]/.test(report));

check('Enervate -8% Tactical Dealt', report.includes('-8% Tactical Damage Dealt'));
check('Quick-Witted +12.5% Intelligence', report.includes('+12.5% Intelligence'));
check('Quick-Witted +12.5% Initiative', report.includes('+12.5% Initiative') && !/\+16% Intelligence/.test(report));
check('Cunning Whispers base -15% enhanced INIT', /-15% Instinct \(enhanced by Initiative → /.test(report));
check('Cunning Whispers INIT shred base -15%', /-15% Initiative \(enhanced by Initiative → /.test(report));
check('Cunning Whispers not Echoes -6% on command line', !/activates \[ Cunning Whispers \][\s\S]{0,80}-6% Instinct/.test(report));
check('Echoes R1 base -6% enhanced INIT', /Echoes of Deceit[\s\S]{0,200}-6% Instinct \(enhanced by Initiative → /.test(rFmt(report, 1)) || /-6% Instinct \(enhanced by Initiative → /.test(rFmt(report, 1)));
check('Echoes R1 INIT shred base -6%', /-6% Initiative \(enhanced by Initiative → /.test(rFmt(report, 1)));
check('Second Wind table +10% Damage Dealt', report.includes('+10% Damage Dealt'));
check('Second Wind Recovery +150%', /Recovery \+150%/.test(report));
check('Nullify Recovery visible', /Nullify Recovery/.test(report));
check('Weakened -10%', /Weakened \(-10%\)/.test(report));
check('not Weakened +10%', !/Weakened \(\+10%\)/.test(report) && !/Weakened \(\+10%\)/.test(raw));

check('R1 30% shred hit same-lane EnemyV', /\[hit\] Cunning Whispers → EnemyV \(30%\)/.test(rN(raw, 1)));
check('R1 shred not on EnemyL/R', !/Reduces Instinct of EnemyL/.test(rN(raw, 1)) && !/Reduces Instinct of EnemyL/.test(whispersChunk(raw, 1)));
check('R1 Echoes shred highest INST EnemyR', /Reduces Instinct of EnemyR by /.test(echoesChunk(raw, 1)));
check('R1 no Echoes fire', !/Deals \d+ Fire Damage/.test(echoesChunk(raw, 1)));
check('R2 command fire same-lane EnemyV', /Deals \d+ Fire Damage to EnemyV/.test(whispersChunk(raw, 2)));
check('R2 no command fire on EnemyL/R', !/Deals \d+ Fire Damage to EnemyL/.test(whispersChunk(raw, 2)) && !/Deals \d+ Fire Damage to EnemyR/.test(whispersChunk(raw, 2)));
check('R2,5,8 command fire present', fireHits(whispersChunk(raw, 2)).length === 1 && fireHits(whispersChunk(raw, 5)).length === 1 && fireHits(whispersChunk(raw, 8)).length === 1);
check('R1,3,4 no command fire', fireHits(whispersChunk(raw, 1)).length === 0 && fireHits(whispersChunk(raw, 3)).length === 0 && fireHits(whispersChunk(raw, 4)).length === 0);
check('R3 Echoes fire on tactical dealer EnemyR', /Deals \d+ Fire Damage to EnemyR/.test(echoesChunk(raw, 3)));
check('R3 Echoes not on fire dealer EnemyL', !/Deals \d+ Fire Damage to EnemyL/.test(echoesChunk(raw, 3)));
check('R3 Echoes not on physical dealer EnemyV', !/Deals \d+ Fire Damage to EnemyV/.test(echoesChunk(raw, 3)));
check('R3,6,9 Echoes fire', /Echoes of Deceit/.test(rN(raw, 3)) && /Echoes of Deceit/.test(rN(raw, 6)) && /Echoes of Deceit/.test(rN(raw, 9)));
check('R2,4,5 no Echoes', !/Echoes of Deceit/.test(rN(raw, 2)) && !/Echoes of Deceit/.test(rN(raw, 4)) && !/Echoes of Deceit/.test(rN(raw, 5)));
check('R6 Second Wind', /Second Wind/.test(rN(raw, 6)));
check('Second Wind not on other rounds', !/Second Wind/.test(rN(raw, 1)) && !/Second Wind/.test(rN(raw, 5)) && !/Second Wind/.test(rN(raw, 7)));
check('Whispering Sabotage 25% hit seed 0', /\[hit\] Whispering Sabotage → EnemyV \(25%\)/.test(raw));

check('engine vanguard fire_dealt 16', main.jag.getPercentTotal('fire_dealt') === 16);
check('engine Quick-Witted INT 12.5', main.jag.getPercentTotal('int') === 12.5, 'intPct=' + main.jag.getPercentTotal('int'));
check('engine Quick-Witted INIT 12.5', main.jag.getPercentTotal('init') === 12.5, 'initPct=' + main.jag.getPercentTotal('init'));
check('engine Second Wind dmg_dealt 10', main.jag.getPercentTotal('dmg_dealt') === 10, 'dmgDealt=' + main.jag.getPercentTotal('dmg_dealt'));
check('engine Nullify Recovery on self', hasEffect(main.jag, 'nullify_recovery'));
check('engine right STR flat +20', main.right.flatMods.str === 20);
check('engine right INIT flat +20', main.right.flatMods.init === 20);
check('engine left no vanguard flats', main.left.flatMods.str === 0 && main.left.flatMods.init === 0);
check('engine Enervate EnemyR tactical_dealt -8', main.e2.getPercentTotal('tactical_dealt') === -8, 'tac=' + main.e2.getPercentTotal('tactical_dealt'));
check('engine Enervate not on fire dealer EnemyL', main.e0.getPercentTotal('tactical_dealt') === 0);
check('engine Enervate not on physical dealer EnemyV', main.e1.getPercentTotal('tactical_dealt') === 0);
check('engine Echoes INST shred on highest INST EnemyR', main.e2.getPercentTotal('inst') < 0 && main.e2.getPercentTotal('inst') !== -6, 'instPct=' + main.e2.getPercentTotal('inst'));
check('engine command shred on same-lane EnemyV', main.e1.getPercentTotal('inst') < 0 && main.e1.getPercentTotal('inst') !== -15, 'instPct=' + main.e1.getPercentTotal('inst'));
check('engine no INST shred leftover on EnemyL', main.e0.getPercentTotal('inst') === 0);
check('engine Weakened -10 on EnemyV', hasEffect(main.e1, 'weakened') && main.e1.damagePenalty === 10, 'penalty=' + main.e1.damagePenalty);
check('dealer types fire/phys/tac', getDealerType(main.e0) === 'fire' && getDealerType(main.e1) === 'physical' && getDealerType(main.e2) === 'tactical',
  JSON.stringify({ L: getDealerType(main.e0), V: getDealerType(main.e1), R: getDealerType(main.e2) }));

const hitShred = setup(() => 0);
hitShred.battle.start();
hitShred.battle.runRound();
const rawHitShred = (hitShred.battle.battleLog || []).join('\n');
check('seed 0 hits 30% same-lane shred', /\[hit\] Cunning Whispers → EnemyV \(30%\)/.test(rawHitShred) && /Reduces Instinct of EnemyV/.test(rawHitShred));
check('engine R1 INST shred scaled not base -15', hitShred.e1.getPercentTotal('inst') !== -15 && hitShred.e1.getPercentTotal('inst') < -15, 'instPct=' + hitShred.e1.getPercentTotal('inst'));
check('engine R1 INIT shred on EnemyV', hitShred.e1.getPercentTotal('init') < 0, 'initPct=' + hitShred.e1.getPercentTotal('init'));
check('engine R1 other enemies no command shred', hitShred.e0.getPercentTotal('inst') === 0 && hitShred.e2.getPercentTotal('inst') !== hitShred.e1.getPercentTotal('inst'));

const missShred = setup(() => 0.99);
missShred.battle.start();
missShred.battle.runRound();
const rawMissShred = (missShred.battle.battleLog || []).join('\n');
check('seed 0.99 misses 30% shred', /\[miss\] Cunning Whispers → EnemyV \(30%\)/.test(rawMissShred) && !/Reduces Instinct of EnemyV/.test(rawMissShred));
check('seed 0.99 still activates Cunning Whispers', /Jagadrix activates Cunning Whispers/.test(rawMissShred));
check('seed 0.99 Echoes R1 shred still applies', /Reduces Instinct of EnemyR/.test(rawMissShred));

const hitWeak = setup(() => 0);
hitWeak.battle.start();
hitWeak.battle.runRound();
const rawHitWeak = (hitWeak.battle.battleLog || []).join('\n');
check('seed 0 hits 25% Weakened', /\[hit\] Whispering Sabotage → EnemyV \(25%\)/.test(rawHitWeak) && /Afflicts EnemyV with Weakened \(-10%\) for 2 round/.test(rawHitWeak));
check('engine Weakened duration 2', hasEffect(hitWeak.e1, 'weakened') && getEffect(hitWeak.e1, 'weakened').duration === 2, 'dur=' + (getEffect(hitWeak.e1, 'weakened') && getEffect(hitWeak.e1, 'weakened').duration));

const missWeak = setup(() => 0.99);
missWeak.battle.start();
missWeak.battle.runRound();
const rawMissWeak = (missWeak.battle.battleLog || []).join('\n');
check('seed 0.99 misses 25% Weakened', /\[miss\] Whispering Sabotage → EnemyV \(25%\)/.test(rawMissWeak) && !/Afflicts \w+ with Weakened/.test(rawMissWeak));

const splitRoll = setup(() => 0.28);
splitRoll.battle.start();
splitRoll.battle.runRound();
const rawSplit = (splitRoll.battle.battleLog || []).join('\n');
check('seed 0.28 hits 30% shred misses 25% Weakened', /\[hit\] Cunning Whispers → EnemyV \(30%\)/.test(rawSplit) && /\[miss\] Whispering Sabotage → EnemyV \(25%\)/.test(rawSplit));

const noBurn = setup(() => 0);
noBurn.battle.start();
noBurn.battle.runRound();
noBurn.battle.runRound();
noBurn.battle.runRound();
const dmgNoPanic = (fireHits(echoesChunk((noBurn.battle.battleLog || []).join('\n'), 3)).find(h => h.who === 'EnemyR') || {}).amt;

const withPanic = setup(() => 0);
withPanic.battle.start();
applyEffect(withPanic.e2, 'PANIC', 1, 'seed', { duration: 10 });
withPanic.battle.runRound();
withPanic.battle.runRound();
withPanic.battle.runRound();
const rawPanic = (withPanic.battle.battleLog || []).join('\n');
const dmgPanic = (fireHits(echoesChunk(rawPanic, 3)).find(h => h.who === 'EnemyR') || {}).amt;
check('Panic 2x Echoes fire vs no Panic', dmgNoPanic != null && dmgPanic != null && dmgPanic > dmgNoPanic, 'noPanic=' + dmgNoPanic + ' panic=' + dmgPanic);
check('Panic raises fire rate 30% to 60%', dmgNoPanic && dmgPanic && Math.abs((dmgPanic / dmgNoPanic) - (1.6 / 1.3)) < 0.08, 'ratio=' + (dmgNoPanic ? (dmgPanic / dmgNoPanic).toFixed(3) : 'n/a') + ' expect~' + (1.6 / 1.3).toFixed(3));

const allTac = setup(() => 0, {
  e0Stats: { str: 20, inst: 90, int: 20, init: 20 },
  e1Stats: { str: 20, inst: 90, int: 20, init: 20 },
  e2Stats: { str: 20, inst: 90, int: 20, init: 20 }
});
allTac.battle.start();
allTac.battle.runRound();
allTac.battle.runRound();
allTac.battle.runRound();
const rawAllTac = (allTac.battle.battleLog || []).join('\n');
const tacHits = fireHits(echoesChunk(rawAllTac, 3));
check('3 tactical dealers: Echoes fire hits 3', tacHits.length === 3, 'count=' + tacHits.length + ' dealers=' + [allTac.e0, allTac.e1, allTac.e2].map(getDealerType).join(','));

const noTac = setup(() => 0, {
  e0Stats: { str: 20, inst: 20, int: 90, init: 20 },
  e1Stats: { str: 90, inst: 20, int: 20, init: 20 },
  e2Stats: { str: 20, inst: 20, int: 90, init: 20 }
});
noTac.battle.start();
noTac.battle.runRound();
noTac.battle.runRound();
noTac.battle.runRound();
const rawNoTac = (noTac.battle.battleLog || []).join('\n');
check('0 tactical dealers: no Echoes fire', fireHits(echoesChunk(rawNoTac, 3)).length === 0, 'dealers=' + [noTac.e0, noTac.e1, noTac.e2].map(getDealerType).join(',') + ' chunk=' + JSON.stringify(echoesChunk(rawNoTac, 3).slice(0, 180)));

const emptyLane = setup(() => 0, { e1: false });
emptyLane.battle.start();
emptyLane.battle.runRound();
emptyLane.battle.runRound();
const rawEmpty = (emptyLane.battle.battleLog || []).join('\n');
check('same-lane empty: command still activates', /Jagadrix activates Cunning Whispers/.test(rawEmpty));
check('same-lane empty: no shred on EnemyL/R', !/Reduces Instinct of EnemyL/.test(whispersChunk(rawEmpty, 1)) && !/Reduces Instinct of EnemyR/.test(whispersChunk(rawEmpty, 1)));
check('same-lane empty: R2 fire does not spill to other lanes', fireHits(whispersChunk(rawEmpty, 2)).length === 0);
check('same-lane empty: Whispering Sabotage has no Weakened target', !/Afflicts Enemy/.test((rawEmpty.split('Jagadrix activates Whispering Sabotage')[1] || '').split('Jagadrix activates')[0] || ''));

const occupied = setup(() => 0);
occupied.battle.start();
occupied.battle.runRound();
occupied.battle.runRound();
const rawOcc = (occupied.battle.battleLog || []).join('\n');
check('same-lane occupied: R2 fire hits EnemyV', fireHits(whispersChunk(rawOcc, 2)).some(h => h.who === 'EnemyV'));

const preHeal = setup(() => 0);
preHeal.battle.start();
preHeal.jag.takeDamage(2000);
for (let i = 0; i < 6; i += 1) preHeal.battle.runRound();
const rawHeal = (preHeal.battle.battleLog || []).join('\n');
const healAmt = Number((rN(rawHeal, 6).match(/Applies Recovery to Jagadrix \(\+(\d+) Troop Capacity\)/) || [])[1] || 0);
const fmt6 = rFmt(formatBattleReport(preHeal.battle, ''), 6);
check('R6 Second Wind Recovery heals missing troops', healAmt > 0, 'heal=' + healAmt);
check('formatted Recovery +150% with troops', /Recovery \+150%/.test(fmt6) && /\+\d+ Troop gained/.test(fmt6));
check('engine Nullify after Second Wind', hasEffect(preHeal.jag, 'nullify_recovery'));
const missing = preHeal.jag.maxHealth - preHeal.jag.currentHealth;
if (missing < 100) preHeal.jag.takeDamage(400);
const blocked = preHeal.jag.heal(500);
check('Nullify Recovery blocks later heal()', blocked === 0, 'healed=' + blocked);
applyEffect(preHeal.jag, 'RECOVERY', 1, 'seed', { duration: 10 });
preHeal.battle.runRound();
const rawBlock = (preHeal.battle.battleLog || []).join('\n');
check('Nullify Recovery cannot-receive log', /cannot receive Recovery \(Nullify Recovery\)/.test(rawBlock));

const no10 = setup(() => 0, { stars: 8 });
no10.battle.start();
for (let i = 0; i < 3; i += 1) no10.battle.runRound();
const rawNo10 = (no10.battle.battleLog || []).join('\n');
check('below 10★: no Echoes of Deceit', !/Echoes of Deceit/.test(rawNo10));
check('below 10★: Cunning Whispers still fires', /Cunning Whispers/.test(rawNo10));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
