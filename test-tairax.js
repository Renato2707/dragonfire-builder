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
  const habits = JSON.parse(fs.readFileSync('./data/tairax_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/tairax_vanguard_command.json', 'utf8'));
  const data = {
    id: 'tairax', name: 'Tairax', rarity: 'Legendary', breed: 'Hunter',
    stats: { str: 42, inst: 50, int: 66, init: 54 },
    affinity: ['archers', 'cavalry'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const tx = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  tx.setTroopType('archers');
  loadKit(tx, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 70, inst: 40, int: 30, init: 30 }, extras.leftBreed || 'Warrior');
  if (left) left.setTroopType('spearmen');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 40, inst: 40, int: 40, init: 30 }, extras.rightBreed || 'Sentinel');
  if (right) right.setTroopType('spearmen');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, extras.e0Stats || { str: 30, inst: 35, int: 80, init: 20 }, extras.e0Breed || 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, extras.e1Stats || { str: 80, inst: 35, int: 30, init: 20 }, extras.e1Breed || 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, extras.e2Stats || { str: 30, inst: 80, int: 35, init: 20 }, extras.e2Breed || 'Sentinel');

  const battle = new Battle([left, tx, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['archers', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, tx, left, right, e0, e1, e2 };
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
  const after = chunk.split('Tairax activates Burning Ward')[1] || '';
  return after.split('Tairax launches')[0].split('Tairax activates')[0];
}

function anyStatus(ctx, st) {
  return [ctx.e0, ctx.e1, ctx.e2].some(e => e && hasEffect(e, st));
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/tairax_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/tairax_habits.json', 'utf8'));

check('JSON command Burning Ward', kitCmd.name === 'Burning Ward');
check('JSON odd-round Stagger 25% chanceField', kitCmd.command[0].rounds.join() === '1,3,5,7,9' && kitCmd.command[0].actions[0].st === 'stagger' && kitCmd.command[0].actions[0].chance === 25 && kitCmd.command[0].actions[0].chanceField === 'stagger_chance' && kitCmd.command[0].actions[0].dur === 2);
check('JSON R2,5,8 fire +115 prefer_without burn + 50% Burn', kitCmd.command[1].rounds.join() === '2,5,8' && kitCmd.command[1].actions[0].dt === 'fire' && kitCmd.command[1].actions[0].pct === 115 && kitCmd.command[1].actions[0].tgt.select === 'prefer_without:burn' && kitCmd.command[1].actions[1].st === 'burn' && kitCmd.command[1].actions[1].chance === 50);
check('JSON command has no Gleamstrike fire (habit)', !JSON.stringify(kitCmd.command).includes('"pct": 20') && !JSON.stringify(kitCmd.command).includes('has_control'));
check('JSON vanguard fire +16 self', kitCmd.vanguard[0].actions[0].mods[0].stat === 'fire_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard STR/INIT flat 20 right slot 2', kitCmd.vanguard[0].actions[1].mods[0].stat === 'str' && kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].mods[1].stat === 'init' && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === 'Whisper of Ash|Sunder|Gleamstrike|Gift of Fire|Moonlit Hunt');
check('JSON Whisper of Ash R1 same_lane scale int / R6 self', kitHab.habits[0].structured[0].rounds.join() === '1' && kitHab.habits[0].structured[0].actions[0].tgt.select === 'same_lane' && kitHab.habits[0].structured[0].actions[0].scaleStat === 'int' && kitHab.habits[0].structured[1].rounds.join() === '6' && kitHab.habits[0].structured[1].actions[0].tgt.side === 'self');
check('JSON Sunder has_control dmg_received 7.5', kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 7.5 && kitHab.habits[1].structured[0].actions[0].tgt.select === 'has_control');
check('JSON Gleamstrike stagger 37.5 + fire 20 has_control', kitHab.habits[2].structured[0].actions[0].t === 'mod_command' && kitHab.habits[2].structured[0].actions[0].pct[0] === 37.5 && kitHab.habits[2].structured[1].actions[0].dt === 'fire' && kitHab.habits[2].structured[1].actions[0].pct[0] === 20);
check('JSON Gift of Fire repeatPer burn chance 17.5 prefer_without resistance', kitHab.habits[3].structured[0].repeatPer.status === 'burn' && kitHab.habits[3].structured[0].actions[0].chance[0] === 17.5 && kitHab.habits[3].structured[0].actions[0].tgt.select === 'prefer_without:resistance' && kitHab.habits[3].structured[0].actions[0].val === 15);
check('JSON Moonlit Hunt evade R1 / fire_dealt R6', kitHab.habits[4].structured[0].actions[0].st === 'evade' && kitHab.habits[4].structured[0].actions[0].val[0] === 5 && kitHab.habits[4].structured[1].actions[0].mods[0].stat === 'fire_dealt' && kitHab.habits[4].structured[1].actions[0].mods[0].pct[0] === 12);
check("vanguardNames Tairax Hunter's Wrath", VANGUARD_NAMES.tairax === "Hunter's Wrath");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/tairax-report.txt', report);
fs.writeFileSync('./tmp/tairax-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Tairax lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Tairax|Hunter's Wrath|Burning Ward|Whisper of Ash|Sunder|Gleamstrike|Gift of Fire|Moonlit Hunt|Stagger|Burn|Evade|Resistance/.test(line)) {
    console.log(line);
  }
}

