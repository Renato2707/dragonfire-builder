// positionSystem.js (Nível 4: Positioning System)
// Responsabilidade: Gerenciar posições, flancos, adjacência, targeting baseado em posição

// ============================================================================
// SEÇÃO 1: CONSTANTES DE POSIÇÃO
// ============================================================================

const POSITIONS = {
  LEFT: 0,
  CENTER: 1,
  RIGHT: 2
};

const POSITION_NAMES = {
  0: 'Left',
  1: 'Center',
  2: 'Right'
};

const FLANK_NAMES = {
  0: 'Left Flank',
  1: 'Center',
  2: 'Right Flank'
};

// ============================================================================
// SEÇÃO 2: LAYOUT DO CAMPO
// ============================================================================

// Layout visual da batalha:
//
// TIME A                          TIME B
// [0] Left       vs       [0] Left
// [1] Center     vs       [1] Center  
// [2] Right      vs       [2] Right
//
// Same Lane: A[0] vs B[0], A[1] vs B[1], A[2] vs B[2]
// Adjacent: A[0] e A[1], A[1] e A[2], etc

// ============================================================================
// SEÇÃO 3: CÁLCULO DE DISTÂNCIA E ADJACÊNCIA
// ============================================================================

function getDistance(slot1, slot2) {
  // Retorna distância numérica entre duas posições (0, 1, 2)
  // Left(0) - Center(1) = 1
  // Left(0) - Right(2) = 2
  // Center(1) - Right(2) = 1
  
  return Math.abs(slot1 - slot2);
}

function isInSameLane(slot1, slot2) {
  // Verifica se duas posições estão na mesma lane (mesma coluna)
  // A[0] vs B[0] = true (mesma lane)
  // A[0] vs B[1] = false (lanes diferentes)
  
  return slot1 === slot2;
}

function isAdjacent(slot1, slot2) {
  // Verifica se duas posições são vizinhas
  // Left(0) e Center(1) = true
  // Center(1) e Right(2) = true
  // Left(0) e Right(2) = false
  
  return getDistance(slot1, slot2) === 1;
}

function getAdjacentSlots(slot) {
  // Retorna array com posições adjacentes a uma posição
  // 0 (Left) → [1]
  // 1 (Center) → [0, 2]
  // 2 (Right) → [1]
  
  const adjacent = [];
  
  if (slot > 0) adjacent.push(slot - 1);
  if (slot < 2) adjacent.push(slot + 1);
  
  return adjacent;
}

// ============================================================================
// SEÇÃO 4: SELEÇÃO DE ALVO POR POSIÇÃO
// ============================================================================

function getCharacterAtSlot(team, slot) {
  // Retorna character de um time em uma posição específica
  // team: array [char0, char1, char2]
  // slot: 0, 1 ou 2
  
  if (!team || slot < 0 || slot > 2) {
    return null;
  }
  
  return team[slot] || null;
}

function getCharactersAtSameLane(friendlyTeam, enemyTeam, characterSlot) {
  // Retorna [friendlyChar, enemyChar] na mesma lane
  // Usado para targeting "Same Lane"
  
  const friendly = getCharacterAtSlot(friendlyTeam, characterSlot);
  const enemy = getCharacterAtSlot(enemyTeam, characterSlot);
  
  return {
    friendly: friendly,
    enemy: enemy,
    slot: characterSlot
  };
}

function getCharactersInAdjacentLanes(team, slot) {
  // Retorna characters adjacentes em um time
  // team: um dos times
  // slot: posição do personagem que está atacando
  
  const adjacent = getAdjacentSlots(slot);
  const characters = [];
  
  for (let adjSlot of adjacent) {
    const char = getCharacterAtSlot(team, adjSlot);
    if (char && !char.isDead) {
      characters.push({
        character: char,
        slot: adjSlot,
        distance: getDistance(slot, adjSlot)
      });
    }
  }
  
  return characters;
}

function getCharactersInFlank(team, flankPosition) {
  // Retorna characters em um flanco específico
  // flankPosition: 'left', 'center', 'right'
  // Retorna character vivo naquela posição
  
  let slot;
  
  if (flankPosition === 'left' || flankPosition === 'left_flank') {
    slot = POSITIONS.LEFT;
  } else if (flankPosition === 'center') {
    slot = POSITIONS.CENTER;
  } else if (flankPosition === 'right' || flankPosition === 'right_flank') {
    slot = POSITIONS.RIGHT;
  } else {
    return [];
  }
  
  const char = getCharacterAtSlot(team, slot);
  return char && !char.isDead ? [char] : [];
}

