import {
  calculateFinalDamage, sortByInitiative, isTeamAlive, rollChance,
  formatStatName, formatDamageTypeName, formatStatusName, formatDuration,
  formatSignedPercent, formatTroopCapacity, isGrantedStatus, formatStackName,
  applyChanceIf
} from './utils.js';
import {
  updateEffects, processDamageEffects, processHealingEffects,
  canAct, canAttack, canUseAbilities, applyEffect, hasEffect, tryEvade, getEffect,
  cleanseCharacter, isImmuneTo
} from './effects.js';
import { selectTargets, getPositionName, POSITIONS, getDealerType } from './positionSystem.js';
import { executeHabitAction, resolveChance, PHASES } from './habitParser.js';

function enhancedNote(stat) {
  return stat ? ` (enhanced by ${formatStatName(stat)})` : '';
}

export const battlePart1 = {
  initialize() {
    this.isActive = true;
    this.currentRound = 0;
    this.logSeparator('Start of Combat');
    this.logTeamStatus('Team A', this.teamA);
    this.logTeamStatus('Team B', this.teamB);
    this.logSeparator();
    for (const character of this.allCharacters) this.executeVanguard(character);
    this.executeHabitsForPhase(PHASES.COMBAT_START, this.allCharacters, 1);
  },
  start() {
    this.initialize();
  },
  runRound() {
    if (!this.isActive || this.isFinished) return false;
    this.currentRound += 1;
    if (this.currentRound > this.maxRounds) {
      this.endBattle(null, `Maximum ${this.maxRounds} rounds reached`);
      return false;
    }
    this.phaseStartOfRound();
    if (!isTeamAlive(this.teamA) || !isTeamAlive(this.teamB)) {
      this.checkVictory();
      return false;
    }
    for (const character of this.phaseCalculateInitiative()) {
      if (character.isDead) continue;
      if (!canAct(character)) {
        this.logAction(`${character.name} cannot act (${this.getActiveEffectString(character)})`);
        continue;
      }
      this.executeCharacterAction(character);
      if (!isTeamAlive(this.teamA) || !isTeamAlive(this.teamB)) {
        this.checkVictory();
        return false;
      }
    }
    this.phaseEndOfRound();
    if (!isTeamAlive(this.teamA) || !isTeamAlive(this.teamB)) {
      this.checkVictory();
      return false;
    }
    this.logRoundSummary();
    return true;
  },
  phaseStartOfRound() {
    this.logSeparator(`Start of Round ${this.currentRound}`);
    for (const character of this.allCharacters) updateEffects(character);
    this.executeHabitsForPhase(PHASES.ROUND_START, this.allCharacters, this.currentRound);
  },
  phaseCalculateInitiative() {
    const order = sortByInitiative(this.allCharacters.filter(c => !c.isDead));
    this.logAction(`Turn order: ${order.map(c => c.name).join(' → ')}`);
    return order;
  },
  phaseEndOfRound() {
    for (const character of this.allCharacters) {
      if (!character.isDead) {
        const ticks = processDamageEffects(character, name => this.allCharacters.find(c => c.name === name));
        for (const tick of ticks) {
          if (character.isDead) break;
          const actual = this.dealDamage(character, tick.amount, {
            type: tick.damageType,
            basic: false,
            sourceName: tick.name
          });
          if (!actual) continue;
          this.logAction(`${character.name} takes ${actual} ${formatDamageTypeName(tick.damageType)} from ${tick.name}`);
          if (character.isDead) this.logAction(`${character.name} retreated`);
        }
        const recovery = processHealingEffects(character);
        if (recovery > 0) {
          this.logAction(`Applies Recovery to ${character.name} (+${recovery} Troop Capacity)`);
          this.notifyPreyRecovery(character);
        } else if (hasEffect(character, 'nullify_recovery')) {
          const hasHot = (character.activeEffects || []).some(e => e.id === 'recovery' && !e.isExpired());
          if (hasHot) this.logAction(`${character.name} cannot receive Recovery (Nullify Recovery)`);
        }
        if (typeof character.tickPercentMods === 'function') character.tickPercentMods();
      }
    }
    for (const character of this.allCharacters) {
      if (typeof character.advanceRetreatFlags === 'function') character.advanceRetreatFlags();
    }
  },
  isDefending(character) {
    return character && character.teamId === this.defendingTeam;
  },
  troopOf(character) {
    const raw = character.troopType || this.teamTroop[character.teamId] || null;
    return raw ? String(raw).toLowerCase().replace(/[\s_-]/g, '') : null;
  },
  hasCommand(character, name) {
    if (!name) return false;
    const want = String(name).toLowerCase();
    const kitName = character.commandKit && character.commandKit.name;
    const named = character.commandName;
    return (named && String(named).toLowerCase() === want)
      || (kitName && String(kitName).toLowerCase() === want);
  },
  notifyPreyRecovery(recovered) {
    if (!recovered) return;
    for (const hunter of this.allCharacters) {
      if (!hunter || hunter.isDead) continue;
      if (this.getPrey(hunter) !== recovered) continue;
      this.executeHabitsForPhase(PHASES.ON_PREY_RECOVERY, [hunter], this.currentRound);
    }
  },
  getPrey(character) {
    const linked = character.links && character.links.prey;
    if (linked && !linked.isDead && hasEffect(linked, 'prey')) return linked;
    return this.enemiesOf(character).find(c => c && !c.isDead && hasEffect(c, 'prey')) || null;
  },
  dealDamage(target, amount, info = {}) {
    if (!target || amount <= 0) return 0;
    if (tryEvade(target)) {
      const from = info.sourceName ? ` from ${info.sourceName}` : '';
      this.logAction(`${target.name} Evades the ${formatDamageTypeName(info.type)}${from}`);
      return 0;
    }
    const actual = target.takeDamage(amount);
    if (actual > 0) {
      this.notifyDamage(target, info);
      if (info.source && String(info.type || '').toLowerCase() === 'tactical') {
        this.notifyLinkProc(info.source, 'tactical');
      }
    }
    return actual;
  },
  notifyLinkProc(source, event) {
    if (!source) return;
    const prev = this.damageContext;
    this.damageContext = { ...(prev || {}), linkEvent: event, linkSource: source };
    try {
      for (const watcher of this.allCharacters) {
        if (!watcher || watcher.isDead) continue;
        const links = watcher.links || {};
        if (!Object.values(links).includes(source)) continue;
        const kit = watcher.commandKit;
        const label = watcher.commandName || (kit && kit.name) || 'Command';
        if (kit) this.executeKit(watcher, kit, PHASES.ON_LINK_PROC, this.currentRound, label);
        this.executeHabitsForPhase(PHASES.ON_LINK_PROC, [watcher], this.currentRound);
      }
    } finally {
      this.damageContext = prev || null;
    }
  },
  notifyDamage(target, info = {}) {
    if (!target) return;
    const type = String(info.type || '').toLowerCase();
    const basic = !!info.basic;
    const firstSelf = !target.receivedDamageThisRound;
    target.receivedDamageThisRound = true;
    const prev = this.damageContext;
    this.damageContext = { type, basic, victim: target };
    try {
      if (firstSelf && !target.isDead) {
        this.executeHabitsForPhase(PHASES.ON_SELF_FIRST_DAMAGE, [target], this.currentRound);
      }
      if (type === 'fire') {
        const allies = this.alliesOf(target).filter(c => c && !c.isDead);
        this.executeHabitsForPhase(PHASES.ON_ALLY_FIRE_DAMAGE, allies, this.currentRound);
      }
    } finally {
      this.damageContext = prev || null;
    }
  },
  hasLeastTroops(character) {
    const hp = character.currentHealth;
    return this.allCharacters.filter(c => c && !c.isDead).every(c => c.currentHealth >= hp);
  }
};
