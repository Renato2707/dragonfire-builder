import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Character } from './character.js';
import { Battle } from './battle.js';
import { loadDragonHabitsSync, loadCommandSync, ifBonusApplies, executeModAction, executeHabitAction, resolveChance, Habit } from './habitParser.js';
import { applyEffect, hasEffect, cleanseCharacter, getEffect, isImmuneTo, processHealingEffects } from './effects.js';
import { selectTargets } from './positionSystem.js';
import { applyChanceIf, statusConditionMet, sortByInitiative } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧪 TESTE DE INTEGRAÇÃO - SIMULADOR NÍVEL 5');
console.log('═══════════════════════════════════════════════════════\n');

function mockFx(ids) {
  return { activeEffects: ids.map(id => ({ id, duration: 2, isExpired: () => false })) };
}

{
  const bleed = mockFx(['bleed']);
  const clean = mockFx([]);
  if (applyChanceIf(25, { bleed: 2 }, bleed) !== 50) throw new Error('chanceIf bleed ×2 failed');
  if (applyChanceIf(25, { bleed: 2 }, clean) !== 25) throw new Error('chanceIf bleed miss failed');
  if (applyChanceIf(25, { burn: 2 }, mockFx(['burn'])) !== 50) throw new Error('chanceIf burn ×2 failed');
  if (applyChanceIf(25, { taunt: 2 }, mockFx(['taunt'])) !== 50) throw new Error('chanceIf taunt ×2 failed');
  if (!statusConditionMet(mockFx(['stun']), 'control')) throw new Error('control stun failed');
  if (!statusConditionMet(mockFx(['confusion']), 'control')) throw new Error('control confusion failed');
  if (statusConditionMet(mockFx(['burn']), 'control')) throw new Error('burn is not control');
  const attacker = mockFx(['first_strike']);
  const targetPanic = mockFx(['panic']);
  if (!ifBonusApplies({ status: 'first_strike', pct: 150 }, attacker, clean)) throw new Error('ifBonus first_strike on attacker failed');
  if (!ifBonusApplies({ status: 'panic', pct: 150 }, clean, targetPanic)) throw new Error('ifBonus panic on target failed');
  if (!ifBonusApplies({ status: 'control', pct: 30 }, clean, mockFx(['stagger']))) throw new Error('ifBonus control failed');
  if (ifBonusApplies({ status: 'panic', pct: 150 }, clean, clean)) throw new Error('ifBonus panic miss should be false');
  if (!ifBonusApplies({ defending: true, mult: 2 }, clean, clean, { defending: true })) throw new Error('ifBonus defending should apply');
  if (ifBonusApplies({ defending: true, mult: 2 }, clean, clean, { defending: false })) throw new Error('ifBonus defending miss should be false');
  const moon = {
    getStackCount: id => (id === 'rising_tide' ? 6 : 0)
  };
  if (applyChanceIf(25, { stacks: { id: 'rising_tide', min: 6 }, mult: 2 }, clean, { attacker: moon }) !== 50) {
    throw new Error('chanceIf.stacks ×2 at Rising Tide 6+ failed');
  }
  if (applyChanceIf(25, { stacks: { id: 'rising_tide', min: 6 }, mult: 2 }, clean, { attacker: { getStackCount: () => 3 } }) !== 25) {
    throw new Error('chanceIf.stacks below min should stay 25');
  }
  if (applyChanceIf(25, { allyStatus: 'advantage', mult: 2 }, clean, { allies: [mockFx(['advantage'])] }) !== 50) {
    throw new Error('chanceIf.allyStatus Advantage ×2 failed');
  }
  if (applyChanceIf(25, { allyStatus: 'advantage', mult: 2 }, clean, { allies: [clean] }) !== 25) {
    throw new Error('chanceIf.allyStatus without Advantage should stay 25');
  }
  if (applyChanceIf(25, { allyStatus: 'advantage', mult: 2 }, clean, { allies: [{ ...mockFx(['advantage']), isDead: true }] }) !== 25) {
    throw new Error('retreated ally Advantage must not double Rising Tide chance');
  }
  console.log('✓ chanceIf / ifBonus / control\n');
}

{
  const dragon = (id, stats) => ({
    id, name: id, breed: 'Hunter', rarity: 'Rare',
    stats: stats || { str: 10, inst: 10, int: 80, init: 10 }
  });
  const caster = new Character(dragon('caster'), 0, 0);
  const physical = new Character(dragon('physical', { str: 90, inst: 10, int: 10, init: 10 }), 1, 0);
  const fireEnemy = new Character(dragon('fireE'), 1, 1);
  caster.currentHealth = 40;
  caster.maxHealth = 100;
  const btl = new Battle([caster], [physical, fireEnemy], { verbose: false });
  if (!btl.blockAllowed(caster, { requires: { troopsBelow: 75 } })) throw new Error('troopsBelow 75 should pass at 40%');
  if (btl.blockAllowed(caster, { requires: { troopsBelow: 30 } })) throw new Error('troopsBelow 30 should fail at 40%');
  if (!btl.blockAllowed(caster, { requires: { selfHpAtLeast: 40 } })) throw new Error('selfHpAtLeast 40 should pass');
  if (!btl.blockAllowed(caster, { requires: { noPrey: true } })) throw new Error('noPrey should pass');
  if (btl.blockAllowed(caster, { requires: { hasPrey: true } })) throw new Error('hasPrey should fail');
  physical.activeEffects.push({ id: 'prey', duration: 2, isExpired: () => false });
  caster.links.prey = physical;
  if (btl.blockAllowed(caster, { requires: { noPrey: true } })) throw new Error('noPrey should fail with prey');
  if (!btl.blockAllowed(caster, { requires: { hasPrey: true } })) throw new Error('hasPrey should pass');
  if (!btl.blockAllowed(caster, { requires: { preyHpAbove: 10 } })) throw new Error('preyHpAbove should pass');
  if (!btl.blockAllowed(caster, { requires: { anyEnemyDealerFire: true } })) throw new Error('anyEnemyDealerFire should pass');
  const noFire = new Battle([caster], [physical], { verbose: false });
  if (noFire.blockAllowed(caster, { requires: { anyEnemyDealerFire: true } })) throw new Error('anyEnemyDealerFire should fail vs physical only');
  caster.stacks.mirage = 4;
  if (!btl.blockAllowed(caster, { requires: { stacks: { id: 'mirage', min: 4 } } })) throw new Error('stacks min 4 should pass');
  if (btl.blockAllowed(caster, { requires: { stacks: { id: 'mirage', min: 7 } } })) throw new Error('stacks min 7 should fail');
  if (btl.blockAllowed(caster, { requires: { pve: true } })) throw new Error('pve true should fail in default PvP');
  const archers = new Battle([caster], [physical], { verbose: false, teamTroop: ['archers', null] });
  if (!archers.blockAllowed(caster, { requires: { troop: 'archers' } })) throw new Error('leading Archers should pass');
  if (archers.blockAllowed(caster, { requires: { troop: 'shieldbearers' } })) throw new Error('Shieldbearers should fail when leading Archers');
  const shields = new Battle([caster], [physical], { verbose: false, teamTroop: ['Shield-Bearers', null] });
  if (!shields.blockAllowed(caster, { requires: { troop: 'shieldbearers' } })) throw new Error('troop name should normalize');
  caster.currentHealth = 10;
  physical.currentHealth = 50;
  fireEnemy.currentHealth = 50;
  if (!btl.blockAllowed(caster, { requires: { leastTroops: true } })) throw new Error('leastTroops should pass at 10 vs 50');
  caster.currentHealth = 80;
  if (btl.blockAllowed(caster, { requires: { leastTroops: true } })) throw new Error('leastTroops should fail when others have fewer troops');
  console.log('✓ requires troopsBelow / prey / dealerFire / stacks / pve / troop / leastTroops\n');
}

{
  const dummy = { id: 'x', name: 'X', breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 } };
  const victim = new Character(dummy, 1, 0);
  applyEffect(victim, 'ADVANTAGE', 1, 'A');
  applyEffect(victim, 'RESISTANCE', 1, 'A');
  applyEffect(victim, 'BURN', 1, 'A');
  applyEffect(victim, 'WEAKENED', 1, 'A');
  applyEffect(victim, 'STUN', 1, 'A');
  const pos = cleanseCharacter(victim, { t: 'status', st: 'cleanse', remove: 'positive', count: 1 });
  if (!pos.length || hasEffect(victim, pos[0])) throw new Error('positive cleanse failed');
  if (!hasEffect(victim, 'burn')) throw new Error('burn should remain after positive cleanse');
  const typed = cleanseCharacter(victim, { t: 'cleanse', types: ['bleed', 'panic', 'burn'], count: 1 });
  if (!typed.includes('burn') || hasEffect(victim, 'burn')) throw new Error('typed burn cleanse failed');
  const mixed = cleanseCharacter(victim, { t: 'cleanse', negative: 2, control: 1 });
  if (!mixed.includes('weakened')) throw new Error('negative cleanse missed weakened');
  if (!mixed.includes('stun')) throw new Error('control cleanse missed stun');
  console.log('✓ cleanse positive / types / negative+control\n');
}

