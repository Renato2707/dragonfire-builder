import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';
import { applyEffect, hasEffect } from './effects.js';

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
  const habits = JSON.parse(fs.readFileSync('./data/shimmer_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/shimmer_vanguard_command.json', 'utf8'));
  const data = {
    id: 'shimmer', name: 'Shimmer', rarity: 'Rare', breed: 'Sentinel',
    stats: { str: 47, inst: 60, int: 45, init: 42 },
    affinity: ['cavalry', 'siege'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const sh = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  sh.setTroopType('cavalry');
  loadKit(sh, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 30, inst: 40, int: 40, init: 30 });
  if (left) left.setTroopType('cavalry');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 80, inst: 40, int: 40, init: 30 });
  if (right) right.setTroopType('cavalry');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 }, 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 }, 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 }, 'Sentinel');

  const battle = new Battle([left, sh, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['cavalry', 'spearmen'],
    defendingTeam: 1,
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
  const after = chunk.split('Shimmer activates Unbreakable Loyalty')[1] || '';
  return after.split('Shimmer launches')[0].split('Shimmer activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/shimmer_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/shimmer_habits.json', 'utf8'));

check('JSON command Unbreakable Loyalty', kitCmd.name === 'Unbreakable Loyalty');
check('JSON command 30% STR+18 INIT+9 highest str other ally', kitCmd.command[0].actions[0].chance === 30 && kitCmd.command[0].actions[0].mods[0].stat === 'str' && kitCmd.command[0].actions[0].mods[0].pct === 18 && kitCmd.command[0].actions[0].mods[1].stat === 'init' && kitCmd.command[0].actions[0].mods[1].pct === 9 && kitCmd.command[0].actions[0].scaleStat === 'inst' && kitCmd.command[0].actions[0].dur === 2 && kitCmd.command[0].actions[0].tgt.excludeSelf === true && /highest/.test(String(kitCmd.command[0].actions[0].tgt.select)));
check('JSON tactical R2,4,7,9 +50 adj 2', kitCmd.command[1].rounds.join() === '2,4,7,9' && kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 50 && kitCmd.command[1].actions[0].tgt.count === 2 && kitCmd.command[1].actions[0].tgt.select === 'adjacency');
check('JSON vanguard rec dealt +15 INST flat 25', kitCmd.vanguard[0].actions[0].mods[0].stat === 'recovery_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 15 && kitCmd.vanguard[0].actions[0].mods[1].stat === 'inst' && kitCmd.vanguard[0].actions[0].mods[1].fixed === 25);
check('JSON vanguard fire +16 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].stat === 'fire_dealt' && kitCmd.vanguard[0].actions[1].mods[0].pct === 16 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Crushing Force|Dragon's Insight|Loyal Shield|Unbroken Devotion|Sneak Attack");
check('JSON Crushing Force physical is Left Flank slot 0', kitHab.habits[0].structured[0].rounds.join() === '1' && kitHab.habits[0].structured[0].actions[0].mods[0].stat === 'physical_dealt' && kitHab.habits[0].structured[0].actions[0].tgt.slot === 0);
check('JSON Crushing Force tactical prefers Right Flank', kitHab.habits[0].structured[0].actions[1].mods[0].stat === 'tactical_dealt' && kitHab.habits[0].structured[0].actions[1].tgt.select === 'prefer_lane:R');
check("JSON Dragon's Insight -4 recv +5 inst combat", kitHab.habits[1].structured[0].phase === 'combat_start' && kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === -4 && kitHab.habits[1].structured[0].actions[0].mods[1].pct[0] === 5);
check('JSON Loyal Shield requires Unbreakable Loyalty R2,4,7,9 resist x2', kitHab.habits[2].structured[0].requires.command === 'Unbreakable Loyalty' && kitHab.habits[2].structured[0].rounds.join() === '2,4,7,9' && kitHab.habits[2].structured[0].actions[0].ifBonus.status === 'resistance' && kitHab.habits[2].structured[0].actions[0].ifBonus.mult === 2 && kitHab.habits[2].structured[0].actions[0].ifBonus.on === 'target');
check('JSON Unbroken Devotion rec received +15 other allies', kitHab.habits[3].structured[0].actions[0].mods[0].stat === 'recovery_received' && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 15 && kitHab.habits[3].structured[0].actions[0].tgt.excludeSelf === true && kitHab.habits[3].structured[0].actions[0].tgt.count === 2);
check('JSON Sneak Attack 14% highest str other ally first-strike', kitHab.habits[4].structured[0].chance[0] === 14 && kitHab.habits[4].structured[0].actions[1].st === 'first_strike' && kitHab.habits[4].structured[0].actions[0].tgt.excludeSelf === true && /highest/.test(String(kitHab.habits[4].structured[0].actions[0].tgt.select)));
check("vanguardNames Shimmer Sentinel's Presence", VANGUARD_NAMES.shimmer === "Sentinel's Presence");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/shimmer-report.txt', report);
fs.writeFileSync('./tmp/shimmer-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Shimmer lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Shimmer|Sentinel's Presence|Unbreakable Loyalty|Crushing Force|Dragon's Insight|Loyal Shield|Unbroken Devotion|Sneak Attack|First-Strike|Resistance/.test(line)) {
    console.log(line);
  }
}

check("vanguard Sentinel's Presence", report.includes("Sentinel's Presence"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Unbreakable Loyalty (Vanguard)', !/Unbreakable Loyalty \(Vanguard\)/.test(raw) && !/Unbreakable Loyalty \(Vanguard\)/.test(report));
check('command Unbreakable Loyalty', report.includes('Unbreakable Loyalty') && /Shimmer activates Unbreakable Loyalty/.test(raw));
check('Crushing Force', report.includes('Crushing Force') || /Crushing Force/.test(raw));
check("Dragon's Insight", report.includes("Dragon's Insight") || /Dragon's Insight/.test(raw));
check('Loyal Shield', report.includes('Loyal Shield') || /Loyal Shield/.test(raw));
check('Unbroken Devotion', report.includes('Unbroken Devotion') || /Unbroken Devotion/.test(raw));
check('Sneak Attack', report.includes('Sneak Attack') || /Sneak Attack/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Recovery Dealt +15%', /\+15% Recovery Dealt/.test(report));
check('vanguard Instinct +25 flat not %', /\+25 Instinct/.test(report) && !/\+25% Instinct/.test(report));
check('left flank Fire Damage Dealt +16%', /\+16% Fire Damage Dealt/.test(report));
check("right flank no Sentinel's Presence fire", !/\[ AllyR \] is under the effect of \[ Sentinel's Presence \]/.test(report));

check('R1 no command tactical', !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 1)));
check('R2 command tactical 2 adj', (cmdChunk(raw, 2).match(/Deals \d+ Tactical Damage/g) || []).length === 2, 'hits=' + ((cmdChunk(raw, 2).match(/Deals \d+ Tactical Damage/g) || []).length));
check('R3 no command tactical', (cmdChunk(raw, 3).match(/Deals \d+ Tactical Damage/g) || []).length === 0);
check('R4 command tactical', (cmdChunk(raw, 4).match(/Deals \d+ Tactical Damage/g) || []).length === 2);
check('R7 command tactical', (cmdChunk(raw, 7).match(/Deals \d+ Tactical Damage/g) || []).length === 2);
check('R9 command tactical', (cmdChunk(raw, 9).match(/Deals \d+ Tactical Damage/g) || []).length === 2);
check('R2 Loyal Shield recovery', /Applies Recovery to /.test(rN(raw, 2)) || /Loyal Shield/.test(rN(raw, 2)));

check('engine self rec dealt +15 INST flat 25', main.sh.getPercentTotal('recovery_dealt') === 15 && main.sh.flatMods.inst === 25, 'rec=' + main.sh.getPercentTotal('recovery_dealt') + ' flat=' + JSON.stringify(main.sh.flatMods));
check('engine left fire_dealt +16', main.left.getPercentTotal('fire_dealt') === 16, 'Lfire=' + main.left.getPercentTotal('fire_dealt'));
check('engine right fire_dealt 0', main.right.getPercentTotal('fire_dealt') === 0, 'Rfire=' + main.right.getPercentTotal('fire_dealt'));
check("engine Dragon's Insight recv -4 inst +5", main.sh.getPercentTotal('dmg_received') === -4 && main.sh.getPercentTotal('inst') === 5, 'recv=' + main.sh.getPercentTotal('dmg_received') + ' inst=' + main.sh.getPercentTotal('inst'));
check('engine Crushing Force physical on left not right', main.left.getPercentTotal('physical_dealt') === 9 && main.right.getPercentTotal('physical_dealt') !== 9, 'Lphys=' + main.left.getPercentTotal('physical_dealt') + ' Rphys=' + main.right.getPercentTotal('physical_dealt'));
check('engine Crushing Force tactical prefers right', main.right.getPercentTotal('tactical_dealt') === 9, 'Rtac=' + main.right.getPercentTotal('tactical_dealt') + ' Ltac=' + main.left.getPercentTotal('tactical_dealt'));
check('engine Unbroken Devotion rec received on others not self', main.left.getPercentTotal('recovery_received') === 15 && main.right.getPercentTotal('recovery_received') === 15 && main.sh.getPercentTotal('recovery_received') === 0, 'L=' + main.left.getPercentTotal('recovery_received') + ' R=' + main.right.getPercentTotal('recovery_received') + ' S=' + main.sh.getPercentTotal('recovery_received'));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Crushing Force fires', /Crushing Force/.test(rawR1));
check("R1 Dragon's Insight fires", /Dragon's Insight/.test(rawR1));
check('R1 Unbroken Devotion fires', /Unbroken Devotion/.test(rawR1));
check('R1 command 30% buff hits highest STR AllyR', /\[hit\] Unbreakable Loyalty → AllyR \(30%\)/.test(rawR1) || /Increases Strength of AllyR/.test(rawR1));
check('R1 Sneak Attack 14% hits AllyR', /\[hit\] Sneak Attack → AllyR \(14%\)/.test(rawR1) || /Grants First-Strike to AllyR/.test(rawR1));
check('R1 First-Strike on highest STR other ally', hasEffect(r1.right, 'first_strike') && !hasEffect(r1.left, 'first_strike') && !hasEffect(r1.sh, 'first_strike'));
check('R1 no Loyal Shield (not R2/4/7/9)', !/Loyal Shield/.test(rawR1) && !/Applies Recovery to /.test(rawR1.split('Shimmer launches')[0] || ''));

const resist = setup(() => 0);
resist.battle.start();
try { applyEffect(resist.left, 'RESISTANCE', 1, 'seed', { duration: 10, damageReduction: 20 }); } catch (e) {}
try { applyEffect(resist.right, 'resistance', 1, 'seed', { duration: 10, damageReduction: 20 }); } catch (e) {}
resist.battle.runRound();
resist.battle.runRound();
const rawResist = (resist.battle.battleLog || []).join('\n');
const rawPlain = (() => {
  const p = setup(() => 0);
  p.battle.start();
  p.battle.runRound();
  p.battle.runRound();
  return (p.battle.battleLog || []).join('\n');
})();
const recResist = [...rN(rawResist, 2).matchAll(/Recovery \+(\d+(?:\.\d+)?)%/g)].map(m => Number(m[1]));
const recPlain = [...rN(rawPlain, 2).matchAll(/Recovery \+(\d+(?:\.\d+)?)%/g)].map(m => Number(m[1]));
check('Loyal Shield resistance doubles recovery vs base', recResist.length && recPlain.length && Math.max(...recResist) > Math.max(...recPlain), 'resist=' + recResist.join(',') + ' base=' + recPlain.join(','));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 misses command 30%', /\[miss\] Unbreakable Loyalty/.test(rawMiss));
check('seed 0.99 misses Sneak Attack 14%', /\[miss\] Sneak Attack/.test(rawMiss) && !hasEffect(miss.right, 'first_strike') && !hasEffect(miss.left, 'first_strike'));
check('seed 0.99 still vanguard + Insight + Crushing + Devotion', miss.sh.flatMods.inst === 25 && miss.sh.getPercentTotal('inst') === 5 && miss.left.getPercentTotal('physical_dealt') === 9 && miss.left.getPercentTotal('recovery_received') === 15);

const low6 = setup(() => 0, { stars: 5 });
low6.battle.start();
low6.battle.runRound();
low6.battle.runRound();
const rawLow6 = (low6.battle.battleLog || []).join('\n');
check('5★ no Loyal Shield / Unbroken / Sneak', !/Loyal Shield/.test(rawLow6) && !/Unbroken Devotion/.test(rawLow6) && !/Sneak Attack/.test(rawLow6));
check("5★ still Crushing + Insight + command", /Crushing Force/.test(rawLow6) && /Dragon's Insight/.test(rawLow6) && /Unbreakable Loyalty/.test(rawLow6));

const low8 = setup(() => 0, { stars: 8 });
low8.battle.start();
low8.battle.runRound();
const rawLow8 = (low8.battle.battleLog || []).join('\n');
check('8★ no Sneak Attack', !/Sneak Attack/.test(rawLow8));
check('8★ still Loyal Shield gated to R2+', /Unbroken Devotion/.test(rawLow8) && /Unbreakable Loyalty/.test(rawLow8));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
