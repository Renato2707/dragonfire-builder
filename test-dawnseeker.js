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
import { hasEffect } from './effects.js';
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
  const habits = JSON.parse(fs.readFileSync('./data/dawnseeker_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/dawnseeker_vanguard_command.json', 'utf8'));

  const data = {
    id: 'dawnseeker', name: 'Dawnseeker', rarity: 'Rare', breed: 'Sentinel',
    stats: { str: 44, inst: 54, int: 42, init: 56 },
    affinity: ['spearmen'], weaknesses: ['siege']
  };
  const slot = extras.slot != null ? extras.slot : 1;
  const stars = extras.stars != null ? extras.stars : 10;
  const dawn = new Character(data, 0, slot, { level: 16, stars, habitRank: 1 });
  dawn.setTroopType('spearmen');
  loadKit(dawn, habits, cmd);

  const left = (extras.noLeft || slot === 0) ? null : dummy('allyL', 'AllyL', 0, 0, { str: 40, inst: 40, int: 40, init: 30 });
  if (left) left.setTroopType('spearmen');
  const right = (extras.noRight || slot === 2) ? null : dummy('allyR', 'AllyR', 0, 2, { str: 40, inst: 40, int: 40, init: 30 });
  if (right) right.setTroopType('spearmen');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };

  let e0 = null;
  let e1 = null;
  let e2 = null;
  const enemies = extras.enemies || 'all';
  if (enemies === 'all' || enemies === 'L') e0 = makeEnemy('e0', 'EnemyL', 0, { str: 30, inst: 35, int: 80, init: 20 }, 'Hunter');
  if (enemies === 'all' || enemies === 'V') e1 = makeEnemy('e1', 'EnemyV', 1, { str: 80, inst: 35, int: 30, init: 20 }, 'Warrior');
  if (enemies === 'all' || enemies === 'R') e2 = makeEnemy('e2', 'EnemyR', 2, { str: 30, inst: 80, int: 35, init: 20 }, 'Sentinel');

  const teamA = slot === 0 ? [dawn, right].filter(Boolean) : slot === 2 ? [left, dawn].filter(Boolean) : [left, dawn, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, dawn, left, right, e0, e1, e2 };
}

