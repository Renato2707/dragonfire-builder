// effects.js (Refatorado - Nível 2: Effects System)
// Responsabilidade: Definir, aplicar e gerenciar 15+ efeitos reais

// ============================================================================
// SEÇÃO 1: CATÁLOGO DE EFEITOS
// ============================================================================

// Referência: 00-CONCEITOS-BASE.md seções 3 e 7

const EFFECTS_CATALOG = {
  
  // ========== EFEITOS DE DANO (DoT - Damage over Time) ==========
  
  BLEED: {
    id: 'bleed',
    name: 'Bleed',
    category: 'damage',
    description: 'Deals Physical Damage each round',
    duration: 2,
    damageType: 'physical',
    damagePerRound: 5,
    stackable: false,
    stackCap: 1
  },
  
  PANIC: {
    id: 'panic',
    name: 'Panic',
    category: 'damage',
    description: 'Deals Tactical Damage each round',
    duration: 2,
    damageType: 'tactical',
    damagePerRound: 5,
    stackable: false,
    stackCap: 1
  },
  
  BURN: {
    id: 'burn',
    name: 'Burn',
    category: 'damage',
    description: 'Deals Fire Damage each round',
    duration: 2,
    damageType: 'fire',
    damagePerRound: 5,
    stackable: false,
    stackCap: 1
  },
  
  // ========== EFEITOS POSITIVOS (Buffs) ==========
  
  FIRST_STRIKE: {
    id: 'first_strike',
    name: 'First-Strike',
    category: 'positive',
    description: 'Act before all other combatants this round',
    duration: 1,
    initiativeModifier: 999,  // Valor muito alto para garantir primeiro
    stackable: false,
    stackCap: 1
  },
  
  DOUBLE_STRIKE: {
    id: 'double_strike',
    name: 'Double-Strike',
    category: 'positive',
    description: 'Grants a second Basic Attack each round',
    duration: 1,
    extraActions: 1,  // 1 ação extra por rodada
    stackable: false,
    stackCap: 1
  },
  
  RECOVERY: {
    id: 'recovery',
    name: 'Recovery',
    category: 'positive',
    description: 'Healing effect that restores HP over time',
    duration: 2,
    healPerRound: 15,
    stackable: false,
    stackCap: 1
  },
  
  ADVANTAGE: {
    id: 'advantage',
    name: 'Advantage',
    category: 'positive',
    description: 'Increases Damage Dealt by X%',
    duration: 2,
    damageBonus: 15,  // +15% de dano
    stackable: true,
    stackCap: 5
  },
  
  RESISTANCE: {
    id: 'resistance',
    name: 'Resistance',
    category: 'positive',
    description: 'Reduces Damage Received by X%',
    duration: 2,
    defenseBonus: 20,  // -20% dano recebido
    stackable: true,
    stackCap: 5
  },
  
  // ========== EFEITOS NEGATIVOS (Debuffs) ==========
  
  SLOW: {
    id: 'slow',
    name: 'Slow',
    category: 'negative',
    description: 'Attack after all other combatants each round',
    duration: 2,
    initiativeModifier: -999,  // Valor muito negativo para garantir último
    stackable: false,
    stackCap: 1
  },
  
  WEAKENED: {
    id: 'weakened',
    name: 'Weakened',
    category: 'negative',
    description: 'Reduces Damage Dealt by X%',
    duration: 2,
    damagePenalty: 25,  // -25% de dano causado
    stackable: true,
    stackCap: 3
  },
  
  VULNERABLE: {
    id: 'vulnerable',
    name: 'Vulnerable',
    category: 'negative',
    description: 'Increases Damage Received by X%',
    duration: 2,
    defensePenalty: 25,  // +25% dano recebido
    stackable: true,
    stackCap: 3
  },
  
  PREY: {
    id: 'prey',
    name: 'Prey',
    category: 'negative',
    description: 'Modifies Recovery Received (less effective)',
    duration: 2,
    recoveryPenalty: 50,  // -50% de cura recebida
    stackable: false,
    stackCap: 1
  },
  
  // ========== EFEITOS DE CONTROLE (Control) ==========
  
  EVADE: {
    id: 'evade',
    name: 'Evade',
    category: 'control',
    description: 'Each instance of damage has X% chance to be ignored',
    duration: 2,
    evasionChance: 25,  // 25% chance de evitar dano
    stackable: true,
    stackCap: 3
  },
  
  CLEANSE: {
    id: 'cleanse',
    name: 'Cleanse',
    category: 'control',
    description: 'Remove negative effects (ally) or positive effects (enemy)',
    duration: 1,
    removesNegative: true,  // Remove debuffs de aliados
    stackable: false,
    stackCap: 1,
    isInstant: true  // Executa imediatamente
  },
  
  TAUNT: {
    id: 'taunt',
    name: 'Taunt',
    category: 'control',
    description: 'Forces target to attack this dragon only',
    duration: 2,
    forcedTarget: true,  // Força seleção de alvo
    stackable: false,
    stackCap: 1
  },
  
  STUN: {
    id: 'stun',
    name: 'Stun',
    category: 'control',
    description: 'Cannot act (no Commands, Habits, or Basic Attack)',
    duration: 1,
    preventsAllActions: true,  // Bloqueia tudo
    stackable: false,
    stackCap: 1
  },
  
  OVERWHELM: {
    id: 'overwhelm',
    name: 'Overwhelm',
    category: 'control',
    description: 'Cannot use Commands or Habits (only Basic Attack)',
    duration: 2,
    preventsAbilities: true,  // Bloqueia Commands/Habits
    stackable: false,
    stackCap: 1
  },
  
  STAGGER: {
    id: 'stagger',
    name: 'Stagger',
    category: 'control',
    description: 'Cannot use Attack Modifier Commands or Basic Attack',
    duration: 2,
    preventsAttacks: true,  // Bloqueia ataques
    stackable: false,
    stackCap: 1
  },
  
  CONFUSION: {
    id: 'confusion',
    name: 'Confusion',
    category: 'control',
    description: '50% chance to attack Ally instead of Enemy each action',
    duration: 2,
    confusionChance: 50,  // 50% chance de friendly fire
    stackable: false,
    stackCap: 1
  }
  
};