// ============================================================================
// SEÇÃO 5: SELEÇÃO DE ALVO BASEADA EM TARGETING
// ============================================================================

function selectTargets(caster, friendlyTeam, enemyTeam, targetingParsed) {
  // Seleciona alvo(s) baseado em targeting estruturado
  // targetingParsed: {side, count, select, position}
  // Retorna: array de targets selecionados
  
  const targets = [];
  const casterSlot = caster.slotPosition;
  
  // PASSO 1: Determinar time de alvo
  let targetTeam;
  
  if (targetingParsed.side === 'self') {
    targetTeam = [caster];
  } else if (targetingParsed.side === 'ally') {
    targetTeam = friendlyTeam.filter(c => c !== caster);
  } else if (targetingParsed.side === 'enemy') {
    targetTeam = enemyTeam;
  } else {
    targetTeam = [];
  }
  
  if (targetTeam.length === 0) return [];
  
  // PASSO 2: Filtrar por posição (se especificado)
  let candidates = [...targetTeam];
  
  if (targetingParsed.position) {
    if (targetingParsed.position === 'same_lane') {
      // Mesmo slot
      candidates = targetTeam.filter(c => c.slotPosition === casterSlot);
    } else if (targetingParsed.position === 'adjacent') {
      // Slots adjacentes
      const adjacentSlots = getAdjacentSlots(casterSlot);
      candidates = targetTeam.filter(c => adjacentSlots.includes(c.slotPosition));
    } else if (targetingParsed.position === 'left' || targetingParsed.position === 'left_flank') {
      candidates = targetTeam.filter(c => c.slotPosition === POSITIONS.LEFT);
    } else if (targetingParsed.position === 'center') {
      candidates = targetTeam.filter(c => c.slotPosition === POSITIONS.CENTER);
    } else if (targetingParsed.position === 'right' || targetingParsed.position === 'right_flank') {
      candidates = targetTeam.filter(c => c.slotPosition === POSITIONS.RIGHT);
    }
  }
  
  // Remove mortos
  candidates = candidates.filter(c => !c.isDead);
  
  if (candidates.length === 0) return [];
  
  // PASSO 3: Ordenar por critério de seleção
  if (targetingParsed.select === 'lowest_troops') {
    // Lowest HP
    candidates.sort((a, b) => a.currentHealth - b.currentHealth);
  } else if (targetingParsed.select === 'highest_troops') {
    // Highest HP
    candidates.sort((a, b) => b.currentHealth - a.currentHealth);
  } else if (targetingParsed.select === 'random') {
    // Embaralhar
    candidates = shuffleArray(candidates);
  }
  // Padrão: 'any' (ordem natural)
  
  // PASSO 4: Pegar primeiros N
  const count = Math.min(targetingParsed.count, candidates.length);
  
  for (let i = 0; i < count; i++) {
    targets.push(candidates[i]);
  }
  
  return targets;
}

function selectRandomTargets(team, count) {
  // Seleciona N targets aleatórios de um time
  // Filtra apenas vivos
  
  const alive = team.filter(c => !c.isDead);
  const selected = [];
  
  for (let i = 0; i < Math.min(count, alive.length); i++) {
    const randomIndex = Math.floor(Math.random() * alive.length);
    selected.push(alive[randomIndex]);
    alive.splice(randomIndex, 1);  // Remover para não repetir
  }
  
  return selected;
}

function selectLowestHealthTargets(team, count) {
  // Seleciona N targets com menor HP
  
  const alive = team.filter(c => !c.isDead);
  
  alive.sort((a, b) => a.currentHealth - b.currentHealth);
  
  return alive.slice(0, Math.min(count, alive.length));
}

function selectHighestHealthTargets(team, count) {
  // Seleciona N targets com maior HP
  
  const alive = team.filter(c => !c.isDead);
  
  alive.sort((a, b) => b.currentHealth - a.currentHealth);
  
  return alive.slice(0, Math.min(count, alive.length));
}

// ============================================================================
// SEÇÃO 6: VERIFICAÇÃO DE POSIÇÃO
// ============================================================================

function canTargetAcrossLane(casterSlot, targetSlot) {
  // Verifica se caster pode atingir alvo em outra lane
  // Algumas habilidades só funcionam em mesma lane ou adjacentes
  
  return true;  // Placeholder - implementar se houver restrições específicas
}

function getTargetDistance(casterSlot, targetSlot) {
  // Retorna distância entre caster e target
  
  return getDistance(casterSlot, targetSlot);
}

