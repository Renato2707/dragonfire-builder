// positionSystem.js

const POSITIONS = { LEFT: 0, VANGUARD: 1, CENTER: 1, RIGHT: 2 };
const POSITION_NAMES = { 0: 'Left Flank', 1: 'Vanguard', 2: 'Right Flank' };
const FLANK_NAMES = { 0: 'Left Flank', 1: 'Vanguard', 2: 'Right Flank' };

const SELECT_ALIASES = {
  'highest:troops': 'highest_troops',
  'lowest:troops': 'lowest_troops',
  'highest:str': 'highest_str',
  'highest:int': 'highest_int',
  'highest:inst': 'highest_inst',
  'highest:init': 'highest_init',
  'prefer_lane:l': 'prefer_lane:L',
  'prefer_lane:left': 'prefer_lane:L',
  'prefer_lane:left_flank': 'prefer_lane:L',
  'prefer_lane:r': 'prefer_lane:R',
  'prefer_lane:right': 'prefer_lane:R',
  'prefer_lane:right_flank': 'prefer_lane:R',
  'prefer_lane:v': 'prefer_lane:V',
  'prefer_lane:vanguard': 'prefer_lane:V',
  'prefer_lane:center': 'prefer_lane:V',
  'adjacent': 'adjacency',
  'adjacent_lane': 'adjacency',
  'prefer_class:hunter': 'prefer_class:hunter',
  'prefer_class:warrior': 'prefer_class:warrior',
  'prefer_class:sentinel': 'prefer_class:sentinel',
  'prefer_class:champion': 'prefer_class:champion',
  'prefer_breed:hunter': 'prefer_class:hunter',
  'prefer_breed:warrior': 'prefer_class:warrior',
  'prefer_breed:sentinel': 'prefer_class:sentinel',
  'prefer_breed:champion': 'prefer_class:champion',
  'last_damage': 'last_dmg'
};

function getDistance(slot1, slot2) {
  return Math.abs(slot1 - slot2);
}

function isInSameLane(slot1, slot2) {
  return slot1 === slot2;
}

function isAdjacent(slot1, slot2) {
  return getDistance(slot1, slot2) === 1;
}

function isWithinAdjacency(slot1, slot2) {
  return getDistance(slot1, slot2) <= 1;
}

function getAdjacentSlots(slot) {
  const adjacent = [];
  if (slot > 0) adjacent.push(slot - 1);
  if (slot < 2) adjacent.push(slot + 1);
  return adjacent;
}

function getCharacterAtSlot(team, slot) {
  if (!team || slot < 0 || slot > 2) return null;
  return team.find(c => c && c.slotPosition === slot) || team[slot] || null;
}

function getCharactersAtSameLane(friendlyTeam, enemyTeam, characterSlot) {
  return {
    friendly: getCharacterAtSlot(friendlyTeam, characterSlot),
    enemy: getCharacterAtSlot(enemyTeam, characterSlot),
    slot: characterSlot
  };
}

function getCharactersInAdjacentLanes(team, slot) {
  const characters = [];
  for (const adjSlot of getAdjacentSlots(slot)) {
    const char = getCharacterAtSlot(team, adjSlot);
    if (char && !char.isDead) {
      characters.push({ character: char, slot: adjSlot, distance: getDistance(slot, adjSlot) });
    }
  }
  return characters;
}

function getCharactersInFlank(team, flankPosition) {
  let slot;
  if (flankPosition === 'left' || flankPosition === 'left_flank') slot = POSITIONS.LEFT;
  else if (flankPosition === 'center' || flankPosition === 'vanguard') slot = POSITIONS.VANGUARD;
  else if (flankPosition === 'right' || flankPosition === 'right_flank') slot = POSITIONS.RIGHT;
  else return [];
  const char = getCharacterAtSlot(team, slot);
  return char && !char.isDead ? [char] : [];
}

function effectId(effect) {
  return String(effect.id || effect.name || '').toLowerCase().replace(/-/g, '_');
}

function hasStatus(character, statusName) {
  const want = String(statusName || '').toLowerCase().replace(/-/g, '_');
  return (character.activeEffects || []).some(e => {
    const active = typeof e.isExpired === 'function' ? !e.isExpired() : e.duration > 0;
    return active && effectId(e) === want;
  });
}

