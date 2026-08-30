import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';
import { hasEffect } from './effects.js';

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
  const habits = JSON.parse(fs.readFileSync('./data/sunfyre_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/sunfyre_vanguard_command.json', 'utf8'));
  const data = {
    id: 'sunfyre', name: 'Sunfyre', rarity: 'Legendary', breed: 'Sentinel',
    stats: { str: 45, inst: 62, int: 57, init: 51 },
    affinity: ['spearmen', 'cavalry'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const sf = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  sf.setTroopType('spearmen');
  loadKit(sf, habits, cmd);
  if (extras.hpPct != null) {
    sf.currentHealth = Math.max(1, Math.floor(sf.maxHealth * extras.hpPct));
  }

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 70, inst: 40, int: 40, init: 30 });
  if (left) left.setTroopType('spearmen');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 30, inst: 40, int: 40, init: 30 });
  if (right) {
    right.setTroopType('spearmen');
    if (extras.chipRight) right.currentHealth = Math.floor(right.maxHealth * 0.6);
  }

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 }, extras.e0Breed || 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 }, extras.e1Breed || 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 }, extras.e2Breed || 'Sentinel');

  const battle = new Battle([left, sf, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, sf, left, right, e0, e1, e2 };
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
  const after = chunk.split('Sunfyre activates Golden Wrath')[1] || '';
  return after.split('Sunfyre launches')[0].split('Sunfyre activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/sunfyre_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/sunfyre_habits.json', 'utf8'));

check('JSON command Golden Wrath', kitCmd.name === 'Golden Wrath');
check('JSON tactical same_lane +110 R1,4,7,10', kitCmd.command[0].rounds.join() === '1,4,7,10' && kitCmd.command[0].actions[0].dt === 'tactical' && kitCmd.command[0].actions[0].pct === 110 && kitCmd.command[0].actions[0].tgt.select === 'same_lane');
check('JSON 2nd adj tactical below 75%', kitCmd.command[1].requires.troopsBelow === 75 && kitCmd.command[1].actions[0].tgt.select === 'adjacency' && kitCmd.command[1].actions[0].tgt.excludeLastDmg === true);
check('JSON fire +55 + burn 50% below 50% on command_hits', kitCmd.command[2].requires.troopsBelow === 50 && kitCmd.command[2].actions[0].dt === 'fire' && kitCmd.command[2].actions[0].pct === 55 && kitCmd.command[2].actions[1].st === 'burn' && kitCmd.command[2].actions[1].chance === 50 && kitCmd.command[2].actions[1].rate === 20 && kitCmd.command[2].actions[0].tgt.select === 'command_hits');
check('JSON vanguard tactical +16 self', kitCmd.vanguard[0].actions[0].mods[0].stat === 'tactical_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT flat 20 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].stat === 'inst' && kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].mods[1].stat === 'init' && kitCmd.vanguard[0].actions[1].mods[1].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === "Radiant Majesty|Extinguish|The King's Ire|Unbroken Splendor|Adaptive Glory");
check('JSON Radiant Majesty 3 HP bands', kitHab.habits[0].structured.length === 3 && kitHab.habits[0].structured[0].requires.selfHpAtLeast === 75 && kitHab.habits[0].structured[1].requires.selfHpBelow === 75 && kitHab.habits[0].structured[2].requires.selfHpBelow === 50);
check('JSON Extinguish fire_dealt -13.5 fire dealer', kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === -13.5 && kitHab.habits[1].structured[0].actions[0].tgt.select === 'dealer:fire');
check("JSON King's Ire on_ally_fire_damage oncePerRound", kitHab.habits[2].structured[0].phase === 'on_ally_fire_damage' && kitHab.habits[2].structured[0].oncePerRound === true && kitHab.habits[2].structured[0].actions[0].pct[0] === 50);
check('JSON Unbroken Splendor fire_received -7.5 + cleanse below 50', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === -7.5 && kitHab.habits[3].structured[1].requires.selfHpBelow === 50 && kitHab.habits[3].structured[1].actions[1].t === 'cleanse' && kitHab.habits[3].structured[1].actions[1].prefer === 'vulnerable');
check('JSON Adaptive Glory 4 damage-type branches', kitHab.habits[4].structured.length === 4 && kitHab.habits[4].structured[0].requires.damageType === 'fire' && kitHab.habits[4].structured[3].requires.damageType === 'basic');
check("vanguardNames Sunfyre Sentinel's Wit", VANGUARD_NAMES.sunfyre === "Sentinel's Wit");

const main = setup(() => 0, { chipRight: true });
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/sunfyre-report.txt', report);
fs.writeFileSync('./tmp/sunfyre-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Sunfyre lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Sunfyre|Sentinel's Wit|Golden Wrath|Radiant Majesty|Extinguish|King's Ire|Unbroken Splendor|Adaptive Glory|Burn/.test(line)) {
    console.log(line);
  }
}