{
  const dummy = (id) => ({ id, name: id, breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 } });
  const hunter = new Character(dummy('hunter'), 0, 0);
  const prey = new Character(dummy('prey'), 1, 0);
  applyEffect(prey, 'PREY', 1, hunter.name, { magnitude: 30, duration: 3 });
  hunter.links.prey = prey;
  const fx = prey.activeEffects.find(e => e.id === 'prey');
  if (!fx || fx.recoveryPenalty !== 30) throw new Error('prey recoveryPenalty from val failed');
  const before = prey.getRecoveryReceivedMultiplier();
  if (Math.abs(before - 0.7) > 0.001) throw new Error(`prey recovery received should be 0.7, got ${before}`);
  prey.currentHealth = Math.max(1, Math.floor(prey.maxHealth * 0.4));
  prey.heal(10);
  if (!prey.receivedRecoveryThisRound) throw new Error('heal should flag receivedRecoveryThisRound');
  prey.advanceRetreatFlags();
  if (!prey.receivedRecoveryLastRound) throw new Error('flag should move to last round');
  const btl = new Battle([hunter], [prey], { verbose: false });
  if (btl.getPrey(hunter) !== prey) throw new Error('getPrey should return linked prey');
  const extras = { prey };
  if (!ifBonusApplies({ preyRecoveredLastRound: true, mult: 3 }, hunter, prey, extras)) {
    throw new Error('ifBonus preyRecoveredLastRound should apply');
  }
  const doubled = applyChanceIf(25, { preyRecoveredLastRound: true, mult: 2 }, prey, extras);
  if (doubled !== 50) throw new Error(`chanceIf prey recovered expected 50 got ${doubled}`);
  console.log('✓ prey link / recovery penalty / recovered-last-round\n');
}

