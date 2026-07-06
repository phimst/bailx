"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartPresenceManager = exports.createPresenceManager = void 0;

/**
 * seraphbail — SmartPresenceManager
 *
 * Randomly switches presence between 'available' and 'unavailable' at natural
 * intervals to prevent WhatsApp from flagging idle connections.
 *
 * Usage:
 *   const pm = createPresenceManager(sock, { minOnlineMs: 3 * 60 * 1000 })
 *   // after connection opens:
 *   await pm.start()
 *   // on connection close:
 *   pm.stop()
 */
class SmartPresenceManager {
  /**
   * @param {object} sock        - makeWASocket instance
   * @param {object} [options]
   * @param {number} [options.minOnlineMs=5min]   min time to stay 'available'
   * @param {number} [options.maxOnlineMs=20min]  max time to stay 'available'
   * @param {number} [options.minOfflineMs=1min]  min time to stay 'unavailable'
   * @param {number} [options.maxOfflineMs=8min]  max time to stay 'unavailable'
   */
  constructor(sock, options = {}) {
    this.sock = sock;
    this.minOnlineMs  = options.minOnlineMs  ?? 5  * 60 * 1000;
    this.maxOnlineMs  = options.maxOnlineMs  ?? 20 * 60 * 1000;
    this.minOfflineMs = options.minOfflineMs ?? 1  * 60 * 1000;
    this.maxOfflineMs = options.maxOfflineMs ?? 8  * 60 * 1000;
    this._timer = null;
    this._active = false;
    this._state = null;
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

  _schedule() {
    if (!this._active) return;
    const isOnline = this._state === "available";
    const delay    = isOnline
      ? this._rand(this.minOfflineMs, this.maxOfflineMs)
      : this._rand(this.minOnlineMs,  this.maxOnlineMs);
    const next = isOnline ? "unavailable" : "available";
    this._timer = setTimeout(async () => {
      await this._set(next);
      this._schedule();
    }, delay);
  }

  /** Start manager. Call once connection is open. */
  async start() {
    if (this._active) return;
    this._active = true;
    await this._set("available");
    this._schedule();
  }

  /** Stop manager. Call on connection close/logout. */
  stop() {
    this._active = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /** Current presence state ('available' | 'unavailable' | null) */
  get currentState() {
    return this._state;
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
