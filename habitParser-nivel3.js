// habitParser.js (Nível 3: Habit Parser)
// Responsabilidade: Ler habits JSON e converter 'structured' em ações executáveis

// ============================================================================
// SEÇÃO 1: TIPOS DE TRIGGERS (WHEN)
// ============================================================================

const TRIGGER_TYPES = {
  // Executa uma única vez ao início da batalha
  COMBAT_START: 'combat_start',
  
  // Executa a cada rodada/ação (com chance variável)
  EACH_ROUND: 'each',
  EACH_ACTION: 'each',  // Mesmo que EACH_ROUND
  
  // Executa em rodadas específicas (odd: 1,3,5,7,9 ou even: 2,4,6,8,10)
  ODD_ROUNDS: 'odd',
  EVEN_ROUNDS: 'even',
  
  // Executa após atacar normalmente
  AFTER_ATTACK: 'after_attack',
  
  // Executa se vida cai abaixo de X%
  LOW_HEALTH: 'low_health'
};

// Mapear textos descritivos para tipos internos
const TRIGGER_MAP = {
  'Start of Combat': TRIGGER_TYPES.COMBAT_START,
  'Each Action / Round': TRIGGER_TYPES.EACH_ROUND,
  'Each Round': TRIGGER_TYPES.EACH_ROUND,
  'Odd Rounds': TRIGGER_TYPES.ODD_ROUNDS,
  'Even Rounds': TRIGGER_TYPES.EVEN_ROUNDS,
  'After Basic Attack': TRIGGER_TYPES.AFTER_ATTACK,
  'Low Health': TRIGGER_TYPES.LOW_HEALTH
};

// ============================================================================
// SEÇÃO 2: TIPOS DE AÇÕES (ACTION TYPES)
// ============================================================================

const ACTION_TYPES = {
  // Modificador de stats (buff/debuff)
  MOD: 'mod',
  
  // Efeito de status (BURN, STUN, etc)
  STATUS: 'status',
  
  // Dano direto (nuke)
  DAMAGE: 'dmg',
  
  // Cura
  HEAL: 'heal'
};

// ============================================================================
// SEÇÃO 3: PARSER DE TARGETING
// ============================================================================

function parseTargeting(targetingString) {
  // Converte string descritiva em objeto estruturado
  // Exemplos:
  // "3 Enemies" → {side: 'enemy', count: 3, select: 'any'}
  // "1 Self" → {side: 'self', count: 1}
  // "2 Enemies (Adjacent Lane)" → {side: 'enemy', count: 2, position: 'adjacent'}
  
  if (!targetingString) return { side: 'self', count: 1 };
  
  const lower = targetingString.toLowerCase();
  let targeting = {
    side: 'self',
    count: 1,
    select: 'any',
    position: null
  };
  
  // Determinar lado (self/ally/enemy)
  if (lower.includes('self')) {
    targeting.side = 'self';
  } else if (lower.includes('ally') || lower.includes('allies')) {
    targeting.side = 'ally';
  } else if (lower.includes('enemy') || lower.includes('enemies')) {
    targeting.side = 'enemy';
  }
  
  // Extrair quantidade (número no início)
  const match = targetingString.match(/^(\d+)/);
  if (match) {
    targeting.count = parseInt(match[1]);
  }
  
  // Determinar tipo de seleção
  if (lower.includes('adjacent')) {
    targeting.position = 'adjacent';
  } else if (lower.includes('same lane')) {
    targeting.position = 'same_lane';
  } else if (lower.includes('flank')) {
    if (lower.includes('left')) targeting.position = 'left_flank';
    else if (lower.includes('right')) targeting.position = 'right_flank';
    else targeting.position = 'flank';
  }
  
  // Seleção especial (lowest, highest, etc)
  if (lower.includes('lowest')) {
    targeting.select = 'lowest_troops';
  } else if (lower.includes('highest')) {
    targeting.select = 'highest_troops';
  } else if (lower.includes('random')) {
    targeting.select = 'random';
  }
  
  return targeting;
}

// ============================================================================
// SEÇÃO 4: PARSER DE DURAÇÃO
// ============================================================================

function parseDuration(durationString) {
  // Converte string descritiva em número de rodadas ou 'combat'
  // Exemplos:
  // "2 Rounds" → 2
  // "Whole Combat" → 'combat'
  // "Instant" → 0
  // "1 Round" → 1
  
  if (!durationString) return 1;
  
  const lower = durationString.toLowerCase();
  
  if (lower.includes('whole combat') || lower.includes('permanent')) {
    return 'combat';
  }
  
  if (lower.includes('instant') || lower.includes('immediate')) {
    return 0;
  }
  
  // Extrair número
  const match = durationString.match(/(\d+)/);
  if (match) {
    return parseInt(match[1]);
  }
  
  return 1;  // Default 1 rodada
}

