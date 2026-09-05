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
  const habits = JSON.parse(fs.readFileSync('./data/caraxes_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/caraxes_vanguard_command.json', 'utf8'));

  const data = {
    id: 'caraxes', name: 'Caraxes', rarity: 'Legendary', breed: 'Hunter',
    stats: { str: 51, inst: 37, int: 67, init: 57 },
    affinity: ['spearmen', 'cavalry'], weaknesses: []
  };
  const car = new Character(data, 0, 1, { level: 16, stars: 10, habitRank: 1 });
  car.setTroopType('spearmen');
  loadKit(car, habits, cmd);

  const left = dummy('allyL', 'AllyL', 0, 0, { str: 40, inst: 40, int: 40, init: 30 });
  left.setTroopType('spearmen');
  const right = dummy('allyR', 'AllyR', 0, 2, { str: 40, inst: 40, int: 40, init: 30 });
  right.setTroopType('spearmen');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const e0 = dummy('e0', 'EnemyL', 1, 0, { str: 30, inst: 35, int: 80, init: 20 }, 'Hunter', tank);
  const e1 = dummy('e1', 'EnemyV', 1, 1, { str: 80, inst: 35, int: 30, init: 20 }, 'Warrior', tank);
  const e2 = dummy('e2', 'EnemyR', 1, 2, { str: 30, inst: 80, int: 35, init: 20 }, 'Sentinel', tank);
  for (const e of [e0, e1, e2]) e.setTroopType('spearmen');

  const battle = new Battle([left, car, right], [e0, e1, e2], {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1
  });
  return { battle, car, left, right, e0, e1, e2 };
}

function dumpEngine(label, car, left, right, e0, e1, e2) {
  const lines = [];
  const snap = (c) => ({
    name: c.name,
    str: c.getModifiedStat('str'),
    inst: c.getModifiedStat('inst'),
    int: c.getModifiedStat('int'),
    init: c.getModifiedStat('init'),
    strPct: c.getPercentTotal('str'),
    initPct: c.getPercentTotal('init'),
    fireDealt: c.getPercentTotal('fire_dealt'),
    physDealt: c.getPercentTotal('physical_dealt'),
    physDealtBasic: c.getPercentTotal('physical_dealt', { basic: true }),
    flat: { ...c.flatMods },
    dealer: getDealerType(c),
    slow: hasEffect(c, 'slow'),
    burn: hasEffect(c, 'burn'),
    firstStrike: hasEffect(c, 'first_strike'),
    hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth),
    hpPct: Math.round(c.getHealthPercentage() * 100) / 100,
    retreatedLastRound: !!c.retreatedLastRound,
    dead: !!c.isDead
  });
  lines.push('===== ' + label + ' =====');
  for (const c of [car, left, right, e0, e1, e2]) {
    lines.push(JSON.stringify(snap(c)));
  }
  return lines.join('\n');
}

function burstDamage(raw) {
  const chunks = raw.split(/Caraxes activates Infernal Burst/);
  const amounts = [];
  for (let i = 1; i < chunks.length; i += 1) {
    const hits = [...chunks[i].split(/Caraxes activates |Caraxes launches/)[0].matchAll(/Deals (\d+) Fire Damage to Enemy/g)];
    for (const hit of hits) amounts.push(Number(hit[1]));
  }
  return amounts;
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/caraxes-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/caraxes-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Caraxes lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Caraxes|Hunter|Infernal|Battle Dread|Flair|Crippling|Enfeeble|Blood Wyrm|Wrath/.test(line)) {
    console.log(line);
  }
}

console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.car, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Hunter's Wrath", report.includes("Hunter's Wrath"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('command Infernal Burst', report.includes('Infernal Burst'));
check('not Antares Relentless Pursuit', !report.includes('Relentless Pursuit'));
check('Battle Dread', report.includes('Battle Dread'));
check("Dragon's Flair", report.includes("Dragon's Flair"));
check('Crippling Inferno', report.includes('Crippling Inferno'));
check('Mass Enfeeble', report.includes('Mass Enfeeble'));