// ============================================================================
// SEÇÃO 2: CRIAÇÃO E GERENCIAMENTO DE EFEITOS
// ============================================================================

class Effect {
  constructor(effectId, rank = 1, appliedBy = null) {
    const template = EFFECTS_CATALOG[effectId.toUpperCase()];
    
    if (!template) {
      throw new Error(`Effect desconhecido: ${effectId}`);
    }
    
    // Copiar propriedades do template
    this.id = template.id;
    this.name = template.name;
    this.category = template.category;
    this.description = template.description;
    this.duration = template.duration;
    this.maxDuration = template.duration;
    this.rank = rank;  // Rank 1-5 (★2, ★4, ★6, ★8, ★10)
    this.appliedBy = appliedBy;
    
    // Propriedades baseadas em template
    this.damageType = template.damageType || null;
    this.damagePerRound = template.damagePerRound || 0;
    this.healPerRound = template.healPerRound || 0;
    this.evasionChance = template.evasionChance || 0;
    this.confusionChance = template.confusionChance || 0;
    this.recoveryPenalty = template.recoveryPenalty || 0;
    
    // Modificadores (serão aplicados a Character)
    this.initiativeModifier = template.initiativeModifier || 0;
    this.damageBonus = template.damageBonus || 0;
    this.damagePenalty = template.damagePenalty || 0;
    this.defenseBonus = template.defenseBonus || 0;
    this.defensePenalty = template.defensePenalty || 0;
    this.extraActions = template.extraActions || 0;
    
    // Flags de comportamento
    this.stackable = template.stackable;
    this.stackCap = template.stackCap;
    this.isInstant = template.isInstant || false;
    this.preventsAllActions = template.preventsAllActions || false;
    this.preventsAbilities = template.preventsAbilities || false;
    this.preventsAttacks = template.preventsAttacks || false;
    this.forcedTarget = template.forcedTarget || false;
    this.removesNegative = template.removesNegative || false;
    
    this.isActive = true;
  }
  
  tick() {
    // Reduzir duração em 1
    if (this.duration > 0) {
      this.duration -= 1;
    }
    return this.duration > 0;  // Retorna true se ainda ativo
  }
  
  isExpired() {
    return this.duration <= 0;
  }
  
  getDescription() {
    return `${this.name} (${this.duration}/${this.maxDuration})`;
  }
}

// ============================================================================
// SEÇÃO 3: APLICAÇÃO DE EFEITOS
// ============================================================================

