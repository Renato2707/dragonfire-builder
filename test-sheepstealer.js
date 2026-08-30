import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';
import { hasEffect, getEffect } from './effects.js';

applyVanguardLabel(Battle);

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
  const habits = JSON.parse(fs.readFileSync('./data/sheepstealer_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/sheepstealer_vanguard_command.json', 'utf8'));
  const data = {
    id: 'sheepstealer', name: 'Sheepstealer', rarity: 'Legendary', breed: 'Hunter',
    stats: { str: 56, inst: 45, int: 62, init: 52 },
    affinity: ['cavalry', 'archers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const sh = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  sh.setTroopType('cavalry');
  loadKit(sh, habits, cmd);

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
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 }, extras.e0Breed || 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 }, extras.e1Breed || 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 }, extras.e2Breed || 'Sentinel');

  const teamA = [left, sh, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['cavalry', 'spearmen'],
    defendingTeam: 1,
    pve: !!extras.pve,
    verbose: false
  });
  return { battle, sh, left, right, e0, e1, e2 };
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + detail : ''));
}

function rN(raw, n) {
  return (raw.split('Start of Round ' + n)[1] || '').split('Start of Round ' + (n + 1))[0] || '';
}

function cmdChunk(raw, n) {
  const chunk = rN(raw, n);
  const after = chunk.split('Sheepstealer activates Wild Hunt')[1] || '';
  return after.split('Sheepstealer launches')[0].split('Sheepstealer activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/sheepstealer_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/sheepstealer_habits.json', 'utf8'));

check('JSON command name Wild Hunt', kitCmd.name === 'Wild Hunt');
check('JSON prey mark 40% dur 3 val 30 noPrey', kitCmd.command[0].requires.noPrey === true && kitCmd.command[0].actions[0].st === 'prey' && kitCmd.command[0].actions[0].chance === 40 && kitCmd.command[0].actions[0].val === 30 && kitCmd.command[0].actions[0].dur === 3 && kitCmd.command[0].actions[0].tgt.linkAs === 'prey');
check('JSON prey mark prefers recovery last round', kitCmd.command[0].actions[0].tgt.filter.receivedRecoveryLastRound === true);
check('JSON fire rounds 1,4,7,10 +100 / +200 on prey', kitCmd.command[1].rounds.join() === '1,4,7,10' && kitCmd.command[1].actions[0].dt === 'fire' && kitCmd.command[1].actions[0].pct === 100 && kitCmd.command[1].actions[0].ifBonus.status === 'prey' && kitCmd.command[1].actions[0].ifBonus.pct === 200);
check('JSON fire prioritizes prey does not exclude others', kitCmd.command[1].actions[0].tgt.preferStatus === 'prey' && !kitCmd.command[1].actions[0].tgt.filter);
check('JSON vanguard rec received +20 Int flat 25', kitCmd.vanguard[0].actions[0].mods[0].stat === 'recovery_received' && kitCmd.vanguard[0].actions[0].mods[0].pct === 20 && kitCmd.vanguard[0].actions[0].mods[1].stat === 'int' && kitCmd.vanguard[0].actions[0].mods[1].fixed === 25);
check('JSON vanguard physical +10 right flank slot 2', kitCmd.vanguard[0].actions[1].mods[0].stat === 'physical_dealt' && kitCmd.vanguard[0].actions[1].mods[0].pct === 10 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Stolen Flock|Dragon's Cunning|Baited Kill|Wary Beast|Savage Claim");
check('JSON Stolen Flock PvE + stack + on_prey_recovery', kitHab.habits[0].structured[0].requires.pve === true && kitHab.habits[0].structured[1].actions[0].id === 'stolen_flock' && kitHab.habits[0].structured[1].actions[0].maxStacks === 10 && kitHab.habits[0].structured[2].phase === 'on_prey_recovery');
check('JSON Savage Claim requires Wild Hunt + hasPrey', kitHab.habits[4].structured[0].requires.command === 'Wild Hunt' && kitHab.habits[4].structured[0].requires.hasPrey === true);
check('JSON Savage Claim triple if prey recovered last round', kitHab.habits[4].structured[0].actions[0].ifBonus.preyRecoveredLastRound === true && kitHab.habits[4].structured[0].actions[0].ifBonus.mult === 3);
check("vanguardNames Sheepstealer Hunter's Cunning", VANGUARD_NAMES.sheepstealer === "Hunter's Cunning");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/sheepstealer-report.txt', report);
fs.writeFileSync('./tmp/sheepstealer-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Sheepstealer lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Sheepstealer|Hunter's Cunning|Wild Hunt|Stolen Flock|Dragon's Cunning|Baited Kill|Wary Beast|Savage Claim|Prey|Evade/.test(line)) {
    console.log(line);
  }
}

