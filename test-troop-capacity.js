// test-troop-capacity.js
import { calculateTroopCapacity } from './troopCapacity.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(calculateTroopCapacity(1, 1) === 100, 'L1 1* = 100');
assert(calculateTroopCapacity(16, 1) === 1600, 'L16 1* = 1600');
assert(calculateTroopCapacity(16, 2) === 1600, 'L16 2* = 1600');
assert(calculateTroopCapacity(50, 2) === 5000, 'L50 2* = 5000');
assert(calculateTroopCapacity(50, 10) === 9000, 'L50 10* = 9000');
assert(calculateTroopCapacity(16) === 1600, 'default stars treat as 1');

console.log('test-troop-capacity: ok');
