import { applyInitiativeOrder } from './hook-initiative-order.js';
import { applyLinkedRetreated } from './hook-linked-retreated.js';
import { applyRetreatedPerTarget } from './hook-retreated-per-target.js';
import { applyTargetFilters } from './hook-targeting.js';
import { applyAfterBasicTarget } from './hook-after-basic-target.js';
import { applyLinkProcOrder } from './hook-link-proc.js';
import { applyRateFieldStackBonus } from './hook-ratefield-stacks.js';
import { applyIfBonusTarget } from './hook-ifbonus-target.js';
import { applyOnCleanseStack } from './hook-cleanse-positive.js';
import { applyExtraStatuses } from './hook-extra-statuses.js';
import { applySameLaneBasic } from './hook-basic-target.js';

export function applyEngineHooks(Battle) {
  if (Battle.prototype.__engineHooks) return;
  Battle.prototype.__engineHooks = true;
  applyExtraStatuses();
  applyInitiativeOrder(Battle);
  applyLinkedRetreated(Battle);
  applyRetreatedPerTarget(Battle);
  applyTargetFilters(Battle);
  applyAfterBasicTarget(Battle);
  applyRateFieldStackBonus(Battle);
  applyIfBonusTarget(Battle);
  applyOnCleanseStack(Battle);
  applyLinkProcOrder(Battle);
  applySameLaneBasic(Battle);
}
