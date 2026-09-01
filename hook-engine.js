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
import { applyPrintDamageScale } from './hook-print-scale.js';
import { applyHealFormula } from './hook-heal-formula.js';
import { applyHealCap } from './hook-heal-cap.js';
import { applyHabitRanks } from './hook-habit-rank.js';

function applyPanelRanks(Battle) {
  if (Battle.prototype.__panelRanks) return;
  Battle.prototype.__panelRanks = true;
  const orig = Battle.prototype.start;
  Battle.prototype.start = function () {
    const bag = (typeof globalThis !== 'undefined' && globalThis.__dfbPendingRanks) || {};
    this.teamA.forEach(c => Object.assign(c.habitRanks || (c.habitRanks = {}), bag[`0:${c.slotPosition}`] || {}));
    this.teamB.forEach(c => Object.assign(c.habitRanks || (c.habitRanks = {}), bag[`1:${c.slotPosition}`] || {}));
    return orig.apply(this, arguments);
  };
}

export function applyEngineHooks(Battle) {
  if (Battle.prototype.__engineHooks) return;
  Battle.prototype.__engineHooks = true;
  applyExtraStatuses();
  applyHealCap();
  applyHabitRanks(Battle);
  applyPanelRanks(Battle);
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
  applyPrintDamageScale(Battle);
  applyHealFormula(Battle);
  if (typeof document !== 'undefined') {
    import('./habit-panel.js').catch(() => {});
  }
}