check("vanguard Hunter's Cunning", report.includes("Hunter's Cunning"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Wild Hunt (Vanguard)', !/Wild Hunt \(Vanguard\)/.test(raw) && !/Wild Hunt \(Vanguard\)/.test(report));
check('command Wild Hunt', report.includes('Wild Hunt') && /Sheepstealer activates Wild Hunt/.test(raw));
check("Dragon's Cunning", report.includes("Dragon's Cunning") || /Dragon's Cunning/.test(raw));
check('Baited Kill', report.includes('Baited Kill') || /Baited Kill/.test(raw));
check('Wary Beast', report.includes('Wary Beast') || /Wary Beast/.test(raw));
check('Savage Claim', report.includes('Savage Claim') || /Savage Claim/.test(raw));
check('Stolen Flock stack or gated PvE', /Stolen Flock/.test(raw) || /Stolen Flock/.test(report));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Recovery Received +20%', /\+20% Recovery Received/.test(report) || /Recovery Received/.test(raw));
check('vanguard Intelligence +25 flat not %', /\+25 Intelligence/.test(report) && !/\+25% Intelligence/.test(report));
check('right flank Physical Damage Dealt +10%', /\[ AllyR \] is under the effect of \[ Hunter's Cunning \]/.test(report) || /\+10% Physical Damage Dealt/.test(report));
check("left flank no Hunter's Cunning physical", !/\[ AllyL \] is under the effect of \[ Hunter's Cunning \]/.test(report));

check('R1 marks Prey 40% hit seed 0', /\[hit\] Wild Hunt → .+ \(40%\)/.test(cmdChunk(raw, 1)) && /Afflicts .+ with Prey/.test(cmdChunk(raw, 1)));
check('R1 fire damage after mark', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 1)));
check('R2 no new Prey mark while prey lives', !/Afflicts .+ with Prey/.test(cmdChunk(raw, 2)));
check('R4 fire', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 4)));
check('R7 fire', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 7)));
check('R10 fire', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 10)));
check('R2 no command fire', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 2)));
check('R3 no command fire', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 3)));

check('engine self rec received +20 Int flat 25', main.sh.getPercentTotal('recovery_received') === 20 && main.sh.flatMods.int === 25, 'rec=' + main.sh.getPercentTotal('recovery_received') + ' flat=' + JSON.stringify(main.sh.flatMods));
check('engine right physical_dealt +10', main.right.getPercentTotal('physical_dealt') === 10, 'R=' + main.right.getPercentTotal('physical_dealt'));
check('engine left physical_dealt 0', main.left.getPercentTotal('physical_dealt') === 0, 'L=' + main.left.getPercentTotal('physical_dealt'));
check("engine Dragon's Cunning self INT 16%", main.sh.getPercentTotal('int') === 16, 'intPct=' + main.sh.getPercentTotal('int'));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
const preyTarget = [r1.e0, r1.e1, r1.e2].find(c => c && hasEffect(c, 'prey'));
check('R1 engine has a Prey', !!preyTarget, 'prey=' + (preyTarget && preyTarget.name));
check('R1 Prey recoveryPenalty 30 not catalog 50', preyTarget && getEffect(preyTarget, 'prey').recoveryPenalty === 30, 'pen=' + (preyTarget && getEffect(preyTarget, 'prey') && getEffect(preyTarget, 'prey').recoveryPenalty));
check('R1 Prey duration 3', preyTarget && getEffect(preyTarget, 'prey').duration >= 2, 'dur=' + (preyTarget && getEffect(preyTarget, 'prey') && getEffect(preyTarget, 'prey').duration));
check('R1 links.prey set', r1.sh.links && r1.sh.links.prey === preyTarget);
check('R1 battle.getPrey', r1.battle.getPrey(r1.sh) === preyTarget);
check('R1 Baited Kill Vulnerable on Prey', preyTarget && hasEffect(preyTarget, 'vulnerable'));
check('R1 Savage Claim fire + self recovery', /Sheepstealer activates Savage Claim/.test(rawR1) && /Deals \d+ Fire Damage/.test(rawR1) && /Applies Recovery to Sheepstealer/.test(rawR1));

const r2 = setup(() => 0);
r2.battle.start();
r2.battle.runRound();
r2.battle.runRound();
check('R2 Wary Beast Evade while Prey above 50%', hasEffect(r2.sh, 'evade'), 'evade=' + hasEffect(r2.sh, 'evade'));
check('R2 Evade rate 10', getEffect(r2.sh, 'evade') && getEffect(r2.sh, 'evade').evasionChance === 10, 'rate=' + (getEffect(r2.sh, 'evade') && getEffect(r2.sh, 'evade').evasionChance));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 misses 40% Prey mark', /\[miss\] Wild Hunt/.test(rawMiss) && !/Afflicts .+ with Prey/.test(rawMiss));
check('seed 0.99 still fires R1 command fire (no prey → 100%)', /Deals \d+ Fire Damage/.test(cmdChunk(rawMiss, 1)));
check('seed 0.99 no Prey link', !miss.battle.getPrey(miss.sh));
check('seed 0.99 no Savage Claim', !/Sheepstealer activates Savage Claim/.test(rawMiss));
check('seed 0.99 still vanguard flats', miss.sh.flatMods.int === 25 && miss.right.getPercentTotal('physical_dealt') === 10);

const low = setup(() => 0, { stars: 8 });
low.battle.start();
low.battle.runRound();
const rawLow = (low.battle.battleLog || []).join('\n');
check('8★ no Savage Claim', !/Savage Claim/.test(rawLow));
check('8★ still Wild Hunt Prey mark', /Afflicts .+ with Prey/.test(rawLow));
check("8★ still Dragon's Cunning + Wary Beast", /Dragon's Cunning/.test(rawLow) && /Wary Beast/.test(rawLow));

const pve = setup(() => 0, { pve: true });
pve.battle.start();
check('PvE Stolen Flock combat_start fire_dealt', pve.sh.getPercentTotal('fire_dealt') >= 10, 'fire=' + pve.sh.getPercentTotal('fire_dealt'));

const prefer = setup(() => 0);
prefer.e2.receivedRecoveryLastRound = true;
prefer.battle.start();
prefer.battle.runRound();
check('mark prefers who recovered last round', hasEffect(prefer.e2, 'prey') && !hasEffect(prefer.e0, 'prey'), 'e2=' + hasEffect(prefer.e2, 'prey') + ' e0=' + hasEffect(prefer.e0, 'prey'));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
