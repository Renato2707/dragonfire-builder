// Recovery amount is computed in habitParser.executeHealAction (stat × 1.2 × (1+rate/100)).
export function applyHealFormula(Battle) {
  if (Battle.prototype.__healFormula) return;
  Battle.prototype.__healFormula = true;
}
