// Full Moon (and similar habits) set commandMods[rateField]. The 4+ stack
// double lives on the command dmg action as ifBonus — only apply it when the
// habit actually overrode the rate, so 1–5★ stays 75% not 150%.
export function applyRateFieldStackBonus(Battle) {
  if (Battle.prototype.__rateFieldStackBonusHook) return;
  Battle.prototype.__rateFieldStackBonusHook = true;
  const orig = Battle.prototype.runAction;
  Battle.prototype.runAction = function (character, habit, raw, round) {
    if (raw && raw.t === 'dmg' && raw.rateField && raw.ifBonus && raw.ifBonus.stacks) {
      const stored = character && character.commandMods && character.commandMods[raw.rateField];
      if (stored == null) {
        const rest = { ...raw };
        delete rest.ifBonus;
        return orig.call(this, character, habit, rest, round);
      }
    }
    return orig.apply(this, arguments);
  };
}
