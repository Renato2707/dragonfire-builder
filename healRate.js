export function kitsOf(character) {
  if (!character) return [];
  return [
    ...(character.parsedHabits || []),
    character.commandKit,
    character.vanguardKit
  ].filter(Boolean);
}

const NAMED_HEAL = {
  'Ebbing Fury': [25, 30, 35, 42.5, 50]
};

export function healRateOf(character, skillName) {
  if (!character || !skillName) return null;
  const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
  for (const kit of kitsOf(character)) {
    if (kit.name !== skillName) continue;
    for (const block of kit.blocks || []) {
      for (const action of block.actions || []) {
        if (action.t !== 'heal' || action.pct == null) continue;
        return Array.isArray(action.pct) ? action.pct[rankIndex] : action.pct;
      }
    }
  }
  if (NAMED_HEAL[skillName]) return NAMED_HEAL[skillName][rankIndex];
  return null;
}
