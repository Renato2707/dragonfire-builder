export function livingByInitiative(sortByInitiative, characters) {
  return sortByInitiative((characters || []).filter(c => c && !c.isDead));
}

export function formatTurnOrder(order) {
  return `Turn order: ${order.map(c => c.name).join(' → ')}`;
}