function getDealerType(character) {
  const str = character.getModifiedStat('str');
  const inst = character.getModifiedStat('inst');
  const int = character.getModifiedStat('int');
  if (str >= inst && str >= int) return 'physical';
  if (int >= str && int >= inst) return 'fire';
  return 'tactical';
}

function getStat(character, stat) {
  if (typeof character.getModifiedStat === 'function') {
    return character.getModifiedStat(stat);
  }
  return (character.stats && character.stats[stat]) || 0;
}

function troopCount(character) {
  return Number(character && character.currentHealth) || 0;
}

function healthPct(character) {
  if (character && typeof character.getHealthPercentage === 'function') return character.getHealthPercentage();
  return 100;
}

function sortByTroops(candidates, lowestFirst) {
  const dir = lowestFirst ? 1 : -1;
  candidates.sort((a, b) => {
    const diff = (troopCount(a) - troopCount(b)) * dir;
    if (diff !== 0) return diff;
    return (a.slotPosition || 0) - (b.slotPosition || 0);
  });
}

function normalizeSelect(select) {
  if (!select) return 'any';
  const raw = String(select);
  const aliased = SELECT_ALIASES[raw] || SELECT_ALIASES[raw.toLowerCase()];
  if (aliased) return aliased;
  if (raw === 'prefer_lane:L' || raw === 'prefer_lane:R' || raw === 'prefer_lane:V') return raw;
  return raw;
}

function preferClass(candidates, klass) {
  const want = String(klass || '').toLowerCase();
  candidates.sort((a, b) => {
    const sa = String(a.breed || '').toLowerCase() === want ? 0 : 1;
    const sb = String(b.breed || '').toLowerCase() === want ? 0 : 1;
    return sa - sb;
  });
}

function preferSlot(candidates, slot) {
  candidates.sort((a, b) => {
    const sa = a.slotPosition === slot ? 0 : 1;
    const sb = b.slotPosition === slot ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return getDistance(a.slotPosition, slot) - getDistance(b.slotPosition, slot);
  });
}

