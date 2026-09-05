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
  const habits = JSON.parse(fs.readFileSync('./data/daemoros_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/daemoros_vanguard_command.json', 'utf8'));

  const data = {
    id: 'daemoros', name: 'Daemoros', rarity: 'Epic', breed: 'Warrior',
    stats: { str: 62, inst: 48, int: 41, init: 55 },
    affinity: ['archers'], weaknesses: []
  };
  const slot = extras.slot != null ? extras.slot : 1;
  const dae = new Character(data, 0, slot, { level: 16, stars: 10, habitRank: 1 });
  dae.setTroopType('archers');
  loadKit(dae, habits, cmd);

  const left = dummy('allyL', 'AllyL', 0, 0, { str: 40, inst: 40, int: 40, init: 30 });
  left.setTroopType('archers');
  const right = dummy('allyR', 'AllyR', 0, 2, { str: 40, inst: 40, int: 40, init: 30 });
  right.setTroopType('archers');

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

  const teamA = slot === 0 ? [dae, right] : slot === 2 ? [left, dae] : [left, dae, right];
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['archers', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, dae, left, right, e0, e1, e2 };
}

function dumpEngine(label, dae, left, right, e0, e1, e2) {
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
      physRecv: c.getPercentTotal('physical_received'),
      tacRecv: c.getPercentTotal('tactical_received'),
      fireRecv: c.getPercentTotal('fire_received'),
      flat: { ...c.flatMods },
      dealer: getDealerType(c),
      panic: hasEffect(c, 'panic'),
      burn: hasEffect(c, 'burn'),
      confusion: hasEffect(c, 'confusion'),
      hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth)
    };
  };
  lines.push('===== ' + label + ' =====');
  for (const c of [dae, left, right, e0, e1, e2]) {
    if (c) lines.push(JSON.stringify(snap(c)));
  }
  return lines.join('\n');
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

function r1chunk(raw) {
  return (raw.split('Start of Round 1')[1] || '').split('Start of Round 2')[0] || '';
}

function rN(raw, n) {
  return (raw.split('Start of Round ' + n)[1] || '').split('Start of Round ' + (n + 1))[0] || '';
}

// ---- Main 10-round fight, Math.random=0 (all chances hit; Veil picks first channel) ----
const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/daemoros-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/daemoros-raw.txt', raw);