function getPositionAdvantage(casterSlot, targetSlot) {
  // Retorna bônus/penalidade baseado em posição
  // Placeholder para mecânicas futuras
  // Ex: Center pode atacar melhor que Left/Right?
  
  return 0;  // Sem vantagem de posição por enquanto
}

// ============================================================================
// SEÇÃO 7: INFORMAÇÃO DE POSIÇÃO
// ============================================================================

function getPositionName(slot) {
  // Converte número (0, 1, 2) para nome legível
  
  return POSITION_NAMES[slot] || 'Unknown';
}

function getFlankName(slot) {
  // Converte número (0, 1, 2) para nome de flanco
  
  return FLANK_NAMES[slot] || 'Unknown';
}

function formatPositionInfo(character) {
  // Retorna string descrevendo posição do character
  // Ex: "Caraxes (Left Flank, Slot 0)"
  
  return `${character.name} (${getFlankName(character.slotPosition)}, Slot ${character.slotPosition})`;
}

function visualizeTeamPositions(team) {
  // Retorna string visual mostrando posições do time
  // Ex:
  // [0] Caraxes   (HP: 200/200)
  // [1] Syrax     (HP: 150/150)
  // [2] Sunfyre   (HP: 175/175)
  
  const visual = [];
  
  for (let i = 0; i < 3; i++) {
    const char = team[i];
    if (!char) {
      visual.push(`[${i}] <empty>`);
    } else {
      const status = char.isDead ? '💀' : '';
      const hp = `${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)}`;
      visual.push(`[${i}] ${char.name.padEnd(12)} (HP: ${hp}) ${status}`);
    }
  }
  
  return visual.join('\n');
}

function visualizeBattle(teamA, teamB) {
  // Retorna visual completo da batalha com posições
  
  const lines = [];
  
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('TIME A (LEFT → CENTER → RIGHT)    vs    TIME B (LEFT → CENTER → RIGHT)');
  lines.push('═══════════════════════════════════════════════════════');
  
  for (let i = 0; i < 3; i++) {
    const charA = teamA[i];
    const charB = teamB[i];
    
    const nameA = charA ? charA.name.padEnd(15) : '<empty>'.padEnd(15);
    const nameB = charB ? charB.name.padEnd(15) : '<empty>'.padEnd(15);
    
    const hpA = charA 
      ? `${Math.round(charA.currentHealth).toString().padStart(4)}/${Math.round(charA.maxHealth).toString().padStart(4)}`.padEnd(10)
      : '<dead>'.padEnd(10);
    const hpB = charB 
      ? `${Math.round(charB.currentHealth).toString().padStart(4)}/${Math.round(charB.maxHealth).toString().padStart(4)}`.padEnd(10)
      : '<dead>'.padEnd(10);
    
    const statusA = charA && charA.isDead ? '💀' : '●';
    const statusB = charB && charB.isDead ? '💀' : '●';
    
    lines.push(`[${i}] ${statusA} ${nameA} ${hpA}  ║  [${i}] ${statusB} ${nameB} ${hpB}`);
  }
  
  lines.push('═══════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

// ============================================================================
// SEÇÃO 8: UTILITÁRIOS
// ============================================================================

function shuffleArray(array) {
  // Fisher-Yates shuffle
  
  const shuffled = [...array];
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

function validatePosition(slot) {
  // Verifica se slot é válido (0, 1, 2)
  
  return typeof slot === 'number' && slot >= 0 && slot <= 2;
}

function validateTeamPositions(team) {
  // Verifica se todos os characters têm posição válida
  
  return team.every(char => validatePosition(char.slotPosition));
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Constantes
  POSITIONS,
  POSITION_NAMES,
  FLANK_NAMES,
  
  // Distância e adjacência
  getDistance,
  isInSameLane,
  isAdjacent,
  getAdjacentSlots,
  
  // Seleção por posição
  getCharacterAtSlot,
  getCharactersAtSameLane,
  getCharactersInAdjacentLanes,
  getCharactersInFlank,
  
  // Targeting
  selectTargets,
  selectRandomTargets,
  selectLowestHealthTargets,
  selectHighestHealthTargets,
  
  // Verificação
  canTargetAcrossLane,
  getTargetDistance,
  getPositionAdvantage,
  
  // Informação
  getPositionName,
  getFlankName,
  formatPositionInfo,
  visualizeTeamPositions,
  visualizeBattle,
  
  // Utilitários
  shuffleArray,
  validatePosition,
  validateTeamPositions
};
