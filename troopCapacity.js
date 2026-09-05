// troopCapacity.js
// Combat-report formula (Wyrmtable, account Troop Capacity unset):
// L1 1★ = 100, L16 1★ = 1600, L16 2★ = 1600, L50 2★ = 5000, L50 10★ = 9000.
// Same for every dragon.
// Screenshots can show a larger pool (e.g. L50 1★ 8175 vs 5000) from account
// research / Dragon's Army. That bonus is not knowable from the opponent's
// card, so it is NOT applied here. Battle logs use this formula (6000/5000/…).

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
