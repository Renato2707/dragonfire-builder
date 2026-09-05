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
  const habits = JSON.parse(fs.readFileSync('./data/kalspire_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/kalspire_vanguard_command.json', 'utf8'));
  const data = {
    id: 'kalspire', name: 'Kalspire', rarity: 'Legendary', breed: 'Champion',
    stats: { str: 61, inst: 63, int: 41, init: 47 },
    affinity: ['cavalry', 'shieldbearers', 'siege'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const kal = new Character(data, 0, 1, { level: 16, stars, habitRank: 1 });
  kal.setTroopType('cavalry');
  loadKit(kal, habits, cmd);
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
  const teamA = [left, kal, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, { teamTroop: ['cavalry', 'spearmen'], defendingTeam: 1, verbose: false });
  return { battle, kal, left, right, e0, e1, e2 };
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
function baTargetOf(raw, n) {
  const m = rN(raw, n).match(/Kalspire launches a Basic Attack[\s\S]*?Deals \d+ \w+ Damage to (\w+)/);
  return m ? m[1] : null;
}
function afterBa(raw, n, skill) {
  const chunk = rN(raw, n);
  const start = chunk.indexOf('Kalspire activates ' + skill);
  return start < 0 ? '' : chunk.slice(start);
}

const kitCmd = JSON.parse(fs.readFileSync('./data/kalspire_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/kalspire_habits.json', 'utf8'));
check('JSON command name Tactical Strike', kitCmd.name === 'Tactical Strike');
check('JSON no Tactical Assault on command', !JSON.stringify(kitCmd.command).includes('panic') && !JSON.stringify(kitCmd.command).includes('physical'));
check('JSON vanguard flats 15', kitCmd.vanguard[0].actions[0].mods.every(m => m.fixed === 15));
check('JSON right flank -8%', kitCmd.vanguard[0].actions[1].mods[0].pct === -8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON tactical 50% last_basic', kitCmd.command[0].actions[0].dt === 'tactical' && kitCmd.command[0].actions[0].pct === 50 && kitCmd.command[0].actions[0].tgt.select === 'last_basic');
check('JSON bleed BA then other', kitCmd.command[0].actions[1].st === 'bleed' && kitCmd.command[0].actions[1].chance === 30 && kitCmd.command[0].actions[1].tgt.select === 'last_basic' && kitCmd.command[0].actions[2].tgt.excludeLastBasic === true);
check('JSON Battle Cunning -6.5', kitHab.habits[1].scaling[0].values[0] === -6.5 && kitHab.habits[1].structured[0].actions[0].scaleStat === 'inst');
check('JSON Tactical Assault excludeLastBasic', kitHab.habits[2].structured[0].requires.command === 'Tactical Strike' && kitHab.habits[2].structured[0].actions[0].tgt.excludeLastBasic === true);
check('JSON Panic 15% per target', kitHab.habits[2].structured[0].actions[1].st === 'panic' && kitHab.habits[2].structured[0].actions[1].chance[0] === 15 && kitHab.habits[2].structured[0].actions[2].st === 'panic');
check('JSON Radiant R1 stun R2 shred', kitHab.habits[4].structured[0].actions[1].st === 'stun' && kitHab.habits[4].structured[1].actions[0].tgt.select === 'highest:str' && kitHab.habits[4].structured[1].actions[0].excludeBasic === true);
check("vanguardNames Champion's Brilliance", VANGUARD_NAMES.kalspire === "Champion's Brilliance");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/kalspire-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/kalspire-raw.txt', raw);
console.log(report);

check("vanguard Champion's Brilliance", report.includes("Champion's Brilliance"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('command Tactical Strike', report.includes('Tactical Strike'));
check('habits named', report.includes('Robust Insight') && report.includes('Battle Cunning') && report.includes('Tactical Assault') && report.includes("Dragon's Insight") && report.includes('Radiant Conqueror'));
check('10 rounds', /• Round 10/.test(report));
check('vanguard +15 Strength not %', /\+15 Strength/.test(report) && !/\+15% Strength/.test(report.split("Champion's Brilliance")[1] || report));
check('right flank -8% DR', report.includes('-8% Damage Received'));
check('Battle Cunning base and scaled', /-6\.5% Strength \(enhanced by Instinct → /.test(report));
check('R1 Stun + cannot after Radiant', /Afflicts Kalspire with Stun/.test(rN(raw, 1)) && /Kalspire cannot act \(Stun\)/.test(rN(raw, 1)) && rFmt(report, 1).indexOf('Radiant Conqueror') < rFmt(report, 1).indexOf('cannot act (Stun)'));
check('R1 no BA/command', !/Kalspire launches a Basic Attack/.test(rN(raw, 1)) && !/Tactical Strike/.test((rN(raw, 1).split('Turn order')[1] || '')) && !/Tactical Assault/.test(rN(raw, 1)));
check('R2 can act', /Kalspire launches a Basic Attack/.test(rN(raw, 2)));
check('R2 dual shred', /Reduces Physical Damage Dealt \(excluding Basic Attacks\) of EnemyV by -10%/.test(rN(raw, 2)) && /Reduces Fire Damage Dealt of EnemyL by -10%/.test(rN(raw, 2)));
const ba2 = baTargetOf(raw, 2);
check('R2 tactical on BA', ba2 && new RegExp('Deals \\d+ Tactical Damage to ' + ba2).test(afterBa(raw, 2, 'Tactical Strike')), 'ba=' + ba2);
check('R2 Bleed on BA and 1 other', (rN(raw, 2).match(/Afflicts \w+ with Bleed/g) || []).length === 2);
check('R2 Assault physical not BA', ba2 && ((afterBa(raw, 2, 'Tactical Assault').match(/Deals \d+ Physical Damage to (\w+)/) || [])[1] !== ba2));
check('R2 Panic 15% two rolls', (rN(raw, 2).match(/\[hit\] Tactical Assault → \w+ \(15%\)/g) || []).length === 2);
check('Bleed/Panic DoT ticks', /from \[ Bleed \]/.test(report) && /from \[ Panic \]/.test(report));
check('engine vanguard flats', main.kal.flatMods.str === 15 && main.kal.flatMods.int === 15 && main.kal.flatMods.inst === 15);
check('engine right DR -8 left 0', main.right.getPercentTotal('dmg_received') === -8 && main.left.getPercentTotal('dmg_received') === 0);
check('engine Battle Cunning scaled', [main.e0, main.e1, main.e2].every(c => c.getPercentTotal('str') < -6.5));
check('engine shred expired after 10r', main.e1.getPercentTotal('physical_dealt') === 0 && main.e0.getPercentTotal('fire_dealt') === 0);

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
check('engine R1 Stun', hasEffect(r1.kal, 'stun'));
const r2 = setup(() => 0);
r2.battle.start();
r2.battle.runRound();
r2.battle.runRound();
check('engine R2 shred split', r2.e1.getPercentTotal('physical_dealt') === -10 && r2.e0.getPercentTotal('fire_dealt') === -10);

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 miss Bleed/Panic', /\[miss\] Tactical Strike → \w+ \(30%\)/.test(rawMiss) && !/Afflicts \w+ with Bleed/.test(rawMiss) && /\[miss\] Tactical Assault → \w+ \(15%\)/.test(rawMiss));
check('seed 0.99 still tactical+physical', /Deals \d+ Tactical Damage to \w+/.test(rN(rawMiss, 2)) && /Deals \d+ Physical Damage to \w+/.test(afterBa(rawMiss, 2, 'Tactical Assault')));

const emptyAdj = setup(() => 0, { e0: false, e2: false });
emptyAdj.battle.start();
emptyAdj.battle.runRound();
emptyAdj.battle.runRound();
const rawEmpty = (emptyAdj.battle.battleLog || []).join('\n');
check('empty adj Bleed only BA no Panic', (rN(rawEmpty, 2).match(/Afflicts \w+ with Bleed/g) || []).length === 1 && !/Afflicts \w+ with Panic/.test(rawEmpty));

const split = setup(() => 0, { e0Stats: { str: 20, inst: 20, int: 99, init: 20 }, e1Stats: { str: 99, inst: 20, int: 20, init: 20 }, e2Stats: { str: 40, inst: 20, int: 40, init: 20 } });
split.battle.start();
split.battle.runRound();
split.battle.runRound();
check('split highest STR vs INT', split.e1.getPercentTotal('physical_dealt') === -10 && split.e0.getPercentTotal('fire_dealt') === -10 && split.e0.getPercentTotal('physical_dealt') === 0);

const no6 = setup(() => 0, { stars: 5 });
no6.battle.start();
no6.battle.runRound();
no6.battle.runRound();
const rawNo6 = (no6.battle.battleLog || []).join('\n');
check('below 6 no Assault, below 10 no Radiant', !/Tactical Assault/.test(rawNo6) && !/Radiant Conqueror/.test(rawNo6) && /Tactical Strike/.test(rN(rawNo6, 2)));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
