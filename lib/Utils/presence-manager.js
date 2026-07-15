"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartPresenceManager = exports.createPresenceManager = void 0;

/**
 * seraphbail — SmartPresenceManager
 *
 * Two modes:
 *
 * 'reactive' (default) — presence follows real activity. Idle by default,
 * flips to 'available' the moment an inbound message comes in, stays online
 * for a window (default 5 min) after the LAST activity, then goes back to
 * idle. This mirrors how a real person checks their phone: online because
 * something happened, not on a random clock. Call `notifyActivity()` on
 * every genuine inbound event to drive this (already wired automatically
 * inside makeWASocket for messages.upsert).
 *
 * 'cycle' — the older behavior: randomly flips available/unavailable on its
 * own timer, independent of real activity. Still available for anyone who
 * prefers it, and used automatically as a background fallback during long
 * idle stretches even in 'reactive' mode (so the account doesn't look
 * "permanently dead" for days), unless disabled.
 *
 * Usage:
 *   const pm = createPresenceManager(sock)
 *   await pm.start()
 *   // on inbound message: pm.notifyActivity()   (auto-wired already)
 *   // on connection close:
 *   pm.stop()
 */
class SmartPresenceManager {
  /**
   * @param {object} sock        - makeWASocket instance
   * @param {object} [options]
   * @param {'reactive'|'cycle'} [options.mode='reactive']
   * @param {number} [options.reactiveWindowMs=5min]  how long to stay 'available' after last activity (reactive mode)
   * @param {boolean} [options.idleFallback=true]     enable occasional background cycling during long idle stretches
   * @param {number} [options.idleFallbackAfterMs=30min] how long idle before fallback cycling kicks in
   * @param {number} [options.minOnlineMs=5min]   min time to stay 'available' (cycle mode / idle fallback)
   * @param {number} [options.maxOnlineMs=20min]  max time to stay 'available' (cycle mode / idle fallback)
   * @param {number} [options.minOfflineMs=1min]  min time to stay 'unavailable' (cycle mode / idle fallback)
   * @param {number} [options.maxOfflineMs=8min]  max time to stay 'unavailable' (cycle mode / idle fallback)
   */
  constructor(sock, options = {}) {
    this.sock = sock;
    this.mode = options.mode ?? "reactive";
    this.reactiveWindowMs = options.reactiveWindowMs ?? 5 * 60 * 1000;
    this.idleFallback = options.idleFallback ?? true;
    this.idleFallbackAfterMs = options.idleFallbackAfterMs ?? 30 * 60 * 1000;

    this.minOnlineMs  = options.minOnlineMs  ?? 5  * 60 * 1000;
    this.maxOnlineMs  = options.maxOnlineMs  ?? 20 * 60 * 1000;
    this.minOfflineMs = options.minOfflineMs ?? 1  * 60 * 1000;
    this.maxOfflineMs = options.maxOfflineMs ?? 8  * 60 * 1000;

    this._timer = null;          // cycle-mode / idle-fallback timer
    this._reactiveTimer = null;  // reactive window timer
    this._idleWatchTimer = null; // watches for "been idle long enough, start fallback cycling"
    this._active = false;
    this._state = null;
    this._lastActivityAt = null;
  }

  _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async _set(state) {
    try {
      await this.sock.sendPresenceUpdate(state);
      this._state = state;
    } catch (_) {
      // silent — connection may not be ready yet
    }
  }

  // --- cycle mode / idle fallback (random on/off loop) ---------------------
  _scheduleCycle() {
    if (!this._active) return;
    const isOnline = this._state === "available";
    const delay = isOnline
      ? this._rand(this.minOfflineMs, this.maxOfflineMs)
      : this._rand(this.minOnlineMs, this.maxOnlineMs);
    const next = isOnline ? "unavailable" : "available";
    this._timer = setTimeout(async () => {
      await this._set(next);
      this._scheduleCycle();
    }, delay);
  }

  _clearCycle() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  // --- reactive mode ---------------------------------------------------------
  _armIdleWatch() {
    if (!this.idleFallback || this.mode !== "reactive") return;
    if (this._idleWatchTimer) clearTimeout(this._idleWatchTimer);
    this._idleWatchTimer = setTimeout(() => {
      // been idle for a long stretch — hand off to gentle background cycling
      // so the account doesn't look permanently offline for days on end.
      this._scheduleCycle();
    }, this.idleFallbackAfterMs);
  }

  /**
   * Call this on every genuine inbound activity (e.g. a real message from
   * someone else). Flips presence to 'available' if needed and (re)starts
   * the reactive window — already wired automatically for messages.upsert.
   */
  notifyActivity() {
    if (!this._active || this.mode !== "reactive") return;
    this._lastActivityAt = Date.now();

    // activity means we're no longer "idle" — cancel any fallback cycling
    this._clearCycle();
    if (this._idleWatchTimer) {
      clearTimeout(this._idleWatchTimer);
      this._idleWatchTimer = null;
    }

    if (this._state !== "available") {
      this._set("available");
    }

    if (this._reactiveTimer) clearTimeout(this._reactiveTimer);
    this._reactiveTimer = setTimeout(async () => {
      await this._set("unavailable");
      this._armIdleWatch();
    }, this.reactiveWindowMs);
  }

  /** Start manager. Call once connection is open. */
  async start() {
    if (this._active) return;
    this._active = true;

    if (this.mode === "reactive") {
      // reactive-first: start idle, only go online in response to real activity
      this._state = "unavailable";
      await this._set("unavailable");
      this._armIdleWatch();
    } else {
      await this._set("available");
      this._scheduleCycle();
    }
  }

  /** Stop manager. Call on connection close/logout. */
  stop() {
    this._active = false;
    this._clearCycle();
    if (this._reactiveTimer) {
      clearTimeout(this._reactiveTimer);
      this._reactiveTimer = null;
    }
    if (this._idleWatchTimer) {
      clearTimeout(this._idleWatchTimer);
      this._idleWatchTimer = null;
    }
  }

  /** Current presence state ('available' | 'unavailable' | null) */
  get currentState() {
    return this._state;
  }

  /** ms since last recorded activity, or null if none yet */
  get idleForMs() {
    return this._lastActivityAt ? Date.now() - this._lastActivityAt : null;
  }
}

/**
 * Factory shorthand.
 * @param {object} sock
 * @param {object} [options]
 * @returns {SmartPresenceManager}
 */
const createPresenceManager = exports.createPresenceManager = (sock, options) =>
  new SmartPresenceManager(sock, options);

exports.SmartPresenceManager = SmartPresenceManager;
