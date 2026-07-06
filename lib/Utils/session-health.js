"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionHealthMonitor = exports.createSessionHealth = void 0;

/**
 * seraphbail — Session Health Monitor
 *
 * Tracks the lifetime stats of a single socket session: how long it's been
 * alive, how many times it reconnected, and the ratio of sent vs failed
 * messages. Exposes a single getHealth() snapshot for dashboards/logging.
 */
class SessionHealthMonitor {
  constructor() {
    this._startedAt = Date.now();
    this._reconnects = 0;
    this._sent = 0;
    this._failed = 0;
    this._lastError = null;
    this._lastReconnectAt = null;
  }

  recordReconnect(reason) {
    this._reconnects += 1;
    this._lastReconnectAt = Date.now();
    if (reason) this._lastError = reason;
  }

  recordSend(success, statusCode) {
    if (success) this._sent += 1;
    else {
      this._failed += 1;
      if (statusCode !== undefined) this._lastError = statusCode;
    }
  }

  /**
   * @returns {{uptimeMs:number, reconnects:number, sent:number, failed:number,
   *            successRate:number, status:'healthy'|'degraded'|'critical', lastError:*}}
   */
  getHealth() {
    const uptimeMs = Date.now() - this._startedAt;
    const total = this._sent + this._failed;
    const successRate = total > 0 ? this._sent / total : 1;

    // simple heuristic: frequent reconnects or low success rate = unhealthy
    const reconnectsPerHour = this._reconnects / Math.max(uptimeMs / 3600000, 1 / 60);
    let status = "healthy";
    if (successRate < 0.5 || reconnectsPerHour > 6) status = "critical";
    else if (successRate < 0.85 || reconnectsPerHour > 2) status = "degraded";

    return {
      uptimeMs,
      reconnects: this._reconnects,
      sent: this._sent,
      failed: this._failed,
      successRate: Number(successRate.toFixed(3)),
      status,
      lastError: this._lastError,
      lastReconnectAt: this._lastReconnectAt
    };
  }

  reset() {
    this._startedAt = Date.now();
    this._reconnects = 0;
    this._sent = 0;
    this._failed = 0;
    this._lastError = null;
    this._lastReconnectAt = null;
  }
}

const createSessionHealth = exports.createSessionHealth = () => new SessionHealthMonitor();
exports.SessionHealthMonitor = SessionHealthMonitor;