{
  const d = (id, breed, slot, team) => new Character({
    id, name: id, breed, rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const caster = d('caster', 'Champion', 1, 0);
  const hunter = d('hunter', 'Hunter', 0, 1);
  const warrior = d('warrior', 'Warrior', 1, 1);
  const sentinel = d('sentinel', 'Sentinel', 2, 1);
  const allies = [caster];
  const enemies = [hunter, warrior, sentinel];
  caster.lastBasicTarget = hunter;
  const splash = selectTargets(caster, allies, enemies, {
    side: 'enemy', count: 3, select: 'adjacency', excludeLastBasic: true
  });
  if (splash.some(c => c === hunter)) throw new Error('excludeLastBasic dropped hunter failed');
  if (!splash.includes(warrior) || !splash.includes(sentinel)) throw new Error('excludeLastBasic should keep adjacent others');
  const prefer = selectTargets(caster, allies, enemies, {
    side: 'enemy', count: 1, select: 'prefer_class:hunter'
  });
  if (prefer[0] !== hunter) throw new Error('prefer_class:hunter should pick Hunter');
  const exact = selectTargets(caster, allies, enemies, {
    side: 'enemy', count: 2, select: 'class:sentinel'
  });
  if (exact.length !== 1 || exact[0] !== sentinel) throw new Error('class:sentinel should hard-filter');
  const weak = d('weak', 'Sentinel', 0, 0);
  const mid = d('mid', 'Warrior', 2, 0);
  caster.currentHealth = 80;
  weak.currentHealth = 20;
  mid.currentHealth = 50;
  hunter.currentHealth = 15;
  warrior.currentHealth = 90;
  sentinel.currentHealth = 40;
  const lowestAlly = selectTargets(caster, [weak, caster, mid], enemies, {
    side: 'ally', count: 1, select: 'lowest:troops'
  });
  if (lowestAlly[0] !== weak) throw new Error('lowest:troops should pick the ally with 20 troops');
  const highestAlly = selectTargets(caster, [weak, caster, mid], enemies, {
    side: 'ally', count: 1, select: 'highest:troops'
  });
  if (highestAlly[0] !== caster) throw new Error('highest:troops should pick the ally with 80 troops');
  const lowestEnemy = selectTargets(caster, [weak, caster, mid], enemies, {
    side: 'enemy', count: 1, select: 'lowest:troops'
  });
  if (lowestEnemy[0] !== hunter) throw new Error('lowest:troops enemy should be hunter at 15');
  weak.isDead = true;
  const afterDeath = selectTargets(caster, [weak, caster, mid], enemies, {
    side: 'ally', count: 1, select: 'lowest:troops'
  });
  if (afterDeath[0] !== mid) throw new Error('lowest:troops must skip retreated allies');
  caster.currentHealth = 50;
  mid.currentHealth = 50;
  const tie = selectTargets(caster, [caster, mid], enemies, {
    side: 'ally', count: 1, select: 'lowest:troops'
  });
  if (tie[0] !== caster) throw new Error('troop ties break toward lower slot');
  console.log('✓ lastBasicTarget exclude + breed/class targeting');
  console.log('✓ lowest:troops / highest:troops remaining troop count\n');
}

{
  const d = (id, slot) => new Character({
    id, name: id, breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 1, slot);
  const caster = new Character({
    id: 'crimson', name: 'Crimson', breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 1);
  const stunned = d('stunned', 0);
  const clean = d('clean', 1);
  const alsoStunned = d('also', 2);
  applyEffect(stunned, 'STUN', 1, 'x', { duration: 2 });
  applyEffect(alsoStunned, 'STUN', 1, 'x', { duration: 2 });
  const pick = selectTargets(caster, [caster], [stunned, clean, alsoStunned], {
    side: 'enemy', count: 1, select: 'prefer_without:stun'
  });
  if (pick[0] !== clean) throw new Error('prefer_without:stun should pick the non-stunned enemy');
  applyEffect(clean, 'STUN', 1, 'x', { duration: 2 });
  const fallback = selectTargets(caster, [caster], [stunned, clean, alsoStunned], {
    side: 'enemy', count: 1, select: 'prefer_without:stun'
  });
  if (!fallback.length) throw new Error('prefer_without:stun must still pick if all are stunned');
  const resist = d('resist', 0);
  const open = d('open', 1);
  applyEffect(resist, 'RESISTANCE', 1, 'x', { duration: 2, magnitude: 15 });
  const gift = selectTargets(caster, [resist, open], [], {
    side: 'ally', count: 1, select: 'prefer_without:resistance'
  });
  if (gift[0] !== open) throw new Error('prefer_without:resistance should pick ally without Resistance');
  console.log('✓ prefer_without:stun / prefer_without:resistance\n');
}

{
  const mk = (id, team, slot, stats) => new Character({
    id, name: id, breed: 'Hunter', rarity: 'Rare',
    stats: stats || { str: 10, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const tairax = mk('tairax', 0, 1);
  const ally = mk('ally', 0, 0);
  const burnedA = mk('burnA', 1, 0);
  const burnedB = mk('burnB', 1, 1);
  const clean = mk('clean', 1, 2);
  applyEffect(burnedA, 'BURN', 1, 't', { duration: 2, damageRate: 20 });
  applyEffect(burnedB, 'BURN', 1, 't', { duration: 2, damageRate: 20 });
  const btl = new Battle([tairax, ally], [burnedA, burnedB, clean], { verbose: false });
  const burns = btl.matchingPerTarget(tairax, { side: 'enemy', status: 'burn' });
  if (burns.length !== 2) throw new Error(`repeatPer burn should count 2, got ${burns.length}`);
  const habit = new Habit({
    name: 'Gift of Fire',
    structured: [{
      phase: 'round_start',
      rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      repeatPer: { side: 'enemy', status: 'burn' },
      actions: [{
        t: 'status',
        st: 'resistance',
        val: 15,
        dur: 2,
        chance: 100,
        tgt: { side: 'ally', count: 1, select: 'prefer_without:resistance' }
      }]
    }]
  }, 'tairax');
  btl.executeHabit(tairax, habit, 'round_start', 1);
  const resisted = [tairax, ally].filter(c => hasEffect(c, 'resistance'));
  if (resisted.length !== 2) throw new Error(`2 Burns should grant 2 Resistance, got ${resisted.length}`);
  const none = new Battle([mk('t2', 0, 1)], [mk('e', 1, 1)], { verbose: false });
  if (none.matchingPerTarget(none.teamA[0], { side: 'enemy', status: 'burn' }).length !== 0) {
    throw new Error('no Burns should match 0');
  }
  const fire = mk('fire', 1, 0, { str: 10, inst: 10, int: 80, init: 10 });
  const phys = mk('phys', 1, 1, { str: 80, inst: 10, int: 10, init: 10 });
  const rally = new Battle([mk('vermax', 0, 1)], [fire, phys], { verbose: false });
  const dealers = rally.matchingPerTarget(rally.teamA[0], { side: 'enemy', dealer: 'fire' });
  if (dealers.length !== 1 || dealers[0] !== fire) throw new Error('repeatPer dealer:fire should count one');
  console.log('✓ repeatPer Gift of Fire / Rallying Flame\n');
}

{
  const mk = (id, team, slot, stats) => new Character({
    id, name: id, breed: 'Sentinel', rarity: 'Rare',
    stats: stats || { str: 10, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const sun = mk('sunfyre', 0, 1);
  const ally = mk('ally', 0, 0);
  const fire = mk('fire', 1, 1, { str: 10, inst: 10, int: 80, init: 10 });
  ally.maxHealth = 5000;
  ally.currentHealth = 5000;
  fire.maxHealth = 5000;
  fire.currentHealth = 5000;
  const habit = new Habit({
    name: "The King's Ire",
    unlockStar: 2,
    structured: [{
      phase: 'on_ally_fire_damage',
      rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      oncePerRound: true,
      actions: [
        { t: 'dmg', dt: 'tactical', pct: 50, tgt: { side: 'enemy', count: 1, select: 'dealer:fire' } },
        { t: 'mod', mods: [{ stat: 'int', pct: -15 }], dur: 2, tgt: { side: 'enemy', count: 1, select: 'last_dmg' } }
      ]
    }]
  }, 'sunfyre');
  sun.setHabits([habit]);
  const btl = new Battle([sun, ally], [fire], { verbose: false });
  btl.currentRound = 1;
  btl.notifyDamage(ally, { type: 'fire', basic: false });
  const firstInt = fire.getPercentTotal('int');
  if (firstInt !== -15) throw new Error(`King's Ire should reduce Int on first Fire, got ${firstInt}`);
  const activations = btl.battleLog.filter(line => /activates The King's Ire/.test(line)).length;
  if (activations !== 1) throw new Error(`expected 1 activation, got ${activations}`);
  btl.notifyDamage(ally, { type: 'fire', basic: false });
  if (btl.battleLog.filter(line => /activates The King's Ire/.test(line)).length !== 1) {
    throw new Error("King's Ire must not activate on the second Fire hit");
  }
  if (fire.getPercentTotal('int') !== -15) throw new Error('second Fire must not stack another Int reduction');
  sun.advanceRetreatFlags();
  btl.currentRound = 2;
  btl.notifyDamage(ally, { type: 'fire', basic: false });
  if (btl.battleLog.filter(line => /activates The King's Ire/.test(line)).length !== 2) {
    throw new Error("King's Ire should refresh next round");
  }
  console.log('✓ oncePerRound The King\'s Ire\n');
}

{
  const mk = (id, team, slot) => new Character({
    id, name: id, breed: 'Sentinel', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const glory = new Habit({
    name: 'Adaptive Glory',
    unlockStar: 2,
    structured: [
      { phase: 'on_self_first_damage', rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], oncePerRound: true, requires: { damageType: 'fire' }, actions: [{ t: 'heal', pct: 30, tgt: { side: 'self' } }] },
      { phase: 'on_self_first_damage', rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], oncePerRound: true, requires: { damageType: 'tactical' }, actions: [{ t: 'mod', mods: [{ stat: 'dmg_dealt', pct: 12 }], dur: 1, tgt: { side: 'ally', count: 1, select: 'highest:troops' } }] },
      { phase: 'on_self_first_damage', rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], oncePerRound: true, requires: { damageType: 'physical', excludeBasic: true }, actions: [{ t: 'mod', mods: [{ stat: 'dmg_dealt', pct: -12 }], dur: 1, tgt: { side: 'enemy', count: 1, select: 'highest:troops' } }] },
      { phase: 'on_self_first_damage', rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], oncePerRound: true, requires: { damageType: 'basic' }, actions: [{ t: 'mod', mods: [{ stat: 'inst', pct: 12 }, { stat: 'init', pct: 6 }], dur: 1, tgt: { side: 'self' } }] }
    ]
  }, 'sunfyre');
  const run = (info) => {
    const sun = mk('sunfyre', 0, 1);
    const mate = mk('mate', 0, 0);
    const foe = mk('foe', 1, 1);
    sun.maxHealth = 200;
    sun.currentHealth = 100;
    sun.setHabits([glory]);
    const btl = new Battle([sun, mate], [foe], { verbose: false });
    btl.currentRound = 1;
    btl.notifyDamage(sun, info);
    return { sun, mate, foe, btl };
  };
  const fireHit = run({ type: 'fire', basic: false });
  if (fireHit.sun.currentHealth <= 100) throw new Error('Fire first hit should Recover');
  if (fireHit.sun.getPercentTotal('inst') !== 0) throw new Error('Fire must not take the Basic Attack branch');
  const tac = run({ type: 'tactical', basic: false });
  const tacBuff = [tac.sun, tac.mate].some(c => c.getPercentTotal('dmg_dealt') === 12);
  if (!tacBuff) throw new Error('Tactical first hit should buff ally Damage Dealt');
  if (tac.foe.getPercentTotal('dmg_dealt') !== 0) throw new Error('Tactical must not take Physical branch');
  const phys = run({ type: 'physical', basic: false });
  if (phys.foe.getPercentTotal('dmg_dealt') !== -12) throw new Error('Physical (non-basic) should debuff the enemy');
  if (phys.sun.getPercentTotal('inst') !== 0) throw new Error('Physical skill must not take Basic Attack branch');
  const basicPhys = run({ type: 'physical', basic: true });
  if (basicPhys.sun.getPercentTotal('inst') !== 12 || basicPhys.sun.getPercentTotal('init') !== 6) {
    throw new Error('Basic Attack should buff Instinct and Initiative');
  }
  if (basicPhys.foe.getPercentTotal('dmg_dealt') !== 0) throw new Error('Physical Basic Attack must not take Physical skill branch');
  const fireBasic = run({ type: 'fire', basic: true });
  if (fireBasic.sun.getPercentTotal('inst') !== 12) throw new Error('Fire Basic Attack is still a Basic Attack');
  if (fireBasic.sun.currentHealth !== 100) throw new Error('Fire Basic Attack must not take Fire Recovery branch');
  console.log('✓ requires.damageType Adaptive Glory branches\n');
}

{
  const mk = (id, team, slot, breed) => new Character({
    id, name: id, breed: breed || 'Warrior', rarity: 'Rare',
    stats: { str: 10, inst: 80, int: 10, init: 10 }
  }, team, slot);
  const moon = mk('moondancer', 0, 1, 'Warrior');
  const sentinel = mk('syrax', 0, 0, 'Sentinel');
  const warrior = mk('vhagar', 0, 2, 'Warrior');
  const foe = mk('foe', 1, 1, 'Hunter');
  foe.maxHealth = 5000;
  foe.currentHealth = 5000;
  const grant = selectTargets(moon, [moon, sentinel, warrior], [foe], {
    side: 'ally', count: 1, select: 'class:sentinel', excludeSelf: true
  });
  if (grant[0] !== sentinel) throw new Error('Crescent Blade must target an Ally Sentinel');
  const proc = new Habit({
    name: 'Crescent Blade',
    structured: [{
      phase: 'on_link_proc',
      rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      oncePerRound: true,
      onceWhen: 'success',
      chance: 100,
      requires: { linkAs: 'crescent_blade_ally', linkEvent: 'tactical_or_recovery' },
      actions: [{
        t: 'stack',
        id: 'rising_tide',
        stacks: 1,
        maxStacks: 8,
        mods: [{ stat: 'dmg_received', pct: -2 }],
        dur: 'combat',
        tgt: { side: 'self' }
      }]
    }]
  }, 'moondancer');
  moon.commandKit = proc;
  moon.commandName = 'Crescent Blade';
  moon.links.crescent_blade_ally = sentinel;
  const btl = new Battle([moon, sentinel, warrior], [foe], { verbose: false });
  btl.currentRound = 1;
  btl.notifyLinkProc(sentinel, 'tactical');
  if (moon.getStackCount('rising_tide') !== 1) throw new Error('Tactical from linked Sentinel should grant Rising Tide');
  if (moon.getPercentTotal('dmg_received') !== -2) throw new Error('each Rising Tide stack is -2% Damage Received');
  btl.notifyLinkProc(sentinel, 'tactical');
  if (moon.getStackCount('rising_tide') !== 1) throw new Error('Rising Tide from Crescent Blade is once per round');
  btl.notifyLinkProc(sentinel, 'recovery');
  if (moon.getStackCount('rising_tide') !== 1) throw new Error('recovery after a success same round must not stack');
  moon.advanceRetreatFlags();
  btl.currentRound = 2;
  btl.notifyLinkProc(sentinel, 'recovery');
  if (moon.getStackCount('rising_tide') !== 2) throw new Error('next round Recovery should grant another stack');
  btl.notifyLinkProc(warrior, 'tactical');
  if (moon.getStackCount('rising_tide') !== 2) throw new Error('unlinked ally must not proc Crescent Blade');
  const phys = mk('moon2', 0, 1, 'Warrior');
  phys.commandKit = proc;
  phys.commandName = 'Crescent Blade';
  phys.links.crescent_blade_ally = sentinel;
  const btl2 = new Battle([phys, sentinel], [foe], { verbose: false });
  btl2.currentRound = 1;
  btl2.dealDamage(foe, 10, { type: 'physical', basic: false, source: sentinel });
  if (phys.getStackCount('rising_tide') !== 0) throw new Error('Physical damage must not proc Crescent Blade');
  console.log('✓ Crescent Blade Rising Tide once per round\n');
}

{
  const moon = new Character({
    id: 'moondancer', name: 'Moondancer', breed: 'Warrior', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 1);
  const sentinel = new Character({
    id: 'syrax', name: 'Syrax', breed: 'Sentinel', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 0);
  const habit = new Habit({ name: 'New Moon', structured: [] }, 'moondancer');
  const raw = {
    t: 'mod',
    mods: [
      { stat: 'inst', pct: [9, 10.8, 12.6, 15.3, 18] },
      { stat: 'tactical_dealt', pct: [6, 7.2, 8.4, 10.2, 12] }
    ],
    ifStacks: { id: 'rising_tide', min: 4, mult: 1.5 },
    dur: 2
  };
  executeHabitAction(habit, raw, moon, [sentinel], 1, { skipChance: true });
  if (sentinel.getPercentTotal('inst') !== 9 || sentinel.getPercentTotal('tactical_dealt') !== 6) {
    throw new Error('New Moon without 4 stacks should stay 9 / 6');
  }
  sentinel.percentMods = [];
  moon.addStack('rising_tide', {}, 'combat', { stacks: 4, maxStacks: 8 });
  executeHabitAction(habit, raw, moon, [sentinel], 1, { skipChance: true });
  if (sentinel.getPercentTotal('inst') !== 13.5 || sentinel.getPercentTotal('tactical_dealt') !== 9) {
    throw new Error(`New Moon at 4 stacks should be 13.5 / 9, got ${sentinel.getPercentTotal('inst')} / ${sentinel.getPercentTotal('tactical_dealt')}`);
  }
  console.log('✓ ifStacks New Moon 1.5x at Rising Tide 4+\n');
}

{
  const moon = new Character({
    id: 'moondancer', name: 'Moondancer', breed: 'Warrior', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 1);
  const foe = new Character({
    id: 'foe', name: 'Foe', breed: 'Hunter', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 1, 1);
  const habit = new Habit({
    name: 'Eclipsing Strike',
    structured: [{
      phase: 'turn',
      rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      chance: [20, 26, 32, 40, 50],
      chanceIf: { stacks: { id: 'rising_tide', min: 6 }, mult: 2 },
      actions: [{ t: 'mod', mods: [{ stat: 'dmg_dealt', pct: -18 }], dur: 2, tgt: { side: 'enemy', count: 1, select: 'highest:troops' } }]
    }]
  }, 'moondancer');
  const block = habit.blocks[0];
  if (!block.chanceIf || !block.chanceIf.stacks) throw new Error('block.chanceIf.stacks must parse');
  moon.addStack('rising_tide', {}, 'combat', { stacks: 6, maxStacks: 8 });
  const btl = new Battle([moon], [foe], { verbose: false });
  const extras = { attacker: moon };
  const boosted = applyChanceIf(20, block.chanceIf, foe, extras);
  if (boosted !== 40) throw new Error(`Eclipsing Strike at 6 stacks should be 40%, got ${boosted}`);
  const bleedChance = applyChanceIf(25, { stacks: { id: 'rising_tide', min: 6 }, mult: 2 }, foe, extras);
  if (bleedChance !== 50) throw new Error(`Blood Moon Bleed at 6 stacks should be 50%, got ${bleedChance}`);
  console.log('✓ chanceIf.stacks Blood Moon / Eclipsing Strike\n');
}

{
  const moon = new Character({
    id: 'moondancer', name: 'Moondancer', breed: 'Warrior', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 1);
  const ally = new Character({
    id: 'syrax', name: 'Syrax', breed: 'Sentinel', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 0);
  const spec = { allyStatus: 'advantage', mult: 2 };
  const btl = new Battle([moon, ally], [], { verbose: false });
  const extras = { allies: btl.alliesOf(moon), attacker: moon };
  if (applyChanceIf(25, spec, moon, extras) !== 25) throw new Error('New Moon base chance should be 25');
  applyEffect(ally, 'ADVANTAGE', 1, 'x', { duration: 2, magnitude: 20 });
  if (applyChanceIf(25, spec, moon, extras) !== 50) throw new Error('any ally Advantage should double Rising Tide chance');
  ally.isDead = true;
  if (applyChanceIf(25, spec, moon, extras) !== 25) throw new Error('dead ally Advantage should not double');
  ally.isDead = false;
  applyEffect(moon, 'ADVANTAGE', 1, 'x', { duration: 2, magnitude: 20 });
  const extrasSelf = { allies: btl.alliesOf(moon), attacker: moon };
  if (applyChanceIf(25, spec, moon, extrasSelf) !== 50) throw new Error('self Advantage should also double');
  console.log('✓ chanceIf.allyStatus New Moon / Full Moon\n');
}

{
  const mk = (id, team, slot, stats, breed) => new Character({
    id, name: id, breed: breed || 'Warrior', rarity: 'Rare',
    stats: stats || { str: 80, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const rounds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const kit = new Habit({
    name: 'Spreading Blaze',
    structured: [
      {
        phase: 'after_basic_attack',
        rounds,
        actions: [
          { t: 'dmg', dt: 'physical', pct: 50, tgt: { side: 'enemy', count: 1, select: 'same_lane' } },
          {
            t: 'stack', id: 'spreading_blaze', stacks: 1, maxStacks: 10,
            mods: [{ stat: 'tactical_dealt', pct: 2.5 }], dur: 'combat', chance: 100,
            tgt: { side: 'ally', count: 1, select: 'dealer:tactical' }
          }
        ]
      },
      {
        phase: 'after_basic_attack',
        rounds,
        requires: { anyEnemyDealerFire: true },
        actions: [{
          t: 'stack', id: 'spreading_blaze', stacks: 1, maxStacks: 10,
          mods: [{ stat: 'tactical_dealt', pct: 2.5 }], dur: 'combat', chance: 100,
          tgt: { side: 'ally', count: 1, select: 'dealer:tactical' }
        }]
      }
    ]
  }, 'vermax');
  const vermax = mk('vermax', 0, 1);
  const tac = mk('syrax', 0, 0, { str: 10, inst: 80, int: 10, init: 10 }, 'Sentinel');
  const fire = mk('caraxes', 1, 0, { str: 10, inst: 10, int: 80, init: 10 }, 'Hunter');
  const lane = mk('foe', 1, 1);
  lane.maxHealth = 5000;
  lane.currentHealth = 5000;
  fire.maxHealth = 5000;
  fire.currentHealth = 5000;
  vermax.setCommandKit(kit);
  const btl = new Battle([vermax, tac], [fire, lane], { verbose: false });
  btl.currentRound = 1;
  const hpBefore = lane.currentHealth;
  btl.executeKit(vermax, kit, 'after_basic_attack', 1, 'Spreading Blaze');
  if (lane.currentHealth >= hpBefore) throw new Error('Spreading Blaze should deal Physical to same lane');
  if (tac.getStackCount('spreading_blaze') !== 2) {
    throw new Error(`Fire enemy should repeat the stack, got ${tac.getStackCount('spreading_blaze')}`);
  }
  if (tac.getPercentTotal('tactical_dealt') !== 5) throw new Error('two Spreading Blaze stacks should be +5% Tactical Dealt');
  const v2 = mk('vermax2', 0, 1);
  const t2 = mk('syrax2', 0, 0, { str: 10, inst: 80, int: 10, init: 10 }, 'Sentinel');
  const physFoe = mk('foe2', 1, 1);
  physFoe.maxHealth = 5000;
  physFoe.currentHealth = 5000;
  v2.setCommandKit(kit);
  const btl2 = new Battle([v2, t2], [physFoe], { verbose: false });
  btl2.currentRound = 1;
  btl2.executeKit(v2, kit, 'after_basic_attack', 1, 'Spreading Blaze');
  if (t2.getStackCount('spreading_blaze') !== 1) {
    throw new Error(`no Fire enemy should grant 1 stack, got ${t2.getStackCount('spreading_blaze')}`);
  }
  console.log('✓ Spreading Blaze after Basic + Fire repeat\n');
}

{
  const mk = (id, team, slot, stats, breed) => new Character({
    id, name: id, breed: breed || 'Warrior', rarity: 'Rare',
    stats: stats || { str: 80, inst: 10, int: 10, init: 10 }
  }, team, slot, { stars: 6 });
  const habit = new Habit({
    name: 'Rallying Flame',
    unlockStar: 6,
    structured: [{
      phase: 'combat_start',
      rounds: [1],
      repeatPer: { side: 'enemy', dealer: 'fire' },
      actions: [
        {
          t: 'stack', id: 'rallying_flame', stacks: 1, maxStacks: 4, chance: 100,
          mods: [{ stat: 'physical_dealt', pct: 5 }], dur: 'combat', tgt: { side: 'self' }
        },
        {
          t: 'stack', id: 'spreading_blaze', stacks: 1, maxStacks: 10, chance: 100,
          mods: [{ stat: 'tactical_dealt', pct: 2.5 }], dur: 'combat',
          tgt: { side: 'ally', count: 1, select: 'dealer:tactical' }
        }
      ]
    }]
  }, 'vermax');
  const vermax = mk('vermax', 0, 1);
  const tac = mk('syrax', 0, 0, { str: 10, inst: 80, int: 10, init: 10 }, 'Sentinel');
  const fireA = mk('caraxes', 1, 0, { str: 10, inst: 10, int: 80, init: 10 }, 'Hunter');
  const fireB = mk('antares', 1, 2, { str: 10, inst: 10, int: 80, init: 10 }, 'Hunter');
  vermax.setHabits([habit]);
  const btl = new Battle([vermax, tac], [fireA, fireB], { verbose: false });
  btl.executeHabitsForPhase('combat_start', [vermax], 1);
  if (vermax.getStackCount('rallying_flame') !== 2) {
    throw new Error(`2 Fire dealers should grant 2 Rallying Flame, got ${vermax.getStackCount('rallying_flame')}`);
  }
  if (vermax.getPercentTotal('physical_dealt') !== 10) throw new Error('Rallying Flame should be +5% Physical Dealt per stack');
  if (tac.getStackCount('spreading_blaze') !== 2) {
    throw new Error(`2 Fire dealers should grant 2 Spreading Blaze, got ${tac.getStackCount('spreading_blaze')}`);
  }
  const locked = mk('vermax2', 0, 1);
  locked.setStars(2);
  locked.setHabits([habit]);
  if (locked.getHabitsForPhase(1, 'combat_start').length) throw new Error('Rallying Flame should stay locked below 6 stars');
  const v3 = mk('vermax3', 0, 1);
  const t3 = mk('syrax3', 0, 0, { str: 10, inst: 80, int: 10, init: 10 }, 'Sentinel');
  const phys = mk('foe', 1, 1);
  v3.setHabits([habit]);
  const none = new Battle([v3, t3], [phys], { verbose: false });
  none.executeHabitsForPhase('combat_start', [v3], 1);
  if (v3.getStackCount('rallying_flame') !== 0 || t3.getStackCount('spreading_blaze') !== 0) {
    throw new Error('no Fire enemy should skip Rallying Flame');
  }
  console.log('✓ Rallying Flame combat start per Fire dealer\n');
}

{
  const d = (id, team, slot) => new Character({
    id, name: id, breed: 'Warrior', rarity: 'Rare', stats: { str: 80, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const a = d('striker', 0, 1);
  const b = d('dummy', 1, 1);
  b.maxHealth = 10000;
  b.currentHealth = 10000;
  applyEffect(a, 'DOUBLE_STRIKE', 1, a.name, { duration: 2 });
  const btl = new Battle([a], [b], { verbose: false });
  btl.currentRound = 1;
  btl.executeCharacterAction(a);
  const basics = btl.battleLog.filter(line => /Basic Attack/.test(line));
  if (basics.length !== 2) throw new Error(`expected 2 Basic Attacks, got ${basics.length}: ${basics.join(' | ')}`);
  if (!basics[1].includes('Double-Strike')) throw new Error('2nd hit should log Double-Strike');
  const none = d('plain', 0, 1);
  const dummy2 = d('dummy2', 1, 1);
  dummy2.maxHealth = 10000;
  dummy2.currentHealth = 10000;
  const btl2 = new Battle([none], [dummy2], { verbose: false });
  btl2.currentRound = 1;
  btl2.executeCharacterAction(none);
  const one = btl2.battleLog.filter(line => /launches a Basic Attack/.test(line));
  if (one.length !== 1) throw new Error(`plain dragon should launch 1 basic, got ${one.length}`);
  console.log('✓ Double-Strike 2nd Basic Attack\n');
}

{
  const d = (id, team, slot) => new Character({
    id, name: id, breed: 'Warrior', rarity: 'Rare', stats: { str: 80, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const confused = d('confused', 0, 1);
  const ally = d('ally', 0, 0);
  const enemy = d('enemy', 1, 1);
  ally.maxHealth = 10000;
  ally.currentHealth = 10000;
  enemy.maxHealth = 10000;
  enemy.currentHealth = 10000;
  applyEffect(confused, 'CONFUSION', 1, 'x', { duration: 2 });
  getEffect(confused, 'confusion').confusionChance = 100;
  const btl = new Battle([confused, ally], [enemy], { verbose: false });
  confused.confusedThisActivation = true;
  const hit = btl.selectBasicAttackTarget(confused);
  if (hit !== ally) throw new Error(`confused basic should pick ally, got ${hit && hit.name}`);
  const tgt = btl.resolveTargets(confused, { targetingParsed: { side: 'enemy' } }, { tgt: { side: 'enemy', count: 1, select: 'any' } });
  if (!tgt.includes(ally) || tgt.includes(enemy)) throw new Error('confused enemy targeting should resolve to allies');
  const self = btl.resolveTargets(confused, {}, { tgt: { side: 'self' } });
  if (self[0] !== confused) throw new Error('self targeting must not swap');
  console.log('✓ Confusion swaps ally/enemy targeting\n');
}

{
  const d = (id, team, slot) => new Character({
    id, name: id, breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 80, init: 10 }
  }, team, slot);
  const sun = d('sun', 0, 1);
  const foe = d('foe', 1, 1);
  sun.maxHealth = 1000;
  sun.currentHealth = 1000;
  const btl = new Battle([sun], [foe], { verbose: false });
  btl.currentRound = 1;
  btl.damageContext = { type: 'fire', basic: false, victim: sun };
  if (!btl.blockAllowed(sun, { requires: { damageType: 'fire' } })) throw new Error('fire require failed');
  if (btl.blockAllowed(sun, { requires: { damageType: 'tactical' } })) throw new Error('tactical should not match fire');
  btl.damageContext = { type: 'physical', basic: true, victim: sun };
  if (btl.blockAllowed(sun, { requires: { damageType: 'physical', excludeBasic: true } })) {
    throw new Error('excludeBasic should reject Basic Attack physical');
  }
  if (!btl.blockAllowed(sun, { requires: { damageType: 'basic' } })) throw new Error('damageType basic failed');
  const first = btl.dealDamage(sun, 10, { type: 'fire', basic: false });
  if (first !== 10) throw new Error('dealDamage amount');
  if (!sun.receivedDamageThisRound) throw new Error('first damage flag');
  btl.dealDamage(sun, 10, { type: 'tactical', basic: false });
  if (!sun.receivedDamageThisRound) throw new Error('flag should stay');
  console.log('✓ first-damage requires / notify flags\n');
}

{
  const dummy = { id: 'x', name: 'X', breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 } };
  const unit = new Character(dummy, 0, 0);
  applyEffect(unit, 'WEAKENED', 1, 'e', { magnitude: 20, duration: 2 });
  applyEffect(unit, 'VULNERABLE', 1, 'e', { magnitude: 10, duration: 2 });
  applyEffect(unit, 'BURN', 1, 'e', { duration: 2 });
  applyEffect(unit, 'IMMUNITY', 1, 'self', { duration: 2, immunities: ['vulnerable', 'weakened'] });
  if (hasEffect(unit, 'weakened') || hasEffect(unit, 'vulnerable')) throw new Error('Immunity should purge Vulnerable/Weakened');
  if (!hasEffect(unit, 'burn')) throw new Error('Immunity should not purge Burn');
  if (!isImmuneTo(unit, 'weakened') || !isImmuneTo(unit, 'vulnerable')) throw new Error('isImmuneTo failed');
  if (applyEffect(unit, 'WEAKENED', 1, 'e') != null) throw new Error('Weakened should be blocked');
  if (applyEffect(unit, 'STUN', 1, 'e') == null) throw new Error('Stun should still apply');
  console.log('✓ Immunity blocks and purges Vulnerable/Weakened\n');
}

{
  const dummy = { id: 'j', name: 'Jag', breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 } };
  const unit = new Character(dummy, 0, 0);
  unit.currentHealth = 10;
  const healed = unit.heal(20);
  if (!(healed > 0)) throw new Error('heal should work before Nullify');
  applyEffect(unit, 'NULLIFY_RECOVERY', 1, 'self', { duration: 'combat' });
  if (!hasEffect(unit, 'nullify_recovery')) throw new Error('Nullify Recovery missing');
  unit.currentHealth = 10;
  if (unit.heal(50) !== 0) throw new Error('heal should be 0 under Nullify Recovery');
  applyEffect(unit, 'RECOVERY', 1, 'self', { duration: 2 });
  if (processHealingEffects(unit) !== 0) throw new Error('HoT should be blocked');
  console.log('✓ Nullify Recovery blocks heal and HoT\n');
}

{
  const d = (id, init) => {
    const c = new Character({
      id, name: id, breed: 'Warrior', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init }
    }, 0, 1);
    return c;
  };
  const fs = d('fs', 1);
  const mid = d('mid', 50);
  const slow = d('slow', 99);
  applyEffect(fs, 'FIRST_STRIKE', 1, 'x', { duration: 2 });
  applyEffect(slow, 'SLOW', 1, 'x', { duration: 2 });
  const order = sortByInitiative([slow, mid, fs]).map(c => c.name);
  if (order.join(',') !== 'fs,mid,slow') throw new Error(`order ${order.join('→')} expected fs→mid→slow`);
  const both = d('both', 1);
  applyEffect(both, 'FIRST_STRIKE', 1, 'x', { duration: 2 });
  applyEffect(both, 'SLOW', 1, 'x', { duration: 2 });
  const order2 = sortByInitiative([both, mid]).map(c => c.name);
  if (order2[order2.length - 1] !== 'both') throw new Error('Slow overrides First-Strike');
  console.log('✓ First-Strike / Slow initiative order\n');
}

{
  const d = (id, team, slot) => new Character({
    id, name: id, breed: 'Warrior', rarity: 'Rare', stats: { str: 80, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const vael = d('vael', 0, 1);
  const dummy = d('dummy', 0, 0);
  const foe = d('foe', 1, 1);
  applyEffect(foe, 'TAUNT', 1, vael.name, { duration: 1 });
  const btl = new Battle([vael, dummy], [foe], { verbose: false });
  const forced = btl.selectBasicAttackTarget(foe);
  if (forced !== vael) throw new Error(`Taunt should force Basic onto vael, got ${forced && forced.name}`);
  applyEffect(foe, 'STAGGER', 1, vael.name, { duration: 1 });
  const already = hasEffect(foe, 'taunt');
  if (!already) throw new Error('setup taunt missing');
  console.log('✓ Taunt forces Basic Attack onto appliedBy\n');
}

{
  const dummy = { id: 't', name: 'Tairax', breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 } };
  const unit = new Character(dummy, 0, 0);
  const foe = new Character({ ...dummy, id: 'f', name: 'Foe' }, 1, 1);
  unit.maxHealth = 500;
  unit.currentHealth = 500;
  applyEffect(unit, 'EVADE', 1, 'self', { duration: 5, magnitude: 100 });
  if (getEffect(unit, 'evade').evasionChance !== 100) throw new Error('evade rate from val');
  const btl = new Battle([unit], [foe], { verbose: false });
  const dealt = btl.dealDamage(unit, 80, { type: 'fire', basic: false });
  if (dealt !== 0) throw new Error('100% Evade should ignore damage');
  if (unit.currentHealth !== 500) throw new Error('health should be unchanged');
  if (unit.receivedDamageThisRound) throw new Error('evaded hit is not first damage');
  const open = new Character({ ...dummy, id: 'o', name: 'Open' }, 0, 2);
  open.maxHealth = 500;
  open.currentHealth = 500;
  applyEffect(open, 'EVADE', 1, 'self', { duration: 1, magnitude: 0 });
  const btl2 = new Battle([open], [foe], { verbose: false });
  const dmg = btl2.dealDamage(open, 10, { type: 'physical', basic: true });
  if (!(dmg > 0) || open.currentHealth >= 500) throw new Error('0% Evade should take damage');
  console.log('✓ Evade ignores each damage instance\n');
}

{
  const d = (id, team, slot) => new Character({
    id, name: id, breed: 'Champion', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const arulix = d('arulix', 0, 1);
  const ally = d('ally', 0, 0);
  const foe = d('foe', 1, 1);
  applyEffect(ally, 'WEAKENED', 1, 'x', { magnitude: 20, duration: 2 });
  const btl = new Battle([arulix, ally], [foe], { verbose: false });
  btl.currentRound = 1;
  btl.executeCopyStatus(arulix, { name: 'Mimicry' }, {
    from: { side: 'ally', status: ['weakened', 'vulnerable'] },
    dur: 2,
    chance: 100,
    tgt: { side: 'enemy', count: 1, select: 'any' }
  });
  if (!hasEffect(foe, 'weakened')) throw new Error('Mimicry should copy Weakened onto enemy');
  if (getEffect(foe, 'weakened').damagePenalty !== 20) throw new Error('copied magnitude');
  btl.executeCopyStatus(arulix, { name: 'Mimicry' }, {
    from: { side: 'enemy', status: ['advantage', 'resistance'] },
    dur: 2,
    chance: 100,
    tgt: { side: 'ally', count: 1, select: 'any' }
  });
  if (hasEffect(arulix, 'advantage') || hasEffect(ally, 'advantage')) {
    throw new Error('should not copy Advantage when no enemy has it');
  }
  console.log('✓ copy_status Mimicry copies Weakened, skips missing Advantage\n');
}

{
  const d = (id, team, slot) => new Character({
    id, name: id, breed: 'Warrior', rarity: 'Legendary', stats: { str: 80, inst: 10, int: 10, init: 10 }
  }, team, slot);
  const vhagar = d('vhagar', 0, 1);
  const foe = d('foe', 1, 1);
  const habit = { getScalingValue: (action, rankIndex) => {
    const data = action.data || action;
    const values = {};
    for (const mod of data.mods || []) values[mod.stat] = Array.isArray(mod.pct) ? mod.pct[rankIndex] : mod.pct;
    return values;
  } };
  const raw = {
    t: 'stack',
    id: 'bulwark',
    stacks: 1,
    maxStacks: 5,
    mods: [
      { stat: 'str', pct: [5, 6.5, 8, 10, 12.5] },
      { stat: 'physical_received', pct: [-2.5, -3.25, -4, -5, -6.25] }
    ],
    dur: 'combat',
    onReach: {
      stacks: 3,
      once: true,
      actions: [{ t: 'dmg', dt: 'physical', pct: [100] }]
    },
    tgt: { side: 'self' }
  };
  let reaches = 0;
  for (let i = 0; i < 5; i += 1) {
    const result = executeModAction(habit, raw, vhagar, [vhagar], habit.getScalingValue(raw, 0), 1);
    reaches += result.onReachActions.length;
  }
  if (vhagar.getStackCount('bulwark') !== 5) throw new Error(`expected 5 stacks, got ${vhagar.getStackCount('bulwark')}`);
  if (reaches !== 1) throw new Error(`onReach should fire once, fired ${reaches}`);
  if (!(vhagar.getModifiedStat('str') > 80)) throw new Error('Bulwark should raise Strength');
  console.log('✓ stack onReach Bulwark fires once at 3 stacks\n');
}

{
  const d = new Character({
    id: 'dawn', name: 'Dawnseeker', breed: 'Sentinel', rarity: 'Rare', stats: { str: 10, inst: 80, int: 10, init: 40 }
  }, 0, 1);
  const foe = new Character({
    id: 'f', name: 'Foe', breed: 'Warrior', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 1, 1);
  const btl = new Battle([d], [foe], { verbose: false });
  btl.runAction(d, { name: 'Sunbreak' }, {
    t: 'mod_command', command: 'Radiant Wings', field: 'tactical_rate', pct: [100, 110, 120, 135, 150]
  }, 1);
  if (d.commandMods.tactical_rate.value !== 100) throw new Error('Sunbreak should write rank 1 rate 100');
  const habit = { getScalingValue: (a, i) => (a.data || a).pct };
  const dmg = executeHabitAction(habit, {
    t: 'dmg', dt: 'tactical', pct: 50, rateField: 'tactical_rate'
  }, d, [foe], 1, { skipChance: true, round: 1 });
  const baseline = executeHabitAction(habit, {
    t: 'dmg', dt: 'tactical', pct: 50
  }, d, [foe], 1, { skipChance: true, round: 1 });
  if (!(dmg.damages[0].amount > baseline.damages[0].amount)) {
    throw new Error('rateField should raise Radiant Wings damage on rounds 1-2');
  }
  d.tickCommandMods();
  if (d.commandMods.tactical_rate) throw new Error('round-only command mod should expire');
  btl.runAction(d, { name: 'Full Moon' }, {
    t: 'mod_command', command: 'Crescent Blade', field: 'physical_rate', pct: 85, dur: 'combat'
  }, 1);
  d.tickCommandMods();
  if (!d.commandMods.physical_rate) throw new Error('combat command mod should persist');
  if (resolveChance({ chance: 20, chanceField: 'stun_chance' }, 0, d) !== 20) {
    throw new Error('missing chanceField should use default');
  }
  d.commandMods.stun_chance = { value: 40, duration: 1 };
  if (resolveChance({ chance: 20, chanceField: 'stun_chance' }, 0, d) !== 40) {
    throw new Error('chanceField override failed');
  }
  console.log('✓ mod_command rateField / chanceField / duration\n');
}

{
  const unit = new Character({
    id: 'daemoros', name: 'Daemoros', breed: 'Warrior', rarity: 'Legendary',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 1);
  const habit = new Habit({ name: "Phantom's Veil", structured: [] }, 'daemoros');
  const raw = {
    t: 'mod',
    pick: 'random',
    mods: [
      { stat: 'physical_received', pct: [-15, -19.5, -24, -30, -37.5] },
      { stat: 'tactical_received', pct: [-15, -19.5, -24, -30, -37.5] },
      { stat: 'fire_received', pct: [-15, -19.5, -24, -30, -37.5] }
    ],
    dur: 1
  };
  const orig = Math.random;
  Math.random = () => 0;
  executeHabitAction(habit, raw, unit, [unit], 1, { skipChance: true });
  if (unit.getPercentTotal('physical_received') !== -15) throw new Error('pick 0 should be Physical');
  if (unit.getPercentTotal('tactical_received') !== 0 || unit.getPercentTotal('fire_received') !== 0) {
    throw new Error('Phantom\'s Veil must apply only one damage type');
  }
  unit.percentMods = [];
  Math.random = () => 0.99;
  executeHabitAction(habit, raw, unit, [unit], 1, { skipChance: true });
  if (unit.getPercentTotal('fire_received') !== -15) throw new Error('pick last should be Fire');
  if (unit.getPercentTotal('physical_received') !== 0) throw new Error('should not stack previous pick');
  Math.random = orig;
  const seen = new Set();
  for (let i = 0; i < 60; i += 1) {
    const u = new Character({
      id: 'd', name: 'D', breed: 'Warrior', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
    }, 0, 0);
    executeHabitAction(habit, raw, u, [u], 1, { skipChance: true });
    for (const stat of ['physical_received', 'tactical_received', 'fire_received']) {
      if (u.getPercentTotal(stat) === -15) seen.add(stat);
    }
  }
  if (seen.size !== 3) throw new Error(`expected all 3 types over 60 rolls, got ${[...seen]}`);
  console.log('✓ pick:random Phantom\'s Veil one damage type per round\n');
}

{
  const nyrena = new Character({
    id: 'nyrena', name: 'Nyrena', breed: 'Champion', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 1, 1);
  const ally = new Character({
    id: 'ally', name: 'Ally', breed: 'Warrior', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 1, 0);
  const attacker = new Character({
    id: 'atk', name: 'Atk', breed: 'Hunter', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 1);
  const habit = new Habit({ name: 'The Long Siege', structured: [] }, 'nyrena');
  const raw = {
    t: 'mod',
    mods: [{ stat: 'physical_received', pct: [-5, -6.5, -8, -10, -12.5] }],
    ifBonus: { defending: true, mult: 2 },
    dur: 1
  };
  executeHabitAction(habit, raw, nyrena, [ally], 1, { skipChance: true, defending: true });
  if (ally.getPercentTotal('physical_received') !== -10) {
    throw new Error(`Defending should double -5 to -10, got ${ally.getPercentTotal('physical_received')}`);
  }
  const open = new Character({
    id: 'open', name: 'Open', breed: 'Warrior', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 0);
  executeHabitAction(habit, raw, attacker, [open], 1, { skipChance: true, defending: false });
  if (open.getPercentTotal('physical_received') !== -5) {
    throw new Error('Attacking should keep -5 Physical Received');
  }
  const btl = new Battle([attacker], [nyrena], { verbose: false, defendingTeam: 1 });
  if (!btl.isDefending(nyrena) || btl.isDefending(attacker)) throw new Error('Team B should be Defending by default');
  console.log('✓ When Defending doubles The Long Siege\n');
}

{
  const mk = (id, hp) => {
    const c = new Character({
      id, name: id, breed: 'Champion', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
    }, 0, 1);
    c.maxHealth = 100;
    c.currentHealth = hp;
    return c;
  };
  const habit = new Habit({ name: 'Sharpened Beauty', structured: [] }, 'tessarion');
  const raw = {
    t: 'mod',
    mods: [
      { stat: 'physical_dealt', pct: [7, 8.4, 9.8, 11.9, 14] },
      { stat: 'fire_dealt', pct: [7, 8.4, 9.8, 11.9, 14] }
    ],
    ifBonus: { any: [{ selfHpAbove: 75 }, { selfStatus: 'advantage' }], mult: 2 },
    dur: 1
  };
  const high = mk('high', 80);
  executeHabitAction(habit, raw, high, [high], 1, { skipChance: true });
  if (high.getPercentTotal('physical_dealt') !== 14 || high.getPercentTotal('fire_dealt') !== 14) {
    throw new Error('above 75% should double Sharpened Beauty to 14');
  }
  const edge = mk('edge', 75);
  executeHabitAction(habit, raw, edge, [edge], 1, { skipChance: true });
  if (edge.getPercentTotal('physical_dealt') !== 7) throw new Error('exactly 75% is not above 75%');
  const low = mk('low', 50);
  executeHabitAction(habit, raw, low, [low], 1, { skipChance: true });
  if (low.getPercentTotal('physical_dealt') !== 7) throw new Error('below 75% without Advantage stays 7');
  applyEffect(low, 'ADVANTAGE', 1, 'self', { duration: 2, magnitude: 20 });
  low.percentMods = [];
  executeHabitAction(habit, raw, low, [low], 1, { skipChance: true });
  if (low.getPercentTotal('fire_dealt') !== 14) throw new Error('Advantage should double Sharpened Beauty at 50% HP');
  const queen = mk('queen', 90);
  const ally = mk('fireally', 100);
  ally.stats = { str: 10, inst: 10, int: 80, init: 10 };
  executeHabitAction(habit, {
    t: 'mod',
    mods: [
      { stat: 'dmg_received', pct: -10 },
      { stat: 'int', pct: 15 }
    ],
    ifBonus: { selfHpAbove: 75, mult: 2 },
    dur: 2
  }, queen, [ally], 1, { skipChance: true });
  if (ally.getPercentTotal('dmg_received') !== -20) throw new Error('The Blue Queen should double to -20 when above 75%');
  if (ally.getPercentTotal('int') !== 30) throw new Error('The Blue Queen should double Intelligence to +30');
  console.log('✓ ifBonus.any / selfHpAbove / selfStatus Tessarion\n');
}

{
  const mk = (id, team) => new Character({
    id, name: id, breed: 'Sentinel', rarity: 'Rare', stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, team, 1);
  const syrax = mk('syrax', 0);
  const ally = mk('ally', 0);
  const foe = mk('foe', 1);
  ally.maxHealth = 200;
  ally.currentHealth = 100;
  const habit = new Habit({ name: 'Strategic Revival', structured: [] }, 'syrax');
  const raw = {
    t: 'heal',
    pct: [50, 60, 70, 85, 100],
    ifBonus: { anyEnemyStatus: 'slow', mult: 1.5 }
  };
  const base = executeHabitAction(habit, raw, syrax, [ally], 1, {
    skipChance: true, enemies: [foe]
  });
  applyEffect(foe, 'SLOW', 1, 'syrax', { duration: 2 });
  const boosted = executeHabitAction(habit, raw, syrax, [ally], 1, {
    skipChance: true, enemies: [foe]
  });
  if (!(boosted.heals[0].amount > base.heals[0].amount * 1.4)) {
    throw new Error(`Slow should 1.5x Recovery, base ${base.heals[0].amount} boosted ${boosted.heals[0].amount}`);
  }
  if (!ifBonusApplies({ anyEnemyStatus: 'slow', mult: 1.5 }, syrax, ally, { enemies: [foe] })) {
    throw new Error('anyEnemyStatus Slow should apply');
  }
  const clean = mk('clean', 1);
  if (ifBonusApplies({ anyEnemyStatus: 'slow', mult: 1.5 }, syrax, ally, { enemies: [clean] })) {
    throw new Error('anyEnemyStatus should miss without Slow');
  }
  console.log('✓ anyEnemyStatus Slow 1.5x Strategic Revival\n');
}

{
  const ts = new Character({
    id: 'thunderstrike', name: 'Thunderstrike', breed: 'Warrior', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 1);
  const foe = new Character({
    id: 'foe', name: 'Foe', breed: 'Hunter', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 1, 1);
  const habit = new Habit({ name: 'Staggering Assault', structured: [] }, 'thunderstrike');
  const raw = {
    t: 'status',
    st: 'stagger',
    dur: 1,
    ifBonus: { selfStatus: 'advantage', dur: 2 }
  };
  const plain = executeHabitAction(habit, raw, ts, [foe], 1, { skipChance: true });
  if (plain.duration !== 1) throw new Error(`Stagger without Advantage should last 1, got ${plain.duration}`);
  applyEffect(ts, 'ADVANTAGE', 1, 'self', { duration: 2, magnitude: 20 });
  const boosted = executeHabitAction(habit, raw, ts, [foe], 1, { skipChance: true });
  if (boosted.duration !== 2) throw new Error(`Stagger with Advantage should last 2, got ${boosted.duration}`);
  console.log('✓ ifBonus.dur Staggering Assault Advantage\n');
}

{
  const vaeldra = new Character({
    id: 'vaeldra', name: 'Vaeldra', breed: 'Warrior', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 0, 1);
  const fresh = new Character({
    id: 'fresh', name: 'Fresh', breed: 'Hunter', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 1, 0);
  const marked = new Character({
    id: 'marked', name: 'Marked', breed: 'Hunter', rarity: 'Rare',
    stats: { str: 10, inst: 10, int: 10, init: 10 }
  }, 1, 1);
  applyEffect(marked, 'TAUNT', 1, 'other', { duration: 2 });
  const habit = new Habit({ name: "Siren's Call", structured: [] }, 'vaeldra');
  const raw = { t: 'status', st: 'taunt', dur: 1, ifAlready: { st: 'stagger', dur: 1 } };
  const hit = executeHabitAction(habit, raw, vaeldra, [fresh], 1, { skipChance: true });
  if (hit.statusType !== 'taunt' || hit.converted) throw new Error('clean target should receive Taunt');
  const swap = executeHabitAction(habit, raw, vaeldra, [marked], 1, { skipChance: true });
  if (swap.statusType !== 'stagger' || !swap.converted) throw new Error('already-Taunted should convert to Stagger');
  const btl = new Battle([vaeldra], [fresh, marked], { verbose: false });
  btl.logActionResult(vaeldra, habit, raw, marked, swap);
  if (!hasEffect(marked, 'stagger')) throw new Error('Stagger should apply');
  if (!hasEffect(marked, 'taunt')) throw new Error('existing Taunt should remain');
  if (vaeldra.lastTauntTarget === marked) throw new Error('ifAlready Stagger must not fire on_taunt');
  btl.logActionResult(vaeldra, habit, raw, fresh, hit);
  if (!hasEffect(fresh, 'taunt')) throw new Error('clean enemy should be Taunted');
  if (hasEffect(fresh, 'stagger')) throw new Error('clean enemy should not be Staggered');
  if (vaeldra.lastTauntTarget !== fresh) throw new Error('fresh Taunt should set lastTauntTarget');
  console.log('✓ ifAlready Taunt → Stagger Siren\'s Call\n');
}

try {
  // Passo 1: Carregar dragões
  console.log('1️⃣  Carregando dragões...');
  const dragonsContent = fs.readFileSync(path.join(__dirname, 'data', 'dragons.json'), 'utf-8');
  const dragonsData = JSON.parse(dragonsContent);
  const allDragons = dragonsData.dragons || [];
  console.log(`   ✓ ${allDragons.length} dragões disponíveis\n`);

  if (allDragons.length < 6) {
    console.error('   ✗ Não há dragões suficientes (mínimo 6)');
    process.exit(1);
  }

  // Passo 2: Selecionar dragões
  console.log('2️⃣  Selecionando dragões...');
  const selected = allDragons.slice(0, 6);
  console.log(`   Team A: ${selected.slice(0, 3).map(d => d.id).join(', ')}`);
  console.log(`   Team B: ${selected.slice(3, 6).map(d => d.id).join(', ')}\n`);

  // Passo 3: Criar Characters
  console.log('3️⃣  Criando Characters...');
  const teamA = allDragons.slice(0, 3).map((dragon, idx) => 
    new Character(dragon, 0, idx)
  );
  const teamB = allDragons.slice(3, 6).map((dragon, idx) => 
    new Character(dragon, 1, idx)
  );
  console.log(`   ✓ Team A: ${teamA.map(c => c.name).join(', ')}`);
  console.log(`   ✓ Team B: ${teamB.map(c => c.name).join(', ')}\n`);

  // Passo 4: Carregar Habits
  console.log('4️⃣  Carregando Habits...');
  let habitsLoaded = 0;
  for (let character of [...teamA, ...teamB]) {
    try {
      const habitPath = path.join(__dirname, 'data', `${character.id}_habits.json`);
      if (fs.existsSync(habitPath)) {
        const habitContent = fs.readFileSync(habitPath, 'utf-8');
        const habitData = JSON.parse(habitContent);
        const habits = loadDragonHabitsSync(habitData, character.id);
        character.setHabits(habits);
        character.setHabitRank(3);
        console.log(`   ✓ ${character.name}: ${habits.length} habits`);
        habitsLoaded++;
      }
    } catch (error) {
      console.log(`   ⚠ ${character.name}: sem habits`);
    }
    try {
      const cmdPath = path.join(__dirname, 'data', `${character.id}_vanguard_command.json`);
      if (fs.existsSync(cmdPath)) {
        const cmdData = JSON.parse(fs.readFileSync(cmdPath, 'utf-8'));
        const kit = loadCommandSync(cmdData, character.id);
        character.setCommandKit(kit.command);
        character.setVanguardKit(kit.vanguard);
        console.log(`   ✓ ${character.name}: Command ${kit.name}`);
      }
    } catch (error) {
      console.log(`   ⚠ ${character.name}: sem command`);
    }
  }
  console.log(`   ✓ ${habitsLoaded}/6 dragões com habits\n`);

  // Passo 5: Criar Batalha
  console.log('5️⃣  Inicializando Batalha...');
  const battle = new Battle(teamA, teamB, { verbose: false });
  battle.start();
  console.log(`   ✓ Batalha criada (máx ${battle.maxRounds} rodadas)\n`);

  // Passo 6: Executar rodadas
  console.log('6️⃣  Executando Rodadas...\n');
  let roundCount = 0;
  while (battle.isBattleActive()) {
    battle.runRound();
    roundCount++;

    const statusA = battle.getTeamStatus(0);
    const statusB = battle.getTeamStatus(1);
    console.log(`   Rodada ${roundCount}: Team A (${statusA.alive} vivos), Team B (${statusB.alive} vivos)`);

    if (!battle.isBattleActive()) break;
  }

  console.log('\n');

  // Passo 7: Resultado
  console.log('7️⃣  Resultado Final\n');
  const result = battle.getResult();
  const summary = battle.getSummary();

  console.log(`   🏆 Vencedor: ${summary.winner}`);
  console.log(`   📊 Rodadas: ${summary.rounds}`);
  console.log(`   🔵 Team A Sobreviventes: ${summary.teamASurvivors}/3`);
  console.log(`   🔴 Team B Sobreviventes: ${summary.teamBSurvivors}/3`);
  console.log(`   📝 Motivo: ${summary.reason}\n`);

  console.log('═══════════════════════════════════════════════════════');
  console.log('✅ TESTE COMPLETADO COM SUCESSO\n');

  // Log da batalha (primeiras 80 linhas)
  const logLines = result.log.split('\n');
  console.log('📋 LOG DA BATALHA:\n');
  console.log(logLines.slice(0, 80).join('\n'));
  if (logLines.length > 80) {
    console.log(`\n... (${logLines.length - 80} linhas omitidas) ...`);
  }

} catch (error) {
  console.error('\n❌ ERRO:');
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
}
