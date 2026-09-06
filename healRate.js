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

function rankValue(arr, rankIndex) {
  if (Array.isArray(arr)) return arr[rankIndex] ?? arr[0];
  return arr;
}

function commandRateOverride(character, rateField, rankIndex, round) {
  if (!rateField || round == null) return null;
  for (const kit of kitsOf(character)) {
    for (const block of kit.blocks || []) {
      if (!block.rounds || !block.rounds.includes(round)) continue;
      for (const action of block.actions || []) {
        if (action.t !== 'mod_command' || action.field !== rateField || action.pct == null) continue;
        return rankValue(action.pct, rankIndex);
      }
    }
  }
  return null;
}

export function healRateOf(character, skillName, round) {
  if (!character || !skillName) return null;
  const rankIndex = Math.max(0, Math.min(4, (character.habitRank || 1) - 1));
  for (const kit of kitsOf(character)) {
    if (kit.name !== skillName) continue;
    for (const block of kit.blocks || []) {
      for (const action of block.actions || []) {
        if (action.t !== 'heal' || action.pct == null) continue;
        const override = commandRateOverride(character, action.rateField, rankIndex, round);
        if (override != null) return override;
        return rankValue(action.pct, rankIndex);
      }
    }
  }
  if (NAMED_HEAL[skillName]) return NAMED_HEAL[skillName][rankIndex];
  return null;
}