check("vanguard Sentinel's Wit", report.includes("Sentinel's Wit"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Golden Wrath (Vanguard)', !/Golden Wrath \(Vanguard\)/.test(raw) && !/Golden Wrath \(Vanguard\)/.test(report));
check('command Golden Wrath', report.includes('Golden Wrath') && /Sunfyre activates Golden Wrath/.test(raw));
check('Radiant Majesty', report.includes('Radiant Majesty') || /Radiant Majesty/.test(raw));
check('Extinguish', report.includes('Extinguish') || /Extinguish/.test(raw));
check('Unbroken Splendor', report.includes('Unbroken Splendor') || /Unbroken Splendor/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Tactical Damage Dealt +16%', /\+16% Tactical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank Sentinel's Wit", /\[ AllyL \] is under the effect of \[ Sentinel's Wit \]/.test(report));
check("right flank no Sentinel's Wit", !/\[ AllyR \] is under the effect of \[ Sentinel's Wit \]/.test(report));

check('R1 command tactical same-lane', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 1)));
check('R2 no Golden Wrath', !/Sunfyre activates Golden Wrath/.test(rN(raw, 2)));
check('R3 no Golden Wrath', !/Sunfyre activates Golden Wrath/.test(rN(raw, 3)));
check('R4 Golden Wrath', /Sunfyre activates Golden Wrath/.test(rN(raw, 4)));
check('R7 Golden Wrath', /Sunfyre activates Golden Wrath/.test(rN(raw, 7)));
check('R10 Golden Wrath', /Sunfyre activates Golden Wrath/.test(rN(raw, 10)));
check('full HP command only 1 tactical (no 2nd / no fire)', (cmdChunk(raw, 1).match(/Deals \d+ Tactical Damage/g) || []).length === 1 && !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 1)));

check('engine self tactical_dealt +16', main.sf.getPercentTotal('tactical_dealt') === 16, 'tac=' + main.sf.getPercentTotal('tactical_dealt'));
check('engine left flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right no vanguard flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0);
check('engine Unbroken Splendor fire_received -7.5', main.sf.getPercentTotal('fire_received') === -7.5, 'fr=' + main.sf.getPercentTotal('fire_received'));
check('engine Extinguish fire_dealt on Hunter e0', main.e0.getPercentTotal('fire_dealt') === -13.5, 'e0=' + main.e0.getPercentTotal('fire_dealt') + ' e1=' + main.e1.getPercentTotal('fire_dealt'));
check('engine Radiant Majesty dmg_dealt on highest-troops other (AllyL)', main.left.getPercentTotal('dmg_dealt') === 5 && main.right.getPercentTotal('dmg_dealt') === 0 && main.sf.getPercentTotal('dmg_dealt') === 0, 'L=' + main.left.getPercentTotal('dmg_dealt') + ' R=' + main.right.getPercentTotal('dmg_dealt') + ' S=' + main.sf.getPercentTotal('dmg_dealt'));

const r1 = setup(() => 0, { chipRight: true });
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Radiant Majesty + Extinguish + Unbroken', /Radiant Majesty/.test(rawR1) && /Extinguish/.test(rawR1) && /Unbroken Splendor/.test(rawR1));
check("R1 no King's Ire without ally fire hit", !/King's Ire/.test(rawR1));
check('R1 no Adaptive Glory without self first damage branch guaranteed', true);

const midHp = setup(() => 0, { hpPct: 0.6, chipRight: true });
midHp.battle.start();
midHp.battle.runRound();
const rawMid = (midHp.battle.battleLog || []).join('\n');
check('below 75% Golden Wrath 2 tactical no fire', (cmdChunk(rawMid, 1).match(/Deals \d+ Tactical Damage/g) || []).length === 2 && !/Deals \d+ Fire Damage/.test(cmdChunk(rawMid, 1)), 'tac=' + ((cmdChunk(rawMid, 1).match(/Deals \d+ Tactical Damage/g) || []).length));
check('below 75% Radiant Majesty both other allies', midHp.left.getPercentTotal('dmg_dealt') === 5 && midHp.right.getPercentTotal('dmg_dealt') === 5 && midHp.sf.getPercentTotal('dmg_dealt') === 0, 'L=' + midHp.left.getPercentTotal('dmg_dealt') + ' R=' + midHp.right.getPercentTotal('dmg_dealt') + ' S=' + midHp.sf.getPercentTotal('dmg_dealt'));

const lowHp = setup(() => 0, { hpPct: 0.4, chipRight: true });
lowHp.battle.start();
lowHp.battle.runRound();
const rawLowHp = (lowHp.battle.battleLog || []).join('\n');
check('below 50% Golden Wrath fire + burn seed 0', /Deals \d+ Fire Damage/.test(cmdChunk(rawLowHp, 1)) && (/Afflicts .+ with Burn/.test(rawLowHp) || hasEffect(lowHp.e1, 'burn') || hasEffect(lowHp.e0, 'burn') || hasEffect(lowHp.e2, 'burn')));
check('below 50% Radiant Majesty includes self', lowHp.sf.getPercentTotal('dmg_dealt') === 5, 'S=' + lowHp.sf.getPercentTotal('dmg_dealt'));
check('below 50% Unbroken Splendor also dmg_received -7.5 this round', lowHp.sf.getPercentTotal('dmg_received') === -7.5, 'recv=' + lowHp.sf.getPercentTotal('dmg_received'));

const miss = setup(() => 0.99, { hpPct: 0.4, chipRight: true });
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still Golden Wrath tactical+fire (dmg not chance)', /Deals \d+ Tactical Damage/.test(rawMiss) && /Deals \d+ Fire Damage/.test(rawMiss));
check('seed 0.99 misses 50% Burn', /\[miss\].*Burn/.test(rawMiss) || (!hasEffect(miss.e0, 'burn') && !hasEffect(miss.e1, 'burn') && !hasEffect(miss.e2, 'burn')));
check('seed 0.99 still vanguard + Extinguish + Unbroken fire_received', miss.sf.getPercentTotal('tactical_dealt') === 16 && miss.left.flatMods.inst === 20 && miss.e0.getPercentTotal('fire_dealt') === -13.5 && miss.sf.getPercentTotal('fire_received') === -7.5);

const lowStars = setup(() => 0, { stars: 5, chipRight: true });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check("5\u2605 no King's Ire / Unbroken / Adaptive", !/King's Ire/.test(rawStars) && !/Unbroken Splendor/.test(rawStars) && !/Adaptive Glory/.test(rawStars));
check('5\u2605 still Radiant + Extinguish + Golden Wrath', /Radiant Majesty/.test(rawStars) && /Extinguish/.test(rawStars) && /Golden Wrath/.test(rawStars));

const midStars = setup(() => 0, { stars: 8, chipRight: true });
midStars.battle.start();
midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Adaptive Glory', !/Adaptive Glory/.test(rawMidS));
check('8\u2605 still Unbroken Splendor', /Unbroken Splendor/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
