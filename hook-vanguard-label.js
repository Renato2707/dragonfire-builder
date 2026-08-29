import { VANGUARD_NAMES } from './vanguardNames.js';
import { POSITIONS } from './positionSystem.js';
import { PHASES } from './habitParser.js';
import { applyLinkedRetreated } from './hook-linked-retreated.js';
import { applyRetreatedPerTarget } from './hook-retreated-per-target.js';
import { applyAfterBasicTarget } from './hook-after-basic-target.js';
import { applyLinkProcOrder } from './hook-link-proc.js';
import { applyRateFieldStackBonus } from './hook-ratefield-stacks.js';

export function applyVanguardLabel(Battle) {
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
  applyLinkedRetreated(Battle);
  applyRetreatedPerTarget(Battle);
  applyAfterBasicTarget(Battle);
  applyLinkProcOrder(Battle);
  applyRateFieldStackBonus(Battle);
}
