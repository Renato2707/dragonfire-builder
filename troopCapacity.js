// troopCapacity.js
// Calibrated to Wyrmtable roster (account Troop Capacity unset):
// L1 1★ = 100, L16 1★ = 1600, L16 2★ = 1600, L50 2★ = 5000, L50 10★ = 9000.
// Same for every dragon. Account research / Dragon's Army is not applied here.

const TROOPS_PER_LEVEL = 100;
const STAR_TROOP_START = 2;
const TROOPS_PER_STAR_ABOVE = 500;

function calculateTroopCapacity(level = 1, stars = 1) {
  const lv = Math.max(1, Number(level) || 1);
  const st = Math.max(1, Math.min(10, Number(stars) || 1));
  return lv * TROOPS_PER_LEVEL + Math.max(0, st - STAR_TROOP_START) * TROOPS_PER_STAR_ABOVE;
}

export {
  TROOPS_PER_LEVEL,
  STAR_TROOP_START,
  TROOPS_PER_STAR_ABOVE,
  calculateTroopCapacity
};