function applyEffect(character, effectId, rank = 1, appliedBy = null) {
  // Aplicar um efeito a um character
  
  const effect = new Effect(effectId, rank, appliedBy);
  
  // Verificar stacking
  const existing = character.activeEffects.find(e => e.id === effect.id);
  
  if (existing && effect.stackable) {
    // Stackable: aumentar stack se não atingiu cap
    if (existing.rank < effect.stackCap) {
      existing.rank += 1;
    } else {
      // Renewar duração ao invés de stackar
      existing.duration = Math.max(existing.duration, effect.duration);
    }
  } else if (existing && !effect.stackable) {
    // Não stackable: renewar duração
    existing.duration = Math.max(existing.duration, effect.duration);
  } else {
    // Novo efeito
    character.activeEffects.push(effect);
    
    // Aplicar modificadores imediatamente
    applyEffectModifiers(character, effect);
  }
  
  return effect;
}

function applyEffectModifiers(character, effect) {
  // Aplicar modificadores permanentes do efeito ao character
  // (ex: SLOW reduz INIT, ADVANTAGE aumenta dano, etc)
  
  if (effect.initiativeModifier !== 0) {
    character.addStatModifier('init', effect.initiativeModifier);
  }
  
  if (effect.damageBonus > 0) {
    character.damageBonus = (character.damageBonus || 0) + effect.damageBonus;
  }
  
  if (effect.damagePenalty > 0) {
    character.damagePenalty = (character.damagePenalty || 0) + effect.damagePenalty;
  }
  
  if (effect.defenseBonus > 0) {
    character.defenseBonus = (character.defenseBonus || 0) + effect.defenseBonus;
  }
  
  if (effect.defensePenalty > 0) {
    character.defensePenalty = (character.defensePenalty || 0) + effect.defensePenalty;
  }
}

function removeEffectModifiers(character, effect) {
  // Remover modificadores quando efeito expira
  
  if (effect.initiativeModifier !== 0) {
    character.addStatModifier('init', -effect.initiativeModifier);
  }
  
  if (effect.damageBonus > 0) {
    character.damageBonus = Math.max(0, (character.damageBonus || 0) - effect.damageBonus);
  }
  
  if (effect.damagePenalty > 0) {
    character.damagePenalty = Math.max(0, (character.damagePenalty || 0) - effect.damagePenalty);
  }
  
  if (effect.defenseBonus > 0) {
    character.defenseBonus = Math.max(0, (character.defenseBonus || 0) - effect.defenseBonus);
  }
  
  if (effect.defensePenalty > 0) {
    character.defensePenalty = Math.max(0, (character.defensePenalty || 0) - effect.defensePenalty);
  }
}

// ============================================================================
// SEÇÃO 4: VERIFICAÇÃO E CONSULTA DE EFEITOS
// ============================================================================

function hasEffect(character, effectId) {
  // Verificar se character tem efeito ativo
  return character.activeEffects.some(e => 
    e.id === effectId.toLowerCase() && !e.isExpired()
  );
}

function getEffect(character, effectId) {
  // Obter efeito específico (ou null se não existe)
  return character.activeEffects.find(e => 
    e.id === effectId.toLowerCase() && !e.isExpired()
  ) || null;
}

function getEffectsByCategory(character, category) {
  // Obter todos os efeitos de uma categoria
  return character.activeEffects.filter(e => 
    e.category === category && !e.isExpired()
  );
}

function getActiveEffectNames(character) {
  // Retorna array com nomes dos efeitos ativos
  return character.activeEffects
    .filter(e => !e.isExpired())
    .map(e => e.name);
}

// ============================================================================
// SEÇÃO 5: PROCESSAMENTO DE EFEITOS POR RODADA
// ============================================================================

function updateEffects(character) {
  // Chamado ao final de cada rodada
  // 1. Remover modificadores de efeitos que expiram
  // 2. Reduzir duração
  // 3. Limpar efeitos expirados
  
  for (let effect of character.activeEffects) {
    // Se vai expirar esta rodada, remover modificadores primeiro
    if (effect.duration === 1) {
      removeEffectModifiers(character, effect);
    }
    
    // Reduzir duração
    effect.tick();
  }
  
  // Remover efeitos expirados
  character.activeEffects = character.activeEffects.filter(e => !e.isExpired());
}

