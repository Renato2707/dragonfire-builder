export function applyPanelTroopCap(Battle) {
  if (Battle.prototype.__panelTroopCap) return;
  Battle.prototype.__panelTroopCap = true;
  const orig = Battle.prototype.start;
  Battle.prototype.start = function () {
    if (typeof document !== 'undefined') {
      const sides = [
        ['teamA', this.teamA],
        ['teamB', this.teamB]
      ];
      for (const [prefix, team] of sides) {
        for (const character of team || []) {
          const el = document.getElementById(`${prefix}-cap-${character.slotPosition}`);
          const n = el ? Number(String(el.value).replace(/\D+/g, '')) : 0;
          if (n > 0) {
            character.maxHealth = n;
            character.currentHealth = n;
            character.isDead = false;
          }
        }
      }
    }
    return orig.apply(this, arguments);
  };
}
