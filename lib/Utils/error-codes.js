"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WA_DISCONNECT_CODES = exports.getDisconnectDescription = exports.isSafeToReconnect = exports.getReconnectDelay = void 0;

/**
 * seraphbail — WA disconnect code descriptions
 */
const WA_DISCONNECT_CODES = exports.WA_DISCONNECT_CODES = {
  400: "Bad Request — invalid stanza or message format",
  401: "Unauthorized — credentials rejected, please re-login",
  403: "Forbidden — account suspended or action blocked",
  405: "Connection Closed — server rejected connection unexpectedly (safe to reconnect)",
  408: "Connection Timed Out — no response from WhatsApp server",
  409: "Conflict — session replaced by another login",
  410: "Session Expired — please re-authenticate",
  411: "Client Outdated — WhatsApp version mismatch",
  428: "Precondition Required — connection reset by server (safe to reconnect)",
  429: "Rate Limited — too many requests, slow down",
  440: "Already Logged In — duplicate session",
  500: "Internal Server Error — issue on WhatsApp side",
  503: "Service Unavailable — WhatsApp server temporarily down",
};

/**
 * Returns a human-readable description for a WA disconnect status code.
 * @param {number} statusCode
 * @returns {string}
 */
const getDisconnectDescription = exports.getDisconnectDescription = (statusCode) => {
  return WA_DISCONNECT_CODES[statusCode] || `Unknown disconnect code: ${statusCode}`;
};

/**
 * Returns true if it is safe to reconnect after this status code.
 * @param {number} statusCode
 * @returns {boolean}
 */
const isSafeToReconnect = exports.isSafeToReconnect = (statusCode) => {
  const NO_RECONNECT = new Set([401, 403, 409, 410, 411, 440]);
  return !NO_RECONNECT.has(statusCode);
};

/**
 * Returns a suggested reconnect delay (ms) with exponential backoff + jitter.
 * @param {number} attempt  1-based attempt number
 * @param {number|null} statusCode  WA disconnect code
 * @returns {number}  delay in ms
 */
const getReconnectDelay = exports.getReconnectDelay = (attempt = 1, statusCode = null) => {
  // Rate-limited: always wait at least 60s
  if (statusCode === 429) {
    const base = 60000;
    const jitter = Math.floor(Math.random() * 10000);
    return base + jitter;
  }
  // Server error: longer base
  const baseMs = [500, 503].includes(statusCode) ? 5000 : 2000;
  const delay = Math.min(baseMs * Math.pow(2, attempt - 1), 60000);
  // ±20% jitter to avoid thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.max(500, Math.floor(delay + jitter));
};
