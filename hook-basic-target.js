function aliveFrom(pool, character) {
  return (pool || []).filter(c => c && !c.isDead && c !== character);
}

function tauntSource(character, alive) {
  const list = character.activeEffects || [];
  for (const effect of list) {
    const id = String(effect.id || effect.name || '').toLowerCase().replace(/-/g, '_');
    const active = typeof effect.isExpired === 'function' ? !effect.isExpired() : effect.duration > 0;
    if (!active || id !== 'taunt') continue;
    const by = effect.appliedBy;
    const forced = alive.find(c => c.name === by || c.id === by);
    if (forced) return forced;
  }
  return null;
}

export function applySameLaneBasic(Battle) {
  if (Battle.prototype.__sameLaneBasic) return;
  Battle.prototype.__sameLaneBasic = true;
  Battle.prototype.selectBasicAttackTarget = function (character) {
    const pools = typeof this.teamPools === 'function'
      ? this.teamPools(character)
      : { enemies: this.enemiesOf(character) };
    const alive = aliveFrom(pools.enemies, character);
    if (!alive.length) return null;
    if (!character.confusedThisActivation) {
      const taunt = tauntSource(character, alive);
      if (taunt) return taunt;
    }
    const same = alive.find(c => c.slotPosition === character.slotPosition);
    if (same) return same;
    const vanguard = alive.find(c => c.slotPosition === 1);
    return vanguard || alive[0];
  };
}
