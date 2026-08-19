// battle.js (Refatorado - Nível 5: Battle Engine)
// Responsabilidade: Orquestrar simulação de batalha com Damage, Effects, Habits, Positioning

import { calculateFinalDamage, sortByInitiative, isTeamAlive } from './utils.js';
import { 
  updateEffects, 
  processDamageEffects, 
  processHealingEffects,
  canAct,
  canUseAbilities,
  canAttack,
  applyEffect
} from './effects.js';
import { 
  selectTargets,
  visualizeBattle,
  getPositionName
} from './positionSystem.js';
import { 
  loadDragonHabitsSync,
  executeHabitAction
} from './habitParser.js';

// ============================================================================
// SEÇÃO 1: CLASSE BATTLE
// ============================================================================

class Battle {
  constructor(teamA, teamB, options = {}) {
    // Teams
    this.teamA = teamA;
    this.teamB = teamB;
    this.allCharacters = [...teamA, ...teamB];
    
    // Configuração
    this.maxRounds = options.maxRounds || 10;
    this.verbose = options.verbose !== false;
    
    // Estado
    this.currentRound = 0;
    this.isActive = false;
    this.isFinished = false;
    this.winner = null;  // 'A', 'B', ou null (empate)
    this.endReason = '';
    
    // Histórico
    this.battleLog = [];
    this.roundHistory = [];
    this.actionLog = [];
  }

  // ========================================================================
  // SEÇÃO 2: INICIALIZAÇÃO E CICLO
  // ========================================================================

  initialize() {
    // Executar setup inicial (antes de rodada 1)
    this.isActive = true;
    this.currentRound = 0;
    
    this.logSeparator('BATTLE START');
    this.logInfo(`3v3 Combat - Maximum ${this.maxRounds} rounds`);
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
    this.logSeparator();
    
    // Executar "Start of Combat" habits
    this.executeStartOfCombatHabits();
  }

  start() {
    // Sinônimo para initialize()
    this.initialize();
  }

  runRound() {
    // Executar uma rodada completa
    if (!this.isActive || this.isFinished) {
      return false;
    }

    this.currentRound += 1;

    if (this.currentRound > this.maxRounds) {
      this.endBattle(null, `Maximum ${this.maxRounds} rounds reached`);
      return false;
    }

    // Fase 1: Início da rodada (durações, efeitos passivos)
    this.phaseStartOfRound();

    // Fase 2: Verificar equipes vivas
    if (!isTeamAlive(this.teamA) || !isTeamAlive(this.teamB)) {
      this.checkVictory();
      return false;
    }

    // Fase 3: Calcular iniciativa e ordenar
    const actionOrder = this.phaseCalculateInitiative();

    // Fase 4: Executar ações
    for (let character of actionOrder) {
      if (character.isDead) continue;

      if (!canAct(character)) {
        this.logAction(`${character.name} cannot act this turn (${this.getActiveEffectString(character)})`);
        continue;
      }

      this.executeCharacterAction(character);

      // Verificar derrota durante ação
      if (!isTeamAlive(this.teamA) || !isTeamAlive(this.teamB)) {
        this.checkVictory();
        return false;
      }
    }

    // Fase 5: Processamento de efeitos no final da rodada
    this.phaseEndOfRound();

    // Verificar derrota por dano de efeito
    if (!isTeamAlive(this.teamA) || !isTeamAlive(this.teamB)) {
      this.checkVictory();
      return false;
    }

    // Fase 6: Log da rodada
    this.logRoundSummary();

    return true;
  }

  // ========================================================================
  // SEÇÃO 3: FASES DA RODADA
  // ========================================================================

  phaseStartOfRound() {
    // Fase 1: Atualizar efeitos, remover expirados
    this.logSeparator(`ROUND ${this.currentRound}`);

    for (let character of this.allCharacters) {
      updateEffects(character);
    }
  }

  phaseCalculateInitiative() {
    // Fase 2: Calcular INIT, aplicar SLOW/FIRST-STRIKE, ordenar
    const alive = this.allCharacters.filter(c => !c.isDead);
    return sortByInitiative(alive);
  }