function selectTargets(caster, friendlyTeam, enemyTeam, targetingParsed) {
  if (!targetingParsed) return [];

  const tgt = targetingParsed;
  const casterSlot = caster.slotPosition;
  const select = normalizeSelect(tgt.select || 'any');

  let targetTeam;
  if (tgt.side === 'self') {
    targetTeam = [caster];
  } else if (tgt.side === 'ally') {
    targetTeam = tgt.excludeSelf ? friendlyTeam.filter(c => c !== caster) : [...friendlyTeam];
  } else if (tgt.side === 'enemy') {
    targetTeam = [...enemyTeam];
  } else {
    targetTeam = [];
  }

  let candidates = targetTeam.filter(c => c && !c.isDead);
  if (tgt.excludeLastBasic && caster.lastBasicTarget) {
    candidates = candidates.filter(c => c !== caster.lastBasicTarget);
  }
  if (tgt.excludeLastDmg && caster.lastDamageTarget) {
    candidates = candidates.filter(c => c !== caster.lastDamageTarget);
  }
  if (candidates.length === 0) return [];

  if (tgt.slot != null) {
    candidates = candidates.filter(c => c.slotPosition === Number(tgt.slot));
  } else if (select === 'same_lane' || tgt.position === 'same_lane') {
    candidates = candidates.filter(c => c.slotPosition === casterSlot);
  } else if (select === 'adjacency' || tgt.position === 'adjacent') {
    candidates = candidates.filter(c => isWithinAdjacency(c.slotPosition, casterSlot));
  }

  if (tgt.filter) {
    if (tgt.filter.status) {
      candidates = candidates.filter(c => hasStatus(c, tgt.filter.status));
    }
    if (tgt.filter.withoutStatus) {
      candidates = candidates.filter(c => !hasStatus(c, tgt.filter.withoutStatus));
    }
    if (tgt.filter.troopsAbove != null) {
      candidates = candidates.filter(c => healthPct(c) > tgt.filter.troopsAbove);
    }
    if (tgt.filter.troopsBelow != null) {
      candidates = candidates.filter(c => healthPct(c) < tgt.filter.troopsBelow);
    }
    if (tgt.filter.hpAtLeast != null) {
      candidates = candidates.filter(c => healthPct(c) >= tgt.filter.hpAtLeast);
    }
    if (tgt.filter.dealer) {
      const want = String(tgt.filter.dealer).toLowerCase();
      candidates = candidates.filter(c => getDealerType(c) === want);
    }
    if (tgt.filter.breed || tgt.filter.class) {
      const want = String(tgt.filter.breed || tgt.filter.class).toLowerCase();
      candidates = candidates.filter(c => String(c.breed || '').toLowerCase() === want);
    }
    if (tgt.filter.receivedRecoveryLastRound) {
      candidates.sort((a, b) => (b.receivedRecoveryLastRound ? 1 : 0) - (a.receivedRecoveryLastRound ? 1 : 0));
    }
  }

  const hpBelow = tgt.hpBelow != null ? tgt.hpBelow : null;
  const hpAtLeast = tgt.hpAtLeast != null ? tgt.hpAtLeast : null;
  if (hpBelow != null) candidates = candidates.filter(c => healthPct(c) < Number(hpBelow));
  if (hpAtLeast != null) candidates = candidates.filter(c => healthPct(c) >= Number(hpAtLeast));

  if (select === 'last_dmg' || select === 'last_damage') {
    const last = caster.lastDamageTarget;
    if (!last || last.isDead) return [];
    return [last];
  }

  if (select === 'command_hits' || select === 'last_dmg_all') {
    return (caster.lastDamageTargets || []).filter(c => c && !c.isDead);
  }

  if (select === 'prey') {
    const linked = caster.links && caster.links.prey;
    if (linked && !linked.isDead && candidates.includes(linked)) return [linked];
    const marked = candidates.filter(c => hasStatus(c, 'prey'));
    return marked.slice(0, 1);
  }

  if (select === 'last_buff' || select === 'last_mod') {
    const last = caster.lastBuffTarget;
    if (!last || last.isDead) return [];
    return [last];
  }

  if (select === 'last_taunt') {
    const last = caster.lastTauntTarget;
    if (!last || last.isDead) return [];
    return [last];
  }

  if (select === 'last_cleanse') {
    const last = caster.lastCleanse;
    if (!last || last.isDead) return [];
    return [last];
  }

  if (select === 'prefer_lane:L') preferSlot(candidates, POSITIONS.LEFT);
  else if (select === 'prefer_lane:R') preferSlot(candidates, POSITIONS.RIGHT);
  else if (select === 'prefer_lane:V') preferSlot(candidates, POSITIONS.VANGUARD);
  else if (select === 'lowest_troops') {
    sortByTroops(candidates, true);
  } else if (select === 'highest_troops') {
    sortByTroops(candidates, false);
  } else if (select === 'highest_str') {
    candidates.sort((a, b) => getStat(b, 'str') - getStat(a, 'str'));
  } else if (select === 'highest_int') {
    candidates.sort((a, b) => getStat(b, 'int') - getStat(a, 'int'));
  } else if (select === 'highest_inst') {
    candidates.sort((a, b) => getStat(b, 'inst') - getStat(a, 'inst'));
  } else if (select === 'highest_init') {
    candidates.sort((a, b) => getStat(b, 'init') - getStat(a, 'init'));
  } else if (select === 'dealer:tactical' || select === 'dealer:fire' || select === 'dealer:physical') {
    const want = select.split(':')[1];
    candidates = candidates.filter(c => getDealerType(c) === want);
  } else if (select.startsWith('prefer_dealer:')) {
    const want = select.split(':')[1];
    candidates.sort((a, b) => {
      const sa = getDealerType(a) === want ? 0 : 1;
      const sb = getDealerType(b) === want ? 0 : 1;
      return sa - sb;
    });
  } else if (select.startsWith('prefer_without:')) {
    const status = select.split(':')[1];
    candidates.sort((a, b) => (hasStatus(a, status) ? 1 : 0) - (hasStatus(b, status) ? 1 : 0));
  } else if (select === 'prefer_control') {
    const control = ['stun', 'stagger', 'overwhelm', 'confusion'];
    const score = c => control.some(id => hasStatus(c, id)) ? 0 : 1;
    candidates.sort((a, b) => score(a) - score(b));
  } else if (select === 'has_control') {
    const types = (tgt.controlTypes || ['stun', 'stagger', 'overwhelm', 'confusion']).map(t => String(t).toLowerCase());
    candidates = candidates.filter(c => types.some(id => hasStatus(c, id)));
  } else if (select.startsWith('prefer_class:') || select.startsWith('prefer_breed:')) {
    preferClass(candidates, select.split(':')[1]);
  } else if (select.startsWith('class:') || select.startsWith('breed:')) {
    const want = String(select.split(':')[1] || '').toLowerCase();
    candidates = candidates.filter(c => String(c.breed || '').toLowerCase() === want);
  } else if (select === 'random') {
    candidates = shuffleArray(candidates);
  }

  if (candidates.length === 0) return [];

  if (tgt.count === 'all') return candidates;
  const count = Math.min(tgt.count == null ? 1 : tgt.count, candidates.length);
  return candidates.slice(0, count);
}

