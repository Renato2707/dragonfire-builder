import fs from 'fs';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { applyInitiativeOrder } from './hook-initiative-order.js';
import { applyVanguardLabel } from './hook-vanguard-label.js';
import { loadDragonHabitsSync, loadCommandSync } from './habitParser.js';
import { VANGUARD_NAMES } from './vanguardNames.js';
import { formatBattleReport } from './reportFormat.js';

applyInitiativeOrder(Battle);
applyVanguardLabel(Battle);

Math.random = () => 0;

const DATA_DIR = './data';
const OFFICIAL_HABITS = '/workspace/official/Habits.txt';
const OFFICIAL_VANGUARD = '/workspace/official/Vanguard and Commands.txt';
const SKIP = new Set(['antares', 'arrax']);
const SLOT_FLANK = { 0: 'left', 2: 'right' };

function titleCaseOfficial(raw) {
  return String(raw || '').trim().split(/\s+/).map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word)).join(' ');
}

function parseOfficialHabits(text) {
  const map = {};
  const parts = text.split(/^(?=.+ habits\s*$)/m);
  for (const part of parts) {
    const header = part.match(/^(.+?) habits\s*$/m);
    if (!header) continue;
    const id = header[1].trim().toLowerCase();
    const names = [...part.matchAll(/^(.+?) \(unlocks at (\d+) stars\)\s*$/gm)].map(row => row[1].trim());
    map[id] = { display: header[1].trim(), names };
  }
  return map;
}

