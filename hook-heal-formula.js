// Recovery: Level × 1.2 × (rate/100) × livingTroops/2400 × Recovery Dealt/Received.
// Official: "The amount of Recovery scales with your Level." Enhanced stats still scale the rate.
export function applyHealFormula(Battle) {
  if (Battle.prototype.__healFormula) return;
  Battle.prototype.__healFormula = true;
}