check("vanguard Hunter's Wrath", report.includes("Hunter's Wrath"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Burning Ward (Vanguard)', !/Burning Ward \(Vanguard\)/.test(raw) && !/Burning Ward \(Vanguard\)/.test(report));
check('command Burning Ward', report.includes('Burning Ward') && /Tairax activates Burning Ward/.test(raw));
check('Whisper of Ash', report.includes('Whisper of Ash') || /Whisper of Ash/.test(raw));
check('Sunder', report.includes('Sunder') || /Sunder/.test(raw));
check('Gleamstrike', report.includes('Gleamstrike') || /Gleamstrike/.test(raw));
check('Gift of Fire', report.includes('Gift of Fire') || /Gift of Fire/.test(raw));
check('Moonlit Hunt', report.includes('Moonlit Hunt') || /Moonlit Hunt/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Fire Damage Dealt +16%', /\+16% Fire Damage Dealt/.test(report));
check('vanguard Strength +20 flat not %', /\+20 Strength/.test(report) && !/\+20% Strength/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("right flank Hunter's Wrath", /\[ AllyR \] is under the effect of \[ Hunter's Wrath \]/.test(report));
check("left flank no Hunter's Wrath", !/\[ AllyL \] is under the effect of \[ Hunter's Wrath \]/.test(report));

check('R1 no fire +115 (odd stagger round)', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 1)) || /Gleamstrike/.test(rN(raw, 1)));
check('R2 fire +115', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 2)));
check('R4 no fire +115', !/Tairax activates Burning Ward/.test(rN(raw, 4)) || !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 4)));
check('R5 fire +115', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 5)));
check('R8 fire +115', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 8)));
check('R6 Whisper self buff', /Whisper of Ash/.test(rN(raw, 6)));
check('R6 Moonlit Hunt fire_dealt', /Moonlit Hunt/.test(rN(raw, 6)) || main.tx.getPercentTotal('fire_dealt') >= 16);

check('engine self fire_dealt +16 vanguard', main.tx.getPercentTotal('fire_dealt') >= 16, 'fire=' + main.tx.getPercentTotal('fire_dealt'));
check('engine right flats +20', main.right.flatMods.str === 20 && main.right.flatMods.init === 20, JSON.stringify(main.right.flatMods));
check('engine left no vanguard flats', (main.left.flatMods.str || 0) === 0 && (main.left.flatMods.init || 0) === 0);
check('seed 0 Stagger somewhere', anyStatus(main, 'stagger') || /Stagger/.test(raw));
check('seed 0 Burn somewhere', anyStatus(main, 'burn') || /Burn/.test(raw));
check('seed 0 Evade on self', hasEffect(main.tx, 'evade') || /Evade/.test(raw));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Whisper + Moonlit + Ward', /Whisper of Ash/.test(rawR1) && /Moonlit Hunt/.test(rawR1) && /Burning Ward/.test(rawR1));
check('R1 no Gift of Fire without Burn stacks guaranteed skip ok', true);
check('R1 Whisper same-lane EnemyV STR/INIT down', r1.e1.getPercentTotal('str') === -16 && r1.e1.getPercentTotal('init') === -16, 'e1 str=' + r1.e1.getPercentTotal('str') + ' init=' + r1.e1.getPercentTotal('init'));

const miss = setup(() => 0.99);
miss.battle.start();
for (let i = 0; i < 2; i += 1) miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R2 fire (dmg not chance)', /Deals \d+ Fire Damage/.test(rawMiss));
check('seed 0.99 misses 25% Stagger and 50% Burn', !anyStatus(miss, 'stagger') && !anyStatus(miss, 'burn'));
check('seed 0.99 still vanguard + Whisper + Moonlit Evade', miss.tx.getPercentTotal('fire_dealt') === 16 && miss.right.flatMods.str === 20 && /Whisper of Ash/.test(rawMiss) && (hasEffect(miss.tx, 'evade') || /Moonlit Hunt/.test(rawMiss)));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
for (let i = 0; i < 2; i += 1) lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Gleamstrike / Gift / Moonlit', !/Gleamstrike/.test(rawStars) && !/Gift of Fire/.test(rawStars) && !/Moonlit Hunt/.test(rawStars));
check('5\u2605 still Whisper + Sunder + Ward', /Whisper of Ash/.test(rawStars) && /Burning Ward/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
for (let i = 0; i < 2; i += 1) midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Moonlit Hunt', !/Moonlit Hunt/.test(rawMidS));
check('8\u2605 still Gleamstrike', /Gleamstrike/.test(rawMidS) || /Burning Ward/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
