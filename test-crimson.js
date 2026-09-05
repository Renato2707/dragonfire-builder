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
import { applyEffect, hasEffect } from './effects.js';
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

function setup(randomFn) {
  Math.random = randomFn;
  const habits = JSON.parse(fs.readFileSync('./data/crimson_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/crimson_vanguard_command.json', 'utf8'));

  const data = {
    id: 'crimson', name: 'Crimson', rarity: 'Legendary', breed: 'Hunter',
    stats: { str: 55, inst: 51, int: 63, init: 50 },
    affinity: ['spearmen', 'archers', 'siege'], weaknesses: []
  };
  const cr = new Character(data, 0, 1, { level: 16, stars: 10, habitRank: 1 });
  cr.setTroopType('spearmen');
  loadKit(cr, habits, cmd);

  const left = dummy('allyL', 'AllyL', 0, 0, { str: 40, inst: 40, int: 40, init: 30 });
  left.setTroopType('spearmen');
  const right = dummy('allyR', 'AllyR', 0, 2, { str: 40, inst: 40, int: 40, init: 30 });
  right.setTroopType('spearmen');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const e0 = dummy('e0', 'EnemyL', 1, 0, { str: 30, inst: 35, int: 80, init: 20 }, 'Hunter', tank);
  const e1 = dummy('e1', 'EnemyV', 1, 1, { str: 80, inst: 35, int: 30, init: 20 }, 'Warrior', tank);
  const e2 = dummy('e2', 'EnemyR', 1, 2, { str: 30, inst: 80, int: 35, init: 20 }, 'Sentinel', tank);
  for (const e of [e0, e1, e2]) e.setTroopType('spearmen');

  const battle = new Battle([left, cr, right], [e0, e1, e2], {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1
  });
  return { battle, cr, left, right, e0, e1, e2 };
}

function dumpEngine(label, cr, left, right, e0, e1, e2) {
  const lines = [];
  const snap = (c) => ({
    name: c.name,
    str: c.getModifiedStat('str'),
    inst: c.getModifiedStat('inst'),
    int: c.getModifiedStat('int'),
    init: c.getModifiedStat('init'),
    intPct: c.getPercentTotal('int'),
    recRecv: c.getPercentTotal('recovery_received'),
    physDealt: c.getPercentTotal('physical_dealt'),
    tacDealt: c.getPercentTotal('tactical_dealt'),
    dmgRecv: c.getPercentTotal('dmg_received'),
    physRecv: c.getPercentTotal('physical_received'),
    physRecvBA: c.getPercentTotal('physical_received', { basic: true }),
    fireRecv: c.getPercentTotal('fire_received'),
    recRecvPct: c.getPercentTotal('recovery_received'),
    instPct: c.getPercentTotal('inst'),
    initPct: c.getPercentTotal('init'),
    flat: { ...c.flatMods },
    dealer: getDealerType(c),
    stun: hasEffect(c, 'stun'),
    weakened: hasEffect(c, 'weakened'),
    damagePenalty: c.damagePenalty,
    hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth),
    hpPct: Math.round(c.getHealthPercentage() * 100) / 100
  });
  lines.push('===== ' + label + ' =====');
  for (const c of [cr, left, right, e0, e1, e2]) lines.push(JSON.stringify(snap(c)));
  return lines.join('\n');
}

function terrorFire(raw) {
  const chunks = raw.split(/Crimson activates Bloodscale Terror/);
  const amounts = [];
  for (let i = 1; i < chunks.length; i += 1) {
    const hits = [...chunks[i].split(/Crimson activates |Crimson launches/)[0].matchAll(/Deals (\d+) Fire Damage to Enemy/g)];
    for (const hit of hits) amounts.push(Number(hit[1]));
  }
  return amounts;
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

// ---- Main 10-round fight, Math.random=0 (all chances hit) ----
const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/crimson-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/crimson-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Crimson lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Crimson|Hunter|Bloodscale|Enervate|Intellect|Fury|Unlikely|Vermin|Stun|Weakened/.test(line)) {
    console.log(line);
  }
}
console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.cr, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Hunter's Cunning", report.includes("Hunter's Cunning"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('command Bloodscale Terror', report.includes('Bloodscale Terror'));
check('Enervate', report.includes('Enervate'));
check("Dragon's Intellect", report.includes("Dragon's Intellect"));
check('Bloodscale Fury', report.includes('Bloodscale Fury'));
check('Unlikely Hero', report.includes('Unlikely Hero'));
check("Vermin's Bane", report.includes("Vermin's Bane"));

