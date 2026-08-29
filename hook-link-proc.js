// dealDamage notifies on_link_proc before the caller logs "Deals …".
// Defer tactical procs until after that Deals line, without scanning log text.
export function applyLinkProcOrder(Battle) {
  if (Battle.prototype.__linkProcOrderHook) return;
  Battle.prototype.__linkProcOrderHook = true;

  const origNotify = Battle.prototype.notifyLinkProc;
  Battle.prototype.notifyLinkProc = function (source, event) {
    if (event === 'tactical' && this._deferLinkProc) {
      if (!this._pendingLinkProc) this._pendingLinkProc = [];
      this._pendingLinkProc.push([source, event]);
      return;
    }
    return origNotify.call(this, source, event);
  };

  Battle.prototype._flushLinkProc = function () {
    const pending = this._pendingLinkProc;
    if (!pending || !pending.length) return;
    this._pendingLinkProc = [];
    for (const [source, event] of pending) origNotify.call(this, source, event);
  };

  function withDeferredTactical(battle, fn) {
    const prev = battle._deferLinkProc;
    battle._deferLinkProc = true;
    try {
      const result = fn();
      battle._flushLinkProc();
      return result;
    } finally {
      battle._deferLinkProc = prev;
    }
  }

  const origDeal = Battle.prototype.dealDamage;
  Battle.prototype.dealDamage = function () {
    if (this._deferLinkProc) return origDeal.apply(this, arguments);
    return withDeferredTactical(this, () => origDeal.apply(this, arguments));
  };

  const origLogResult = Battle.prototype.logActionResult;
  Battle.prototype.logActionResult = function (character, habit, raw) {
    if (raw && raw.t === 'dmg') {
      return withDeferredTactical(this, () => origLogResult.apply(this, arguments));
    }
    return origLogResult.apply(this, arguments);
  };

  const origBasic = Battle.prototype.executeBasicAttack;
  Battle.prototype.executeBasicAttack = function () {
    return withDeferredTactical(this, () => origBasic.apply(this, arguments));
  };

  const origAct = Battle.prototype.executeCharacterAction;
  Battle.prototype.executeCharacterAction = function () {
    try {
      return origAct.apply(this, arguments);
    } finally {
      this._flushLinkProc();
    }
  };
}