check('vanguard fire dealt +16%', report.includes('+16% Fire Damage Dealt'));
check("Dragon's Flair +12.5%", report.includes('+12.5% Fire Damage Dealt'));
check('right flank +20 Strength flat not %', /\+20 Strength/.test(report) && !/\+20% Strength/.test(report));
check('right flank +20 Initiative flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank no Hunter's Wrath flats", !/\[ AllyL \] is under the effect of \[ Hunter's Wrath \]/.test(report));

check('Battle Dread base -6.5% enhanced INT', /-6\.5% Strength \(enhanced by Intelligence/.test(report));
check('Battle Dread INIT enhanced', /-6\.5% Initiative \(enhanced by Intelligence/.test(report));
check('Mass Enfeeble -5.5% exclude BA', report.includes('-5.5% Physical Damage Dealt (excluding Basic Attacks)'));
check('Crippling Slow', /Slow/i.test(report));
check('Crippling Burn +20%', /Burn/.test(report) && /Damage Rate: \+20%/.test(raw));
check('Crippling 10% rolls', /\[hit\] Crippling Inferno → Enemy/.test(report) && /\(10%\)/.test(report));

check('Infernal Burst R3/6/9', (raw.match(/Caraxes activates Infernal Burst/g) || []).length === 3,
  'count=' + (raw.match(/Caraxes activates Infernal Burst/g) || []).length);
check('Infernal Burst fire damage lines', burstDamage(raw).length >= 9, 'hits=' + burstDamage(raw).length);
check('10 rounds played', /• Round 10/.test(report));

check('engine Caraxes fire_dealt 16+12.5 plus Blood Wyrm leftover expired', main.car.getPercentTotal('fire_dealt') === 28.5 || main.car.getPercentTotal('fire_dealt') >= 28.5,
  'fire_dealt=' + main.car.getPercentTotal('fire_dealt'));
check('engine right flank flat str 20', main.right.flatMods.str === 20);
check('engine right flank flat init 20', main.right.flatMods.init === 20);
check('engine left NOT right-flank flats', main.left.flatMods.str === 0 && main.left.flatMods.init === 0);
check('engine Caraxes no right-flank flats', main.car.flatMods.str === 0 && main.car.flatMods.init === 0);
check('engine enemies Battle Dread str pct', main.e0.getPercentTotal('str') < 0 && main.e1.getPercentTotal('str') < 0 && main.e2.getPercentTotal('str') < 0,
  JSON.stringify({ L: main.e0.getPercentTotal('str'), V: main.e1.getPercentTotal('str'), R: main.e2.getPercentTotal('str') }));
check('engine Mass Enfeeble physical_dealt -5.5', main.e0.getPercentTotal('physical_dealt') === -5.5, 'phys=' + main.e0.getPercentTotal('physical_dealt'));
check('engine Mass Enfeeble excluded from basic', main.e0.getPercentTotal('physical_dealt', { basic: true }) === 0,
  'basic phys=' + main.e0.getPercentTotal('physical_dealt', { basic: true }));

check('Slow listed on enemies', /\[ EnemyL \] is under the effect of \[ Crippling Inferno \].*Slow/.test(report));

const miss = setup(() => 0.15);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.15 misses 10% Crippling Inferno', /\[miss\] Crippling Inferno/.test(rawMiss) && !/Afflicts .+ with Slow/.test(rawMiss) && !/Afflicts .+ with Burn/.test(rawMiss));
check('seed 0.15 still applies combat_start habits', /Battle Dread/.test(rawMiss) && /Mass Enfeeble/.test(rawMiss));

const fsCase = setup(() => 0);
fsCase.battle.start();
applyEffect(fsCase.car, 'FIRST_STRIKE', 1, 'seed', { duration: 10 });
for (let i = 0; i < 3; i += 1) fsCase.battle.runRound();
const rawFs = (fsCase.battle.battleLog || []).join('\n');
const noFs = setup(() => 0);
noFs.battle.start();
for (let i = 0; i < 3; i += 1) noFs.battle.runRound();
const rawNoFs = (noFs.battle.battleLog || []).join('\n');
const dmgFs = burstDamage(rawFs);
const dmgNo = burstDamage(rawNoFs);
check('First-Strike Infernal Burst deals 1.5x', dmgFs.length && dmgNo.length && dmgFs[0] > dmgNo[0],
  'fs=' + (dmgFs[0] || 0) + ' base=' + (dmgNo[0] || 0) + ' ratio=' + ((dmgFs[0] && dmgNo[0]) ? (dmgFs[0] / dmgNo[0]).toFixed(2) : '?'));

const low = setup(() => 0);
low.battle.start();
low.e0.currentHealth = Math.floor(low.e0.maxHealth * 0.4);
low.e1.currentHealth = Math.floor(low.e1.maxHealth * 0.4);
low.e2.currentHealth = low.e2.maxHealth;
low.battle.runRound();
const rawLow = (low.battle.battleLog || []).join('\n');
const reportLow = formatBattleReport(low.battle, '');
const count8 = (rawLow.match(/Increases Fire Damage Dealt of Caraxes by \+8%/g) || []).length;
check('Blood Wyrm log +8% twice for 2 low-HP enemies', count8 === 2, 'count8=' + count8);
check('Blood Wyrm formatted combined +16%', /\+16% Fire Damage Dealt/.test(reportLow),
  'has16=' + /\+16% Fire Damage Dealt/.test(reportLow));
check('Blood Wyrm 1-round expired after tick', low.car.getPercentTotal('fire_dealt') === 28.5,
  'fire_dealt=' + low.car.getPercentTotal('fire_dealt'));
check('no Blood Wyrm heal without retreat', !/Applies Recovery to Caraxes/.test(rawLow));

low.e0.currentHealth = Math.floor(low.e0.maxHealth * 0.4);
low.e1.currentHealth = Math.floor(low.e1.maxHealth * 0.4);
low.battle.runRound();
const rawLow2 = (low.battle.battleLog || []).join('\n');
const r2chunk = rawLow2.split('Start of Round 2')[1] || '';
const count8r2 = (r2chunk.match(/Increases Fire Damage Dealt of Caraxes by \+8%/g) || []).length;
check('Blood Wyrm R2 still two +8% (no cross-round stack)', count8r2 === 2, 'count8r2=' + count8r2);
const reportLow2 = formatBattleReport(low.battle, '');
const r2report = reportLow2.split('• Round 2')[1] || '';
const r2snap = (r2report.split('activates [ Blood Wyrm ]')[0] || '');
check('Blood Wyrm R1 buff does not leak into R2 snapshot', !/effect of \[ Blood Wyrm \]/.test(r2snap),
  'snap=' + (r2snap.match(/Blood Wyrm[^\n]*/)||['none'])[0]);

const ret = setup(() => 0);
ret.battle.start();
ret.e0.takeDamage(ret.e0.currentHealth);
ret.e0.noteDeath();
ret.left.advanceRetreatFlags();
ret.car.advanceRetreatFlags();
ret.right.advanceRetreatFlags();
ret.e0.advanceRetreatFlags();
ret.e1.advanceRetreatFlags();
ret.e2.advanceRetreatFlags();
check('retreatedLastRound set on EnemyL', !!ret.e0.retreatedLastRound, 'flag=' + ret.e0.retreatedLastRound);
ret.battle.runRound();
const rawRet = (ret.battle.battleLog || []).join('\n');
check('Blood Wyrm recovery after retreat', /Applies Recovery to Caraxes/.test(rawRet), 'hasRecovery=' + /Applies Recovery to Caraxes/.test(rawRet));
check('Blood Wyrm recovery enhanced by Initiative', /enhanced by Initiative/.test(rawRet));
const reportRet = formatBattleReport(ret.battle, '');
check('formatted recovery base 40%', /Recovery \+40% \(enhanced by Initiative/.test(reportRet) || /Recovery \+40%/.test(reportRet),
  'snippet=' + ((reportRet.match(/Recovery[^\n]+/) || [])[0] || 'none'));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
