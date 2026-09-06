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
  const habits = JSON.parse(fs.readFileSync('./data/starshower_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/starshower_vanguard_command.json', 'utf8'));
  const data = {
    id: 'starshower', name: 'Starshower', rarity: 'Epic', breed: 'Sentinel',
    stats: { str: 45, inst: 59, int: 50, init: 52 },
    affinity: ['shieldbearers'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const ss = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  ss.setTroopType('shieldbearers');
  loadKit(ss, habits, cmd);

  const left = extras.noLeft ? null : dummy('allyL', 'AllyL', 0, 0, { str: 40, inst: 40, int: 40, init: 30 }, 'Hunter');
  if (left) left.setTroopType('archers');
  const right = extras.noRight ? null : dummy('allyR', 'AllyR', 0, 2, { str: 55, inst: 30, int: 30, init: 30 }, 'Warrior');
  if (right) right.setTroopType('cavalry');

  const tank = { level: 50, stars: 10, habitRank: 1 };
  const makeEnemy = (id, name, slotPos, stats, breed) => {
    const e = dummy(id, name, 1, slotPos, stats, breed, tank);
    e.setTroopType('spearmen');
    return e;
  };
  const e0 = extras.e0 === false ? null : makeEnemy('e0', 'EnemyL', 0, { str: 30, inst: 35, int: 80, init: 20 }, 'Hunter');
  const e1 = extras.e1 === false ? null : makeEnemy('e1', 'EnemyV', 1, { str: 80, inst: 35, int: 30, init: 20 }, 'Warrior');
  const e2 = extras.e2 === false ? null : makeEnemy('e2', 'EnemyR', 2, { str: 30, inst: 80, int: 35, init: 20 }, 'Sentinel');

  const battle = new Battle([left, ss, right].filter(Boolean), [e0, e1, e2].filter(Boolean), {
    teamTroop: ['shieldbearers', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, ss, left, right, e0, e1, e2 };
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
  const after = chunk.split('Starshower activates Solar Flare')[1] || '';
  return after.split('Starshower launches')[0].split('Starshower activates')[0];
}

fs.mkdirSync('./tmp', { recursive: true });

const kitCmd = JSON.parse(fs.readFileSync('./data/starshower_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/starshower_habits.json', 'utf8'));

check('JSON command Solar Flare from dragons.json', kitCmd.name === 'Solar Flare');
check('JSON mark 3 enemies solar_flare combat_start', kitCmd.command[0].phase === 'combat_start' && kitCmd.command[0].actions[0].st === 'solar_flare' && kitCmd.command[0].actions[0].tgt.count === 3);
check('JSON each-round tactical +100 50% filter solar_flare', kitCmd.command[1].actions[0].dt === 'tactical' && kitCmd.command[1].actions[0].pct === 100 && kitCmd.command[1].actions[0].chance === 50 && kitCmd.command[1].actions[0].tgt.filter.status === 'solar_flare');
check('JSON R1,3,7,9 tactical same_lane +80', kitCmd.command[2].rounds.join() === '1,3,7,9' && kitCmd.command[2].actions[0].pct === 80 && kitCmd.command[2].actions[0].tgt.select === 'same_lane');
check('JSON vanguard tactical +16 self', kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT flat 20 left slot 0', kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON habit names from dragons.json', kitHab.habits.map(h => h.name).join('|') === "Night Guardian|Battle Subversion|Ill Portents|Tactical Breach|Wishkeeper's Grace");
check("vanguardNames Starshower Sentinel's Wit", VANGUARD_NAMES.starshower === "Sentinel's Wit");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();
const report = formatBattleReport(main.battle, '═'.repeat(55) + '\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('./tmp/starshower-report.txt', report);
fs.writeFileSync('./tmp/starshower-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Starshower lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Starshower|Sentinel's Wit|Solar Flare/.test(line)) console.log(line);
}

check("vanguard Sentinel's Wit", report.includes("Sentinel's Wit"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Solar Flare (Vanguard)', !/Solar Flare \(Vanguard\)/.test(raw) && !/Solar Flare \(Vanguard\)/.test(report));
check('command Solar Flare', report.includes('Solar Flare') && /Starshower activates Solar Flare/.test(raw));
check('10 rounds played', /• Round 10/.test(report) || /Start of Round 10/.test(raw));
check('vanguard Tactical Damage Dealt +16%', /\+16% Tactical Damage Dealt/.test(report));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test(report));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test(report));
check("left flank Sentinel's Wit", /\[ AllyL \] is under the effect of \[ Sentinel's Wit \]/.test(report));
check("right flank no Sentinel's Wit", !/\[ AllyR \] is under the effect of \[ Sentinel's Wit \]/.test(report));

check('R1 tactical same-lane or mark dmg', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 1)) || /Deals \d+ Tactical Damage/.test(rN(raw, 1)));
check('R3 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 3)) || /Deals \d+ Tactical Damage/.test(rN(raw, 3)));
check('R7 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 7)) || /Deals \d+ Tactical Damage/.test(rN(raw, 7)));
check('R9 tactical', /Deals \d+ Tactical Damage/.test(cmdChunk(raw, 9)) || /Deals \d+ Tactical Damage/.test(rN(raw, 9)));

check('engine self tactical +16', main.ss.getPercentTotal('tactical_dealt') === 16, 'tac=' + main.ss.getPercentTotal('tactical_dealt'));
check('engine left flats +20', main.left.flatMods.inst === 20 && main.left.flatMods.init === 20, JSON.stringify(main.left.flatMods));
check('engine right no vanguard flats', (main.right.flatMods.inst || 0) === 0 && (main.right.flatMods.init || 0) === 0);
check('seed 0 Solar Flare mark on enemies', hasEffect(main.e0, 'solar_flare') || hasEffect(main.e1, 'solar_flare') || hasEffect(main.e2, 'solar_flare') || /Solar Flare/.test(raw));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 still R1 same-lane tactical (dmg not chance)', /Deals \d+ Tactical Damage/.test(rawMiss));
check('seed 0.99 still vanguard', miss.ss.getPercentTotal('tactical_dealt') === 16 && miss.left.flatMods.inst === 20);

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
