import { Character } from './character.js';
import { Battle } from './battle.js';
import { Habit } from './habitParser.js';

console.log('🧪 Veiled Ambush — oncePerCombat\n');

{
  const mk = (id, team, slot, stats, stars) => new Character({
    id, name: id, breed: 'Hunter', rarity: 'Rare',
    stats: stats || { str: 10, inst: 10, int: 80, init: 10 }
  }, team, slot, { stars: stars || 10 });
  const habit = new Habit({
    name: 'Veiled Ambush',
    unlockStar: 10,
    structured: [
      {
        phase: 'round_start',
        rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        actions: [{
          t: 'stack', id: 'mirage', stacks: 1, maxStacks: 10, chance: 100,
          mods: [{ stat: 'fire_dealt', pct: 2.5 }], dur: 'combat',
          tgt: { side: 'self' }
        }]
      },
      {
        phase: 'turn',
        rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        requires: { stacks: { id: 'mirage', min: 7 } },
        oncePerCombat: true,
        actions: [{
          t: 'dmg', dt: 'fire', pct: [150, 220, 290, 380, 500],
          tgt: { side: 'enemy', count: 1, select: 'highest:troops' }
        }]
      }
    ]
  }, 'tashix');

  const tashix = mk('tashix', 0, 1);
  const high = mk('high', 1, 0);
  const low = mk('low', 1, 1);
  high.maxHealth = 9000; high.currentHealth = 9000;
  low.maxHealth = 3000; low.currentHealth = 3000;
  tashix.setHabits([habit]);
  const btl = new Battle([tashix], [high, low], { verbose: false });

  for (let i = 0; i < 6; i += 1) btl.executeHabit(tashix, habit, 'round_start', 1);
  if (tashix.getStackCount('mirage') !== 6) throw new Error('six stacks should be 6 Mirage');
  btl.executeHabit(tashix, habit, 'turn', 1);
  if (high.currentHealth !== 9000) throw new Error('6 stacks must not fire Veiled Ambush');

  btl.executeHabit(tashix, habit, 'round_start', 1);
  if (tashix.getStackCount('mirage') !== 7) throw new Error('seventh stack required');

  const hp = high.currentHealth;
  btl.executeHabit(tashix, habit, 'turn', 1);
  if (high.currentHealth >= hp) throw new Error('7+ Mirage should Fire the highest-troops enemy once');
  if (low.currentHealth !== 3000) throw new Error('must target highest:troops, not the low-troop enemy');

  const afterFirst = high.currentHealth;
  btl.executeHabit(tashix, habit, 'turn', 1);
  if (high.currentHealth !== afterFirst) {
    throw new Error('oncePerCombat must block a second Veiled Ambush in the same combat');
  }

  tashix.advanceRetreatFlags();
  btl.currentRound = 2;
  btl.executeHabit(tashix, habit, 'turn', 2);
  if (high.currentHealth !== afterFirst) {
    throw new Error('oncePerCombat must persist across rounds (advanceRetreatFlags must not clear it)');
  }

  const locked = mk('t2', 0, 1, null, 8);
  locked.setHabits([habit]);
  if (locked.getHabitsForPhase(1, 'turn').length) {
    throw new Error('Veiled Ambush should stay locked below 10 stars');
  }

  console.log('✓ Veiled Ambush 7+ Mirage Fire oncePerCombat / highest:troops');
  console.log('✓ oncePerCombat persists across rounds');
  console.log('✓ locked below 10★\n');
}

console.log('✅ Veiled Ambush oncePerCombat OK\n');
