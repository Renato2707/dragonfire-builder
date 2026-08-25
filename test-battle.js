import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync, loadCommandSync, ifBonusApplies } from './habitParser.js';
import { applyChanceIf, statusConditionMet } from './utils.js';

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