function selectRandomTargets(team, count) {
  const alive = team.filter(c => !c.isDead);
  const selected = [];
  for (let i = 0; i < Math.min(count, alive.length); i++) {
    const randomIndex = Math.floor(Math.random() * alive.length);
    selected.push(alive[randomIndex]);
    alive.splice(randomIndex, 1);
  }
  return selected;
}

function selectLowestHealthTargets(team, count) {
  const alive = team.filter(c => !c.isDead);
  alive.sort((a, b) => a.currentHealth - b.currentHealth);
  return alive.slice(0, Math.min(count, alive.length));
}

function selectHighestHealthTargets(team, count) {
  const alive = team.filter(c => !c.isDead);
  alive.sort((a, b) => b.currentHealth - a.currentHealth);
  return alive.slice(0, Math.min(count, alive.length));
}

function canTargetAcrossLane() {
  return true;
}

function getTargetDistance(casterSlot, targetSlot) {
  return getDistance(casterSlot, targetSlot);
}

function getPositionAdvantage() {
  return 0;
}

function getPositionName(slot) {
  return POSITION_NAMES[slot] || 'Unknown';
}

function getFlankName(slot) {
  return FLANK_NAMES[slot] || 'Unknown';
}

function formatPositionInfo(character) {
  return `${character.name} (${getFlankName(character.slotPosition)})`;
}

function visualizeTeamPositions(team) {
  const visual = [];
  for (let i = 0; i < 3; i++) {
    const char = getCharacterAtSlot(team, i);
    const label = POSITION_NAMES[i];
    if (!char) visual.push(`${label}: <empty>`);
    else {
      const status = char.isDead ? ' retreated' : '';
      const troops = `${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)}`;
      visual.push(`${label}: ${char.name} (${troops} Troop Capacity)${status}`);
    }
  }
  return visual.join('\n');
}

function visualizeBattle(teamA, teamB) {
  const lines = [];
  lines.push('TEAM A                          vs    TEAM B');
  for (let i = 0; i < 3; i++) {
    const charA = getCharacterAtSlot(teamA, i);
    const charB = getCharacterAtSlot(teamB, i);
    const label = POSITION_NAMES[i].padEnd(12);
    const nameA = charA ? charA.name.padEnd(15) : '<empty>'.padEnd(15);
    const nameB = charB ? charB.name.padEnd(15) : '<empty>'.padEnd(15);
    const hpA = charA ? `${Math.round(charA.currentHealth)}/${Math.round(charA.maxHealth)}`.padEnd(10) : '---'.padEnd(10);
    const hpB = charB ? `${Math.round(charB.currentHealth)}/${Math.round(charB.maxHealth)}`.padEnd(10) : '---'.padEnd(10);
    lines.push(`${label} ${nameA} ${hpA}  |  ${nameB} ${hpB}`);
  }
  return lines.join('\n');
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function validatePosition(slot) {
  return typeof slot === 'number' && slot >= 0 && slot <= 2;
}

function validateTeamPositions(team) {
  const slots = team.map(char => char.slotPosition);
  return slots.length === 3 && new Set(slots).size === 3 && team.every(char => validatePosition(char.slotPosition));
}

export {
  POSITIONS,
  POSITION_NAMES,
  FLANK_NAMES,
  getDistance,
  isInSameLane,
  isAdjacent,
  isWithinAdjacency,
  getAdjacentSlots,
  getCharacterAtSlot,
  getCharactersAtSameLane,
  getCharactersInAdjacentLanes,
  getCharactersInFlank,
  selectTargets,
  selectRandomTargets,
  selectLowestHealthTargets,
  selectHighestHealthTargets,
  canTargetAcrossLane,
  getTargetDistance,
  getPositionAdvantage,
  getPositionName,
  getFlankName,
  formatPositionInfo,
  visualizeTeamPositions,
  visualizeBattle,
  shuffleArray,
  validatePosition,
  validateTeamPositions,
  hasStatus,
  getDealerType
};
