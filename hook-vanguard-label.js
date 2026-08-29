import { VANGUARD_NAMES } from './vanguardNames.js';
import { POSITIONS } from './positionSystem.js';
import { PHASES } from './habitParser.js';
import { applyEngineHooks } from './hook-engine.js';

export function applyVanguardLabel(Battle) {
  if (!Battle.prototype.__vanguardLabelHook) {
    Battle.prototype.__vanguardLabelHook = true;
    Battle.prototype.executeVanguard = function (character) {
      if (character.slotPosition !== POSITIONS.VANGUARD) return;
      const kit = character.vanguardKit;
      if (!kit) return;
      const label = character.vanguardName
        || VANGUARD_NAMES[character.id]
        || kit.name
        || 'Vanguard';
      this.executeKit(character, kit, PHASES.COMBAT_START, 1, label);
    };
  }
  applyEngineHooks(Battle);
}