  phaseEndOfRound() {
    // Fase 5: Processar DoT, cura, verificar morte
    for (let character of this.allCharacters) {
      if (character.isDead) continue;

      const dotDamage = processDamageEffects(character);
      const healing = processHealingEffects(character);

      if (character.isDead) {
        this.logAction(`💀 ${character.name} fell!`);
      }
    }
  }

  // ========================================================================
  // SEÇÃO 4: EXECUÇÃO DE AÇÕES
  // ========================================================================

  executeCharacterAction(character) {
    // Selecionar ação e alvo
    const action = this.selectCharacterAction(character);

    if (!action) {
      // Nenhuma ação disponível, pular turno
      return;
    }

    // Se for Basic Attack, executar diretamente
    if (action.type === 'basic_attack') {
      const targetTeam = character.teamId === 0 ? this.teamB : this.teamA;
      const alive = targetTeam.filter(c => !c.isDead);
      
      if (alive.length === 0) return;
      
      const randomIndex = Math.floor(Math.random() * alive.length);
      this.executeBasicAttack(character, alive[randomIndex]);
      return;
    }

    // Se for Habit, selecionar alvos baseado em targeting
    const targetTeam = character.teamId === 0 ? this.teamB : this.teamA;
    const targets = selectTargets(character, character.teamId === 0 ? this.teamA : this.teamB, targetTeam, action.habit.targetingParsed);

    if (targets.length === 0) {
      this.logAction(`${character.name} has no valid targets`);
      return;
    }

    this.executeHabit(character, action.habit);
  }

  selectCharacterAction(character) {
    // Selecionar qual ação executar (Habit ou Basic Attack)
    // Por enquanto: apenas Basic Attack durante rodadas normais
    // Habits "Start of Combat" já foram executadas no initialize()
    
    // Fallback: Basic Attack
    if (!canAttack(character)) {
      return null;
    }

    return {
      type: 'basic_attack',
      name: 'Basic Attack'
    };
  }

  selectTargetsForAction(character, targetTeam, action) {
    // Selecionar alvos baseado em ação
    // Por enquanto: 1 alvo aleatório
    // Será expandido para usar targetingParsed de Habits

    if (action.type === 'basic_attack') {
      const alive = targetTeam.filter(c => !c.isDead);
      if (alive.length === 0) return [];

      const randomIndex = Math.floor(Math.random() * alive.length);
      return [alive[randomIndex]];
    }

    return [];
  }

  executeActionAgainstTarget(attacker, defender, action) {
    // Executar uma ação contra um alvo (ou múltiplos alvos se Habit)
    if (action.type === 'basic_attack') {
      this.executeBasicAttack(attacker, defender);
    } else if (action.type === 'habit') {
      this.executeHabit(attacker, action.habit);
    }
  }

  executeBasicAttack(attacker, defender) {
    // Ataque básico: dano simples
    const damageType = this.selectDamageType(attacker);
    const baseDamage = calculateFinalDamage(attacker, defender, damageType);

    const actualDamage = defender.takeDamage(baseDamage);

    this.logAction(
      `${attacker.name} attacks ${defender.name} (${damageType}): -${actualDamage} HP ` +
      `(${Math.round(defender.currentHealth)}/${Math.round(defender.maxHealth)})`
    );

    attacker.logAction(`Attacked ${defender.name} for ${actualDamage} damage`);

    if (defender.isDead) {
      this.logAction(`💀 ${defender.name} fell!`);
    }

    // 30% chance de aplicar efeito aleatório
    if (Math.random() * 100 < 30) {
      this.applyRandomEffect(attacker, defender);
    }
  }

  selectDamageType(attacker) {
    // Determinar tipo de dano baseado no stat mais alto
    const str = attacker.getModifiedStat('str');
    const inst = attacker.getModifiedStat('inst');
    const int = attacker.getModifiedStat('int');

    if (str >= inst && str >= int) return 'PHYSICAL';
    if (int >= str && int >= inst) return 'FIRE';
    return 'TACTICAL';
  }

