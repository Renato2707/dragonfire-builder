import { Character, AFFINITY_STAT_PCT, WEAKNESS_STAT_PCT } from './character.js';
import { Battle } from './battle.js';

console.log('🧪 Troop Affinity\n');

function mk() {
  return new Character({
    id: 'antares',
    name: 'Antares',
    breed: 'Hunter',
    rarity: 'Rare',
    stats: { str: 50, inst: 50, int: 50, init: 50 },
    affinity: ['archers'],
    weaknesses: ['siege']
  }, 0, 1);
}

{
  const c = mk();
  if (c.getModifiedStat('str') !== 50) throw new Error('no troop → no affinity');
  if (c.getTroopAffinityPct() !== 0) throw new Error('affinity pct must be 0 without troop');
}

{
  const c = mk();
  c.setTroopType('Archers');
  if (c.getTroopAffinityPct() !== AFFINITY_STAT_PCT) throw new Error('archers should be +20');
  if (c.getModifiedStat('str') !== 60) throw new Error('affinity must scale core stats +20%');
  if (c.getModifiedStat('int') !== 60) throw new Error('affinity applies to all four core stats');
}

{
  const c = mk();
  c.setTroopType('siege');
  if (c.getTroopAffinityPct() !== WEAKNESS_STAT_PCT) throw new Error('siege should be -20');
  if (c.getModifiedStat('init') !== 40) throw new Error('weakness must scale core stats -20%');
}

{
  const c = mk();
  c.setTroopType('spearmen');
  if (c.getTroopAffinityPct() !== 0) throw new Error('neutral troop stays 0');
  if (c.getModifiedStat('str') !== 50) throw new Error('neutral troop must not change stats');
}

{
  const c = mk();
  c.addStatModifier('str', 10, 'combat');
  c.setTroopType('archers');
  if (c.getModifiedStat('str') !== 65) throw new Error('affinity stacks additively with habit % (50 * 1.30)');
}

{
  const a = mk();
  const b = new Character({
    id: 'dummy', name: 'Dummy', breed: 'Warrior', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 1, 1);
  const battle = new Battle([a], [b], { verbose: false, teamTroop: ['archers', null] });
  battle.initialize();
  if (a.troopType !== 'archers') throw new Error('Battle.teamTroop must stamp character.troopType');
  if (a.getModifiedStat('str') !== 60) throw new Error('teamTroop archers must apply +20 on initialize');
  const log = battle.getLog();
  if (!/Troop Affinity/.test(log)) throw new Error('combat start should log Troop Affinity');
}

console.log('✓ no troop / neutral = 0');
console.log('✓ affinity Archers +20% core stats');
console.log('✓ weakness Siege -20% core stats');
console.log('✓ additive with habit %');
console.log('✓ Battle.teamTroop stamps troop and logs\n');
console.log('✅ Troop Affinity OK\n');
