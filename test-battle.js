import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync, loadCommandSync, ifBonusApplies } from './habitParser.js';
import { applyChanceIf, statusConditionMet, sortByInitiative } from './utils.js';
import { applyEffect, hasEffect, cleanseCharacter, getEffect, isImmuneTo, processHealingEffects } from './effects.js';
import { selectTargets } from './positionSystem.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧪 TESTE DE INTEGRAÇÃO - SIMULADOR NÍVEL 5');
console.log('═══════════════════════════════════════════════════════\n');

function mockFx(ids) {
  return { activeEffects: ids.map(id => ({ id, duration: 2, isExpired: () => false })) };
}

{
  const bleed = mockFx(['bleed']);
  const clean = mockFx([]);
  if (applyChanceIf(25, { bleed: 2 }, bleed) !== 50) throw new Error('chanceIf bleed ×2 failed');
  if (applyChanceIf(25, { bleed: 2 }, clean) !== 25) throw new Error('chanceIf bleed miss failed');
  if (applyChanceIf(25, { burn: 2 }, mockFx(['burn'])) !== 50) throw new Error('chanceIf burn ×2 failed');
  if (applyChanceIf(25, { taunt: 2 }, mockFx(['taunt'])) !== 50) throw new Error('chanceIf taunt ×2 failed');
  if (!statusConditionMet(mockFx(['stun']), 'control')) throw new Error('control stun failed');
  if (!statusConditionMet(mockFx(['confusion']), 'control')) throw new Error('control confusion failed');
  if (statusConditionMet(mockFx(['burn']), 'control')) throw new Error('burn is not control');
  const attacker = mockFx(['first_strike']);
  const targetPanic = mockFx(['panic']);
  if (!ifBonusApplies({ status: 'first_strike', pct: 150 }, attacker, clean)) throw new Error('ifBonus first_strike on attacker failed');
  if (!ifBonusApplies({ status: 'panic', pct: 150 }, clean, targetPanic)) throw new Error('ifBonus panic on target failed');
  if (!ifBonusApplies({ status: 'control', pct: 30 }, clean, mockFx(['stagger']))) throw new Error('ifBonus control failed');
  if (ifBonusApplies({ status: 'panic', pct: 150 }, clean, clean)) throw new Error('ifBonus panic miss should be false');
  console.log('✓ chanceIf / ifBonus / control\n');
}

{
  const dragon = (id, stats) => ({
    id, name: id, breed: 'Hunter', rarity: 'Rare',
    stats: stats || { str: 10, inst: 10, int: 80, init: 10 }
  });
  const caster = new Character(dragon('caster'), 0, 0);
  const physical = new Character(dragon('physical', { str: 90, inst: 10, int: 10, init: 10 }), 1, 0);
  const fireEnemy = new Character(dragon('fireE'), 1, 1);
  caster.currentHealth = 40;
  caster.maxHealth = 100;
  const btl = new Battle([caster], [physical, fireEnemy], { verbose: false });
  if (!btl.blockAllowed(caster, { requires: { troopsBelow: 75 } })) throw new Error('troopsBelow 75 should pass at 40%');
  if (btl.blockAllowed(caster, { requires: { troopsBelow: 30 } })) throw new Error('troopsBelow 30 should fail at 40%');
  if (!btl.blockAllowed(caster, { requires: { selfHpAtLeast: 40 } })) throw new Error('selfHpAtLeast 40 should pass');
  if (!btl.blockAllowed(caster, { requires: { noPrey: true } })) throw new Error('noPrey should pass');
  if (btl.blockAllowed(caster, { requires: { hasPrey: true } })) throw new Error('hasPrey should fail');
  physical.activeEffects.push({ id: 'prey', duration: 2, isExpired: () => false });
  caster.links.prey = physical;
  if (btl.blockAllowed(caster, { requires: { noPrey: true } })) throw new Error('noPrey should fail with prey');
  if (!btl.blockAllowed(caster, { requires: { hasPrey: true } })) throw new Error('hasPrey should pass');
  if (!btl.blockAllowed(caster, { requires: { preyHpAbove: 10 } })) throw new Error('preyHpAbove should pass');
  if (!btl.blockAllowed(caster, { requires: { anyEnemyDealerFire: true } })) throw new Error('anyEnemyDealerFire should pass');
  const noFire = new Battle([caster], [physical], { verbose: false });
  if (noFire.blockAllowed(caster, { requires: { anyEnemyDealerFire: true } })) throw new Error('anyEnemyDealerFire should fail vs physical only');
  caster.stacks.mirage = 4;
  if (!btl.blockAllowed(caster, { requires: { stacks: { id: 'mirage', min: 4 } } })) throw new Error('stacks min 4 should pass');
  if (btl.blockAllowed(caster, { requires: { stacks: { id: 'mirage', min: 7 } } })) throw new Error('stacks min 7 should fail');
  if (btl.blockAllowed(caster, { requires: { pve: true } })) throw new Error('pve true should fail in default PvP');
  console.log('✓ requires troopsBelow / prey / dealerFire / stacks / pve\n');
}