  applyRandomEffect(attacker, defender) {
    // Aplicar efeito aleatório (placeholder para Habits depois)
    const possibleEffects = ['BURN', 'BLEED', 'VULNERABLE', 'SLOW'];
    const randomEffect = possibleEffects[Math.floor(Math.random() * possibleEffects.length)];

    // Será substituído por sistema real de effects depois
    this.logAction(`  ➜ ${randomEffect} applied to ${defender.name}`);
  }

  // ========================================================================
  // SEÇÃO 5: HABITS
  // ========================================================================

  executeHabit(character, habit) {
    // Executar uma habit específica contra alvos selecionados
    const targetTeam = character.teamId === 0 ? this.teamB : this.teamA;
    const targets = selectTargets(character, character.teamId === 0 ? this.teamA : this.teamB, targetTeam, habit.targetingParsed);

    if (targets.length === 0) {
      this.logAction(`${character.name} uses ${habit.name} but has no valid targets`);
      return;
    }

    this.logAction(`${character.name} uses ${habit.name} on ${targets.map(t => t.name).join(', ')}`);

    // Executar cada ação da habit contra os alvos
    for (let action of habit.parsedActions) {
      const actionResult = executeHabitAction(habit, action, character, targets, character.habitRank);

      // Aplicar efeitos baseado no tipo de ação
      if (action.type === 'mod') {
        // Modificador de stats
        for (let effect of actionResult.effects) {
          this.logAction(`  ➜ ${effect.log}`);
        }
      } else if (action.type === 'status') {
        // Efeito de status (BURN, STUN, etc)
        const statusType = action.data.st.toUpperCase();
        const duration = action.data.dur || 2;

        for (let target of targets) {
          if (target.isDead) continue;
          applyEffect(target, statusType, character.habitRank, character.name);
          this.logAction(`  ➜ ${statusType} applied to ${target.name} (${duration} rounds)`);
        }
      } else if (action.type === 'dmg') {
        // Dano direto
        for (let target of targets) {
          if (target.isDead) continue;
          const damage = actionResult.damages[0]?.amount || 50;
          const actualDamage = target.takeDamage(damage);
          this.logAction(`  ➜ ${character.name} deals ${actualDamage} damage to ${target.name}`);

          if (target.isDead) {
            this.logAction(`    💀 ${target.name} fell!`);
          }
        }
      } else if (action.type === 'heal') {
        // Cura
        for (let target of targets) {
          if (target.isDead) continue;
          const healing = actionResult.heals[0]?.amount || 50;
          const actualHealing = target.heal(healing);
          this.logAction(`  ➜ ${character.name} heals ${target.name} for ${actualHealing} HP`);
        }
      }
    }
  }

  executeStartOfCombatHabits() {
    // Executar todas as habits que ativam "Start of Combat"
    for (let character of this.allCharacters) {
      if (character.isDead) continue;

      const combatStartHabits = character.getHabitsByTrigger('combat_start');

      for (let habit of combatStartHabits) {
        if (habit.unlockStar > character.habitRank * 2) {
          // Habit ainda não desbloqueada
          continue;
        }

        this.executeHabit(character, habit);
      }
    }
  }

  // ========================================================================
  // SEÇÃO 6: VERIFICAÇÃO DE VITÓRIA
  // ========================================================================

  checkVictory() {
    // Verificar condições de vitória
    const teamAAlive = isTeamAlive(this.teamA);
    const teamBAlive = isTeamAlive(this.teamB);

    if (!teamAAlive && !teamBAlive) {
      this.endBattle(null, 'Both teams eliminated');
    } else if (!teamAAlive) {
      this.endBattle('B', 'Team A eliminated');
    } else if (!teamBAlive) {
      this.endBattle('A', 'Team B eliminated');
    }
  }

  endBattle(winner, reason) {
    // Encerrar batalha
    this.isActive = false;
    this.isFinished = true;
    this.winner = winner;
    this.endReason = reason;

    this.logSeparator('BATTLE END');
    this.logInfo(`Round ${this.currentRound}/${this.maxRounds}`);
    this.logInfo(`Reason: ${reason}`);

    if (winner === 'A') {
      this.logInfo('🏆 TEAM A WINS!');
    } else if (winner === 'B') {
      this.logInfo('🏆 TEAM B WINS!');
    } else {
      this.logInfo('⚔️ DRAW - Both teams eliminated or timeout');
    }

    this.logSeparator();
    this.logFinalStatus();
  }

