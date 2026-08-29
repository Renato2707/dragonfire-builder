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