// ============================================================================
// SEÇÃO 5: CLASSE HABIT
// ============================================================================

class Habit {
  constructor(habitData, dragonId) {
    // Dados básicos do JSON
    this.dragonId = dragonId;
    this.name = habitData.name;
    this.slot = habitData.slot;
    this.unlockStar = habitData.unlockStar;
    this.trigger = habitData.trigger;
    this.targeting = habitData.targeting;
    this.effectType = habitData.effectType;
    this.duration = habitData.duration;
    this.description = habitData.description;
    
    // Scaling por rank (1-5 correspondente a ★2, ★4, ★6, ★8, ★10)
    this.scaling = habitData.scaling || [];
    this.scalingRaw = habitData.scalingRaw;
    
    // Estrutura parseada (já pronta)
    this.structured = habitData.structured || [];
    
    // Parser próprio (feito ao construir)
    this.parsedActions = [];
    this.triggerType = TRIGGER_MAP[this.trigger] || TRIGGER_TYPES.EACH_ROUND;
    this.targetingParsed = parseTargeting(this.targeting);
    this.durationParsed = parseDuration(this.duration);
    
    this.parseActions();
  }
  
  parseActions() {
    // Converter structured em ações parseadas
    if (!this.structured || this.structured.length === 0) {
      console.warn(`Habit ${this.name} não tem structured`);
      return;
    }
    
    // Cada item em structured tem "when" e "actions"
    for (let item of this.structured) {
      const when = item.when;
      const actions = item.actions || [];
      
      for (let action of actions) {
        this.parsedActions.push({
          when: when,
          type: action.t,  // 'mod', 'status', 'dmg', 'heal'
          data: action,    // Dados brutos da ação
          chance: action.chance ? action.chance[0] : 100  // Default chance 100%
        });
      }
    }
  }
  
  getActionByRank(rank) {
    // Retorna a versão da ação para um rank específico (1-5)
    // rank 1 = ★2, rank 5 = ★10
    // Array tem índices 0-4 que correspondem a ranks 1-5
    
    const rankIndex = Math.max(0, Math.min(4, rank - 1));
    
    const processed = [];
    for (let action of this.parsedActions) {
      processed.push({
        ...action,
        rankIndex: rankIndex,
        rankValue: this.getScalingValue(action, rankIndex)
      });
    }
    
    return processed;
  }
  
  getScalingValue(action, rankIndex) {
    // Extrair valor de scaling para um rank específico
    // scaling[i].values é um array [val1, val2, val3, val4, val5]
    
    if (!this.scaling || this.scaling.length === 0) return null;
    
    // Para ações de modificador (mod)
    if (action.data.mods) {
      const values = {};
      for (let mod of action.data.mods) {
        if (mod.pct) {
          values[mod.stat] = mod.pct[rankIndex];
        } else if (mod.fixed) {
          values[mod.stat] = mod.fixed[rankIndex];
        }
      }
      return values;
    }
    
    // Para efeitos (status)
    if (action.data.chance) {
      return action.data.chance[rankIndex];
    }
    
    // Para dano
    if (action.data.val) {
      return action.data.val;
    }
    
    return null;
  }
  
  shouldTrigger(battleRound, battlePhase) {
    // Determinar se habit deveria ativar nesta rodada/fase
    // battleRound: número da rodada (1-10)
    // battlePhase: 'combat_start', 'each_round', 'after_attack'
    
    if (this.triggerType === TRIGGER_TYPES.COMBAT_START) {
      return battleRound === 1 && battlePhase === 'combat_start';
    }
    
    if (this.triggerType === TRIGGER_TYPES.EACH_ROUND) {
      return battlePhase === 'each_round' || battlePhase === 'each_action';
    }
    
    if (this.triggerType === TRIGGER_TYPES.ODD_ROUNDS) {
      return battleRound % 2 === 1;  // 1, 3, 5, 7, 9
    }
    
    if (this.triggerType === TRIGGER_TYPES.EVEN_ROUNDS) {
      return battleRound % 2 === 0;  // 2, 4, 6, 8, 10
    }
    
    if (this.triggerType === TRIGGER_TYPES.AFTER_ATTACK) {
      return battlePhase === 'after_attack';
    }
    
    return false;
  }
  
  getDescription() {
    return `${this.name} (★${this.unlockStar}): ${this.trigger} → ${this.targeting}`;
  }
}

// ============================================================================
// SEÇÃO 6: CARREGADOR DE HABITS
// ============================================================================

