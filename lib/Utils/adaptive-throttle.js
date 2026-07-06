"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveSendThrottle = exports.createAdaptiveThrottle = void 0;

/**
 * seraphbail — Adaptive Send Throttle
 *
 * Auto-adjusts the delay applied before each send based on the account's
 * OWN recent error/warning history — not a hardcoded fixed delay. The more
 * errors/warnings seen recently, the more it slows down; a clean recent
 * history lets it ease back toward the configured base delay.
 *
 * Designed to be combined with ReachoutRiskScore: pass a risk level in to
 * weight the delay further, or use standalone from error codes alone.
 */
class AdaptiveSendThrottle {
  /**
   * @param {object} [options]
   * @param {number} [options.baseDelayMs=400]     floor delay between sends when healthy
   * @param {number} [options.maxDelayMs=15000]    ceiling delay when under heavy strain
   * @param {number} [options.windowMs=5min]       rolling window for error history
   */
  constructor(options = {}) {
    this.baseDelayMs = options.baseDelayMs ?? 400;
    this.maxDelayMs = options.maxDelayMs ?? 15000;
    this.windowMs = options.windowMs ?? 5 * 60 * 1000;
    this._history = []; // { ts, success, statusCode }
  }

  _prune(now) {
    const cutoff = now - this.windowMs;
    while (this._history.length && this._history[0].ts < cutoff) {
      this._history.shift();
    }
  }

  /**
   * Record the result of a send attempt.
   * @param {object} info
   * @param {boolean} info.success
   * @param {number} [info.statusCode]
   */
  recordResult({ success, statusCode } = {}) {
    const now = Date.now();
    this._history.push({ ts: now, success: !!success, statusCode });
    this._prune(now);
  }

  /**
   * Compute the recommended delay (ms) to wait before the NEXT send,
   * optionally weighted by an external risk level from ReachoutRiskScore.
   * @param {'low'|'medium'|'high'} [riskLevel]
   * @returns {number} delay in ms
   */
  getDelay(riskLevel) {
    const now = Date.now();
    this._prune(now);

    const n = this._history.length;
    let delay = this.baseDelayMs;

    // rate-limit (429) is a server-mandated cooldown — it overrides the
    // normal ceiling, since respecting it matters more than staying under
    // maxDelayMs.
    const rateLimited = this._history.some(h => h.statusCode === 429);
    if (rateLimited) {
      return Math.max(60000, this.maxDelayMs);
    }

    if (n > 0) {
      const failures = this._history.filter(h => !h.success).length;
      const failureRate = failures / n;
      // each 10% recent failure rate roughly doubles delay, capped at ceiling
      const multiplier = 1 + failureRate * 9; // 0% -> x1, 100% -> x10
      delay = this.baseDelayMs * multiplier;
    }

    if (riskLevel === "medium") delay *= 1.5;
    else if (riskLevel === "high") delay *= 3;

    return Math.round(Math.max(this.baseDelayMs, Math.min(this.maxDelayMs, delay)));
  }

  /** Convenience: await this before sending. */
  async wait(riskLevel) {
    const ms = this.getDelay(riskLevel);
    await new Promise(r => setTimeout(r, ms));
    return ms;
  }

  reset() {
    this._history = [];
  }
}

const createAdaptiveThrottle = exports.createAdaptiveThrottle = (options) => new AdaptiveSendThrottle(options);
exports.AdaptiveSendThrottle = AdaptiveSendThrottle;
