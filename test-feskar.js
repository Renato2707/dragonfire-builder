import fs from 'fs';
import { formatBattleReport } from './reportFormat.js';
import { applyEffect, hasEffect, getEffect } from './effects.js';
import { getDealerType } from './positionSystem.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { dummy, loadKit, setup, dumpEngine, check, checks, rN, rFmt } from './test-feskar-harness.js';


const kitCmd = JSON.parse(fs.readFileSync('./data/feskar_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/feskar_habits.json', 'utf8'));

check('JSON command name Calculated Assault', kitCmd.name === 'Calculated Assault');
check('JSON no Emerald Inferno on command', !JSON.stringify(kitCmd.command).includes('fire') && !JSON.stringify(kitCmd.command).includes('Emerald'));
check('JSON vanguard STR/INT/INST fixed 15', kitCmd.vanguard[0].actions[0].mods.every(m => m.fixed === 15) && kitCmd.vanguard[0].actions[0].mods.map(m => m.stat).join() === 'str,int,inst');
check('JSON vanguard right flank slot 2 -8%', kitCmd.vanguard[0].actions[1].mods[0].stat === 'dmg_received' && kitCmd.vanguard[0].actions[1].mods[0].pct === -8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON shred highest_str -12% 20% 2r excludeBasic', kitCmd.command[0].actions[0].mods[0].stat === 'physical_dealt' && kitCmd.command[0].actions[0].mods[0].pct === -12 && kitCmd.command[0].actions[0].chance === 20 && kitCmd.command[0].actions[0].dur === 2 && kitCmd.command[0].actions[0].excludeBasic === true && kitCmd.command[0].actions[0].tgt.select === 'highest_str');
check('JSON tactical 100% lowest_troops R2,4,7,9', kitCmd.command[1].rounds.join() === '2,4,7,9' && kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 100 && kitCmd.command[1].actions[0].tgt.select === 'lowest_troops');
check('JSON Resilient Bond table -6.5 not prose -7', kitHab.habits[0].scaling[0].values[0] === -6.5 && kitHab.habits[0].structured[0].actions[0].mods[0].pct[0] === -6.5);
check('JSON Resilient Bond linkedRetreated', kitHab.habits[0].structured[1].requires.linkedRetreated === 'resilient_bond_ally');
check('JSON Insightful Allies scaleStat inst 3 allies', kitHab.habits[1].structured[0].actions[0].scaleStat === 'inst' && kitHab.habits[1].structured[0].actions[0].tgt.count === 3);
check('JSON Emerald Inferno habit-mod fire 1.5x burn dealer:physical', kitHab.habits[2].name === 'Emerald Inferno' && kitHab.habits[2].structured[0].requires.command === 'Calculated Assault' && kitHab.habits[2].structured[0].rounds.join() === '3,5,8,10' && kitHab.habits[2].structured[0].actions[0].dt === 'fire' && kitHab.habits[2].structured[0].actions[0].ifBonus.mult === 1.5 && kitHab.habits[2].structured[0].actions[0].tgt.select === 'dealer:physical');
check('JSON Quick-Witted INT INIT 16%', kitHab.habits[3].structured[0].actions[0].mods[0].stat === 'int' && kitHab.habits[3].structured[0].actions[0].mods[1].stat === 'init' && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 16);
check('JSON Unyielding Grasp 10% stagger 3r prefer warrior', kitHab.habits[4].structured[0].actions[0].st === 'stagger' && kitHab.habits[4].structured[0].actions[0].dur === 3 && kitHab.habits[4].structured[0].actions[0].chance[0] === 10 && kitHab.habits[4].structured[0].actions[0].tgt.select === 'prefer_class:warrior');
check('vanguardNames Feskar Champion\'s Brilliance', VANGUARD_NAMES.feskar === "Champion's Brilliance");

// ---- Main 10-round fight, Math.random=0 (all chances hit) ----
const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/feskar-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/feskar-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Feskar lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Feskar|Champion|Calculated|Resilient|Insightful|Emerald|Quick-Witted|Unyielding|Brilliance/.test(line)) {
    console.log(line);
  }
}
console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.fes, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Champion's Brilliance", report.includes("Champion's Brilliance"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Calculated Assault (Vanguard)', !/Calculated Assault \(Vanguard\)/.test(raw) && !/Calculated Assault \(Vanguard\)/.test(report));
check('command Calculated Assault', report.includes('Calculated Assault'));
check('Resilient Bond', report.includes('Resilient Bond'));
check('Insightful Allies', report.includes('Insightful Allies'));
check('Emerald Inferno', report.includes('Emerald Inferno'));
check('Quick-Witted', report.includes('Quick-Witted'));
check('Unyielding Grasp', report.includes('Unyielding Grasp'));
check('10 rounds played', /• Round 10/.test(report));

