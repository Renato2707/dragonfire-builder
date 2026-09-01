import { Character } from './character.js';

const HEAL_CAP_FRACTION = 0.12;

export function applyHealCap() {
  if (Character.prototype.__healCap) return;
  Character.prototype.__healCap = true;
  const orig = Character.prototype.heal;
  Character.prototype.heal = function (amount) {
    const maxGain = Math.max(1, Math.round((Number(this.maxHealth) || 0) * HEAL_CAP_FRACTION));
    return orig.call(this, Math.min(Math.max(0, Number(amount) || 0), maxGain));
  };
}
