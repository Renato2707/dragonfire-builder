export function pendingRanksFor(teamId, slot) {
  const bag = (typeof globalThis !== 'undefined' && globalThis.__dfbPendingRanks) || {};
  return bag[`${teamId}:${slot}`] || {};
}