check('vanguard Strength +15 flat not %', /\+15 Strength/.test(report) && !/\+15% Strength/.test(report.split("Champion's Brilliance")[1] || report));
check('vanguard Intelligence +15 flat', /\+15 Intelligence/.test(report));
check('vanguard Instinct +15 flat', /\+15 Instinct/.test(report));
check('right flank -8% Damage Received', report.includes('-8% Damage Received') && /AllyR/.test(report));
check("left flank no Champion's Brilliance dmg received", !/\[ AllyL \] is under the effect of \[ Champion's Brilliance \]/.test(report));

check('Resilient Bond stack mag table -6.5%', /1 stack of Resilient Bond \(-6\.5% Physical Damage Received \(excluding Basic Attacks\)\)/.test(report));
check('Resilient Bond stack on self', /Feskar[\s\S]{0,200}1 stack of Resilient Bond/.test(report) || /\[ Feskar \][\s\S]{0,400}Resilient Bond/.test(report));
check('Quick-Witted +16% Intelligence', /\+16% Intelligence/.test(report));
check('Quick-Witted +16% Initiative', /\+16% Initiative/.test(report));
check('Insightful Allies base and scaled', /\+10% Instinct \(enhanced by Instinct → /.test(report));

check('R1 shred highest STR EnemyV', /Reduces Physical Damage Dealt \(excluding Basic Attacks\) of EnemyV by -12%/.test(rN(raw, 1)));
check('R1 shred not on EnemyL/R', !/Reduces Physical Damage Dealt[\s\S]{0,40}EnemyL/.test(rN(raw, 1)) && !/Reduces Physical Damage Dealt[\s\S]{0,40}EnemyR/.test(rN(raw, 1)));
check('R1 20% shred hit', /\[hit\] Calculated Assault → EnemyV \(20%\)/.test(rN(raw, 1)));
check('R1 no tactical command', !/Deals \d+ Tactical Damage/.test(rN(raw, 1).split('Feskar launches')[0] || rN(raw, 1)));
check('R2 tactical least troops', /Deals \d+ Tactical Damage to Enemy/.test(rN(raw, 2)));
check('R2,4,7,9 tactical present', /Deals \d+ Tactical Damage/.test(rN(raw, 2)) && /Deals \d+ Tactical Damage/.test(rN(raw, 4)) && /Deals \d+ Tactical Damage/.test(rN(raw, 7)) && /Deals \d+ Tactical Damage/.test(rN(raw, 9)));
check('R3,5,6 no tactical command dmg', !/Deals \d+ Tactical Damage/.test((rN(raw, 3).split('Feskar launches')[0] || '')) && !/Deals \d+ Tactical Damage/.test((rN(raw, 6).split('Feskar launches')[0] || '')));

check('R3 Emerald Inferno fire on physical dealer', /Deals \d+ Fire Damage to EnemyV/.test(rN(raw, 3)));
check('R3 Emerald Inferno not on fire dealer EnemyL', !/Deals \d+ Fire Damage to EnemyL/.test(rN(raw, 3)));
check('R3 Emerald Inferno not on tactical dealer EnemyR', !/Deals \d+ Fire Damage to EnemyR/.test(rN(raw, 3)));
check('R3,5,8,10 Emerald Inferno fire', /Emerald Inferno/.test(rN(raw, 3)) && /Emerald Inferno/.test(rN(raw, 5)) && /Emerald Inferno/.test(rN(raw, 8)) && /Emerald Inferno/.test(rN(raw, 10)));
check('R1,2,4 no Emerald Inferno', !/Emerald Inferno/.test(rN(raw, 1)) && !/Emerald Inferno/.test(rN(raw, 2)) && !/Emerald Inferno/.test(rN(raw, 4)));

check('Unyielding Grasp 10% hit seed 0', /\[hit\] Unyielding Grasp/.test(raw));
check('Unyielding Grasp Stagger 3 rounds', /Afflicts \w+ with Stagger for 3 round/.test(raw));
check('Stagger cannot-line', /cannot launch a Basic Attack \(Stagger\)/.test(report) || /cannot launch a Basic Attack \(Stagger\)/.test(raw));
check('formatted Stagger cannot-line', /cannot launch a Basic Attack \(Stagger\)/.test(report));

check('engine vanguard STR flat +15', main.fes.flatMods.str === 15, 'str=' + main.fes.flatMods.str);
check('engine vanguard INT flat +15', main.fes.flatMods.int === 15);
check('engine vanguard INST flat +15', main.fes.flatMods.inst === 15);
check('engine right dmg_received -8', main.right.getPercentTotal('dmg_received') === -8, 'recv=' + main.right.getPercentTotal('dmg_received'));
check('engine left dmg_received 0', main.left.getPercentTotal('dmg_received') === 0);
check('engine Quick-Witted INT 16', main.fes.getPercentTotal('int') === 16, 'intPct=' + main.fes.getPercentTotal('int'));
check('engine Quick-Witted INIT 16', main.fes.getPercentTotal('init') === 16, 'initPct=' + main.fes.getPercentTotal('init'));
check('engine Resilient Bond stacks self>=1', (main.fes.stacks.resilient_bond || 0) >= 1, 'stacks=' + (main.fes.stacks.resilient_bond || 0));
check('engine physical_received self -6.5 per stack', main.fes.getPercentTotal('physical_received') === -6.5 * (main.fes.stacks.resilient_bond || 0), 'physRecv=' + main.fes.getPercentTotal('physical_received'));
check('engine Insightful Allies INST scaled not base 10', [main.fes, main.left, main.right].every(c => c.getPercentTotal('inst') !== 10 && c.getPercentTotal('inst') > 10), 'instPct fes/L/R=' + [main.fes, main.left, main.right].map(c => c.getPercentTotal('inst')).join('/'));
check('dealer types fire/phys/tac', getDealerType(main.e0) === 'fire' && getDealerType(main.e1) === 'physical' && getDealerType(main.e2) === 'tactical',
  JSON.stringify({ L: getDealerType(main.e0), V: getDealerType(main.e1), R: getDealerType(main.e2) }));
check('engine linked resilient_bond_ally', !!(main.fes.links.resilient_bond_ally && main.fes.links.resilient_bond_ally.name), 'link=' + (main.fes.links.resilient_bond_ally && main.fes.links.resilient_bond_ally.name));

// ---- Extra: hit/miss 20% phys shred ----
const hitShred = setup(() => 0);
hitShred.battle.start();
hitShred.battle.runRound();
const rawHitShred = (hitShred.battle.battleLog || []).join('\n');
check('seed 0 hits 20% phys shred', /\[hit\] Calculated Assault → EnemyV \(20%\)/.test(rawHitShred) && /Reduces Physical Damage Dealt \(excluding Basic Attacks\) of EnemyV by -12%/.test(rawHitShred));
check('engine R1 physical_dealt -12 on highest STR', hitShred.e1.getPercentTotal('physical_dealt') === -12, 'physDealt=' + hitShred.e1.getPercentTotal('physical_dealt'));
check('engine R1 other enemies no phys shred', hitShred.e0.getPercentTotal('physical_dealt') === 0 && hitShred.e2.getPercentTotal('physical_dealt') === 0);

const missShred = setup(() => 0.99);
missShred.battle.start();
missShred.battle.runRound();
const rawMissShred = (missShred.battle.battleLog || []).join('\n');
check('seed 0.99 misses 20% phys shred', /\[miss\] Calculated Assault → EnemyV \(20%\)/.test(rawMissShred) && !/Reduces Physical Damage Dealt/.test(rawMissShred));
check('seed 0.99 still activates Calculated Assault', /Feskar activates Calculated Assault/.test(rawMissShred));

// ---- Extra: hit/miss 10% Stagger ----
const hitStag = setup(() => 0);
hitStag.battle.start();
hitStag.battle.runRound();
const rawHitStag = (hitStag.battle.battleLog || []).join('\n');
check('seed 0 hits 10% Stagger', /\[hit\] Unyielding Grasp/.test(rawHitStag) && /Afflicts \w+ with Stagger for 3 round/.test(rawHitStag));
check('seed 0 Stagger prefers Warrior EnemyV', /Afflicts EnemyV with Stagger/.test(rawHitStag));
check('engine Stagger duration 3', hasEffect(hitStag.e1, 'stagger') && getEffect(hitStag.e1, 'stagger').duration === 3, 'dur=' + (getEffect(hitStag.e1, 'stagger') && getEffect(hitStag.e1, 'stagger').duration));

const missStag = setup(() => 0.99);
missStag.battle.start();
missStag.battle.runRound();
const rawMissStag = (missStag.battle.battleLog || []).join('\n');
check('seed 0.99 misses 10% Stagger', /\[miss\] Unyielding Grasp/.test(rawMissStag) && !/Afflicts \w+ with Stagger/.test(rawMissStag));

// ---- Extra: Burn present for 1.5x fire (rate 40% -> 60%) ----
function infernoChunk(raw, n) {
  const chunk = rN(raw, n);
  return (chunk.split('Feskar activates Emerald Inferno')[1] || '').split('Feskar launches')[0] || '';
}
function fireAmt(text, name) {
  const m = text.match(new RegExp('Deals (\\d+) Fire Damage to ' + name));
  return m ? Number(m[1]) : null;
}

const noBurn = setup(() => 0);
noBurn.battle.start();
noBurn.battle.runRound();
noBurn.battle.runRound();
noBurn.battle.runRound();
const rawNoBurn = (noBurn.battle.battleLog || []).join('\n');
const dmgNoBurn = fireAmt(infernoChunk(rawNoBurn, 3), 'EnemyV');

const withBurn = setup(() => 0);
withBurn.battle.start();
applyEffect(withBurn.e1, 'BURN', 1, 'seed', { duration: 10 });
withBurn.battle.runRound();
withBurn.battle.runRound();
withBurn.battle.runRound();
const rawBurn = (withBurn.battle.battleLog || []).join('\n');
const dmgBurn = fireAmt(infernoChunk(rawBurn, 3), 'EnemyV');
check('Burn 1.5x Emerald Inferno fire vs no Burn', dmgNoBurn != null && dmgBurn != null && dmgBurn > dmgNoBurn, 'noBurn=' + dmgNoBurn + ' burn=' + dmgBurn);
check('Burn raises fire rate 40% to 60%', dmgNoBurn && dmgBurn && Math.abs((dmgBurn / dmgNoBurn) - (1.6 / 1.4)) < 0.08, 'ratio=' + (dmgNoBurn ? (dmgBurn / dmgNoBurn).toFixed(3) : 'n/a') + ' expect~' + (1.6 / 1.4).toFixed(3));

// ---- Extra: linked ally retreatedLastRound extra stack ----
const retreat = setup(() => 0);
retreat.battle.start();
const linked = retreat.fes.links.resilient_bond_ally;
check('Resilient Bond linked ally at combat start', !!(linked && linked.name), 'linked=' + (linked && linked.name));
const stacksAtStart = retreat.fes.stacks.resilient_bond || 0;
if (linked) linked.retreatedLastRound = true;
retreat.battle.runRound();
check('Resilient Bond extra stack after linked retreat',
  (retreat.fes.stacks.resilient_bond || 0) === stacksAtStart + 1 || /gains 1 stack of Resilient Bond \(now 2\)/.test((retreat.battle.battleLog || []).join('\n')),
  'start=' + stacksAtStart + ' now=' + (retreat.fes.stacks.resilient_bond || 0));
const afterRetreat = retreat.fes.stacks.resilient_bond || 0;
for (let i = 0; i < 3; i += 1) {
  if (linked) linked.retreatedLastRound = false;
  retreat.battle.runRound();
}
check('Resilient Bond does not stack every later round without retreat',
  (retreat.fes.stacks.resilient_bond || 0) === afterRetreat,
  'stacks after extra rounds=' + (retreat.fes.stacks.resilient_bond || 0) + ' expected=' + afterRetreat);

const deadLink = setup(() => 0);
deadLink.battle.start();
const deadLinked = deadLink.fes.links.resilient_bond_ally;
if (deadLinked) {
  deadLinked.takeDamage(deadLinked.currentHealth);
  deadLinked.noteDeath();
  deadLinked.retreatedLastRound = false;
  deadLinked.isDead = true;
}
deadLink.battle.runRound();
check('linked isDead without retreatedLastRound does not extra-stack (hook)',
  (deadLink.fes.stacks.resilient_bond || 0) === 1,
  'stacks=' + (deadLink.fes.stacks.resilient_bond || 0));

// ---- Extra: Warrior vs non-Warrior Stagger prio ----
const noWarr = setup(() => 0, { e0Breed: 'Hunter', e1Breed: 'Sentinel', e2Breed: 'Hunter' });
noWarr.battle.start();
noWarr.battle.runRound();
const rawNoWarr = (noWarr.battle.battleLog || []).join('\n');
check('no Warrior: Stagger still hits some enemy', /Afflicts Enemy\w+ with Stagger/.test(rawNoWarr));

const warrRight = setup(() => 0, { e0Breed: 'Hunter', e1Breed: 'Sentinel', e2Breed: 'Warrior' });
warrRight.battle.start();
warrRight.battle.runRound();
const rawWarrRight = (warrRight.battle.battleLog || []).join('\n');
check('Warrior on Right Flank is prioritized for Stagger', /Afflicts EnemyR with Stagger/.test(rawWarrRight), 'raw=' + (rawWarrRight.match(/Afflicts \w+ with Stagger.*/) || [])[0]);

// ---- Extra: physical-dealer filter for Emerald Inferno ----
const allPhys = setup(() => 0, {
  e0Stats: { str: 90, inst: 20, int: 20, init: 20 },
  e1Stats: { str: 90, inst: 20, int: 20, init: 20 },
  e2Stats: { str: 90, inst: 20, int: 20, init: 20 }
});
allPhys.battle.start();
allPhys.battle.runRound();
allPhys.battle.runRound();
allPhys.battle.runRound();
const rawAllPhys = (allPhys.battle.battleLog || []).join('\n');
const fireHits = [...infernoChunk(rawAllPhys, 3).matchAll(/Deals \d+ Fire Damage to Enemy[LVR]/g)];
check('3 physical dealers: Emerald Inferno hits 3', fireHits.length === 3, 'count=' + fireHits.length + ' dealers=' + [allPhys.e0, allPhys.e1, allPhys.e2].map(getDealerType).join(','));

const noPhys = setup(() => 0, {
  e0Stats: { str: 20, inst: 20, int: 90, init: 20 },
  e1Stats: { str: 20, inst: 90, int: 20, init: 20 },
  e2Stats: { str: 20, inst: 20, int: 90, init: 20 }
});
noPhys.battle.start();
noPhys.battle.runRound();
noPhys.battle.runRound();
noPhys.battle.runRound();
const rawNoPhys = (noPhys.battle.battleLog || []).join('\n');
check('0 physical dealers: no Emerald Inferno fire', !/Deals \d+ Fire Damage/.test(infernoChunk(rawNoPhys, 3)), 'dealers=' + [noPhys.e0, noPhys.e1, noPhys.e2].map(getDealerType).join(',') + ' chunk=' + JSON.stringify(infernoChunk(rawNoPhys, 3).slice(0, 180)));

// ---- Extra: lowest troops targeting ----
const least = setup(() => 0, { e0Hp: 5000, e1Hp: 5000, e2Hp: 100 });
least.battle.start();
least.battle.runRound();
least.battle.runRound();
const rawLeast = (least.battle.battleLog || []).join('\n');
check('tactical hits least troops EnemyR', /Deals \d+ Tactical Damage to EnemyR/.test(rN(rawLeast, 2)), 'r2=' + (rN(rawLeast, 2).match(/Deals \d+ Tactical Damage to \w+/) || [])[0]);

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
