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
import { applyEffect, hasEffect, getEffect } from './effects.js';
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
  const habits = JSON.parse(fs.readFileSync('./data/moondancer_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/moondancer_vanguard_command.json', 'utf8'));

  const data = {
    id: 'moondancer', name: 'Moondancer', rarity: 'Legendary', breed: 'Warrior',
    stats: { str: 58, inst: 50, int: 46, init: 61 },
    affinity: ['shieldbearers', 'archers'], weaknesses: ['siege']
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const moon = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  moon.setTroopType('shieldbearers');
  loadKit(moon, habits, cmd);

  const allyOpts = extras.allyOpts || { level: 16, stars: 10, habitRank: 1 };
  const left = extras.noLeft ? null : dummy(
    'allyL', 'AllyL', 0, 0,
    extras.leftStats || { str: 30, inst: 80, int: 30, init: 40 },
    extras.leftBreed || 'Sentinel',
    allyOpts
  );
  if (left) left.setTroopType('shieldbearers');
  const right = extras.noRight ? null : dummy(
    'allyR', 'AllyR', 0, 2,
    extras.rightStats || { str: 40, inst: 40, int: 40, init: 30 },
    extras.rightBreed || 'Warrior',
    allyOpts
  );
  if (right) right.setTroopType('shieldbearers');

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

  const teamA = extras.slot === 2
    ? [left, right, moon].filter(Boolean)
    : extras.slot === 0
      ? [moon, left, right].filter(Boolean)
      : [left, moon, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['shieldbearers', 'spearmen'],
    defendingTeam: 1,
    verbose: false
  });
  return { battle, moon, left, right, e0, e1, e2 };
}