console.log(dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.dae, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Warrior's Zeal", report.includes("Warrior's Zeal"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('command Shadowflame', report.includes('Shadowflame'));
check('Instill Fear', report.includes('Instill Fear'));
check('Powerful Reflexes', report.includes('Powerful Reflexes'));
check('Shroud of Shadows', report.includes('Shroud of Shadows'));
check('Darkening Fear', report.includes('Darkening Fear'));
check("Phantom's Veil", report.includes("Phantom's Veil"));

check('vanguard Physical Damage Dealt +16%', report.includes('+16% Physical Damage Dealt'));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank gets Warrior's Zeal flats", /\[ AllyL \].*Warrior's Zeal/.test(report));
check("right flank no Warrior's Zeal", !/\[ AllyR \] is under the effect of \[ Warrior's Zeal \]/.test(report));
check('Powerful Reflexes +16% Strength', report.includes('+16% Strength'));
check('Powerful Reflexes +16% Initiative', report.includes('+16% Initiative'));

check('Instill Fear 25% not 30%', /\[hit\] Instill Fear → EnemyR \(25%\)/.test(report) && !/\(30%\)/.test(report.split('Instill Fear').slice(1).join('Instill Fear').slice(0, 80) || ''));
check('Instill Fear right-flank prio', /\[hit\] Instill Fear → EnemyR \(25%\)/.test(raw));
check('Instill Fear INT base and scaled', /-25% Intelligence \(enhanced by Strength → /.test(report));
check('Instill Fear INST base and scaled', /-25% Instinct \(enhanced by Strength → /.test(report));
check('Instill Fear Panic tactical 2 rounds', /Panic \(Damage Rate: \+20%\) for 2 round\(s\)/.test(raw) && /Instill Fear/.test(raw));

check('Darkening Fear 25%', /\[hit\] Darkening Fear → EnemyL \(25%\)/.test(raw));
check('Darkening Fear left-flank prio', /\[hit\] Darkening Fear → EnemyL \(25%\)/.test(raw));
check('Darkening Fear INT enhanced', /Darkening Fear[\s\S]*?-25% Intelligence \(enhanced by Strength/.test(report) || /-25% Intelligence \(enhanced by Strength/.test(report));

check('Shadowflame odd rounds only', /activates Shadowflame/.test(rN(raw, 1)) && !/activates Shadowflame/.test(rN(raw, 2)) && /activates Shadowflame/.test(rN(raw, 3)));
check('Shadowflame physical 125 adjacency', /Deals \d+ Physical Damage to Enemy/.test(rN(raw, 1)));
check('Shadowflame Burn 20% on same target', /\[hit\] Shadowflame → EnemyL \(20%\)/.test(raw) && /Afflicts EnemyL with Burn \(Damage Rate: \+20%\) for 2 round\(s\)/.test(raw));
check('Shroud of Shadows 15% odd rounds', /\[hit\] Shroud of Shadows → Enemy/.test(rN(raw, 1)) && /\(15%\)/.test((raw.match(/\[hit\] Shroud of Shadows[^\n]*/) || [])[0] || ''));
check('Shroud Confusion 2 rounds', /Afflicts EnemyL with Confusion for 2 round\(s\)/.test(raw));
check("Phantom's Veil one channel physical at seed 0", /Reduces Physical Damage Received of Daemoros by -15% until the end of the round/.test(raw));
check("Phantom's Veil does not apply all three at once", !(/Reduces Physical Damage Received of Daemoros/.test(rN(raw, 1)) && /Reduces Tactical Damage Received of Daemoros/.test(rN(raw, 1))));
check('10 rounds played', /• Round 10/.test(report));

check('engine left flank INST flat +20', main.left.flatMods.inst === 20, 'inst=' + main.left.flatMods.inst);
check('engine left flank INIT flat +20', main.left.flatMods.init === 20, 'init=' + main.left.flatMods.init);
check('engine right flank no INST flat', main.right.flatMods.inst === 0, 'inst=' + main.right.flatMods.inst);
check('engine right flank no INIT flat', main.right.flatMods.init === 0);
check('engine Daemoros physical_dealt 16', main.dae.getPercentTotal('physical_dealt') === 16);
check('engine Powerful Reflexes STR 16', main.dae.getPercentTotal('str') === 16, 'strPct=' + main.dae.getPercentTotal('str'));
check('engine Powerful Reflexes INIT 16', main.dae.getPercentTotal('init') === 16, 'initPct=' + main.dae.getPercentTotal('init'));
check('engine Instill Fear on EnemyR INT shred', main.e2.getPercentTotal('int') < 0, 'intPct=' + main.e2.getPercentTotal('int'));
check('engine Instill Fear not on EnemyV INT', main.e1.getPercentTotal('int') === 0, 'intPct=' + main.e1.getPercentTotal('int'));
check('engine Darkening Fear on EnemyL INT shred', main.e0.getPercentTotal('int') < 0, 'intPct=' + main.e0.getPercentTotal('int'));
check('engine Panic on EnemyR (Instill)', hasEffect(main.e2, 'panic'));
check('engine Panic on EnemyL (Darkening)', hasEffect(main.e0, 'panic'));
check('engine Burn on Shadowflame target EnemyL', hasEffect(main.e0, 'burn'));
check("engine Phantom's Veil expired after round tick", main.dae.getPercentTotal('physical_received') === 0 && main.dae.getPercentTotal('tactical_received') === 0 && main.dae.getPercentTotal('fire_received') === 0, 'physRecv=' + main.dae.getPercentTotal('physical_received'));
const veilLive = setup(() => 0);
veilLive.battle.start();
veilLive.battle.currentRound = 1;
veilLive.battle.phaseStartOfRound();
check("engine Phantom's Veil physical_received -15 at round start", veilLive.dae.getPercentTotal('physical_received') === -15, 'physRecv=' + veilLive.dae.getPercentTotal('physical_received'));
check("engine Phantom's Veil only one channel at round start", veilLive.dae.getPercentTotal('tactical_received') === 0 && veilLive.dae.getPercentTotal('fire_received') === 0);
check('engine Instill scaled INT not base -25', main.e2.getPercentTotal('int') !== -25 && main.e2.getPercentTotal('int') < -25, 'intPct=' + main.e2.getPercentTotal('int'));

const kitCmd = JSON.parse(fs.readFileSync('./data/daemoros_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/daemoros_habits.json', 'utf8'));
check('JSON Instill table 25 not prose 30', kitHab.habits[0].structured[0].chance[0] === 25);
check('JSON vanguard left slot 0', kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON Shadowflame burn last_dmg', kitCmd.command[0].actions[1].tgt.select === 'last_dmg');
check('JSON Phantom pick random', kitHab.habits[4].structured[0].actions[0].pick === 'random');
check('JSON Darkening prefer left', kitHab.habits[3].structured[0].actions[0].tgt.select === 'prefer_lane:L');
check('JSON Instill prefer right', kitHab.habits[0].structured[0].actions[0].tgt.select === 'prefer_lane:R');

// ---- Seed 0.20: Instill 25% hits, Burn 20% misses, Confusion 15% misses ----
const mid = setup(() => 0.20);
mid.battle.start();
mid.battle.runRound();
const rawMid = (mid.battle.battleLog || []).join('\n');
const r1mid = r1chunk(rawMid);
check('seed 0.20 hits 25% Instill Fear', /\[hit\] Instill Fear → EnemyR \(25%\)/.test(r1mid) && /Afflicts EnemyR with Panic/.test(r1mid));
check('seed 0.20 misses 20% Shadowflame Burn', /\[miss\] Shadowflame/.test(r1mid) && !/Afflicts EnemyL with Burn/.test(r1mid));
check('seed 0.20 misses 15% Shroud Confusion', /\[miss\] Shroud of Shadows/.test(r1mid) && !/Afflicts .+ with Confusion/.test(r1mid));
check('seed 0.20 hits 25% Darkening Fear', /\[hit\] Darkening Fear → EnemyL \(25%\)/.test(r1mid));
check('seed 0.20 still deals Shadowflame physical', /Deals \d+ Physical Damage to Enemy/.test(r1mid));

// ---- Seed 0.30: Instill 25% misses ----
const miss = setup(() => 0.30);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
const r1miss = r1chunk(rawMiss);
check('seed 0.30 misses 25% Instill Fear', /\[miss\] Instill Fear/.test(r1miss) && !/Afflicts EnemyR with Panic/.test(r1miss));
check('seed 0.30 misses Darkening Fear', /\[miss\] Darkening Fear/.test(r1miss));

// ---- Phantom's Veil channel pick ----
function veilChannel(seed) {
  const s = setup(() => seed);
  s.battle.start();
  s.battle.runRound();
  const text = (s.battle.battleLog || []).join('\n');
  const phys = /Reduces Physical Damage Received of Daemoros/.test(text);
  const tac = /Reduces Tactical Damage Received of Daemoros/.test(text);
  const fire = /Reduces Fire Damage Received of Daemoros/.test(text);
  return { phys, tac, fire, count: [phys, tac, fire].filter(Boolean).length, physN: s.dae.getPercentTotal('physical_received'), tacN: s.dae.getPercentTotal('tactical_received'), fireN: s.dae.getPercentTotal('fire_received') };
}
const v0 = veilChannel(0);
const v34 = veilChannel(0.34);
const v70 = veilChannel(0.70);
check('Veil seed 0 physical only', v0.phys && !v0.tac && !v0.fire && v0.count === 1, JSON.stringify(v0));
check('Veil seed 0.34 tactical only', v34.tac && !v34.phys && !v34.fire && v34.count === 1, JSON.stringify(v34));
check('Veil seed 0.70 fire only', v70.fire && !v70.phys && !v70.tac && v70.count === 1, JSON.stringify(v70));

// ---- Adjacency occupied (vanguard vs 3) vs empty (left flank vs only right enemy) ----
const empty = setup(() => 0, { slot: 0, enemies: 'R' });
empty.battle.start();
empty.battle.runRound();
const rawEmpty = (empty.battle.battleLog || []).join('\n');
const sfChunk = (rawEmpty.split('activates Shadowflame')[1] || '').split('activates')[0];
check('empty adjacency: Shadowflame finds no target', /activates Shadowflame/.test(rawEmpty) && !/Deals \d+ Physical Damage/.test(sfChunk));
check('empty adjacency: no Shroud Confusion', !/Afflicts .+ with Confusion/.test(rawEmpty));
check('empty adjacency: no Burn', !/Afflicts .+ with Burn/.test(rawEmpty));
check('occupied adjacency: Shadowflame hits', /Deals \d+ Physical Damage to Enemy/.test(r1chunk(raw)));

// ---- Confusion retarget (engine implements; seed 0 always flips) ----
check('confusion retarget implemented', /mistakes Allies for Enemies \(Confusion\)/.test(raw) || /\[hit\] Confusion →/.test(raw), 'raw has confusion flip=' + /Confusion/.test(raw));
check('formatted Panic DoT ticks', /takes \d+ Tactical Damage from \[ Panic \]/.test(report));
check('formatted Burn DoT ticks', /takes \d+ Fire Damage from \[ Burn \]/.test(report));
check('formatted Confusion roll on EnemyL not AllyR', /\[ EnemyL \] \(Left Flank\):[\s\S]*?\[hit\] Confusion → EnemyL \(50%\)/.test(report));
check('formatted confusion BA hits own team', /\[ EnemyL \] uses \[ Basic Attack \] to attack \[ EnemyV \]/.test(report));
check('formatted no activates Confusion', !/activates \[ Confusion \]/.test(report));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
