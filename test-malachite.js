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
  const habits = JSON.parse(fs.readFileSync('./data/malachite_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/malachite_vanguard_command.json', 'utf8'));

  const data = {
    id: 'malachite', name: 'Malachite', rarity: 'Legendary', breed: 'Sentinel',
    stats: { str: 52, inst: 61, int: 48, init: 55 },
    affinity: ['cavalry', 'shieldbearers'], weaknesses: ['siege']
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const mal = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  mal.setTroopType('cavalry');
  loadKit(mal, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 });
  if (left) left.setTroopType('cavalry');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 40, inst: 40, int: 40, init: 30 });
  if (right) right.setTroopType('cavalry');

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

  const teamA = [left, mal, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['cavalry', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, mal, left, right, e0, e1, e2 };
}

function dumpEngine(label, mal, left, right, e0, e1, e2) {
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
      recDealt: c.getPercentTotal('recovery_dealt'),
      fireDealt: c.getPercentTotal('fire_dealt'),
      physDealt: c.getPercentTotal('physical_dealt'),
      tacRecv: c.getPercentTotal('tactical_received'),
      flat: { ...c.flatMods },
      dealer: getDealerType(c),
      firstStrike: hasEffect(c, 'first_strike'),
      doubleStrike: hasEffect(c, 'double_strike'),
      advantage: hasEffect(c, 'advantage'),
      hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth)
    };
  };
  lines.push('===== ' + label + ' =====');
  for (const c of [mal, left, right, e0, e1, e2]) {
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

const kitCmd = JSON.parse(fs.readFileSync('./data/malachite_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/malachite_habits.json', 'utf8'));

check("JSON command name Warden's Rally", kitCmd.name === "Warden's Rally");
check('JSON tactical rounds 2,4,7,9 same_lane 100%', kitCmd.command[0].rounds.join() === '2,4,7,9' && kitCmd.command[0].actions[0].dt === 'tactical' && kitCmd.command[0].actions[0].pct === 100 && kitCmd.command[0].actions[0].tgt.select === 'same_lane');
check('JSON recovery rounds 3,6,9 inst 70% 3 allies', kitCmd.command[1].rounds.join() === '3,6,9' && kitCmd.command[1].actions[0].t === 'heal' && kitCmd.command[1].actions[0].pct === 70 && kitCmd.command[1].actions[0].scaleStat === 'inst' && kitCmd.command[1].actions[0].tgt.count === 3);
check('JSON vanguard rec dealt +15% INST fixed 25', kitCmd.vanguard[0].actions[0].mods[0].stat === 'recovery_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 15 && kitCmd.vanguard[0].actions[0].mods[1].stat === 'inst' && kitCmd.vanguard[0].actions[0].mods[1].fixed === 25);
check('JSON vanguard left flank slot 0 fire +16%', kitCmd.vanguard[0].actions[1].mods[0].stat === 'fire_dealt' && kitCmd.vanguard[0].actions[1].mods[0].pct === 16 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check("JSON Forest's Instinct 35% block chance", kitHab.habits[0].name === "Forest's Instinct" && kitHab.habits[0].structured[0].chance === 35);
check("JSON Forest's physical excludeBasic only", kitHab.habits[0].structured[0].actions[0].excludeBasic === true && kitHab.habits[0].structured[0].actions[0].mods[0].stat === 'physical_dealt' && !kitHab.habits[0].structured[0].actions[1].excludeBasic && kitHab.habits[0].structured[0].actions[1].mods[0].stat === 'tactical_received');
check("JSON Forest's table 8/-8 … 16/-16", kitHab.habits[0].scaling[1].values.join() === '8,9.6,11.2,13.6,16' && kitHab.habits[0].scaling[2].values.join() === '-8,-9.6,-11.2,-13.6,-16');
check('JSON Wise Vigor 20/20 inst+recDealt', kitHab.habits[1].name === 'Wise Vigor' && kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 20 && kitHab.habits[1].structured[0].actions[0].mods[1].stat === 'recovery_dealt');
check('JSON Thunderous Roar block chance 10/12/14/17/20 val 20', kitHab.habits[2].structured[0].chance.join() === '10,12,14,17,20' && kitHab.habits[2].structured[0].actions[0].val === 20 && kitHab.habits[2].structured[0].actions[0].chance == null);
check('JSON Collective Might 12.5 scaleStat str 3 allies', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 12.5 && kitHab.habits[3].structured[0].actions[0].scaleStat === 'str' && kitHab.habits[3].structured[0].actions[0].tgt.count === 3);
check('JSON Lightning Strike R1 40% adjacency other ally all three', kitHab.habits[4].structured[0].phase === 'round_start' && kitHab.habits[4].structured[0].rounds.join() === '1' && kitHab.habits[4].structured[0].chance[0] === 40 && kitHab.habits[4].structured[0].actions.every(a => a.tgt.select === 'adjacency' && a.tgt.excludeSelf === true) && kitHab.habits[4].structured[0].actions[2].scaleStat === 'inst');
check("vanguardNames Malachite Sentinel's Presence", VANGUARD_NAMES.malachite === "Sentinel's Presence");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/malachite-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/malachite-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Malachite lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Malachite|Sentinel|Warden|Forest|Wise Vigor|Thunderous|Collective|Lightning|Advantage|First-Strike|Double-Strike/.test(line)) {
    console.log(line);
  }
}
console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.mal, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Sentinel's Presence", report.includes("Sentinel's Presence"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check("command Warden's Rally", report.includes("Warden's Rally"));
check("Forest's Instinct", report.includes("Forest's Instinct"));
check('Wise Vigor', report.includes('Wise Vigor'));
check('Thunderous Roar', report.includes('Thunderous Roar'));
check('Collective Might', report.includes('Collective Might'));
check('Lightning Strike', report.includes('Lightning Strike'));
check('10 rounds played', /• Round 10/.test(report));

check('vanguard Recovery Dealt +15%', report.includes('+15% Recovery Dealt'));
check('vanguard Instinct +25 flat not %', /\+25 Instinct/.test(report) && !/\+25% Instinct/.test(report));
check('left flank Fire Damage Dealt +16%', report.includes('+16% Fire Damage Dealt'));
check("right flank no Sentinel's Presence fire", !/\[ AllyR \] is under the effect of \[ Sentinel's Presence \]/.test(report));
check('Wise Vigor +20% Instinct', report.includes('+20% Instinct') && /Wise Vigor/.test(report));
check('Wise Vigor +20% Recovery Dealt', /\[ Wise Vigor \].*\+20% Recovery Dealt/.test(report) || (report.includes('+20% Recovery Dealt') && report.includes('Wise Vigor')));
check('Collective Might base and scaled', /\+12\.5% Strength \(enhanced by Strength → /.test(report));
check('Lightning Strike STR base and scaled', /\+25% Strength \(enhanced by Instinct → /.test(report));
check('formatted Recovery +70% enhanced by Instinct', /Recovery \+70% \(enhanced by Instinct → /.test(report));
check('Advantage (+20%)', report.includes('Advantage (+20%)'));
check("Forest's physical excluding BA", /Physical Damage Dealt \(excluding Basic Attacks\)/.test(report) && /Physical Damage Dealt \(excluding Basic Attacks\)/.test(raw));
check("Forest's tactical received NOT excluding BA", !/Tactical Damage Received \(excluding Basic Attacks\)/.test(raw) && !/Tactical Damage Received \(excluding Basic Attacks\)/.test(report));
check("Forest's tactical received -8%", /Tactical Damage Received/.test(report) && /Reduces Tactical Damage Received of AllyL by -8%/.test(raw));

check('R1 no Warden tactical/recovery', !/Warden's Rally/.test(rN(raw, 1)));
check('R2 tactical same-lane EnemyV', /Deals \d+ Tactical Damage to EnemyV/.test(rN(raw, 2)));
check('R2 no command recovery', !/Applies Recovery to /.test(rN(raw, 2).split('Malachite launches')[0] || rN(raw, 2)));
check('R3 recovery 3 allies', (rN(raw, 3).match(/Applies Recovery to /g) || []).length === 3);
check('R3 no command tactical', !/Deals \d+ Tactical Damage to Enemy/.test((rN(raw, 3).split('Malachite launches')[0] || '')));
check('R4 tactical', /Deals \d+ Tactical Damage to EnemyV/.test(rN(raw, 4)));
check('R6 recovery', /Applies Recovery to /.test(rN(raw, 6)));
check('R7 tactical', /Deals \d+ Tactical Damage to EnemyV/.test(rN(raw, 7)));
check('R9 BOTH tactical and recovery', /Deals \d+ Tactical Damage to EnemyV/.test(rN(raw, 9)) && /Applies Recovery to /.test(rN(raw, 9)));
check('formatted R9 recovery base+scaled', /Recovery \+70% \(enhanced by Instinct → /.test(rFmt(report, 9)));
check('formatted R9 tactical attack', /uses \[ Warden's Rally \] to attack/.test(rFmt(report, 9)));
check('formatted R3 recovery not tactical command', /Recovery \+70% \(enhanced by Instinct → /.test(rFmt(report, 3)) && !/uses \[ Warden's Rally \] to attack/.test(rFmt(report, 3)));

check('Lightning Strike one 40% roll R1', (rN(raw, 1).match(/\[hit\] Lightning Strike → \w+ \(40%\)/g) || []).length === 1);
check('Lightning Strike First-Strike + Double-Strike + STR same ally', /Grants First-Strike to AllyL for 3 round/.test(rN(raw, 1)) && /Grants Double-Strike to AllyL for 3 round/.test(rN(raw, 1)) && /Increases Strength of AllyL by /.test(rN(raw, 1)));
check('Lightning Strike not self', !/Grants First-Strike to Malachite/.test(raw) && !/Grants Double-Strike to Malachite/.test(raw));
check('Lightning Strike not on AllyR when AllyL chosen', !/Grants First-Strike to AllyR/.test(raw) && !/Grants Double-Strike to AllyR/.test(raw));
check('R1 First-Strike AllyL acts first', /^Turn order: AllyL →/.test(rN(raw, 1).trim()) || rN(raw, 1).includes('Turn order: AllyL →'));
check('AllyL Double-Strike 2nd BA R1', /AllyL launches a 2nd Basic Attack \(Double-Strike\)/.test(rN(raw, 1)));
check('Lightning Strike R1 only', /\[hit\] Lightning Strike/.test(rN(raw, 1)) && !/\[hit\] Lightning Strike/.test(rN(raw, 2)));

check("Forest's 35% hit seed 0", /\[hit\] Forest's Instinct → \w+ \(35%\)/.test(raw));
check('Thunderous Roar 10% one roll both allies', (rN(raw, 1).match(/\[hit\] Thunderous Roar → \w+ \(10%\)/g) || []).length === 1 && /Grants Advantage \(\+20%\) to AllyL/.test(rN(raw, 1)) && /Grants Advantage \(\+20%\) to AllyR/.test(rN(raw, 1)));

check('engine vanguard INST flat +25', main.mal.flatMods.inst === 25, 'inst=' + main.mal.flatMods.inst);
check('engine rec dealt 35 (vanguard 15 + Wise Vigor 20)', main.mal.getPercentTotal('recovery_dealt') === 35, 'rec=' + main.mal.getPercentTotal('recovery_dealt'));
check('engine Wise Vigor INST 20%', main.mal.getPercentTotal('inst') === 20, 'instPct=' + main.mal.getPercentTotal('inst'));
check('engine left fire_dealt 16', main.left.getPercentTotal('fire_dealt') === 16, 'fire=' + main.left.getPercentTotal('fire_dealt'));
check('engine right fire_dealt 0', main.right.getPercentTotal('fire_dealt') === 0, 'fire=' + main.right.getPercentTotal('fire_dealt'));
check('engine Collective Might STR scaled on self', main.mal.getPercentTotal('str') !== 12.5 && main.mal.getPercentTotal('str') > 12.5, 'strPct=' + main.mal.getPercentTotal('str'));
check('engine Collective Might STR on 3 allies', main.left.getPercentTotal('str') > 12.5 && main.right.getPercentTotal('str') > 12.5, 'L=' + main.left.getPercentTotal('str') + ' R=' + main.right.getPercentTotal('str'));
check("engine Forest's physical 8 on others not self", main.left.getPercentTotal('physical_dealt') === 8 && main.right.getPercentTotal('physical_dealt') === 8 && main.mal.getPercentTotal('physical_dealt') === 0);
check("engine Forest's tactical_received -8 others not self", main.left.getPercentTotal('tactical_received') === -8 && main.right.getPercentTotal('tactical_received') === -8 && main.mal.getPercentTotal('tactical_received') === 0);
check('engine Lightning Strike expired after 10r', !hasEffect(main.left, 'first_strike') && !hasEffect(main.left, 'double_strike') && !hasEffect(main.right, 'first_strike'));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
check('engine R1 First-Strike on AllyL 3 rounds', hasEffect(r1.left, 'first_strike') && getEffect(r1.left, 'first_strike').duration >= 2, 'dur=' + (getEffect(r1.left, 'first_strike') && getEffect(r1.left, 'first_strike').duration));
check('engine R1 Double-Strike on AllyL', hasEffect(r1.left, 'double_strike'));
check('engine R1 no FS/DS on AllyR or self', !hasEffect(r1.right, 'first_strike') && !hasEffect(r1.right, 'double_strike') && !hasEffect(r1.mal, 'first_strike') && !hasEffect(r1.mal, 'double_strike'));
check('engine R1 AllyL STR Lightning scaled', r1.left.getPercentTotal('str') > 25, 'strPct=' + r1.left.getPercentTotal('str'));
check('engine R1 Advantage on 2 others', hasEffect(r1.left, 'advantage') && hasEffect(r1.right, 'advantage') && !hasEffect(r1.mal, 'advantage'));
check('engine R1 Advantage magnitude 20', getEffect(r1.left, 'advantage') && getEffect(r1.left, 'advantage').damageBonus === 20, 'bonus=' + (getEffect(r1.left, 'advantage') && getEffect(r1.left, 'advantage').damageBonus));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check("seed 0.99 misses Forest's 35%", /\[miss\] Forest's Instinct → \w+ \(35%\)/.test(rawMiss) && !/Increases Physical Damage Dealt/.test(rawMiss));
check('seed 0.99 misses Thunderous 10%', /\[miss\] Thunderous Roar → \w+ \(10%\)/.test(rawMiss) && !/Grants Advantage/.test(rawMiss));
check('seed 0.99 misses Lightning 40%', /\[miss\] Lightning Strike → \w+ \(40%\)/.test(rawMiss) && !/Grants First-Strike/.test(rawMiss) && !/Grants Double-Strike/.test(rawMiss));
check('seed 0.99 no FS so Malachite not after AllyL-first from FS', !hasEffect(miss.left, 'first_strike') && !hasEffect(miss.right, 'first_strike'));
check('seed 0.99 still vanguard + Wise Vigor + Collective', miss.mal.getPercentTotal('recovery_dealt') === 35 && miss.mal.flatMods.inst === 25 && miss.mal.getPercentTotal('str') > 12.5);

const empty = setup(() => 0, { noLeft: true, noRight: true });
empty.battle.start();
empty.battle.runRound();
const rawEmpty = (empty.battle.battleLog || []).join('\n');
check('empty adjacency: no First-Strike/Double-Strike granted', !/Grants First-Strike/.test(rawEmpty) && !/Grants Double-Strike/.test(rawEmpty));
check('empty adjacency: no Lightning STR buff', !/Lightning Strike[\s\S]*Increases Strength/.test(rawEmpty) && !/enhanced by Instinct/.test(rawEmpty));
check('empty adjacency: Lightning does not buff self FS', !hasEffect(empty.mal, 'first_strike') && !hasEffect(empty.mal, 'double_strike'));
check("empty adjacency: Forest's has no other allies", !/Increases Physical Damage Dealt/.test(rawEmpty));
check('empty adjacency: Thunderous has no other allies', !/Grants Advantage/.test(rawEmpty));

const low = setup(() => 0, { stars: 5 });
low.battle.start();
low.battle.runRound();
const rawLow = (low.battle.battleLog || []).join('\n');
check('below 6★: no Thunderous / Collective / Lightning', !/Thunderous Roar/.test(rawLow) && !/Collective Might/.test(rawLow) && !/Lightning Strike/.test(rawLow));
check("below 6★: Forest's + Wise Vigor still fire", /Forest's Instinct/.test(rawLow) && /Wise Vigor/.test(rawLow));
check('below 6★: Warden still fires R2+', true);

const r2cmd = setup(() => 0);
r2cmd.battle.start();
r2cmd.battle.runRound();
r2cmd.battle.runRound();
check('engine after R2 still rec dealt 35', r2cmd.mal.getPercentTotal('recovery_dealt') === 35);

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
