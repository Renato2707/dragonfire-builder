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
  const habits = JSON.parse(fs.readFileSync('./data/arulix_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/arulix_vanguard_command.json', 'utf8'));
  const data = {
    id: 'arulix', name: 'Arulix', rarity: 'Legendary', breed: 'Champion',
    stats: { str: 55, inst: 58, int: 55, init: 46 },
    affinity: ['spearmen', 'archers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const au = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  au.setTroopType('spearmen');
  loadKit(au, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }, extras.leftBreed || 'Hunter');
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, extras.rightStats || { str: 55, inst: 30, int: 30, init: 30 }, extras.rightBreed || 'Warrior');
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

  const battle = new Battle([left, au, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['spearmen', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, au, left, right, e0, e1, e2 };
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
  const after = chunk.split('Arulix activates Gleaming Spiral')[1] || '';
  return after.split('Arulix launches')[0].split('Arulix activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/arulix_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/arulix_habits.json', 'utf8'));

check('JSON command Gleaming Spiral', kitCmd.name === 'Gleaming Spiral');
check('JSON each-round fire_dealt -15 25% fire dealers', kitCmd.command[0].actions[0].mods[0].pct === -15 && kitCmd.command[0].actions[0].chance === 25 && kitCmd.command[0].actions[0].tgt.select === 'dealer:fire');
check('JSON R1,2,3,5,8 tactical 45 physical dealers', kitCmd.command[1].rounds.join() === '1,2,3,5,8' && kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 45 && kitCmd.command[1].actions[0].tgt.select === 'dealer:physical');
check('JSON command has no 6\u2605 physical (habit Spiral Surge)', !JSON.stringify(kitCmd.command).includes('"dt":"physical"'));
check('JSON vanguard STR/INT/INST flat 15 self', kitCmd.vanguard[0].actions[0].mods[0].fixed === 15 && kitCmd.vanguard[0].actions[0].mods[1].fixed === 15 && kitCmd.vanguard[0].actions[0].mods[2].fixed === 15);
check('JSON vanguard dmg_received -8 RIGHT slot 2', kitCmd.vanguard[0].actions[1].mods[0].pct === -8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON habit names official order', kitHab.habits.map(h => h.name).join('|') === 'Hypnotic Helix|Battle Cunning|Spiral Surge|Iron Shell|Mimicry');
check('JSON Helix Overwhelm prefer fire / Stagger prefer physical 12.5%', kitHab.habits[0].structured[0].actions[0].st === 'overwhelm' && kitHab.habits[0].structured[0].actions[0].tgt.select === 'prefer_dealer:fire' && kitHab.habits[0].structured[1].actions[0].st === 'stagger' && kitHab.habits[0].structured[1].actions[0].tgt.select === 'prefer_dealer:physical' && kitHab.habits[0].structured[0].actions[0].chance[0] === 12.5);
check('JSON Battle Cunning STR/INT -4 scale inst 3 enemies', kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === -4 && kitHab.habits[1].structured[0].actions[0].scaleStat === 'inst');
check('JSON Spiral Surge physical 20 roundBonus 5=1.5 8=2', kitHab.habits[2].structured[0].actions[0].pct[0] === 20 && kitHab.habits[2].structured[0].actions[0].roundBonus['5'] === 1.5 && kitHab.habits[2].structured[0].actions[0].roundBonus['8'] === 2);
check('JSON Iron Shell -2.5 other allies', kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === -2.5 && kitHab.habits[3].structured[0].actions[0].tgt.excludeSelf === true);
check('JSON Mimicry copy_status 25%', kitHab.habits[4].structured[0].actions[0].t === 'copy_status' && kitHab.habits[4].structured[0].actions[0].chance[0] === 25);
check("vanguardNames Arulix Champion's Brilliance", VANGUARD_NAMES.arulix === "Champion's Brilliance");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/arulix-report.txt', report);
fs.writeFileSync('./tmp/arulix-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Arulix lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Arulix|Champion's Brilliance|Gleaming Spiral|Hypnotic Helix|Battle Cunning|Spiral Surge|Iron Shell|Mimicry|Overwhelm|Stagger/.test(line)) {
    console.log(line);
  }
}

check("vanguard Champion's Brilliance", report.includes("Champion's Brilliance"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Gleaming Spiral (Vanguard)', !/Gleaming Spiral \(Vanguard\)/.test(raw) && !/Gleaming Spiral \(Vanguard\)/.test(report));
check('command Gleaming Spiral', report.includes('Gleaming Spiral') && /Arulix activates Gleaming Spiral/.test(raw));
check('Hypnotic Helix', report.includes('Hypnotic Helix') || /Hypnotic Helix/.test(raw));
check('Battle Cunning', report.includes('Battle Cunning') || /Battle Cunning/.test(raw));
check('Spiral Surge', report.includes('Spiral Surge') || /Spiral Surge/.test(raw));
check('Iron Shell', report.includes('Iron Shell') || /Iron Shell/.test(raw));
check('Mimicry', report.includes('Mimicry') || /Mimicry/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));

check('vanguard Strength +15 flat not %', /\+15 Strength/.test(report) && !/\+15% Strength/.test(report));
check('vanguard Intelligence +15 flat not %', /\+15 Intelligence/.test(report) && !/\+15% Intelligence/.test(report));
check('vanguard Instinct +15 flat not %', /\+15 Instinct/.test(report) && !/\+15% Instinct/.test(report));
check('vanguard Damage Received -8%', /-8% Damage Received/.test(report));
check("right flank Champion's Brilliance", /\[ AllyR \] is under the effect of \[ Champion's Brilliance \]/.test(report));
check("left flank no Champion's Brilliance", !/\[ AllyL \] is under the effect of \[ Champion's Brilliance \]/.test(report));

check('R1 tactical or physical', /Deals \d+ (Tactical|Physical) Damage/.test(cmdChunk(raw, 1)) || /Deals \d+ Physical Damage/.test(rN(raw, 1)));
check('R4 no spiral tactical command', !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 4)));
check('R5 spiral', /Deals \d+ (Tactical|Physical) Damage/.test(rN(raw, 5)));
check('R8 spiral', /Deals \d+ (Tactical|Physical) Damage/.test(rN(raw, 8)));

check('engine self flats +15', main.au.flatMods.str === 15 && main.au.flatMods.int === 15 && main.au.flatMods.inst === 15, JSON.stringify(main.au.flatMods));
check('engine right dmg_received -8', main.right.getPercentTotal('dmg_received') === -8, 'R recv=' + main.right.getPercentTotal('dmg_received'));
check('engine left no vanguard recv', main.left.getPercentTotal('dmg_received') === 0);
check('engine Battle Cunning enemies STR -4', main.e0.getPercentTotal('str') === -4 && main.e1.getPercentTotal('str') === -4 && main.e2.getPercentTotal('int') === -4, 'e0 str=' + main.e0.getPercentTotal('str'));
check('engine Iron Shell other allies phys/fire recv -2.5', main.left.getPercentTotal('physical_received') === -2.5 && main.right.getPercentTotal('fire_received') === -2.5 && main.au.getPercentTotal('physical_received') === 0, 'L=' + main.left.getPercentTotal('physical_received') + ' self=' + main.au.getPercentTotal('physical_received'));
check('seed 0 Overwhelm or Stagger or fire_dealt debuff', hasEffect(main.e0, 'overwhelm') || hasEffect(main.e1, 'stagger') || hasEffect(main.e2, 'overwhelm') || main.e0.getPercentTotal('fire_dealt') === -15 || /Overwhelm/.test(raw) || /Stagger/.test(raw));

const r1 = setup(() => 0);
r1.battle.start();
r1.battle.runRound();
const rawR1 = (r1.battle.battleLog || []).join('\n');
check('R1 Cunning + Iron + Helix + Spiral + Gleaming', /Battle Cunning/.test(rawR1) && /Iron Shell/.test(rawR1) && /Hypnotic Helix/.test(rawR1) && /Spiral Surge/.test(rawR1) && /Gleaming Spiral/.test(rawR1));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R1 dmg (dmg not chance)', /Deals \d+ (Tactical|Physical) Damage/.test(rawMiss));
check('seed 0.99 still vanguard + Cunning + Iron', miss.au.flatMods.str === 15 && miss.right.getPercentTotal('dmg_received') === -8 && miss.e0.getPercentTotal('str') === -4 && miss.left.getPercentTotal('physical_received') === -2.5 && /Battle Cunning/.test(rawMiss) && /Iron Shell/.test(rawMiss));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
lowStars.battle.runRound();
const rawStars = (lowStars.battle.battleLog || []).join('\n');
check('5\u2605 no Spiral / Iron / Mimicry', !/Spiral Surge/.test(rawStars) && !/Iron Shell/.test(rawStars) && !/Mimicry/.test(rawStars));
check('5\u2605 still Helix + Cunning + Gleaming', /Hypnotic Helix/.test(rawStars) && /Battle Cunning/.test(rawStars) && /Gleaming Spiral/.test(rawStars));

const midStars = setup(() => 0, { stars: 8 });
midStars.battle.start();
midStars.battle.runRound();
const rawMidS = (midStars.battle.battleLog || []).join('\n');
check('8\u2605 no Mimicry', !/Mimicry/.test(rawMidS));
check('8\u2605 still Spiral + Iron', /Spiral Surge/.test(rawMidS) && /Iron Shell/.test(rawMidS));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