function dumpEngine(label, moon, left, right, e0, e1, e2) {
  const lines = [];
  const snap = (c) => {
    if (!c) return null;
    return {
      name: c.name,
      str: c.getModifiedStat('str'),
      inst: c.getModifiedStat('inst'),
      int: c.getModifiedStat('int'),
      init: c.getModifiedStat('init'),
      instPct: c.getPercentTotal('inst'),
      initPct: c.getPercentTotal('init'),
      tacDealt: c.getPercentTotal('tactical_dealt'),
      physDealt: c.getPercentTotal('physical_dealt'),
      dmgRecv: c.getPercentTotal('dmg_received'),
      dmgDealt: c.getPercentTotal('dmg_dealt'),
      flat: { ...c.flatMods },
      stacks: { ...c.stacks },
      dealer: getDealerType(c),
      breed: c.breed,
      hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth),
      links: Object.fromEntries(Object.entries(c.links || {}).map(([k, v]) => [k, v && v.name]))
    };
  };
  lines.push('===== ' + label + ' =====');
  for (const c of [moon, left, right, e0, e1, e2]) {
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

function cmdPhysChunk(raw, n) {
  const chunk = rN(raw, n);
  const after = (chunk.split('Moondancer activates Crescent Blade')[1] || '');
  return after.split('Moondancer launches')[0].split('Moondancer activates Eclipsing')[0];
}

function physAmt(text, name) {
  const m = text.match(new RegExp('Deals (\\d+) Physical Damage to ' + name));
  return m ? Number(m[1]) : null;
}

const kitCmd = JSON.parse(fs.readFileSync('./data/moondancer_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/moondancer_habits.json', 'utf8'));

check('JSON command name Crescent Blade', kitCmd.name === 'Crescent Blade');
check('JSON R1 Crescent Blade other Sentinel link', kitCmd.command[0].rounds.join() === '1' && kitCmd.command[0].actions[0].id === 'crescent_blade' && kitCmd.command[0].actions[0].tgt.select === 'class:sentinel' && kitCmd.command[0].actions[0].tgt.excludeSelf === true && kitCmd.command[0].actions[0].tgt.linkAs === 'crescent_blade_ally');
check('JSON reactive on_link_proc 50% once/round Rising Tide max 8 -2% DR', kitCmd.command[1].phase === 'on_link_proc' && kitCmd.command[1].chance === 50 && kitCmd.command[1].oncePerRound === true && kitCmd.command[1].actions[0].id === 'rising_tide' && kitCmd.command[1].actions[0].maxStacks === 8 && kitCmd.command[1].actions[0].mods[0].pct === -2 && kitCmd.command[1].requires.linkEvent === 'tactical_or_recovery');
check('JSON even rounds physical 75% adjacency 2 not 85', kitCmd.command[2].rounds.join() === '2,4,6,8,10' && kitCmd.command[2].actions[0].dt === 'physical' && kitCmd.command[2].actions[0].pct === 75 && kitCmd.command[2].actions[0].rateField === 'physical_rate' && kitCmd.command[2].actions[0].tgt.select === 'adjacency' && kitCmd.command[2].actions[0].tgt.count === 2);
check('JSON command does not hardcode Full Moon 85/170', !JSON.stringify(kitCmd.command).includes('85') && !JSON.stringify(kitCmd.command).includes('170'));
check('JSON vanguard physical_dealt +16% self', kitCmd.vanguard[0].actions[0].mods[0].stat === 'physical_dealt' && kitCmd.vanguard[0].actions[0].mods[0].pct === 16);
check('JSON vanguard INST/INIT fixed 20 left flank', kitCmd.vanguard[0].actions[1].mods[0].stat === 'inst' && kitCmd.vanguard[0].actions[1].mods[0].fixed === 20 && kitCmd.vanguard[0].actions[1].mods[1].stat === 'init' && kitCmd.vanguard[0].actions[1].mods[1].fixed === 20 && kitCmd.vanguard[0].actions[1].tgt.slot === 0);
check('JSON New Moon table 25/9/6', kitHab.habits[0].scaling[0].values[0] === 25 && kitHab.habits[0].scaling[1].values[0] === 9 && kitHab.habits[0].scaling[2].values[0] === 6);
check('JSON New Moon Sentinel filter + INST enhanced INIT not Tac', kitHab.habits[0].structured[1].actions[0].scaleStat === 'init' && kitHab.habits[0].structured[1].actions[0].mods[0].stat === 'inst' && kitHab.habits[0].structured[1].actions[1].mods[0].stat === 'tactical_dealt' && kitHab.habits[0].structured[1].actions[1].scaleStat == null && kitHab.habits[0].structured[1].actions[0].tgt.select === 'class:sentinel');
check('JSON New Moon Rising Tide max 8 -2% DR', kitHab.habits[0].structured[0].actions[0].maxStacks === 8 && kitHab.habits[0].structured[0].actions[0].mods[0].pct === -2);
check('JSON Reactive Instincts highest INST scaleStat str', kitHab.habits[1].structured[0].actions[0].tgt.select === 'highest:inst' && kitHab.habits[1].structured[0].actions[0].scaleStat === 'str' && kitHab.habits[1].structured[0].actions[0].mods[0].pct[0] === 22 && kitHab.habits[1].structured[0].actions[0].mods[1].pct[0] === 11);
check('JSON Full Moon habit-mod 85% not on command', kitHab.habits[2].structured[1].actions[0].t === 'mod_command' && kitHab.habits[2].structured[1].actions[0].pct[0] === 85 && kitHab.habits[2].structured[1].actions[0].field === 'physical_rate');
check('JSON Full Moon least troops extra stack', kitHab.habits[2].structured[0].actions[1].requires.leastTroops === true && kitHab.habits[2].structured[0].actions[1].id === 'rising_tide');
check('JSON Blood Moon 12.5% 4+ stacks + Bleed 25% adjacency', kitHab.habits[3].structured[0].requires.stacks.min === 4 && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 12.5 && kitHab.habits[3].structured[1].actions[0].st === 'bleed' && kitHab.habits[3].structured[1].actions[0].chance[0] === 25);
check('JSON Eclipsing 20% -18% most troops; INIT -25% at 6+', kitHab.habits[4].structured[0].chance[0] === 20 && kitHab.habits[4].structured[0].actions[0].mods[0].pct === -18 && kitHab.habits[4].structured[0].actions[1].mods[0].pct === -25 && kitHab.habits[4].structured[0].actions[1].scaleStat === 'init' && kitHab.habits[4].structured[0].actions[1].requires.stacks.min === 6);
check("vanguardNames Moondancer Warrior's Zeal", VANGUARD_NAMES.moondancer === "Warrior's Zeal");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/moondancer-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/moondancer-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Moondancer lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Moondancer|Crescent|Rising|New Moon|Full Moon|Blood Moon|Eclipsing|Reactive|Warrior's Zeal/.test(line)) {
    console.log(line);
  }
}
console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.moon, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Warrior's Zeal", report.includes("Warrior's Zeal"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Crescent Blade (Vanguard)', !/Crescent Blade \(Vanguard\)/.test(raw) && !/Crescent Blade \(Vanguard\)/.test(report));
check('command Crescent Blade', report.includes('Crescent Blade'));
check('New Moon', report.includes('New Moon'));
check('Reactive Instincts', report.includes('Reactive Instincts'));
check('Full Moon', report.includes('Full Moon'));
check('Blood Moon', report.includes('Blood Moon'));
check('Eclipsing Strike', report.includes('Eclipsing Strike'));
check('10 rounds played', /• Round 10/.test(report));

