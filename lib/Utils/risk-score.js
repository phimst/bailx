"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.ReachoutRiskScore = exports.createRiskScore = void 0;

/**
 * seraphbail — Reachout Risk Score
 *
 * Tracks outgoing message patterns (frequency, gaps, group vs personal ratio)
 * in a rolling time window, and produces a proactive risk level so the
 * developer can react BEFORE WhatsApp issues a 463 (reachout timelock),
 * instead of only finding out after the fact.
 *
 * This is purely observational — it never blocks or delays sends itself.
 * Pair it with AdaptiveSendThrottle if you want automatic delay adjustment.
 */
class ReachoutRiskScore {
  /**
   * @param {object} [options]
   * @param {number} [options.windowMs=10min]      rolling window for stats
   * @param {number} [options.maxEvents=500]        cap on stored events (memory safety)
   */
  constructor(options = {}) {
    this.windowMs = options.windowMs ?? 10 * 60 * 1000;
    this.maxEvents = options.maxEvents ?? 500;
    this._events = []; // { ts, isGroup, success }
  }

  _prune(now) {
    const cutoff = now - this.windowMs;
    while (this._events.length && this._events[0].ts < cutoff) {
      this._events.shift();
    }
    if (this._events.length > this.maxEvents) {
      this._events.splice(0, this._events.length - this.maxEvents);
    }
  }

  /**
   * Record an outgoing send attempt.
   * @param {object} info
   * @param {boolean} info.isGroup
   * @param {boolean} [info.success=true]
   */
  recordSend({ isGroup = false, success = true } = {}) {
    const now = Date.now();
    this._events.push({ ts: now, isGroup: !!isGroup, success: !!success });
    this._prune(now);
  }

  /**
   * Compute current risk metrics & level.
   * @returns {{level: 'low'|'medium'|'high', score: number, metrics: object}}
   */
  getScore() {
    const now = Date.now();
    this._prune(now);

    const n = this._events.length;
    if (n === 0) {
      return { level: "low", score: 0, metrics: { messagesInWindow: 0, perMinute: 0, groupRatio: 0, avgGapMs: null, failureRate: 0 } };
    }

    const windowMinutes = this.windowMs / 60000;
    const perMinute = n / windowMinutes;
    const groupCount = this._events.filter(e => e.isGroup).length;
    const groupRatio = groupCount / n;
    const failures = this._events.filter(e => !e.success).length;
    const failureRate = failures / n;

    let avgGapMs = null;
    if (n > 1) {
      let totalGap = 0;
      for (let i = 1; i < n; i++) totalGap += this._events[i].ts - this._events[i - 1].ts;
      avgGapMs = totalGap / (n - 1);
    }

    // --- scoring heuristic (0-100, higher = riskier) ---
    let score = 0;
    // volume: >20 msgs/min in window is aggressive for a personal-style account
    score += Math.min(40, perMinute * 4);
    // burstiness: very short avg gaps look robotic
    if (avgGapMs !== null) {
      if (avgGapMs < 1000) score += 25;
      else if (avgGapMs < 3000) score += 12;
    }
    // group-heavy fanout is riskier than 1:1 conversation
    score += groupRatio * 20;
    // recent failures are a strong signal something's already wrong
    score += failureRate * 30;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";

    return {
      level,
      score,
      metrics: {
        messagesInWindow: n,
        perMinute: Number(perMinute.toFixed(2)),
        groupRatio: Number(groupRatio.toFixed(2)),
        avgGapMs: avgGapMs !== null ? Math.round(avgGapMs) : null,
        failureRate: Number(failureRate.toFixed(2))
      }
    };
  }

  reset() {
    this._events = [];
  }
}

const createRiskScore = exports.createRiskScore = (options) => new ReachoutRiskScore(options);
exports.ReachoutRiskScore = ReachoutRiskScore;
