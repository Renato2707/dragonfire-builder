function healthPct(character) {
  if (!character || character.isDead) return 0;
  if (typeof character.getHealthPercentage === 'function') return character.getHealthPercentage();
  return 100;
}

function hasStatus(character, statusName) {
  const want = String(statusName || '').toLowerCase().replace(/-/g, '_');
  return (character.activeEffects || []).some(e => {
    const active = typeof e.isExpired === 'function' ? !e.isExpired() : e.duration > 0;
    const id = String(e.id || e.name || '').toLowerCase().replace(/-/g, '_');
    return active && id === want;
  });
}

function getStat(character, stat) {
  if (!character) return 0;
  if (typeof character.getModifiedStat === 'function') return character.getModifiedStat(stat);
  return (character.stats && character.stats[stat]) || 0;
}

function preferStatusOf(tgt) {
  if (!tgt) return null;
  if (tgt.preferStatus) return String(tgt.preferStatus).toLowerCase().replace(/-/g, '_');
  const select = String(tgt.select || '');
  if (/^prefer_status:/i.test(select)) return select.split(':')[1].toLowerCase().replace(/-/g, '_');
  return null;
}

function lowestStatOf(tgt) {
  const select = String((tgt && tgt.select) || '');
  const match = select.match(/^lowest:?(str|int|inst|init)$/i);
  return match ? match[1].toLowerCase() : null;
}

function wantsLeastTroops(tgt) {
  const select = String((tgt && tgt.select) || '').toLowerCase();
  return select === 'least_troops' || select === 'lowest_troops' || select === 'lowest:troops';
}

// tgt.hpAbove / hpBelow / hpAtLeast + preferStatus (Wild Hunt prioritize Prey).
// lowest:stat + least_troops (Vermithor Vengeful Fury / Bronze Bulwark).
export function applyTargetFilters(Battle) {
  if (Battle.prototype.__targetFiltersHook) return;
  Battle.prototype.__targetFiltersHook = true;
  const orig = Battle.prototype.resolveTargets;
  Battle.prototype.resolveTargets = function (character, habit, action) {
    const tgt = (action && action.tgt) || (habit && habit.targetingParsed);
    const prefer = preferStatusOf(tgt);
    let targets;
    if (prefer && action && action.tgt) {
      const filter = tgt.filter ? { ...tgt.filter } : {};
      delete filter.status;
      const patched = {
        ...action,
        tgt: {
          ...tgt,
          select: tgt.select === 'prey' || /^prefer_status:/i.test(String(tgt.select || '')) ? 'any' : tgt.select,
          count: 'all',
          filter
        }
      };
      targets = orig.call(this, character, habit, patched);
      targets = targets.slice().sort((a, b) => (hasStatus(b, prefer) ? 1 : 0) - (hasStatus(a, prefer) ? 1 : 0));
      const n = tgt.count == null || tgt.count === 'all' ? targets.length : Number(tgt.count);
      targets = targets.slice(0, n);
    } else {
      targets = orig.apply(this, arguments);
    }
    if (!tgt) return targets;
    if (tgt.hpAbove != null) {
      const floor = Number(tgt.hpAbove);
      targets = targets.filter(c => healthPct(c) > floor);
    }
    if (tgt.hpAtLeast != null) {
      const floor = Number(tgt.hpAtLeast);
      targets = targets.filter(c => healthPct(c) >= floor);
    }
    if (tgt.hpBelow != null) {
      const ceil = Number(tgt.hpBelow);
      targets = targets.filter(c => healthPct(c) < ceil);
    }
    const lowStat = lowestStatOf(tgt);
    if (lowStat && targets.length > 1) {
      targets = targets.slice().sort((a, b) => getStat(a, lowStat) - getStat(b, lowStat));
      const n = tgt.count == null || tgt.count === 'all' ? targets.length : Number(tgt.count);
      targets = targets.slice(0, n);
    }
    if (wantsLeastTroops(tgt) && targets.length > 1) {
      targets = targets.slice().sort((a, b) => {
        const diff = (Number(a.currentHealth) || 0) - (Number(b.currentHealth) || 0);
        if (diff) return diff;
        return (a.slotPosition || 0) - (b.slotPosition || 0);
      });
      const n = tgt.count == null || tgt.count === 'all' ? targets.length : Number(tgt.count);
      targets = targets.slice(0, n);
    }
    return targets;
  };
}
