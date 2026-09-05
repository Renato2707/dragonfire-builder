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
import { applyEffect, hasEffect } from './effects.js';
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
  const habits = JSON.parse(fs.readFileSync('./data/nyrena_habits.json', 'utf8'));
  const cmd = JSON.parse(fs.readFileSync('./data/nyrena_vanguard_command.json', 'utf8'));

  const data = {
    id: 'nyrena', name: 'Nyrena', rarity: 'Rare', breed: 'Champion',
    stats: { str: 55, inst: 58, int: 38, init: 43 },
    affinity: ['shieldbearers', 'siege'], weaknesses: []
  };
  const stars = extras.stars != null ? extras.stars : 10;
  const nyr = new Character(data, 0, extras.slot != null ? extras.slot : 1, {
    level: 16, stars, habitRank: extras.habitRank != null ? extras.habitRank : 1
  });
  nyr.setTroopType('shieldbearers');
  loadKit(nyr, habits, cmd);

  const left = extras.noLeft ? null : dummy(
    'allyL', 'AllyL', 0, 0,
    extras.leftStats || { str: 40, inst: 40, int: 40, init: 30 }
  );
  if (left) left.setTroopType('shieldbearers');
  const right = extras.noRight ? null : dummy(
    'allyR', 'AllyR', 0, 2,
    extras.rightStats || { str: 40, inst: 40, int: 40, init: 30 }
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
    ? [left, right, nyr].filter(Boolean)
    : extras.slot === 0
      ? [nyr, left, right].filter(Boolean)
      : [left, nyr, right].filter(Boolean);
  const teamB = [e0, e1, e2].filter(Boolean);
  const battle = new Battle(teamA, teamB, {
    teamTroop: ['shieldbearers', 'spearmen'],
    defendingTeam: extras.defendingTeam != null ? extras.defendingTeam : 1,
    verbose: false
  });
  return { battle, nyr, left, right, e0, e1, e2 };
}

