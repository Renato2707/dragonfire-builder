// positionSystem.js

const POSITIONS = { LEFT: 0, VANGUARD: 1, CENTER: 1, RIGHT: 2 };
const POSITION_NAMES = { 0: 'Left Flank', 1: 'Vanguard', 2: 'Right Flank' };
const FLANK_NAMES = { 0: 'Left Flank', 1: 'Vanguard', 2: 'Right Flank' };

function getDistance(slot1, slot2) {
  return Math.abs(slot1 - slot2);
}

function isInSameLane(slot1, slot2) {
  return slot1 === slot2;
}

function isAdjacent(slot1, slot2) {
  return getDistance(slot1, slot2) === 1;
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

function selectTargets(caster, friendlyTeam, enemyTeam, targetingParsed) {
  if (!targetingParsed) return [];

  const tgt = targetingParsed;
  const casterSlot = caster.slotPosition;

  let targetTeam;
  if (tgt.side === 'self') {
    targetTeam = [caster];
  } else if (tgt.side === 'ally') {
    targetTeam = tgt.excludeSelf === false
      ? [...friendlyTeam]
      : friendlyTeam.filter(c => c !== caster);
  } else if (tgt.side === 'enemy') {
    targetTeam = [...enemyTeam];
  } else {
    targetTeam = [];
  }

  let candidates = targetTeam.filter(c => c && !c.isDead);
  if (candidates.length === 0) return [];

  const select = tgt.select || 'any';
  const position = tgt.position || (select === 'adjacency' ? 'adjacent' : null);

  if (tgt.slot != null) {
    candidates = candidates.filter(c => c.slotPosition === tgt.slot);
  } else if (position === 'same_lane' || select === 'same_lane') {
    candidates = candidates.filter(c => c.slotPosition === casterSlot);
  } else if (position === 'adjacent' || select === 'adjacency') {
    const adjacentSlots = getAdjacentSlots(casterSlot);
    candidates = candidates.filter(c => adjacentSlots.includes(c.slotPosition));
  } else if (position === 'left' || position === 'left_flank' || select === 'prefer_lane:L') {
    candidates.sort((a, b) => {
      const sa = a.slotPosition === POSITIONS.LEFT ? 0 : 1;
      const sb = b.slotPosition === POSITIONS.LEFT ? 0 : 1;
      return sa - sb;
    });
  } else if (position === 'right' || position === 'right_flank' || select === 'prefer_lane:R') {
    candidates.sort((a, b) => {
      const sa = a.slotPosition === POSITIONS.RIGHT ? 0 : 1;
      const sb = b.slotPosition === POSITIONS.RIGHT ? 0 : 1;
      return sa - sb;
    });
  } else if (position === 'vanguard' || select === 'prefer_lane:V') {
    candidates.sort((a, b) => {
      const sa = a.slotPosition === POSITIONS.VANGUARD ? 0 : 1;
      const sb = b.slotPosition === POSITIONS.VANGUARD ? 0 : 1;
      return sa - sb;
    });
  }

  if (tgt.filter) {
    if (tgt.filter.status) {
      candidates = candidates.filter(c => hasStatus(c, tgt.filter.status));
    }
    if (tgt.filter.troopsAbove != null) {
      candidates = candidates.filter(c => c.getHealthPercentage() > tgt.filter.troopsAbove);
    }
    if (tgt.filter.troopsBelow != null) {
      candidates = candidates.filter(c => c.getHealthPercentage() < tgt.filter.troopsBelow);
    }
  }

  if (select === 'lowest_troops') {
    candidates.sort((a, b) => a.currentHealth - b.currentHealth);
  } else if (select === 'highest_troops') {
    candidates.sort((a, b) => b.currentHealth - a.currentHealth);
  } else if (select === 'highest_str') {
    candidates.sort((a, b) => getStat(b, 'str') - getStat(a, 'str'));
  } else if (select === 'highest_int') {
    candidates.sort((a, b) => getStat(b, 'int') - getStat(a, 'int'));
  } else if (select === 'highest_inst') {
    candidates.sort((a, b) => getStat(b, 'inst') - getStat(a, 'inst'));
  } else if (select === 'highest_init') {
    candidates.sort((a, b) => getStat(b, 'init') - getStat(a, 'init'));
  } else if (select === 'dealer:tactical' || select === 'prefer_dealer:tactical') {
    candidates.sort((a, b) => (getDealerType(a) === 'tactical' ? 0 : 1) - (getDealerType(b) === 'tactical' ? 0 : 1));
  } else if (select === 'prefer_dealer:fire' || select === 'dealer:fire') {
    candidates.sort((a, b) => (getDealerType(a) === 'fire' ? 0 : 1) - (getDealerType(b) === 'fire' ? 0 : 1));
  } else if (select === 'prefer_dealer:physical' || select === 'dealer:physical') {
    candidates.sort((a, b) => (getDealerType(a) === 'physical' ? 0 : 1) - (getDealerType(b) === 'physical' ? 0 : 1));
  } else if (select === 'prefer_without:stun') {
    candidates.sort((a, b) => (hasStatus(a, 'stun') ? 1 : 0) - (hasStatus(b, 'stun') ? 0 : 1));
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
      const status = char.isDead ? ' down' : '';
      const hp = `${Math.round(char.currentHealth)}/${Math.round(char.maxHealth)}`;
      visual.push(`${label}: ${char.name} (HP: ${hp})${status}`);
    }
  }
  return visual.join('\n');
}

function visualizeBattle(teamA, teamB) {
  const lines = [];
  lines.push('TIME A                          vs    TIME B');
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