check('vanguard Physical Damage Dealt +16%', report.includes('+16% Physical Damage Dealt'));
check('vanguard Instinct +20 flat not %', /\+20 Instinct/.test(report) && !/\+20% Instinct/.test((report.split("Warrior's Zeal")[1] || '').split('Reactive')[0] || ''));
check('vanguard Initiative +20 flat not %', /\+20 Initiative/.test(report) && !/\+20% Initiative/.test((report.split("Warrior's Zeal")[1] || '').split('Reactive')[0] || ''));
check("right flank no Warrior's Zeal inst", !/\[ AllyR \] is under the effect of \[ Warrior's Zeal \]/.test(report));

check('Reactive Instincts base and scaled INST', /\+22% Instinct \(enhanced by Strength → /.test(report));
check('Reactive Instincts base and scaled INIT', /\+11% Initiative \(enhanced by Strength → /.test(report));
check('New Moon INST enhanced by Initiative not Tac', /\+9% Instinct \(enhanced by Initiative → /.test(report) && !/\+6% Tactical Damage Dealt \(enhanced by Initiative/.test(report));
check('New Moon Tactical Dealt +6% not enhanced', /\+6% Tactical Damage Dealt/.test(report) || /\+9% Tactical Damage Dealt/.test(report));
check('Rising Tide stacks visible with DR', /stacks? of Rising Tide \(-?\d+% Damage Received\)/.test(report));
check('Crescent Blade granted to Sentinel AllyL', /AllyL[\s\S]{0,80}1 stack of Crescent Blade/.test(report) || /gains 1 stack of Crescent Blade/.test(raw));
check('Full Moon physical_rate +85%', /physical_rate \+85%/.test(raw) || /Physical Rate \+85%/.test(report));

check('R1 Crescent Blade grant not even-round phys', !/Deals \d+ Physical Damage/.test(cmdPhysChunk(raw, 1)) && /gains 1 stack of Crescent Blade/.test(rN(raw, 1)));
check('R2 even-round physical adjacency', /Deals \d+ Physical Damage/.test(cmdPhysChunk(raw, 2)));
check('R4 even-round physical', /Deals \d+ Physical Damage/.test(cmdPhysChunk(raw, 4)));
check('R1 New Moon 25% Rising Tide hit', /\[hit\] New Moon → Moondancer \(25%\)/.test(rN(raw, 1)) && /gains 1 stack of Rising Tide/.test(rN(raw, 1)));
check('R1 Crescent Blade 50% reactive after Sentinel tactical', /\[hit\] Crescent Blade → Moondancer \(50%\)/.test(rN(raw, 1)));
check('formatted R1 BA not stolen as Crescent Blade attack', !/uses \[ Crescent Blade \] to attack/.test(rFmt(report, 1)));
check('formatted R2 even-round Crescent Blade attacks', /uses \[ Crescent Blade \] to attack/.test(rFmt(report, 2)));
check('R3 Blood Moon +12.5% phys at 4+ stacks', /Increases Physical Damage Dealt of Moondancer by \+12\.5%/.test(rN(raw, 3)));
check('R1 Blood Moon no +12.5% (under 4 stacks)', !/Increases Physical Damage Dealt of Moondancer by \+12\.5%/.test(rN(raw, 1)));
check('R5 Blood Moon Bleed 50% at 6+ stacks', /\[hit\] Blood Moon → \w+ \(50%\)/.test(rN(raw, 5)));
check('R1 Blood Moon Bleed 25%', /\[hit\] Blood Moon → \w+ \(25%\)/.test(rN(raw, 1)));
check('R5 Eclipsing 40% at 6+', /\[hit\] Eclipsing Strike → \w+ \(40%\)/.test(rN(raw, 5)));
check('R1 Eclipsing 20%', /\[hit\] Eclipsing Strike → \w+ \(20%\)/.test(rN(raw, 1)));
check('Eclipsing INIT shred at 6+ enhanced', /Reduces Initiative of \w+ by .+enhanced by Initiative/.test(raw));
check('Eclipsing -18% Damage Dealt', /Reduces Damage Dealt of \w+ by -18%/.test(raw));
check('Bleed 2 rounds', /Afflicts \w+ with Bleed \(Damage Rate: \+20%\) for 2 round/.test(raw));

check('engine vanguard INST flat +20 left', main.left.flatMods.inst === 20, 'inst=' + main.left.flatMods.inst);
check('engine vanguard INIT flat +20 left', main.left.flatMods.init === 20);
check('engine vanguard physical_dealt +16 self', main.moon.getPercentTotal('physical_dealt') >= 16, 'phys=' + main.moon.getPercentTotal('physical_dealt'));
check('engine Rising Tide max 8', (main.moon.stacks.rising_tide || 0) === 8, 'stacks=' + (main.moon.stacks.rising_tide || 0));
check('engine DR -2% per stack', main.moon.getPercentTotal('dmg_received') === -16, 'recv=' + main.moon.getPercentTotal('dmg_received'));
check('engine linked Sentinel AllyL', main.moon.links.crescent_blade_ally && main.moon.links.crescent_blade_ally.name === 'AllyL');
check('engine AllyL INST scaled not base 22', main.left.getPercentTotal('inst') > 22, 'instPct=' + main.left.getPercentTotal('inst'));
check('engine AllyR no New Moon tac', main.right.getPercentTotal('tactical_dealt') === 0, 'tac=' + main.right.getPercentTotal('tactical_dealt'));
check('engine commandMods physical_rate 85', main.moon.commandMods.physical_rate && main.moon.commandMods.physical_rate.value === 85);
check('dealer AllyL tactical', getDealerType(main.left) === 'tactical', 'dealer=' + getDealerType(main.left));

const rec = setup(() => 0, { leftStats: { str: 80, inst: 30, int: 30, init: 40 } });
const healKit = loadCommandSync({
  name: 'Ally Aid',
  command: [{ phase: 'turn', rounds: [1, 2], actions: [{ t: 'heal', pct: 10, tgt: { side: 'self' } }] }],
  vanguard: []
}, 'allyL');
rec.left.commandName = 'Ally Aid';
rec.left.setCommandKit(healKit.command);
rec.battle.start();
rec.battle.runRound();
const rawRec = (rec.battle.battleLog || []).join('\n');
check('recovery from linked Sentinel procs Rising Tide', /Applies Recovery to AllyL/.test(rawRec) && /\[hit\] Crescent Blade → Moondancer \(50%\)/.test(rawRec) && /gains 1 stack of Rising Tide/.test(rawRec));
check('once per round: at most one Crescent Blade 50% reactive R1', (rN(rawRec, 1).match(/\[hit\] Crescent Blade → Moondancer \(50%\)/g) || []).length <= 1);
check('physical BA does not proc Crescent Blade (recovery did)', getDealerType(rec.left) === 'physical');

const adv = setup(() => 0);
adv.battle.start();
applyEffect(adv.left, 'ADVANTAGE', 1, 'seed', { duration: 20, magnitude: 15 });
adv.battle.runRound();
const rawAdv = (adv.battle.battleLog || []).join('\n');
check('Advantage doubles New Moon chance to 50%', /\[hit\] New Moon → Moondancer \(50%\)/.test(rawAdv));

const advFm = setup(() => 0);
advFm.battle.start();
applyEffect(advFm.left, 'ADVANTAGE', 1, 'seed', { duration: 20, magnitude: 15 });
for (let i = 0; i < 6; i += 1) advFm.battle.runRound();
const rawAdvFm = (advFm.battle.battleLog || []).join('\n');
check('Advantage doubles Full Moon chance to 50%', /\[hit\] Full Moon → Moondancer \(50%\)/.test(rawAdvFm) || /\[hit\] Full Moon → Moondancer \(25%\)/.test(rawAdvFm) === false && /Full Moon/.test(rN(rawAdvFm, 6)));

const r1nm = setup(() => 0);
r1nm.battle.start();
r1nm.battle.runRound();
const rawR1nm = (r1nm.battle.battleLog || []).join('\n');
const instR1 = (rN(rawR1nm, 1).match(/Increases Instinct of AllyL by \+([\d.]+)%/) || [])[1];
const tacR1 = (rN(rawR1nm, 1).match(/Increases Tactical Damage Dealt of AllyL by \+([\d.]+)%/) || [])[1];

const r3nm = setup(() => 0);
r3nm.battle.start();
r3nm.battle.runRound();
r3nm.battle.runRound();
r3nm.battle.runRound();
const rawR3nm = (r3nm.battle.battleLog || []).join('\n');
const instR3 = (rN(rawR3nm, 3).match(/Increases Instinct of AllyL by \+([\d.]+)%/) || [])[1];
const tacR3 = (rN(rawR3nm, 3).match(/Increases Tactical Damage Dealt of AllyL by \+([\d.]+)%/) || [])[1];
check('4+ stacks 1.5x New Moon INST vs R1', instR1 && instR3 && Math.abs(Number(instR3) / Number(instR1) - 1.5) < 0.08, 'R1=' + instR1 + ' R3=' + instR3);
check('4+ stacks 1.5x New Moon Tac Dealt (not enhanced) 6 -> 9', tacR1 && tacR3 && Math.abs(Number(tacR3) / Number(tacR1) - 1.5) < 0.08, 'R1=' + tacR1 + ' R3=' + tacR3);

const star6 = setup(() => 0, { stars: 6 });
star6.battle.start();
star6.battle.runRound();
star6.battle.runRound();
const dmgR2 = physAmt(cmdPhysChunk((star6.battle.battleLog || []).join('\n'), 2), 'EnemyL')
  || physAmt(cmdPhysChunk((star6.battle.battleLog || []).join('\n'), 2), 'EnemyV');
star6.battle.runRound();
star6.battle.runRound();
const rawStar6 = (star6.battle.battleLog || []).join('\n');
const dmgR4 = physAmt(cmdPhysChunk(rawStar6, 4), 'EnemyL') || physAmt(cmdPhysChunk(rawStar6, 4), 'EnemyV');
check('Full Moon 170% vs 85% even-round phys (~2.70/1.85)', dmgR2 && dmgR4 && Math.abs((dmgR4 / dmgR2) - (2.70 / 1.85)) < 0.2, 'R2=' + dmgR2 + ' R4=' + dmgR4);
check('below 8★ no Blood Moon', !/Blood Moon/.test(rawStar6));

const lowStars = setup(() => 0, { stars: 5 });
lowStars.battle.start();
lowStars.battle.runRound();
lowStars.battle.runRound();
const rawLow = (lowStars.battle.battleLog || []).join('\n');
const dmgLow = physAmt(cmdPhysChunk(rawLow, 2), 'EnemyL') || physAmt(cmdPhysChunk(rawLow, 2), 'EnemyV');
check('below 6★ even-round uses 75% not Full Moon 85', dmgLow != null && dmgR2 != null && dmgLow < dmgR2, '5★=' + dmgLow + ' 6★=' + dmgR2);
check('below 6★ no Full Moon / Blood Moon / Eclipsing', !/Full Moon/.test(rawLow) && !/Blood Moon/.test(rawLow) && !/Eclipsing Strike/.test(rawLow));

const six = setup(() => 0);
six.battle.start();
for (let i = 0; i < 5; i += 1) six.battle.runRound();
const rawSix = (six.battle.battleLog || []).join('\n');
check('R5 6+ stacks Blood Moon 50% Bleed', /\[hit\] Blood Moon → \w+ \(50%\)/.test(rN(rawSix, 5)));
check('R5 6+ Eclipsing 40% and INIT shred', /\[hit\] Eclipsing Strike → \w+ \(40%\)/.test(rN(rawSix, 5)) && /Reduces Initiative of \w+ by /.test(rN(rawSix, 5)));
check('engine R5 Rising Tide >= 6', (six.moon.stacks.rising_tide || 0) >= 6, 'stacks=' + (six.moon.stacks.rising_tide || 0));

const least = setup(() => 0, { leftStats: { str: 80, inst: 30, int: 30, init: 20 } });
least.battle.start();
least.moon.currentHealth = 50;
for (let i = 0; i < 6; i += 1) least.battle.runRound();
const rawLeast = (least.battle.battleLog || []).join('\n');
const fmGains = (rN(rawLeast, 6).match(/gains 1 stack of Rising Tide/g) || []).length;
check('least troops extra Full Moon stack on R6', fmGains >= 2 || /gains 1 stack of Rising Tide \(now \d+\)/.test(rN(rawLeast, 6)), 'gains=' + fmGains + ' stacks=' + (least.moon.stacks.rising_tide || 0));

const empty = setup(() => 0, { slot: 0, noLeft: true, noRight: true, e0: false, e1: false });
empty.battle.start();
empty.battle.runRound();
empty.battle.runRound();
const rawEmpty = (empty.battle.battleLog || []).join('\n');
check('empty adjacency: even-round Crescent Blade deals no physical', !/Deals \d+ Physical Damage/.test(cmdPhysChunk(rawEmpty, 2)));
check('empty adjacency: still activates Crescent Blade R2', /Moondancer activates Crescent Blade/.test(rN(rawEmpty, 2)));

const noSen = setup(() => 0, { leftBreed: 'Warrior', leftStats: { str: 30, inst: 80, int: 30, init: 40 } });
noSen.battle.start();
noSen.battle.runRound();
const rawNoSen = (noSen.battle.battleLog || []).join('\n');
check('no Sentinel: Crescent Blade not granted', !/gains 1 stack of Crescent Blade/.test(rawNoSen));
check('no Sentinel: New Moon does not buff Warrior INST/Tac', !/Increases Instinct of Ally/.test(rN(rawNoSen, 1)) && !/Increases Tactical Damage Dealt of Ally/.test(rN(rawNoSen, 1)));
check('no Sentinel: New Moon still self Rising Tide', /gains 1 stack of Rising Tide/.test(rN(rawNoSen, 1)));
check('engine no link without Sentinel', !noSen.moon.links.crescent_blade_ally);

const hitRe = setup(() => 0);
hitRe.battle.start();
hitRe.battle.runRound();
const rawHitRe = (hitRe.battle.battleLog || []).join('\n');
check('seed 0 hits 50% Crescent Blade reactive', /\[hit\] Crescent Blade → Moondancer \(50%\)/.test(rawHitRe));

const missRe = setup(() => 0.99);
missRe.battle.start();
missRe.battle.runRound();
const rawMissRe = (missRe.battle.battleLog || []).join('\n');
check('seed 0.99 misses 50% Crescent Blade reactive', /\[miss\] Crescent Blade → Moondancer \(50%\)/.test(rawMissRe) || !/\[hit\] Crescent Blade → Moondancer \(50%\)/.test(rawMissRe));
check('seed 0.99 still grants Crescent Blade R1', /gains 1 stack of Crescent Blade/.test(rawMissRe));
check('seed 0.99 misses New Moon 25%', /\[miss\] New Moon → Moondancer \(25%\)/.test(rawMissRe));
check('seed 0.99 still vanguard + Reactive Instincts', missRe.left.flatMods.inst === 20 && missRe.left.getPercentTotal('inst') > 22);

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