{
  const dummy = { id: 'x', name: 'X', breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 } };
  const victim = new Character(dummy, 1, 0);
  applyEffect(victim, 'ADVANTAGE', 1, 'A');
  applyEffect(victim, 'RESISTANCE', 1, 'A');
  applyEffect(victim, 'BURN', 1, 'A');
  applyEffect(victim, 'WEAKENED', 1, 'A');
  applyEffect(victim, 'STUN', 1, 'A');
  const pos = cleanseCharacter(victim, { t: 'status', st: 'cleanse', remove: 'positive', count: 1 });
  if (!pos.length || hasEffect(victim, pos[0])) throw new Error('positive cleanse failed');
  if (!hasEffect(victim, 'burn')) throw new Error('burn should remain after positive cleanse');
  const typed = cleanseCharacter(victim, { t: 'cleanse', types: ['bleed', 'panic', 'burn'], count: 1 });
  if (!typed.includes('burn') || hasEffect(victim, 'burn')) throw new Error('typed burn cleanse failed');
  const mixed = cleanseCharacter(victim, { t: 'cleanse', negative: 2, control: 1 });
  if (!mixed.includes('weakened')) throw new Error('negative cleanse missed weakened');
  if (!mixed.includes('stun')) throw new Error('control cleanse missed stun');
  console.log('✓ cleanse positive / types / negative+control\n');
}

{
  const dummy = (id) => ({ id, name: id, breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 } });
  const hunter = new Character(dummy('hunter'), 0, 0);
  const prey = new Character(dummy('prey'), 1, 0);
  applyEffect(prey, 'PREY', 1, hunter.name, { magnitude: 30, duration: 3 });
  hunter.links.prey = prey;
  const fx = prey.activeEffects.find(e => e.id === 'prey');
  if (!fx || fx.recoveryPenalty !== 30) throw new Error('prey recoveryPenalty from val failed');
  const before = prey.getRecoveryReceivedMultiplier();
  if (Math.abs(before - 0.7) > 0.001) throw new Error(`prey recovery received should be 0.7, got ${before}`);
  prey.currentHealth = Math.max(1, Math.floor(prey.maxHealth * 0.4));
  prey.heal(10);
  if (!prey.receivedRecoveryThisRound) throw new Error('heal should flag receivedRecoveryThisRound');
  prey.advanceRetreatFlags();
  if (!prey.receivedRecoveryLastRound) throw new Error('flag should move to last round');
  const btl = new Battle([hunter], [prey], { verbose: false });
  if (btl.getPrey(hunter) !== prey) throw new Error('getPrey should return linked prey');
  const extras = { prey };
  if (!ifBonusApplies({ preyRecoveredLastRound: true, mult: 3 }, hunter, prey, extras)) {
    throw new Error('ifBonus preyRecoveredLastRound should apply');
  }
  const doubled = applyChanceIf(25, { preyRecoveredLastRound: true, mult: 2 }, prey, extras);
  if (doubled !== 50) throw new Error(`chanceIf prey recovered expected 50 got ${doubled}`);
  console.log('✓ prey link / recovery penalty / recovered-last-round\n');
}