function processDamageEffects(character, utils) {
  // Processar efeitos de dano (BLEED, PANIC, BURN) ao final da rodada
  // Requer utils.js para calcular dano de efeitos
  
  let totalDamage = 0;
  const damageBreakdown = {};
  
  for (let effect of character.activeEffects) {
    if (effect.category !== 'damage') continue;
    if (effect.isExpired()) continue;
    
    if (effect.damagePerRound > 0) {
      const damage = effect.damagePerRound;
      totalDamage += damage;
      
      if (!damageBreakdown[effect.name]) {
        damageBreakdown[effect.name] = 0;
      }
      damageBreakdown[effect.name] += damage;
    }
  }
  
  if (totalDamage > 0) {
    character.takeDamage(totalDamage);
    
    // Log detalhado
    const breakdown = Object.entries(damageBreakdown)
      .map(([name, dmg]) => `${name}:${dmg}`)
      .join(', ');
    
    character.logAction(`DOT DAMAGE: -${totalDamage} HP (${breakdown})`);
  }
  
  return totalDamage;
}

function processHealingEffects(character) {
  // Processar efeitos de cura (RECOVERY) ao final da rodada
  
  let totalHealing = 0;
  
  for (let effect of character.activeEffects) {
    if (effect.id !== 'recovery') continue;
    if (effect.isExpired()) continue;
    
    let healing = effect.healPerRound;
    
    // Aplicar PREY penalty se ativo
    const preyEffect = getEffect(character, 'prey');
    if (preyEffect) {
      healing *= (1 - preyEffect.recoveryPenalty / 100);
    }
    
    const actualHealing = character.heal(Math.round(healing));
    totalHealing += actualHealing;
  }
  
  if (totalHealing > 0) {
    character.logAction(`HEALING: +${totalHealing} HP`);
  }
  
  return totalHealing;
}

// ============================================================================
// SEÇÃO 6: VERIFICAÇÕES DE CAPACIDADE (ACTION GATES)
// ============================================================================

function canAct(character) {
  // Verificar se character pode agir (não está STUN, etc)
  if (character.isDead) return false;
  
  const stunEffect = getEffect(character, 'stun');
  if (stunEffect) return false;
  
  return true;
}

function canUseAbilities(character) {
  // Verificar se character pode usar Commands/Habits
  if (!canAct(character)) return false;
  
  const overwhelmEffect = getEffect(character, 'overwhelm');
  if (overwhelmEffect) return false;
  
  return true;
}

function canAttack(character) {
  // Verificar se character pode fazer Basic Attack
  if (!canAct(character)) return false;
  
  const staggerEffect = getEffect(character, 'stagger');
  if (staggerEffect) return false;
  
  return true;
}

// ============================================================================
// SEÇÃO 7: MANIPULAÇÃO DE EFEITOS (UTILITY)
// ============================================================================

function removeEffect(character, effectId) {
  // Remover efeito manualmente (ex: via CLEANSE)
  const effect = getEffect(character, effectId);
  if (effect) {
    removeEffectModifiers(character, effect);
    effect.duration = 0;  // Marcar como expirado
    return true;
  }
  return false;
}

function removeAllNegativeEffects(character) {
  // Remove todos os efeitos negativos (usado por CLEANSE em aliados)
  const negativeEffects = getEffectsByCategory(character, 'negative');
  negativeEffects.forEach(effect => {
    removeEffect(character, effect.id);
  });
  return negativeEffects.length;
}

function removeAllPositiveEffects(character) {
  // Remove todos os efeitos positivos (usado por CLEANSE em inimigos)
  const positiveEffects = getEffectsByCategory(character, 'positive');
  positiveEffects.forEach(effect => {
    removeEffect(character, effect.id);
  });
  return positiveEffects.length;
}

function clearAllEffects(character) {
  // Remove todos os efeitos (reset, fim de batalha)
  const count = character.activeEffects.length;
  character.activeEffects.forEach(effect => {
    removeEffectModifiers(character, effect);
  });
  character.activeEffects = [];
  return count;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Catálogo
  EFFECTS_CATALOG,
  Effect,
  
  // Aplicação
  applyEffect,
  applyEffectModifiers,
  removeEffectModifiers,
  
  // Consulta
  hasEffect,
  getEffect,
  getEffectsByCategory,
  getActiveEffectNames,
  
  // Processamento por rodada
  updateEffects,
  processDamageEffects,
  processHealingEffects,
  
  // Verificação de capacidade
  canAct,
  canUseAbilities,
  canAttack,
  
  // Manipulação
  removeEffect,
  removeAllNegativeEffects,
  removeAllPositiveEffects,
  clearAllEffects
};