function dumpEngine(label, nyr, left, right, e0, e1, e2) {
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
      fireDealt: c.getPercentTotal('fire_dealt'),
      tacDealt: c.getPercentTotal('tactical_dealt'),
      physDealt: c.getPercentTotal('physical_dealt'),
      physRecv: c.getPercentTotal('physical_received'),
      dmgRecv: c.getPercentTotal('dmg_received'),
      flat: { ...c.flatMods },
      dealer: getDealerType(c),
      breed: c.breed,
      hp: Math.round(c.currentHealth) + '/' + Math.round(c.maxHealth)
    };
  };
  lines.push('===== ' + label + ' =====');
  for (const c of [nyr, left, right, e0, e1, e2]) {
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

function cmdChunk(raw, n) {
  const chunk = rN(raw, n);
  const after = (chunk.split('Nyrena activates Undermine')[1] || '');
  return after.split('Nyrena launches')[0];
}

const kitCmd = JSON.parse(fs.readFileSync('./data/nyrena_vanguard_command.json', 'utf8'));
const kitHab = JSON.parse(fs.readFileSync('./data/nyrena_habits.json', 'utf8'));

// Gemini SUMMARY says "Physical Damage Received" but ACTIVE body says Dealt.
check('JSON command name Undermine', kitCmd.name === 'Undermine');
check('JSON Undermine phys DEALT not received (ACTIVE body, not SUMMARY slip)', kitCmd.command[0].actions[0].mods[0].stat === 'physical_dealt' && kitCmd.command[0].actions[0].mods[0].pct === -10);
check('JSON Undermine 10% at block (one roll for 3 enemies)', kitCmd.command[0].chance === 10 && kitCmd.command[0].actions[0].chance == null);
check('JSON Undermine dur 1, doubled to 2 if Burn', kitCmd.command[0].actions[0].dur === 1 && kitCmd.command[0].actions[0].ifBonus.status === 'burn' && kitCmd.command[0].actions[0].ifBonus.dur === 2);
check('JSON Undermine 3 enemies any lane', kitCmd.command[0].actions[0].tgt.count === 3 && kitCmd.command[0].actions[0].tgt.select === 'any' && kitCmd.command[0].actions[0].tgt.side === 'enemy');
check('JSON R1,3 fire 20% 3 any', kitCmd.command[1].rounds.join() === '1,3' && kitCmd.command[1].actions[0].dt === 'fire' && kitCmd.command[1].actions[0].pct === 20 && kitCmd.command[1].actions[0].tgt.count === 3);
check('JSON R5,7,9 tactical 80% same lane', kitCmd.command[2].rounds.join() === '5,7,9' && kitCmd.command[2].actions[0].dt === 'tactical' && kitCmd.command[2].actions[0].pct === 80 && kitCmd.command[2].actions[0].tgt.select === 'same_lane' && kitCmd.command[2].actions[0].tgt.count === 1);
check('JSON vanguard STR/INT/INST fixed 15', kitCmd.vanguard[0].actions[0].mods.every(m => m.fixed === 15) && kitCmd.vanguard[0].actions[0].mods.map(m => m.stat).join() === 'str,int,inst');
check('JSON vanguard right flank slot 2 -8%', kitCmd.vanguard[0].actions[1].mods[0].stat === 'dmg_received' && kitCmd.vanguard[0].actions[1].mods[0].pct === -8 && kitCmd.vanguard[0].actions[1].tgt.slot === 2);
check('JSON Battle Dread -4 not Caraxes -6.5', kitHab.habits[0].name === 'Battle Dread' && kitHab.habits[0].scaling[0].values[0] === -4 && kitHab.habits[0].structured[0].actions[0].scaleStat === 'int');
check('JSON Mindful Synergy +4 enhanced INIT', kitHab.habits[1].name === 'Mindful Synergy' && kitHab.habits[1].scaling[0].values[0] === 4 && kitHab.habits[1].structured[0].actions[0].scaleStat === 'init');
check('JSON Deepen table 10/8/12 ... 20/16/24', kitHab.habits[2].scaling[0].values[0] === 10 && kitHab.habits[2].scaling[1].values[0] === 8 && kitHab.habits[2].scaling[2].values[0] === 12 && kitHab.habits[2].scaling[0].values[4] === 20 && kitHab.habits[2].scaling[1].values[4] === 16 && kitHab.habits[2].scaling[2].values[4] === 24);
check('JSON Deepen R1 self +8% 5r, R6 adj ally +12% 5r', kitHab.habits[2].structured[0].rounds.join() === '1' && kitHab.habits[2].structured[0].actions[0].mods[0].pct[0] === 8 && kitHab.habits[2].structured[0].actions[0].dur === 5 && kitHab.habits[2].structured[1].rounds.join() === '6' && kitHab.habits[2].structured[1].actions[0].mods[0].pct[0] === 12 && kitHab.habits[2].structured[1].actions[0].tgt.excludeSelf === true && kitHab.habits[2].structured[1].actions[0].tgt.select === 'adjacency');
check("JSON Dragon's Ire +4 tac/fire self", kitHab.habits[3].name === "Dragon's Ire" && kitHab.habits[3].structured[0].actions[0].mods[0].pct[0] === 4 && kitHab.habits[3].structured[0].actions[0].mods[1].pct[0] === 4);
check('JSON Long Siege -5 R6-10 defending x2', kitHab.habits[4].name === 'The Long Siege' && kitHab.habits[4].structured[0].rounds.join() === '6,7,8,9,10' && kitHab.habits[4].structured[0].actions[0].mods[0].pct[0] === -5 && kitHab.habits[4].structured[0].actions[0].ifBonus.defending === true && kitHab.habits[4].structured[0].actions[0].ifBonus.mult === 2 && kitHab.habits[4].structured[0].actions[0].dur === 1);
check("vanguardNames Nyrena Champion's Brilliance", VANGUARD_NAMES.nyrena === "Champion's Brilliance");

const main = setup(() => 0);
main.battle.start();
for (let i = 0; i < 10; i += 1) main.battle.runRound();

const report = formatBattleReport(main.battle, '═══════════════════════════════════════════════════════\n• Troop Formation\n');
const raw = (main.battle.battleLog || []).join('\n');
fs.writeFileSync('/workspace/dragonfire-builder/nyrena-report.txt', report);
fs.writeFileSync('/workspace/dragonfire-builder/nyrena-raw.txt', raw);

console.log(report);
console.log('\n===== RAW LOG (Nyrena lines) =====');
for (const line of main.battle.battleLog || []) {
  if (/Nyrena|Champion|Undermine|Battle Dread|Mindful|Deepen|Dragon's Ire|Long Siege|Brilliance/.test(line)) {
    console.log(line);
  }
}
console.log('\n' + dumpEngine('ENGINE AFTER 10 ROUNDS (seed 0)', main.nyr, main.left, main.right, main.e0, main.e1, main.e2));

check("vanguard Champion's Brilliance", report.includes("Champion's Brilliance"));
check('no bare [ Vanguard ]', !report.includes('[ Vanguard ]'));
check('no Undermine (Vanguard)', !/Undermine \(Vanguard\)/.test(raw) && !/Undermine \(Vanguard\)/.test(report));
check('command Undermine', report.includes('Undermine'));
check('Battle Dread', report.includes('Battle Dread'));
check('Mindful Synergy', report.includes('Mindful Synergy'));
check('Deepen the Breach', report.includes('Deepen the Breach'));
check("Dragon's Ire", report.includes("Dragon's Ire"));
check('The Long Siege', report.includes('The Long Siege'));
check('10 rounds played', /• Round 10/.test(report));

check('vanguard Strength +15 flat not %', /\+15 Strength/.test(report) && !/\+15% Strength/.test(report.split("Champion's Brilliance")[1] || report));
check('vanguard Intelligence +15 flat', /\+15 Intelligence/.test(report));
check('vanguard Instinct +15 flat', /\+15 Instinct/.test(report));
check('right flank -8% Damage Received', report.includes('-8% Damage Received') && /AllyR/.test(report));
check("left flank no Champion's Brilliance dmg received", !/\[ AllyL \] is under the effect of \[ Champion's Brilliance \]/.test(report));

check('Battle Dread base and scaled STR', /-4% Strength \(enhanced by Intelligence → /.test(report));
check('Battle Dread base and scaled INIT', /-4% Initiative \(enhanced by Intelligence → /.test(report));
check('Mindful Synergy base and scaled INT', /\+4% Intelligence \(enhanced by Initiative → /.test(report));
check('Mindful Synergy base and scaled INST', /\+4% Instinct \(enhanced by Initiative → /.test(report));
check("Dragon's Ire +4% Tactical Dealt", /\+4% Tactical Damage Dealt/.test(report));
check("Dragon's Ire +4% Fire Dealt", /\+4% Fire Damage Dealt/.test(report) || report.includes('+4% Fire Damage Dealt'));

check('R1 Deepen self +8% Fire Dealt 5 rounds', /Increases Fire Damage Dealt of Nyrena by \+8% for 5 round/.test(rN(raw, 1)));
check('R1 no Deepen ally', !/Increases Fire Damage Dealt of Ally/.test(rN(raw, 1)));
check('R6 Deepen ally +12% Fire Dealt 5 rounds', /Increases Fire Damage Dealt of Ally[LR] by \+12% for 5 round/.test(rN(raw, 6)));
check('no tile damage in 3v3 sim', !/tile/i.test(raw) && !/Tile Damage/.test(report));

check('R6 Long Siege attacking -5% not -10%', /Reduces Physical Damage Received of (Nyrena|Ally[LR]) by -5% until the end of the round/.test(rN(raw, 6)) && !/Physical Damage Received of \w+ by -10%/.test(rN(raw, 6)));
check('Long Siege R6-10 present', /The Long Siege/.test(rN(raw, 6)) && /The Long Siege/.test(rN(raw, 10)));
check('Long Siege not R5', !/The Long Siege/.test(rN(raw, 5)) && !/The Long Siege/.test(rN(raw, 1)));

check('R1 Undermine hit 10%', /\[hit\] Undermine → \w+ \(10%\)/.test(rN(raw, 1)));
check('R1 Undermine -10% Physical Dealt 3 enemies EoR (no Burn)', (rN(raw, 1).match(/Reduces Physical Damage Dealt of Enemy[LVR] by -10% until the end of the round/g) || []).length === 3);
check('R1 no Physical Received shred', !/Physical Damage Received of Enemy/.test(cmdChunk(raw, 1)));
check('R1 fire 20% 3 enemies', (cmdChunk(raw, 1).match(/Deals \d+ Fire Damage to Enemy/g) || []).length === 3);
check('R2 no fire command', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 2)));
check('R3 fire command', /Deals \d+ Fire Damage/.test(cmdChunk(raw, 3)));
check('R5 tactical 80% same lane EnemyV', /Deals \d+ Tactical Damage to EnemyV/.test(cmdChunk(raw, 5)));
check('R5 no fire command', !/Deals \d+ Fire Damage/.test(cmdChunk(raw, 5)));
check('R7,9 tactical present', /Deals \d+ Tactical Damage to EnemyV/.test(cmdChunk(raw, 7)) && /Deals \d+ Tactical Damage to EnemyV/.test(cmdChunk(raw, 9)));
check('R4,6 no tactical command dmg', !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 4)) && !/Deals \d+ Tactical Damage/.test(cmdChunk(raw, 6)));

check('engine vanguard STR flat +15', main.nyr.flatMods.str === 15);
check('engine vanguard INT flat +15', main.nyr.flatMods.int === 15);
check('engine vanguard INST flat +15', main.nyr.flatMods.inst === 15);
check('engine right flank -8% DR', main.right.getPercentTotal('dmg_received') === -8, 'recv=' + main.right.getPercentTotal('dmg_received'));
check('engine left flank no vanguard DR', main.left.getPercentTotal('dmg_received') === 0);
check("engine Dragon's Ire fire +4 combat-long", main.nyr.getPercentTotal('fire_dealt') === 4, 'fire=' + main.nyr.getPercentTotal('fire_dealt'));
check("engine Dragon's Ire tac +4", main.nyr.getPercentTotal('tactical_dealt') === 4);
check('engine Battle Dread STR scaled not -4', main.e0.getPercentTotal('str') < -4 && main.e0.getPercentTotal('str') > -8, 'strPct=' + main.e0.getPercentTotal('str'));
check('engine Mindful INT scaled not +4', main.left.getPercentTotal('int') > 4, 'intPct=' + main.left.getPercentTotal('int'));

// ---- Extra: hit / miss 10% Undermine ----
const hit = setup(() => 0);
hit.battle.start();
hit.battle.runRound();
const rawHit = (hit.battle.battleLog || []).join('\n');
check('seed 0 hits 10% Undermine', /\[hit\] Undermine → \w+ \(10%\)/.test(rawHit) && /Reduces Physical Damage Dealt/.test(rawHit));
check('seed 0 still fires R1 fire 20%', /Deals \d+ Fire Damage/.test(cmdChunk(rawHit, 1)));

const miss = setup(() => 0.99);
miss.battle.start();
miss.battle.runRound();
const rawMiss = (miss.battle.battleLog || []).join('\n');
check('seed 0.99 misses 10% Undermine', /\[miss\] Undermine → \w+ \(10%\)/.test(rawMiss) && !/Reduces Physical Damage Dealt/.test(rawMiss));
check('seed 0.99 still fires R1 fire 20%', /Deals \d+ Fire Damage/.test(cmdChunk(rawMiss, 1)));
check('seed 0.99 still vanguard flats', miss.nyr.flatMods.str === 15);

// ---- Extra: Burn present → 2-round duration vs no Burn → 1 round ----
const mix = setup(() => 0);
mix.battle.start();
applyEffect(mix.e1, 'BURN', 1, 'seed', { duration: 20 });
check('EnemyV has Burn before R1', hasEffect(mix.e1, 'burn'));
mix.battle.runRound();
const rawMix = (mix.battle.battleLog || []).join('\n');
check('Burn target Undermine for 2 rounds', /Reduces Physical Damage Dealt of EnemyV by -10% for 2 round/.test(rawMix));
check('no-Burn EnemyL Undermine until EoR', /Reduces Physical Damage Dealt of EnemyL by -10% until the end of the round/.test(rawMix));
check('no-Burn EnemyR Undermine until EoR', /Reduces Physical Damage Dealt of EnemyR by -10% until the end of the round/.test(rawMix));
check('after R1 Burn still has -10% phys dealt', mix.e1.getPercentTotal('physical_dealt') === -10, 'phys=' + mix.e1.getPercentTotal('physical_dealt'));
check('after R1 no-Burn Undermine expired', mix.e0.getPercentTotal('physical_dealt') === 0 && mix.e2.getPercentTotal('physical_dealt') === 0, 'L=' + mix.e0.getPercentTotal('physical_dealt') + ' R=' + mix.e2.getPercentTotal('physical_dealt'));

Math.random = () => 0.99;
mix.battle.runRound();
const reportMix = formatBattleReport(mix.battle, '');
const r2fmt = rFmt(reportMix, 2);
check('R2 miss Undermine 10%', /\[miss\] Undermine/.test(rN((mix.battle.battleLog || []).join('\n'), 2)));
check('R2 formatted Burn target still under Undermine', /\[ EnemyV \] is under the effect of \[ Undermine \]/.test(r2fmt));
check('R2 formatted no-Burn not under Undermine from R1', !/\[ EnemyL \] is under the effect of \[ Undermine \]/.test(r2fmt) && !/\[ EnemyR \] is under the effect of \[ Undermine \]/.test(r2fmt));

const noBurn = setup(() => 0);
noBurn.battle.start();
noBurn.battle.runRound();
const rawNoBurn = (noBurn.battle.battleLog || []).join('\n');
check('no Burn: all 3 Undermine until EoR not 2 rounds', (rawNoBurn.match(/Reduces Physical Damage Dealt of Enemy[LVR] by -10% until the end of the round/g) || []).length === 3 && !/Physical Damage Dealt of Enemy\w+ by -10% for 2 round/.test(rawNoBurn));
check('no Burn after R1 all expired', noBurn.e0.getPercentTotal('physical_dealt') === 0 && noBurn.e1.getPercentTotal('physical_dealt') === 0 && noBurn.e2.getPercentTotal('physical_dealt') === 0);

// ---- Extra: Deepen R6 adjacency empty ----
const empty = setup(() => 0, { noLeft: true, noRight: true, e0: false, e2: false });
empty.battle.start();
for (let i = 0; i < 6; i += 1) empty.battle.runRound();
const rawEmpty = (empty.battle.battleLog || []).join('\n');
check('empty adjacency: R1 Deepen self still +8%', /Increases Fire Damage Dealt of Nyrena by \+8%/.test(rN(rawEmpty, 1)));
check('empty adjacency: R6 Deepen no ally Fire Dealt', !/Increases Fire Damage Dealt of Ally/.test(rN(rawEmpty, 6)));
check('empty adjacency: R6 still activates Deepen', /Nyrena activates Deepen the Breach/.test(rN(rawEmpty, 6)));

// ---- Extra: Long Siege defending vs attacking ----
const def = setup(() => 0, { defendingTeam: 0 });
def.battle.start();
for (let i = 0; i < 6; i += 1) def.battle.runRound();
const rawDef = (def.battle.battleLog || []).join('\n');
check('defending Long Siege -10% doubled', /Reduces Physical Damage Received of (Nyrena|Ally[LR]) by -10% until the end of the round/.test(rN(rawDef, 6)));
check('defending Long Siege not -5%', !/Physical Damage Received of \w+ by -5%/.test(rN(rawDef, 6)));

const atk = setup(() => 0, { defendingTeam: 1 });
atk.battle.start();
for (let i = 0; i < 6; i += 1) atk.battle.runRound();
const rawAtk = (atk.battle.battleLog || []).join('\n');
check('attacking Long Siege -5%', /Reduces Physical Damage Received of (Nyrena|Ally[LR]) by -5% until the end of the round/.test(rN(rawAtk, 6)));
check('attacking Long Siege not -10%', !/Physical Damage Received of \w+ by -10%/.test(rN(rawAtk, 6)));

console.log('\n===== CHECK SUMMARY =====');
const failed = checks.filter(c => !c.ok);
console.log(checks.filter(c => c.ok).length + ' passed, ' + failed.length + ' failed');
for (const f of failed) console.log('FAIL', f.name, f.detail || '');
process.exit(failed.length ? 1 : 0);