function parseOfficialVanguard(text) {
  const map = {};
  const chunks = text.split(/^### /m).slice(1);
  for (const chunk of chunks) {
    const nameLine = chunk.match(/^([A-Z][A-Z ']+)\s*$/m);
    if (!nameLine) continue;
    const id = nameLine[1].trim().toLowerCase().replace(/\s+/g, '');
    const vgMatch = chunk.match(/Vanguard:\s+([A-Z][A-Z' ]+?)\s+At Level/i);
    const cmdMatch = chunk.match(/Command:\s+([A-Z][A-Z' ]+?)\s+(ACTIVE|ATTACK MODIFIER)/i);
    const vgLine = (chunk.match(/Vanguard:\s+([^\n]+)/) || [])[1] || '';
    let flank = null;
    if (/Right Flank/i.test(vgLine)) flank = 'right';
    else if (/Left Flank/i.test(vgLine)) flank = 'left';
    map[id] = { display: nameLine[1].trim(), vanguard: vgMatch ? titleCaseOfficial(vgMatch[1]) : null, command: cmdMatch ? titleCaseOfficial(cmdMatch[1]) : null, vgLine, flank };
  }
  return map;
}

function dummy(id, name, team, slot, stats, troop) {
  const character = new Character({ id, name, breed: 'Warrior', rarity: 'Rare', stats: stats || { str: 50, inst: 50, int: 50, init: 40 }, affinity: [], weaknesses: [] }, team, slot, { level: 16, stars: 10, habitRank: 1 });
  character.setTroopType(troop || 'shieldbearers');
  return character;
}

function loadKit(character, habits, cmd) {
  character.setHabits(loadDragonHabitsSync(habits, character.id));
  const kit = loadCommandSync(cmd, character.id);
  character.commandName = kit.name;
  character.vanguardName = VANGUARD_NAMES[character.id] || kit.name;
  character.setCommandKit(kit.command);
  character.setVanguardKit(kit.vanguard);
}

function actionChance(action) {
  if (!action) return 100;
  if (Array.isArray(action.chance)) return action.chance[0] ?? 100;
  if (action.chance == null) return 100;
  return action.chance;
}

function actionConditional(action) {
  if (!action) return false;
  return !!(action.ifBonus || action.ifStacks || action.if || action.ifAlready || (action.tgt && action.tgt.select && /dealer:|prefer_dealer:|status:|marked|prey/i.test(String(action.tgt.select))));
}

function describeGate(habit, maxRound) {
  const blocks = habit.structured || habit.blocks || [];
  const reasons = [];
  let guaranteed = false;
  for (const block of blocks) {
    const phase = block.phase || 'turn';
    const rounds = Array.isArray(block.rounds) && block.rounds.length ? block.rounds : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const inPlayed = rounds.some(r => r <= maxRound);
    const lateOnly = rounds.every(r => r > maxRound);
    const req = block.requires || {};
    if (req.selfHpBelow != null || req.troopsBelow != null) reasons.push(habit.name + ': requires HP below ' + (req.selfHpBelow || req.troopsBelow) + '%');
    if (req.command) reasons.push(habit.name + ': requires command ' + req.command);
    const reqBlocks = !!(req.selfHpBelow != null || req.troopsBelow != null || req.hasPrey || req.noPrey || req.linkedRetreated || req.selfStatus || req.stacks || req.troop);
    for (const action of block.actions || []) {
      const chance = actionChance(action);
      const cond = actionConditional(action);
      const tgt = action.tgt || {};
      const select = String(tgt.select || '');
      const hpGate = tgt.hpBelow != null || tgt.hpAtLeast != null;
      const silent = action.t === 'mod_command' || action.t === 'copy_status';
      if (lateOnly) reasons.push(habit.name + ': rounds after last played ' + maxRound);
      if (chance < 100) reasons.push(habit.name + ': chance ' + chance + '% on ' + phase);
      if (cond) reasons.push(habit.name + ': conditional targeting');
      if (hpGate) reasons.push(habit.name + ': HP-band targeting');
      if (silent) reasons.push(habit.name + ': ' + action.t);
      if (phase === 'low_health' || phase === 'on_prey_recovery' || phase === 'on_self_first_damage' || phase === 'on_ally_fire_damage' || phase === 'on_taunt' || phase === 'on_link_proc') reasons.push(habit.name + ': reactive phase ' + phase);
      const alwaysPhase = phase === 'combat_start' || phase === 'round_start' || phase === 'turn' || phase === 'after_basic_attack';
      if (alwaysPhase && inPlayed && chance >= 100 && !cond && !lateOnly && !reqBlocks && !hpGate && !silent) guaranteed = true;
    }
    if (!(block.actions || []).length && inPlayed && !reqBlocks) guaranteed = true;
  }
  if (!blocks.length) reasons.push(habit.name + ': no structured blocks');
  return { guaranteed, reasons: [...new Set(reasons)] };
}

function vanguardSlots(cmd) {
  const found = [];
  for (const block of cmd.vanguard || []) {
    for (const action of block.actions || []) {
      const tgt = action.tgt || {};
      if (tgt.side === 'ally' && tgt.slot != null) found.push({ slot: tgt.slot, flank: SLOT_FLANK[tgt.slot] || ('slot' + tgt.slot) });
    }
  }
  return found;
}

function vanguardRankValues(cmd) {
  const values = [];
  for (const block of cmd.vanguard || []) {
    for (const action of block.actions || []) {
      for (const mod of action.mods || []) {
        const arr = mod.fixed != null ? mod.fixed : mod.pct;
        const n = Array.isArray(arr) ? arr[0] : arr;
        values.push({ stat: mod.stat, value: n });
      }
    }
  }
  return values;
}

function officialHasNumber(line, value) {
  if (value == null || !line) return true;
  const abs = Math.abs(Number(value));
  const re = new RegExp('(?:^|[^0-9.])' + String(abs).replace('.', '\\.') + '(?:%|\\b)');
  return re.test(line);
}

const officialHabits = parseOfficialHabits(fs.readFileSync(OFFICIAL_HABITS, 'utf8'));
const officialVanguard = parseOfficialVanguard(fs.readFileSync(OFFICIAL_VANGUARD, 'utf8'));
const dragonsFile = JSON.parse(fs.readFileSync(DATA_DIR + '/dragons.json', 'utf8'));
const dragons = (dragonsFile.dragons || []).slice().sort((a, b) => a.id.localeCompare(b.id));
fs.mkdirSync('/tmp/kit-reports', { recursive: true });
const results = [];

for (const dragon of dragons) {
  if (SKIP.has(dragon.id)) continue;
  const row = { id: dragon.id, name: dragon.name, pass: true, fails: [], notes: [], gatedHabits: [], missingFiles: [], fixPushed: false };
  const fail = (code, detail) => { row.pass = false; row.fails.push({ code, detail }); };
  const habitsPath = DATA_DIR + '/' + dragon.id + '_habits.json';
  const cmdPath = DATA_DIR + '/' + dragon.id + '_vanguard_command.json';
  const habitsOk = fs.existsSync(habitsPath);
  const cmdOk = fs.existsSync(cmdPath);
  if (!habitsOk) { fail('missing-file', dragon.id + '_habits.json'); row.missingFiles.push(dragon.id + '_habits.json'); }
  if (!cmdOk) { fail('missing-file', dragon.id + '_vanguard_command.json'); row.missingFiles.push(dragon.id + '_vanguard_command.json'); }
  const offH = officialHabits[dragon.id];
  const offV = officialVanguard[dragon.id];
  if (!offH) row.notes.push('no official Habits.txt section');
  if (!offV) row.notes.push('no official Vanguard and Commands.txt section');
  let habitsJson = null;
  let cmdJson = null;
  if (habitsOk) { try { habitsJson = JSON.parse(fs.readFileSync(habitsPath, 'utf8')); } catch (err) { fail('bad-json', 'habits: ' + err.message); } }
  if (cmdOk) { try { cmdJson = JSON.parse(fs.readFileSync(cmdPath, 'utf8')); } catch (err) { fail('bad-json', 'vanguard_command: ' + err.message); } }
  const jsonHabitNames = (habitsJson && habitsJson.habits || []).map(h => h.name);
  const jsonCmdName = cmdJson && cmdJson.name;
  const vgTitle = VANGUARD_NAMES[dragon.id];
  if (offH && jsonHabitNames.length && jsonHabitNames.join('|') !== offH.names.join('|')) fail('habit-name-vs-official', 'JSON vs official habit names');
  if (offV && jsonCmdName && offV.command && jsonCmdName.toLowerCase() !== offV.command.toLowerCase()) fail('command-name-vs-official', 'JSON "' + jsonCmdName + '" vs official "' + offV.command + '"');
  if (offV && vgTitle && offV.vanguard && vgTitle.toLowerCase() !== offV.vanguard.toLowerCase()) fail('vanguard-name-vs-official', vgTitle + ' vs ' + offV.vanguard);
  if (cmdJson && offV && offV.flank) {
    const mismatch = vanguardSlots(cmdJson).filter(s => s.flank && s.flank !== offV.flank);
    if (mismatch.length) fail('vanguard-targeting', 'JSON vs official ' + offV.flank + ' flank');
  }
  if (cmdJson && offV && offV.vgLine) {
    for (const item of vanguardRankValues(cmdJson)) {
      if (!officialHasNumber(offV.vgLine, item.value)) fail('vanguard-number-vs-official', item.stat + '=' + item.value);
    }
  }
  if (!habitsJson || !cmdJson) { results.push(row); continue; }
  const troop = (dragon.affinity && dragon.affinity[0]) || 'shieldbearers';
  const main = new Character({ id: dragon.id, name: dragon.name, rarity: dragon.rarity, breed: dragon.breed, stats: dragon.stats, affinity: dragon.affinity || [], weaknesses: dragon.weaknesses || [] }, 0, 1, { level: 16, stars: 10, habitRank: 1 });
  main.setTroopType(troop);
  try { loadKit(main, habitsJson, cmdJson); } catch (err) { fail('load-kit', err.message); results.push(row); continue; }
  const left = dummy('allyL', 'AllyL', 0, 0, { str: 40, inst: 40, int: 40, init: 30 }, troop);
  const right = dummy('allyR', 'AllyR', 0, 2, { str: 40, inst: 40, int: 40, init: 30 }, troop);
  const e0 = dummy('e0', 'EnemyL', 1, 0, { str: 40, inst: 40, int: 40, init: 20 }, 'spearmen');
  const e1 = dummy('e1', 'EnemyV', 1, 1, { str: 40, inst: 40, int: 40, init: 20 }, 'spearmen');
  const e2 = dummy('e2', 'EnemyR', 1, 2, { str: 40, inst: 40, int: 40, init: 20 }, 'spearmen');
  let report = '';
  let maxRound = 0;
  try {
    const battle = new Battle([left, main, right], [e0, e1, e2], { teamTroop: [troop, 'spearmen'], defendingTeam: 1, verbose: false });
    battle.start();
    for (let i = 0; i < 10; i += 1) { if (battle.isFinished) break; battle.runRound(); }
    maxRound = battle.currentRound || 0;
    report = formatBattleReport(battle, 'Troop Formation');
    fs.writeFileSync('/tmp/kit-reports/' + dragon.id + '.txt', report);
    row.notes.push('rounds=' + maxRound);
  } catch (err) { fail('sim-error', err.message); results.push(row); continue; }
  if (vgTitle) { if (!report.includes(vgTitle)) fail('vanguard-title-missing', vgTitle); } else fail('vanguard-title-missing', 'no VANGUARD_NAMES entry');
  if (report.includes('[ Vanguard ]')) fail('bare-vanguard-label', 'report contains [ Vanguard ]');
  if (jsonCmdName && !report.includes(jsonCmdName)) {
    const cmdBlocks = cmdJson.command || [];
    const restrictive = cmdBlocks.flatMap(b => b.actions || []).every(a => /dealer:|status:|hpBelow|marked|prey/.test(String((a.tgt && a.tgt.select) || '')) || actionChance(a) < 100) && cmdBlocks.length > 0;
    if (!restrictive) fail('command-name-missing', jsonCmdName);
    else row.notes.push('command gated: ' + jsonCmdName);
  }
  for (const habit of habitsJson.habits || []) {
    if (report.includes(habit.name)) continue;
    const gate = describeGate(habit, maxRound);
    const combatStart = (habit.structured || []).some(b => b.phase === 'combat_start');
    if (combatStart && gate.guaranteed) fail('missing-habit-combat-start', habit.name);
    else if (gate.guaranteed) fail('missing-habit-should-have-fired', habit.name);
    else { row.gatedHabits.push({ name: habit.name, reasons: gate.reasons }); row.notes.push('gated habit ' + habit.name); }
  }
  results.push(row);
}

const summary = { generated: new Date().toISOString(), skippedPassed: ['antares', 'arrax'], totals: { reviewed: results.length, pass: results.filter(r => r.pass).length, fail: results.filter(r => !r.pass).length }, results };
fs.writeFileSync('./kit-review.json', JSON.stringify(summary, null, 2));
console.log('reviewed=' + summary.totals.reviewed + ' pass=' + summary.totals.pass + ' fail=' + summary.totals.fail);
for (const row of results) {
  const mark = row.pass ? 'PASS' : 'FAIL';
  const fails = row.fails.map(f => f.code + ':' + f.detail).join(' | ');
  const gated = row.gatedHabits.map(g => g.name).join(', ');
  console.log(mark + ' ' + row.id + (fails ? ' :: ' + fails : '') + (gated ? ' :: gated=' + gated : ''));
}