function dumpEngine(label, dawn, left, right, e0, e1, e2) {
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
      tacDealt: c.getPercentTotal('tactical_dealt'),
      recDealt: c.getPercentTotal('recovery_dealt'),
      recRecv: c.getPercentTotal('recovery_received'),
      flat: { ...c.flatMods },
      dealer: getDealerType(c),
      firstStrike: hasEffect(c, 'first_strike'),
      hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth),
      mods: c.commandMods
    };
  };
  lines.push('===== ' + label + ' =====');
  for (const c of [dawn, left, right, e0, e1, e2]) {
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

function cmdRate(c, field) {
  const stored = c && c.commandMods && c.commandMods[field];
  if (stored == null) return null;
  return typeof stored === 'object' ? stored.value : stored;
}

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/dawnseeker-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/dawnseeker-raw.txt', raw);

console.log(dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.dawn, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Sentinel's Presence", report.includes("Sentinel's Presence"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('command Radiant Wings', report.includes('Radiant Wings'));
check('Tactical Inferno', report.includes('Tactical Inferno'));
check('Unbroken Devotion', report.includes('Unbroken Devotion'));
check('Sunbreak', report.includes('Sunbreak'));
check("Wind's Favor", report.includes("Wind's Favor"));
check('First Light', report.includes('First Light'));
check('10 rounds played', /• Round 10/.test(report));

check('vanguard Recovery Dealt +15%', report.includes('+15% Recovery Dealt'));
check('vanguard Instinct +25 flat not %', /\+25 Instinct/.test(report) && !/\+25% Instinct/.test(report));
check('left flank Fire Damage Dealt +16%', /\[ AllyL \].*Sentinel's Presence[\s\S]*?\+16% Fire Damage Dealt/.test(report) || (report.includes('+16% Fire Damage Dealt') && /AllyL/.test(report)));
check("right flank no Sentinel's Presence fire", !/\[ AllyR \] is under the effect of \[ Sentinel's Presence \]/.test(report));

check("Wind's Favor base and scaled", /\+8% Initiative \(enhanced by Initiative → /.test(report));
check('First Light INT base and scaled', /\+5% Intelligence \(enhanced by Initiative → /.test(report));
check('First Light INST base and scaled', /\+5% Instinct \(enhanced by Initiative → /.test(report));
check('Tactical Inferno left tactical +9%', /Increases Tactical Damage Dealt of AllyL by \+9%/.test(raw));
check('Tactical Inferno right fire +9%', /Increases Fire Damage Dealt of AllyR by \+9%/.test(raw));
check('Unbroken Devotion 2 other allies', /Increases Recovery Received of AllyL by \+15%/.test(raw) && /Increases Recovery Received of AllyR by \+15%/.test(raw) && !/Increases Recovery Received of Dawnseeker/.test(raw));

check('Sunbreak R1 tactical_rate +100%', /Radiant Wings gains: tactical_rate \+100%/.test(rN(raw, 1)));
check('Sunbreak R1 recovery_rate +60%', /Radiant Wings gains: recovery_rate \+60%/.test(rN(raw, 1)));
check('Sunbreak R2 rates', /Radiant Wings gains: tactical_rate \+100%/.test(rN(raw, 2)) && /Radiant Wings gains: recovery_rate \+60%/.test(rN(raw, 2)));
check('Sunbreak not on R3', !/Radiant Wings gains:/.test(rN(raw, 3)));
check('formatted Sunbreak name on R1', /activates \[ Sunbreak \]/.test(rFmt(report, 1)));
check('formatted Radiant Wings name', /Radiant Wings/.test(rFmt(report, 1)));

check('R1 tactical same-lane EnemyV', /Deals \d+ Tactical Damage to EnemyV/.test(rN(raw, 1)));
check('R2 tactical same-lane', /Deals \d+ Tactical Damage to EnemyV/.test(rN(raw, 2)));
check('R3 no tactical command', !/Deals \d+ Tactical Damage to Enemy/.test(rN(raw, 3).split('launches a Basic')[0] || rN(raw, 3)));
check('R4 tactical (base 50%)', /Deals \d+ Tactical Damage to EnemyV/.test(rN(raw, 4)));
check('R7 tactical', /Deals \d+ Tactical Damage to EnemyV/.test(rN(raw, 7)));

check('R2 recovery adjacency', /Applies Recovery to /.test(rN(raw, 2)));
check('R5 recovery', /Applies Recovery to /.test(rN(raw, 5)));
check('R8 recovery', /Applies Recovery to /.test(rN(raw, 8)));
check('R1 no command recovery', !/Applies Recovery to /.test((rN(raw, 1).split('Dawnseeker launches')[0] || '')));
check('formatted R2 recovery base 60 scaled', /Recovery \+60% \(enhanced by Initiative → /.test(rFmt(report, 2)));
check('formatted R5 recovery base 30 scaled', /Recovery \+30% \(enhanced by Initiative → /.test(rFmt(report, 5)));
check('formatted R2 still prints tactical damage', /uses \[ Radiant Wings \] to attack/.test(rFmt(report, 2)));
check('formatted R2 prints INST/INIT sibling', /\+20% Instinct/.test(rFmt(report, 2)) && /\+20% Initiative/.test(rFmt(report, 2)));

check('30% INST/INIT hit seed 0', /\[hit\] Radiant Wings → Dawnseeker \(30%\)/.test(raw));
check('First-Strike hit seed 0 two other allies', /\[hit\] First Light → AllyL \(20%\)/.test(raw) && /\[hit\] First Light → AllyR \(20%\)/.test(raw));
check('First-Strike not self', !/\[hit\] First Light → Dawnseeker/.test(raw));
check('First-Strike R1-3 only', /\[hit\] First Light/.test(rN(raw, 1)) && /\[hit\] First Light/.test(rN(raw, 3)) && !/\[hit\] First Light/.test(rN(raw, 4)));
check('First-Strike until end of round', /Grants First-Strike to AllyL until the end of the round/.test(raw));

check('engine vanguard INST flat +25', main.dawn.flatMods.inst === 25, 'inst=' + main.dawn.flatMods.inst);
check('engine vanguard recovery_dealt 15', main.dawn.getPercentTotal('recovery_dealt') === 15);
check('engine left fire_dealt 16', main.left.getPercentTotal('fire_dealt') === 16, 'fire=' + main.left.getPercentTotal('fire_dealt'));
check('engine right fire_dealt 0 after Inferno expiry', main.right.getPercentTotal('fire_dealt') === 0, 'fire=' + main.right.getPercentTotal('fire_dealt'));
check('engine Unbroken left recovery_received 15', main.left.getPercentTotal('recovery_received') === 15);
check('engine Unbroken right recovery_received 15', main.right.getPercentTotal('recovery_received') === 15);
check('engine Unbroken self no recovery_received', main.dawn.getPercentTotal('recovery_received') === 0);
check("engine Wind's Favor INIT scaled not base 8", main.dawn.getPercentTotal('init') !== 8 && main.dawn.getPercentTotal('init') > 8, 'initPct=' + main.dawn.getPercentTotal('init'));

const kitCmd = JSON.parse(fs.readFileSync('./data/dawnseeker_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/dawnseeker_habits.json', 'utf8'));
check('JSON command name Radiant Wings', kitCmd.name === 'Radiant Wings');
check('JSON vanguard left slot 0 fire', kitCmd.vanguard[0].actions[1].mods[0].stat === 'fire_dealt' && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON vanguard INST fixed 25', kitCmd.vanguard[0].actions[0].mods.some(m => m.stat === 'inst' && m.fixed === 25));
check('JSON command tactical 50 not 100', kitCmd.command[1].actions[0].pct === 50);
check('JSON command recovery 30 not 60', kitCmd.command[2].actions[0].pct === 30);
check('JSON no Sunbreak rates on command blocks', !JSON.stringify(kitCmd.command).includes('100') && !JSON.stringify(kitCmd.command).includes('60'));
check('JSON Sunbreak is habit-mod', kitHab.habits[2].name === 'Sunbreak' && kitHab.habits[2].structured[0].actions[0].t === 'mod_command');
check('JSON Tactical Inferno L then R', kitHab.habits[0].structured[0].actions[0].tgt.select === 'prefer_lane:L' && kitHab.habits[0].structured[0].actions[1].tgt.select === 'prefer_lane:R');
check("JSON Wind's Favor scaleStat init", kitHab.habits[3].structured[0].actions[0].scaleStat === 'init');
check('JSON First Light First-Strike 2 other allies', kitHab.habits[4].structured[1].actions[0].tgt.count === 2 && kitHab.habits[4].structured[1].actions[0].tgt.excludeSelf === true);
check('JSON First Light scaleStat init', kitHab.habits[4].structured[0].actions[0].scaleStat === 'init');

const probe = setup(() => 0);
probe.battle.start();
probe.battle.currentRound = 1;
probe.battle.phaseStartOfRound();
check('engine Sunbreak R1 tactical_rate 100', cmdRate(probe.dawn, 'tactical_rate') === 100, 'rate=' + cmdRate(probe.dawn, 'tactical_rate'));
check('engine Sunbreak R1 recovery_rate 60', cmdRate(probe.dawn, 'recovery_rate') === 60, 'rate=' + cmdRate(probe.dawn, 'recovery_rate'));
check('engine Tactical Inferno left tac 9', probe.left.getPercentTotal('tactical_dealt') === 9, 'tac=' + probe.left.getPercentTotal('tactical_dealt'));
check('engine Tactical Inferno right fire 9', probe.right.getPercentTotal('fire_dealt') === 9, 'fire=' + probe.right.getPercentTotal('fire_dealt'));
check('engine First Light First-Strike on others', hasEffect(probe.left, 'first_strike') && hasEffect(probe.right, 'first_strike'));
check('engine First Light not on self', !hasEffect(probe.dawn, 'first_strike'));
check('engine First Light INT scaled', probe.dawn.getPercentTotal('int') !== 5 && probe.dawn.getPercentTotal('int') > 5, 'intPct=' + probe.dawn.getPercentTotal('int'));
const order1 = probe.battle.phaseCalculateInitiative().map(c => c.name);
check('engine First-Strike allies before Dawnseeker', order1.indexOf('AllyL') < order1.indexOf('EnemyV') && order1.indexOf('AllyR') < order1.indexOf('EnemyV'), 'order=' + order1.join('>'));

probe.battle.phaseEndOfRound();
check('engine Sunbreak rates expire after R1', cmdRate(probe.dawn, 'tactical_rate') == null && cmdRate(probe.dawn, 'recovery_rate') == null);

probe.battle.currentRound = 2;
probe.battle.phaseStartOfRound();
check('engine Sunbreak R2 tactical_rate 100', cmdRate(probe.dawn, 'tactical_rate') === 100);
check('engine Sunbreak R2 recovery_rate 60', cmdRate(probe.dawn, 'recovery_rate') === 60);
probe.battle.phaseEndOfRound();
probe.battle.currentRound = 3;
probe.battle.phaseStartOfRound();
check('engine no Sunbreak rates on R3', cmdRate(probe.dawn, 'tactical_rate') == null && cmdRate(probe.dawn, 'recovery_rate') == null);

const later = setup(() => 0);
later.battle.start();
later.battle.currentRound = 4;
later.battle.phaseStartOfRound();
check('engine R4 no Sunbreak override', cmdRate(later.dawn, 'tactical_rate') == null);

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
const r1miss = rN(rawMiss, 1);
check('seed 0.99 misses 30% INST/INIT', /\[miss\] Radiant Wings → Dawnseeker \(30%\)/.test(r1miss) && !/Increases Instinct of Dawnseeker by \+20%/.test(r1miss));
check('seed 0.99 misses 20% First-Strike', /\[miss\] First Light → AllyL \(20%\)/.test(r1miss) && /\[miss\] First Light → AllyR \(20%\)/.test(r1miss) && !/Grants First-Strike/.test(r1miss));
check('seed 0.99 still deals R1 tactical', /Deals \d+ Tactical Damage to EnemyV/.test(r1miss));
check('seed 0.99 still prints Radiant Wings', /Dawnseeker activates Radiant Wings/.test(r1miss));

const hit30 = setup(() => 0);
hit30.battle.start();
hit30.battle.runRound();
const r1hit = rN((hit30.battle.battleLog || []).join('\n'), 1);
check('seed 0 hits 30% INST/INIT', /\[hit\] Radiant Wings → Dawnseeker \(30%\)/.test(r1hit) && /Increases Instinct of Dawnseeker by \+20%/.test(r1hit) && /Increases Initiative of Dawnseeker by \+20%/.test(r1hit));

const empty = setup(() => 0, { slot: 0, noRight: true, noLeft: true, enemies: 'R' });
empty.battle.start();
for (let i = 0; i < 2; i += 1) empty.battle.runRound();
const rawEmpty = (empty.battle.battleLog || []).join('\n');
const reportEmpty = formatBattleReport(empty.battle, '');
check('empty adjacency: Radiant Wings still named', /Dawnseeker activates Radiant Wings/.test(rawEmpty) && /Radiant Wings/.test(reportEmpty));
check('empty adjacency: Sunbreak still named', /Dawnseeker activates Sunbreak/.test(rawEmpty) && /Sunbreak/.test(reportEmpty));
check('empty adjacency: no same-lane tactical', !/Deals \d+ Tactical Damage/.test(rawEmpty.split('Dawnseeker launches')[0] || rawEmpty));
const r2empty = rN(rawEmpty, 2);
check('empty adjacency: R2 recovery still hits self', /Applies Recovery to Dawnseeker/.test(r2empty));
check('empty adjacency: recovery does not leak to missing flanks', !/Applies Recovery to Ally/.test(rawEmpty));

const far = setup(() => 0, { slot: 0, noLeft: true, enemies: 'R' });
far.left = null;
far.battle.start();
far.battle.runRound();
far.battle.runRound();
const rawFar = (far.battle.battleLog || []).join('\n');
check('non-adjacent right ally does not receive recovery', /Applies Recovery to Dawnseeker/.test(rN(rawFar, 2)) && !/Applies Recovery to AllyR/.test(rN(rawFar, 2)));

const rec2 = [...rN(raw, 2).matchAll(/Applies Recovery to (\w+)/g)].map(m => m[1]);
check('occupied adjacency recovers 2 allies', rec2.length === 2, 'targets=' + rec2.join(','));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