{
  const d = (id, breed, slot, team) => new Character({
    id, name: id, breed, rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const caster = d('caster', 'Champion', 1, 0);
  const hunter = d('hunter', 'Hunter', 0, 1);
  const warrior = d('warrior', 'Warrior', 1, 1);
  const sentinel = d('sentinel', 'Sentinel', 2, 1);
  const allies = [caster];
  const enemies = [hunter, warrior, sentinel];
  caster.lastBasicTarget = hunter;
  const splash = selectTargets(caster, allies, enemies, {
    side: 'enemy', count: 3, select: 'adjacency', excludeLastBasic: true
  });
  if (splash.some(c => c === hunter)) throw new Error('excludeLastBasic dropped hunter failed');
  if (!splash.includes(warrior) || !splash.includes(sentinel)) throw new Error('excludeLastBasic should keep adjacent others');
  const prefer = selectTargets(caster, allies, enemies, {
    side: 'enemy', count: 1, select: 'prefer_class:hunter'
  });
  if (prefer[0] !== hunter) throw new Error('prefer_class:hunter should pick Hunter');
  const exact = selectTargets(caster, allies, enemies, {
    side: 'enemy', count: 2, select: 'class:sentinel'
  });
  if (exact.length !== 1 || exact[0] !== sentinel) throw new Error('class:sentinel should hard-filter');
  console.log('✓ lastBasicTarget exclude + breed/class targeting\n');
}

{
  const d = (id, team, slot) => new Character({
    id, name: id, breed: 'Warrior', rarity: 'Rare', stats: { str: 80, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const a = d('striker', 0, 1);
  const b = d('dummy', 1, 1);
  b.maxHealth = 10000;
  b.currentHealth = 10000;
  applyEffect(a, 'DOUBLE_STRIKE', 1, a.name, { duration: 2 });
  const btl = new Battle([a], [b], { verbose: false });
  btl.currentRound = 1;
  btl.executeCharacterAction(a);
  const basics = btl.battleLog.filter(line => /Basic Attack/.test(line));
  if (basics.length !== 2) throw new Error(`expected 2 Basic Attacks, got ${basics.length}: ${basics.join(' | ')}`);
  if (!basics[1].includes('Double-Strike')) throw new Error('2nd hit should log Double-Strike');
  const none = d('plain', 0, 1);
  const dummy2 = d('dummy2', 1, 1);
  dummy2.maxHealth = 10000;
  dummy2.currentHealth = 10000;
  const btl2 = new Battle([none], [dummy2], { verbose: false });
  btl2.currentRound = 1;
  btl2.executeCharacterAction(none);
  const one = btl2.battleLog.filter(line => /launches a Basic Attack/.test(line));
  if (one.length !== 1) throw new Error(`plain dragon should launch 1 basic, got ${one.length}`);
  console.log('✓ Double-Strike 2nd Basic Attack\n');
}

{
  const d = (id, team, slot) => new Character({
    id, name: id, breed: 'Warrior', rarity: 'Rare', stats: { str: 80, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const confused = d('confused', 0, 1);
  const ally = d('ally', 0, 0);
  const enemy = d('enemy', 1, 1);
  ally.maxHealth = 10000;
  ally.currentHealth = 10000;
  enemy.maxHealth = 10000;
  enemy.currentHealth = 10000;
  applyEffect(confused, 'CONFUSION', 1, 'x', { duration: 2 });
  getEffect(confused, 'confusion').confusionChance = 100;
  const btl = new Battle([confused, ally], [enemy], { verbose: false });
  confused.confusedThisActivation = true;
  const hit = btl.selectBasicAttackTarget(confused);
  if (hit !== ally) throw new Error(`confused basic should pick ally, got ${hit && hit.name}`);
  const tgt = btl.resolveTargets(confused, { targetingParsed: { side: 'enemy' } }, { tgt: { side: 'enemy', count: 1, select: 'any' } });
  if (!tgt.includes(ally) || tgt.includes(enemy)) throw new Error('confused enemy targeting should resolve to allies');
  const self = btl.resolveTargets(confused, {}, { tgt: { side: 'self' } });
  if (self[0] !== confused) throw new Error('self targeting must not swap');
  console.log('✓ Confusion swaps ally/enemy targeting\n');
}

{
  const d = (id, team, slot) => new Character({
    id, name: id, breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 80, init: 10 }
  }, team, slot);
  const sun = d('sun', 0, 1);
  const foe = d('foe', 1, 1);
  sun.maxHealth = 1000;
  sun.currentHealth = 1000;
  const btl = new Battle([sun], [foe], { verbose: false });
  btl.currentRound = 1;
  btl.damageContext = { type: 'fire', basic: false, victim: sun };
  if (!btl.blockAllowed(sun, { requires: { damageType: 'fire' } })) throw new Error('fire require failed');
  if (btl.blockAllowed(sun, { requires: { damageType: 'tactical' } })) throw new Error('tactical should not match fire');
  btl.damageContext = { type: 'physical', basic: true, victim: sun };
  if (btl.blockAllowed(sun, { requires: { damageType: 'physical', excludeBasic: true } })) {
    throw new Error('excludeBasic should reject Basic Attack physical');
  }
  if (!btl.blockAllowed(sun, { requires: { damageType: 'basic' } })) throw new Error('damageType basic failed');
  const first = btl.dealDamage(sun, 10, { type: 'fire', basic: false });
  if (first !== 10) throw new Error('dealDamage amount');
  if (!sun.receivedDamageThisRound) throw new Error('first damage flag');
  btl.dealDamage(sun, 10, { type: 'tactical', basic: false });
  if (!sun.receivedDamageThisRound) throw new Error('flag should stay');
  console.log('✓ first-damage requires / notify flags\n');
}

{
  const dummy = { id: 'x', name: 'X', breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 } };
  const unit = new Character(dummy, 0, 0);
  applyEffect(unit, 'WEAKENED', 1, 'e', { magnitude: 20, duration: 2 });
  applyEffect(unit, 'VULNERABLE', 1, 'e', { magnitude: 10, duration: 2 });
  applyEffect(unit, 'BURN', 1, 'e', { duration: 2 });
  applyEffect(unit, 'IMMUNITY', 1, 'self', { duration: 2, immunities: ['vulnerable', 'weakened'] });
  if (hasEffect(unit, 'weakened') || hasEffect(unit, 'vulnerable')) throw new Error('Immunity should purge Vulnerable/Weakened');
  if (!hasEffect(unit, 'burn')) throw new Error('Immunity should not purge Burn');
  if (!isImmuneTo(unit, 'weakened') || !isImmuneTo(unit, 'vulnerable')) throw new Error('isImmuneTo failed');
  if (applyEffect(unit, 'WEAKENED', 1, 'e') != null) throw new Error('Weakened should be blocked');
  if (applyEffect(unit, 'STUN', 1, 'e') == null) throw new Error('Stun should still apply');
  console.log('✓ Immunity blocks and purges Vulnerable/Weakened\n');
}

{
  const dummy = { id: 'j', name: 'Jag', breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 } };
  const unit = new Character(dummy, 0, 0);
  unit.currentHealth = 10;
  const healed = unit.heal(20);
  if (!(healed > 0)) throw new Error('heal should work before Nullify');
  applyEffect(unit, 'NULLIFY_RECOVERY', 1, 'self', { duration: 'combat' });
  if (!hasEffect(unit, 'nullify_recovery')) throw new Error('Nullify Recovery missing');
  unit.currentHealth = 10;
  if (unit.heal(50) !== 0) throw new Error('heal should be 0 under Nullify Recovery');
  applyEffect(unit, 'RECOVERY', 1, 'self', { duration: 2 });
  if (processHealingEffects(unit) !== 0) throw new Error('HoT should be blocked');
  console.log('✓ Nullify Recovery blocks heal and HoT\n');
}

{
  const d = (id, init) => {
    const c = new Character({
      id, name: id, breed: 'Warrior', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init }
    }, 0, 1);
    return c;
  };
  const fs = d('fs', 1);
  const mid = d('mid', 50);
  const slow = d('slow', 99);
  applyEffect(fs, 'FIRST_STRIKE', 1, 'x', { duration: 2 });
  applyEffect(slow, 'SLOW', 1, 'x', { duration: 2 });
  const order = sortByInitiative([slow, mid, fs]).map(c => c.name);
  if (order.join(',') !== 'fs,mid,slow') throw new Error(`order ${order.join('→')} expected fs→mid→slow`);
  const both = d('both', 1);
  applyEffect(both, 'FIRST_STRIKE', 1, 'x', { duration: 2 });
  applyEffect(both, 'SLOW', 1, 'x', { duration: 2 });
  const order2 = sortByInitiative([both, mid]).map(c => c.name);
  if (order2[order2.length - 1] !== 'both') throw new Error('Slow overrides First-Strike');
  console.log('✓ First-Strike / Slow initiative order\n');
}

try {
  // Passo 1: Carregar dragões
  console.log('1️⃣  Carregando dragões...');
  const dragonsContent = fs.readFileSync(path.join(__dirname, 'data', 'dragons.json'), 'utf-8');
  const dragonsData = JSON.parse(dragonsContent);
  const allDragons = dragonsData.dragons || [];
  console.log(`   ✓ ${allDragons.length} dragões disponíveis\n`);

  if (allDragons.length < 6) {
    console.error('   ✗ Não há dragões suficientes (mínimo 6)');
    process.exit(1);
  }

  // Passo 2: Selecionar dragões
  console.log('2️⃣  Selecionando dragões...');
  const selected = allDragons.slice(0, 6);
  console.log(`   Team A: ${selected.slice(0, 3).map(d => d.id).join(', ')}`);
  console.log(`   Team B: ${selected.slice(3, 6).map(d => d.id).join(', ')}\n`);

  // Passo 3: Criar Characters
  console.log('3️⃣  Criando Characters...');
  const teamA = allDragons.slice(0, 3).map((dragon, idx) => 
    new Character(dragon, 0, idx)
  );
  const teamB = allDragons.slice(3, 6).map((dragon, idx) => 
    new Character(dragon, 1, idx)
  );
  console.log(`   ✓ Team A: ${teamA.map(c => c.name).join(', ')}`);
  console.log(`   ✓ Team B: ${teamB.map(c => c.name).join(', ')}\n`);

  // Passo 4: Carregar Habits
  console.log('4️⃣  Carregando Habits...');
  let habitsLoaded = 0;
  for (let character of [...teamA, ...teamB]) {
    try {
      const habitPath = path.join(__dirname, 'data', `${character.id}_habits.json`);
      if (fs.existsSync(habitPath)) {
        const habitContent = fs.readFileSync(habitPath, 'utf-8');
        const habitData = JSON.parse(habitContent);
        const habits = loadDragonHabitsSync(habitData, character.id);
        character.setHabits(habits);
        character.setHabitRank(3);
        console.log(`   ✓ ${character.name}: ${habits.length} habits`);
        habitsLoaded++;
      }
    } catch (error) {
      console.log(`   ⚠ ${character.name}: sem habits`);
    }
    try {
      const cmdPath = path.join(__dirname, 'data', `${character.id}_vanguard_command.json`);
      if (fs.existsSync(cmdPath)) {
        const cmdData = JSON.parse(fs.readFileSync(cmdPath, 'utf-8'));
        const kit = loadCommandSync(cmdData, character.id);
        character.setCommandKit(kit.command);
        character.setVanguardKit(kit.vanguard);
        console.log(`   ✓ ${character.name}: Command ${kit.name}`);
      }
    } catch (error) {
      console.log(`   ⚠ ${character.name}: sem command`);
    }
  }
  console.log(`   ✓ ${habitsLoaded}/6 dragões com habits\n`);

  // Passo 5: Criar Batalha
  console.log('5️⃣  Inicializando Batalha...');
  const battle = new Battle(teamA, teamB, { verbose: false });
  battle.start();
  console.log(`   ✓ Batalha criada (máx ${battle.maxRounds} rodadas)\n`);

  // Passo 6: Executar rodadas
  console.log('6️⃣  Executando Rodadas...\n');
  let roundCount = 0;
  while (battle.isBattleActive()) {
    battle.runRound();
    roundCount++;

    const statusA = battle.getTeamStatus(0);
    const statusB = battle.getTeamStatus(1);
    console.log(`   Rodada ${roundCount}: Team A (${statusA.alive} vivos), Team B (${statusB.alive} vivos)`);

    if (!battle.isBattleActive()) break;
  }

  console.log('\n');

  // Passo 7: Resultado
  console.log('7️⃣  Resultado Final\n');
  const result = battle.getResult();
  const summary = battle.getSummary();

  console.log(`   🏆 Vencedor: ${summary.winner}`);
  console.log(`   📊 Rodadas: ${summary.rounds}`);
  console.log(`   🔵 Team A Sobreviventes: ${summary.teamASurvivors}/3`);
  console.log(`   🔴 Team B Sobreviventes: ${summary.teamBSurvivors}/3`);
  console.log(`   📝 Motivo: ${summary.reason}\n`);

  console.log('═══════════════════════════════════════════════════════');
  console.log('✅ TESTE COMPLETADO COM SUCESSO\n');

  // Log da batalha (primeiras 80 linhas)
  const logLines = result.log.split('\n');
  console.log('📋 LOG DA BATALHA:\n');
  console.log(logLines.slice(0, 80).join('\n'));
  if (logLines.length > 80) {
    console.log(`\n... (${logLines.length - 80} linhas omitidas) ...`);
  }

} catch (error) {
  console.error('\n❌ ERRO:');
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
}
