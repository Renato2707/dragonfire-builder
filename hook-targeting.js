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

function preferStatusOf(tgt) {
  if (!tgt) return null;
  if (tgt.preferStatus) return String(tgt.preferStatus).toLowerCase().replace(/-/g, '_');
  const select = String(tgt.select || '');
  if (/^prefer_status:/i.test(select)) return select.split(':')[1].toLowerCase().replace(/-/g, '_');
  return null;
}

// tgt.hpAbove / hpBelow / hpAtLeast + preferStatus (Wild Hunt prioritize Prey).
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
    return targets;
  };
}
