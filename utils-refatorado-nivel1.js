// utils.js (Refatorado - Nível 1: Damage System)
// Responsabilidade: RNG, cálculos de dano com 3 tipos reais, posicionamento, validações

// ============================================================================
// SEÇÃO 1: RNG (Random Number Generator)
// ============================================================================

function getRandomInt(min, max) {
  // Retorna número inteiro aleatório entre min e max (inclusive)
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollChance(percentage) {
  // Retorna true com probabilidade = percentage%
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  return Math.random() * 100 < percentage;
}

// ============================================================================
// SEÇÃO 2: TIPOS DE DANO E MITIGAÇÃO
// ============================================================================

// Definições dos 3 tipos de dano conforme Dragon_Abilities.txt
const DAMAGE_TYPES = {
  PHYSICAL: {
    name: 'PHYSICAL',
    causedBy: 'str',      // Atacante usa STR para dano
    mitigatedBy: 'inst',  // Defensor usa INST para mitigação
    variance: 5           // Variância aleatória
  },
  TACTICAL: {
    name: 'TACTICAL',
    causedBy: 'inst',     // Atacante usa INST para dano
    mitigatedBy: 'int',   // Defensor usa INT para mitigação
    variance: 3
  },
  FIRE: {
    name: 'FIRE',
    causedBy: 'int',      // Atacante usa INT para dano
    mitigatedBy: 'init',  // Defensor usa INIT para mitigação
    variance: 2
  }
};

function getDamageTypeConfig(damageType) {
  // Retorna configuração do tipo de dano
  const type = DAMAGE_TYPES[damageType.toUpperCase()];
  if (!type) {
    console.warn(`Tipo de dano desconhecido: ${damageType}, usando PHYSICAL`);
    return DAMAGE_TYPES.PHYSICAL;
  }
  return type;
}

// ============================================================================
// SEÇÃO 3: CÁLCULO DE DANO (Fórmula Base)
// ============================================================================

function calculateBaseDamage(attacker, damageType) {
  // Calcula dano base sem mitigação
  // Fórmula: (Stat Atacante × 1.2) + Variância aleatória
  
  const typeConfig = getDamageTypeConfig(damageType);
  const attackerStat = attacker.getModifiedStat(typeConfig.causedBy);
  
  // Multiplicador base: 1.2x o stat
  const baseValue = attackerStat * 1.2;
  
  // Adicionar variância aleatória (±variance)
  const variance = getRandomInt(-typeConfig.variance, typeConfig.variance);
  
  const baseDamage = baseValue + variance;
  
  // Mínimo 1 de dano
  return Math.max(1, Math.round(baseDamage));
}

function calculateMitigation(defender, damageType) {
  // Calcula redução de dano baseada na stat de defesa
  // Fórmula: (Stat Defensor × 0.3)
  
  const typeConfig = getDamageTypeConfig(damageType);
  const defenderStat = defender.getModifiedStat(typeConfig.mitigatedBy);
  
  // Multiplicador de mitigação: 0.3x o stat defensivo
  const mitigation = defenderStat * 0.3;
  
  // Máximo 80% de redução (nunca bloqueia 100%)
  return Math.min(mitigation, defenderStat * 0.8);
}

function applyDamageMultipliers(baseDamage, attacker, defender) {
  // Aplica multiplicadores de dano (buffs/debuffs como Advantage, Weakened, etc)
  // Estes virão de efeitos aplicados via effects.js
  
  let finalDamage = baseDamage;
  
  // Bônus do atacante (Advantage: +15%, etc)
  if (attacker.damageBonus) {
    finalDamage *= (1 + attacker.damageBonus / 100);
  }
  
  // Penalidade do atacante (Weakened: -X%, etc)
  if (attacker.damagePenalty) {
    finalDamage *= (1 - attacker.damagePenalty / 100);
  }
  
  // Bônus defensivo do defensor (Resistance: -X%, etc)
  if (defender.defenseBonus) {
    finalDamage *= (1 - defender.defenseBonus / 100);
  }
  
  // Penalidade defensiva do defensor (Vulnerable: +X%, etc)
  if (defender.defensePenalty) {
    finalDamage *= (1 + defender.defensePenalty / 100);
  }
  
  return finalDamage;
}

// ============================================================================
// SEÇÃO 4: CÁLCULO COMPLETO DE DANO
// ============================================================================

function calculateFinalDamage(attacker, defender, damageType, bonusPercent = 0) {
  // Fórmula completa:
  // 1. Dano base (stat atacante)
  // 2. Mitigação (stat defensor)
  // 3. Multiplicadores de efeito
  // 4. Bônus percentual adicional
  // 5. Mínimo de 1 dano
  
  // Passo 1: Dano base
  const baseDamage = calculateBaseDamage(attacker, damageType);
  
  // Passo 2: Mitigação
  const mitigation = calculateMitigation(defender, damageType);
  
  // Passo 3: Aplicar mitigação
  let damageMitigated = baseDamage - mitigation;
  
  // Passo 4: Aplicar multiplicadores de efeito
  damageMitigated = applyDamageMultipliers(damageMitigated, attacker, defender);
  
  // Passo 5: Aplicar bônus percentual (habilidades com "+50% dano", etc)
  if (bonusPercent > 0) {
    damageMitigated *= (1 + bonusPercent / 100);
  }
  
  // Passo 6: Garantir mínimo de 1
  return Math.max(1, Math.round(damageMitigated));
}

// ============================================================================
// SEÇÃO 5: CRÍTICO (Opcional - não está em Dragon_Abilities.txt mas mantemos)
// ============================================================================

function calculateCriticalChance(attacker) {
  // Chance de crítico baseada em INST
  // Fórmula: INST / 4, máximo 30%
  const inst = attacker.getModifiedStat('inst');
  return Math.min(30, Math.max(0, inst / 4));
}

function getCriticalMultiplier() {
  // Crítico multiplica dano por 1.5x
  return 1.5;
}

function rollCritical(critChance) {
  return rollChance(critChance);
}

// ============================================================================
// SEÇÃO 6: POSICIONAMENTO
// ============================================================================

// Posições: 0 = Left, 1 = Center, 2 = Right

function getDistance(slot1, slot2) {
  // Retorna distância numérica entre duas posições
  return Math.abs(slot1 - slot2);
}

function isInSameLane(slot1, slot2) {
  // Mesma posição (Left-Left, Center-Center, etc)
  return slot1 === slot2;
}

function isAdjacent(slot1, slot2) {
  // Posições vizinhas (Left-Center ou Center-Right)
  return getDistance(slot1, slot2) === 1;
}

function getAdjacentSlots(slot) {
  // Retorna array com posições adjacentes
  const adjacent = [];
  if (slot > 0) adjacent.push(slot - 1);
  if (slot < 2) adjacent.push(slot + 1);
  return adjacent;
}

function getSlotName(slot) {
  // Converte número para nome legível
  const names = ['Left', 'Center', 'Right'];
  return names[slot] || 'Unknown';
}

// ============================================================================
// SEÇÃO 7: VALIDAÇÕES
// ============================================================================

function validateCharacterTeam(characters) {
  // Verifica se array tem 3 characters válidos
  if (!Array.isArray(characters) || characters.length !== 3) {
    return false;
  }
  return characters.every(c => 
    c && 
    c.name && 
    typeof c.currentHealth === 'number' &&
    typeof c.maxHealth === 'number'
  );
}

function isTeamAlive(teamCharacters) {
  // Verifica se pelo menos um membro do time está vivo
  return teamCharacters.some(c => !c.isDead);
}

function validateDamageType(damageType) {
  // Valida se tipo de dano é reconhecido
  return Object.keys(DAMAGE_TYPES).includes(damageType.toUpperCase());
}

// ============================================================================
// SEÇÃO 8: ORDENAÇÃO
// ============================================================================

function sortByInitiative(characters) {
  // Ordena characters por INIT (maior primeiro)
  // Será ajustado depois por SLOW e FIRST-STRIKE
  return [...characters].sort((a, b) => b.getInitiative() - a.getInitiative());
}

// ============================================================================
// SEÇÃO 9: FORMATAÇÃO E UTILIDADES
// ============================================================================

function formatHealth(current, max) {
  return `${Math.round(current)}/${Math.round(max)}`;
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function getHealthColor(healthPercent) {
  if (healthPercent > 75) return 'green';
  if (healthPercent > 50) return 'yellow';
  if (healthPercent > 25) return 'orange';
  return 'red';
}

function formatDamageReport(attacker, defender, damageType, baseDamage, mitigation, finalDamage) {
  // Gera relatório legível de cálculo de dano
  return {
    attacker: attacker.name,
    defender: defender.name,
    type: damageType,
    baseDamage: Math.round(baseDamage),
    mitigation: Math.round(mitigation),
    finalDamage: Math.round(finalDamage),
    description: `${attacker.name} (${damageType}) → ${defender.name}: ${Math.round(baseDamage)} - ${Math.round(mitigation)} = ${Math.round(finalDamage)} dano`
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // RNG
  getRandomInt,
  rollChance,
  
  // Tipos de dano
  DAMAGE_TYPES,
  getDamageTypeConfig,
  
  // Cálculo de dano
  calculateBaseDamage,
  calculateMitigation,
  applyDamageMultipliers,
  calculateFinalDamage,
  
  // Crítico
  calculateCriticalChance,
  getCriticalMultiplier,
  rollCritical,
  
  // Posicionamento
  getDistance,
  isInSameLane,
  isAdjacent,
  getAdjacentSlots,
  getSlotName,
  
  // Validações
  validateCharacterTeam,
  isTeamAlive,
  validateDamageType,
  
  // Ordenação
  sortByInitiative,
  
  // Formatação
  formatHealth,
  formatPercent,
  getHealthColor,
  formatDamageReport
};