check('vanguard INT +25 flat not %', /\+25 Intelligence/.test(report) && !/\+25% Intelligence/.test(report));
check('vanguard Recovery Received +20%', report.includes('+20% Recovery Received'));
check('right flank +10% Physical Damage Dealt', /\[ AllyR \].*Hunter's Cunning/.test(report) && report.includes('+10% Physical Damage Dealt'));
check("left flank no Hunter's Cunning phys", !/\[ AllyL \] is under the effect of \[ Hunter's Cunning \]/.test(report));
check("Dragon's Intellect +12% Intelligence", report.includes('+12% Intelligence'));
check("Dragon's Intellect -6% Damage Received", report.includes('-6% Damage Received'));
check('Enervate -13.5% Tactical Dealt on EnemyR', /\[ EnemyR \].*Enervate.*-13\.5% Tactical Damage Dealt/.test(report)
  || (report.includes('-13.5% Tactical Damage Dealt') && report.includes('Enervate')));
check('Unlikely Hero activation is +10% not +30%', /activates \[ Unlikely Hero \]/.test(report) && report.includes('+10% Physical Damage Received (excluding Basic Attacks)') && !/\+30% Physical Damage Received/.test(report));
check('Unlikely Hero fire received +10%', report.includes('+10% Fire Damage Received') && !/\+30% Fire Damage Received/.test(report));
check('Bloodscale Fury Weakened -20%', /Weakened \(-20%\)/.test(report));
check('Bloodscale Fury 17.5% not 18%', /\(17\.5%\)/.test(report) && !/\(18%\)/.test(report));
check("Vermin's Bane base -12% enhanced INT", /-12% Instinct \(enhanced by Intelligence/.test(report));
check("Vermin's Bane INIT enhanced", /-12% Initiative \(enhanced by Intelligence/.test(report));
check("Vermin's Bane R1 Stun Chance +40%", /Stun Chance \+40%/.test(report));
check('R1 stun roll 40%', /\[hit\] Bloodscale Terror → EnemyL \(40%\)/.test(report));
check('later odd stun roll 20%', /\[hit\] Bloodscale Terror → EnemyL \(20%\)/.test(report));
check('R5 stun not hidden by fire damage', /• Round 5[\s\S]*?activates \[ Bloodscale Terror \] affecting[\s\S]*?Stun for 2 round\(s\)/.test(report));
check('10 rounds played', /• Round 10/.test(report));

const fireHits = terrorFire(raw);
check('Bloodscale Terror fire on R2/5/8', fireHits.length === 3, 'hits=' + fireHits.length);

check('engine Crimson flat INT 25', main.cr.flatMods.int === 25);
check('engine Crimson recovery_received 20', main.cr.getPercentTotal('recovery_received') === 20);
check("engine Dragon's Intellect int pct 12", main.cr.getPercentTotal('int') === 12, 'intPct=' + main.cr.getPercentTotal('int'));
check("engine Dragon's Intellect dmg_received -6", main.cr.getPercentTotal('dmg_received') === -6);
check('engine right flank physical_dealt 10', main.right.getPercentTotal('physical_dealt') === 10);
check('engine left NOT right-flank phys', main.left.getPercentTotal('physical_dealt') === 0);
check('engine Crimson no physical_dealt from vanguard', main.cr.getPercentTotal('physical_dealt') === 0);
check('engine Enervate EnemyR tactical_dealt -13.5', main.e2.getPercentTotal('tactical_dealt') === -13.5, 'tac=' + main.e2.getPercentTotal('tactical_dealt'));
check('engine Enervate not on fire dealer EnemyL', main.e0.getPercentTotal('tactical_dealt') === 0);
check('engine Enervate not on physical dealer EnemyV', main.e1.getPercentTotal('tactical_dealt') === 0);
check('engine Weakened on EnemyV', hasEffect(main.e1, 'weakened') && main.e1.damagePenalty === 20,
  'weakened=' + hasEffect(main.e1, 'weakened') + ' penalty=' + main.e1.damagePenalty);
check("engine Vermin's Bane INST shred on highest INST EnemyR", main.e2.getPercentTotal('inst') < 0, 'instPct=' + main.e2.getPercentTotal('inst'));
check('engine no INST shred on EnemyL/V', main.e0.getPercentTotal('inst') === 0 && main.e1.getPercentTotal('inst') === 0);
check('engine dealer types fire/phys/tac', getDealerType(main.e0) === 'fire' && getDealerType(main.e1) === 'physical' && getDealerType(main.e2) === 'tactical',
  JSON.stringify({ L: getDealerType(main.e0), V: getDealerType(main.e1), R: getDealerType(main.e2) }));
check('no Vermin even-round shred duplicated on command JSON', !JSON.stringify(JSON.parse(fs.readFileSync('./data/crimson_vanguard_command.json', 'utf8')).command).includes('highest_inst'));

// ---- Seed 0.20 misses 17.5% Fury; R1 40% stun still hits; other-odd 20% stun misses ----
const miss = setup(() => 0.20);
miss.battle.start();
miss.battle.runRound();
const rawMissR1 = (miss.battle.battleLog || []).join('\n');
check('seed 0.20 misses 17.5% Bloodscale Fury', /\[miss\] Bloodscale Fury/.test(rawMissR1) && !/Afflicts .+ with Weakened/.test(rawMissR1));
check('seed 0.20 still hits R1 40% stun', /\[hit\] Bloodscale Terror → EnemyL \(40%\)/.test(rawMissR1) && /Afflicts EnemyL with Stun/.test(rawMissR1));
miss.battle.runRound();
miss.battle.runRound();
const rawMissR3 = (miss.battle.battleLog || []).join('\n');
const r3chunk = rawMissR3.split('Start of Round 3')[1] || '';
check('seed 0.20 misses 20% stun on R3', /\[miss\] Bloodscale Terror/.test(r3chunk) && !/Afflicts EnemyL with Stun/.test(r3chunk.split('Start of Round 4')[0] || r3chunk));

// ---- Taunt doubles Bloodscale Fury chance to 35% ----
const taunt = setup(() => 0.20);
taunt.battle.start();
applyEffect(taunt.e1, 'TAUNT', 1, 'seed', { duration: 10 });
taunt.battle.runRound();
const rawTaunt = (taunt.battle.battleLog || []).join('\n');
check('Taunt doubles Fury to 35% and hits at seed 0.20', /\[hit\] Bloodscale Fury → EnemyV \(35%\)/.test(rawTaunt) && /Afflicts EnemyV with Weakened/.test(rawTaunt),
  'snippet=' + ((rawTaunt.match(/\[(hit|miss)\] Bloodscale Fury[^\n]*/ ) || [])[0] || 'none'));

// ---- Unlikely Hero HP bands: >75 phys/fire, <25 recovery, mid none ----
const bands = setup(() => 0);
bands.battle.start();
bands.e0.currentHealth = Math.floor(bands.e0.maxHealth * 0.9);
bands.e1.currentHealth = Math.floor(bands.e1.maxHealth * 0.2);
bands.e2.currentHealth = Math.floor(bands.e2.maxHealth * 0.5);
bands.battle.runRound();
const rawBands = (bands.battle.battleLog || []).join('\n');
const r1bands = (rawBands.split('Start of Round 1')[1] || '').split('Start of Round 2')[0] || '';
check('Unlikely Hero >75% gets phys received excl BA', /Increases Physical Damage Received \(excluding Basic Attacks\) of EnemyL by \+10%/.test(r1bands));
check('Unlikely Hero >75% gets fire received', /Increases Fire Damage Received of EnemyL by \+10%/.test(r1bands));
check('Unlikely Hero <25% gets recovery received -20%', /Reduces Recovery Received of EnemyV by -20%/.test(r1bands));
check('Unlikely Hero mid-HP gets neither band', !/of EnemyR by \+10%/.test(r1bands) && !/Recovery Received of EnemyR/.test(r1bands));
check('Unlikely Hero >75% does not get recovery shred', !/Recovery Received of EnemyL/.test(r1bands));
check('Unlikely Hero <25% does not get phys/fire received', !/Physical Damage Received \(excluding Basic Attacks\) of EnemyV/.test(r1bands) && !/Fire Damage Received of EnemyV/.test(r1bands));
const reportBands = formatBattleReport(bands.battle, '');
check('formatted Unlikely Hero recovery -20%', reportBands.includes('-20% Recovery Received'));
check('formatted Unlikely Hero still +10% not summed', reportBands.includes('+10% Physical Damage Received (excluding Basic Attacks)') && !/\+20% Physical Damage Received/.test(reportBands) && !/\+30% Physical Damage Received/.test(reportBands));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