  // ========================================================================
  // SEÇÃO 7: LOGGING E VISUALIZAÇÃO
  // ========================================================================

  logSeparator(title = '') {
    const sep = '═══════════════════════════════════════════════════════';
    if (title) {
      this.battleLog.push(`${sep}`);
      this.battleLog.push(title);
      this.battleLog.push(`${sep}`);
    } else {
      this.battleLog.push(sep);
    }
  }

  logInfo(message) {
    this.battleLog.push(message);
    if (this.verbose) console.log(message);
  }

  logAction(message) {
    this.battleLog.push(`  ${message}`);
    if (this.verbose) console.log(`  ${message}`);
  }

  logTeamStatus(teamName, team) {
    this.logInfo(`${teamName}:`);
    for (let char of team) {
      const status = char.isDead ? '💀 DEAD' : `${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)} HP`;
      this.logAction(`${char.name}: ${status}`);
    }
  }

  logRoundSummary() {
    this.logSeparator();
    this.logTeamStatus('Team A Status', this.teamA);
    this.logTeamStatus('Team B Status', this.teamB);
    this.logSeparator();
  }

  logFinalStatus() {
    this.logInfo('Final Status:');
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);

    const survivorsA = this.teamA.filter(c => !c.isDead);
    const survivorsB = this.teamB.filter(c => !c.isDead);

    this.logInfo(`Survivors: Team A: ${survivorsA.length}, Team B: ${survivorsB.length}`);
  }

  getActiveEffectString(character) {
    // Retorna string com efeitos ativos
    const effectNames = character.activeEffects
      .filter(e => !e.isExpired())
      .map(e => e.name)
      .join(', ');

    return effectNames || 'no effects';
  }

  // ========================================================================
  // SEÇÃO 8: RESULTADOS E EXPORTAÇÃO
  // ========================================================================

  getLog() {
    // Retorna log completo em formato string
    return this.battleLog.join('\n');
  }

  getResult() {
    // Retorna objeto com resultado da batalha
    return {
      winner: this.winner,
      endReason: this.endReason,
      roundsPlayed: this.currentRound,
      roundsMax: this.maxRounds,
      survivorsA: this.teamA.filter(c => !c.isDead),
      survivorsB: this.teamB.filter(c => !c.isDead),
      log: this.getLog()
    };
  }

  getSummary() {
    // Retorna resumo executivo
    const result = this.getResult();
    const winnerName = result.winner === 'A' ? 'Team A' : result.winner === 'B' ? 'Team B' : 'Draw';

    return {
      winner: winnerName,
      rounds: `${result.roundsPlayed}/${result.roundsMax}`,
      teamASurvivors: result.survivorsA.length,
      teamBSurvivors: result.survivorsB.length,
      reason: result.endReason
    };
  }

  // ========================================================================
  // SEÇÃO 9: UTILITÁRIOS E HELPERS
  // ========================================================================

  isBattleActive() {
    return this.isActive && !this.isFinished;
  }

  getAlliveCharacters() {
    return this.allCharacters.filter(c => !c.isDead);
  }

  getTeamStatus(teamId) {
    // Retorna {alive: number, dead: number, totalHP: number}
    const team = teamId === 0 ? this.teamA : this.teamB;
    
    return {
      alive: team.filter(c => !c.isDead).length,
      dead: team.filter(c => c.isDead).length,
      totalHP: team.reduce((sum, c) => sum + c.currentHealth, 0),
      totalMaxHP: team.reduce((sum, c) => sum + c.maxHealth, 0)
    };
  }

  getCharacterStatus(character) {
    // Retorna status detalhado de um character
    return {
      name: character.name,
      team: character.teamId === 0 ? 'A' : 'B',
      position: getPositionName(character.slotPosition),
      health: Math.round(character.currentHealth),
      maxHealth: Math.round(character.maxHealth),
      healthPercent: character.getHealthPercentage(),
      isDead: character.isDead,
      activeEffects: character.activeEffects
        .filter(e => !e.isExpired())
        .map(e => ({ name: e.name, duration: e.duration }))
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { Battle };
