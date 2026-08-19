import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync } from './habitParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧪 TESTE DE INTEGRAÇÃO - SIMULADOR NÍVEL 5');
console.log('═══════════════════════════════════════════════════════\n');

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
