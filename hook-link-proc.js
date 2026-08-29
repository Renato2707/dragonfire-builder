// dealDamage notifies on_link_proc before the caller logs "Deals …", so the
// formatter attributes that hit to Crescent Blade (or any link watcher).
// Defer tactical link procs until after the Deals line.
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

  const origLog = Battle.prototype.logAction;
  Battle.prototype.logAction = function (message) {
    const result = origLog.apply(this, arguments);
    if (/^\s*Deals /.test(String(message || ''))) this._flushLinkProc();
    return result;
  };

  const origDeal = Battle.prototype.dealDamage;
  Battle.prototype.dealDamage = function (target, amount, info = {}) {
    const prev = this._deferLinkProc;
    this._deferLinkProc = true;
    try {
      return origDeal.apply(this, arguments);
    } finally {
      this._deferLinkProc = prev;
    }
  };

  const origAct = Battle.prototype.executeCharacterAction;
  Battle.prototype.executeCharacterAction = function (character) {
    try {
      return origAct.apply(this, arguments);
    } finally {
      this._flushLinkProc();
    }
  };
}