async function loadDragonHabits(dragonId) {
  // Carregar arquivo de habits de um dragão específico
  // Espera arquivo em ./data/{dragonId}_habits.json
  
  try {
    const url = `./data/${dragonId}_habits.json`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Converter cada habit em objeto Habit
    const habits = (data.habits || []).map(habitData => 
      new Habit(habitData, dragonId)
    );
    
    console.log(`✓ Carregados ${habits.length} habits de ${dragonId}`);
    return habits;
  } catch (error) {
    console.error(`Falha ao carregar habits de ${dragonId}:`, error);
    return [];
  }
}

function loadDragonHabitsSync(habitData, dragonId) {
  // Versão síncrona (para dados já carregados em memória)
  const habits = (habitData.habits || []).map(h => 
    new Habit(h, dragonId)
  );
  return habits;
}

// ============================================================================
// SEÇÃO 7: EXECUTOR DE AÇÕES
// ============================================================================

function executeHabitAction(habit, actionData, attacker, targets, rank = 1) {
  // Executar uma ação específica de uma habit
  // Retorna {success, executed, log}
  
  const result = {
    success: true,
    executed: 0,
    log: [],
    damages: [],
    heals: [],
    effects: []
  };
  
  // Obter scaling para este rank
  const rankIndex = Math.max(0, Math.min(4, rank - 1));
  const scalingValue = habit.getScalingValue(actionData, rankIndex);
  
  // Verificar chance
  if (actionData.chance) {
    const chance = Array.isArray(actionData.chance) 
      ? actionData.chance[rankIndex] 
      : actionData.chance;
    
    // Aqui entraria rollChance(chance) de utils.js
    // Por enquanto, assumir sucesso
  }
  
  // Executar pela tipo de ação
  const actionType = actionData.data.t;
  
  if (actionType === 'mod') {
    // Modificador de stats (buff/debuff)
    result.effects = executeModAction(habit, actionData, targets, scalingValue);
    result.executed = result.effects.length;
  } else if (actionType === 'status') {
    // Efeito de status (BURN, STUN, etc)
    result.effects = executeStatusAction(habit, actionData, targets, scalingValue);
    result.executed = result.effects.length;
  } else if (actionType === 'dmg') {
    // Dano direto
    result.damages = executeDamageAction(habit, actionData, targets, scalingValue);
    result.executed = result.damages.length;
  } else if (actionType === 'heal') {
    // Cura
    result.heals = executeHealAction(habit, actionData, targets, scalingValue);
    result.executed = result.heals.length;
  }
  
  return result;
}

function executeModAction(habit, actionData, targets, scalingValue) {
  // Executar ação de modificador de stats
  // scalingValue = {stat: percentage}
  
  const effects = [];
  
  for (let target of targets) {
    if (!target || target.isDead) continue;
    
    // Aplicar cada modificador
    for (let stat in scalingValue) {
      const value = scalingValue[stat];
      target.addStatModifier(stat, value);
      
      effects.push({
        target: target.name,
        stat: stat,
        value: value,
        log: `${target.name}: ${stat} ${value > 0 ? '+' : ''}${value}`
      });
    }
  }
  
  return effects;
}

function executeStatusAction(habit, actionData, targets, scalingValue) {
  // Executar ação de efeito de status
  // Necessário ter effects.js importado
  
  const effects = [];
  const actionRaw = actionData.data;
  const statusType = actionRaw.st;  // 'burn', 'stun', 'slow', etc
  const duration = actionRaw.dur || 2;
  
  for (let target of targets) {
    if (!target || target.isDead) continue;
    
    effects.push({
      target: target.name,
      statusType: statusType,
      duration: duration,
      log: `${target.name}: ${statusType} aplicado (${duration} rodadas)`
    });
  }
  
  return effects;
}

function executeDamageAction(habit, actionData, targets, scalingValue) {
  // Executar ação de dano direto
  // Necessário ter utils.js importado
  
  const damages = [];
  
  for (let target of targets) {
    if (!target || target.isDead) continue;
    
    damages.push({
      target: target.name,
      amount: scalingValue || 100,
      log: `${target.name}: Dano -${scalingValue || 100}`
    });
  }
  
  return damages;
}

function executeHealAction(habit, actionData, targets, scalingValue) {
  // Executar ação de cura
  
  const heals = [];
  
  for (let target of targets) {
    if (!target || target.isDead) continue;
    
    heals.push({
      target: target.name,
      amount: scalingValue || 50,
      log: `${target.name}: Cura +${scalingValue || 50}`
    });
  }
  
  return heals;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Tipos e mapeadores
  TRIGGER_TYPES,
  TRIGGER_MAP,
  ACTION_TYPES,
  
  // Parsers
  parseTargeting,
  parseDuration,
  
  // Classe Habit
  Habit,
  
  // Carregadores
  loadDragonHabits,
  loadDragonHabitsSync,
  
  // Executores
  executeHabitAction,
  executeModAction,
  executeStatusAction,
  executeDamageAction,
  executeHealAction
};
