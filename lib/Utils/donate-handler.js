"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.attachDonateCommand = void 0;

const fs = require("fs");
const path = require("path");

const CANDIDATE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

/**
 * Looks for a file named "donasi.<ext>" in the host project's root
 * (process.cwd()), or at an explicit override path if provided.
 * @param {string} [overridePath]
 * @returns {string|null} resolved file path, or null if not found
 */
const resolveDonateImagePath = overridePath => {
  if (overridePath) {
    return fs.existsSync(overridePath) ? overridePath : null;
  }
  for (const ext of CANDIDATE_EXTS) {
    const p = path.join(process.cwd(), `donasi${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

/**
 * seraphbail — Donate command
 *
 * Opt-in easter egg: when a contact sends the configured trigger command
 * (default ".seraphdonate"), the bot replies with a QR/image found at
 * "donasi.<ext>" in the host project root, plus a short caption.
 *
 * Disabled by default — enable explicitly via socket config:
 *   makeWASocket({ enableDonateCommand: true })
 *
 * @param {object} sock     the fully assembled seraphbail socket
 * @param {object} config   resolved socket config
 * @param {object} [logger] optional logger (falls back to console)
 */
const attachDonateCommand = (sock, config, logger) => {
  if (!config.enableDonateCommand) return;

  const trigger = (config.donateCommand || ".seraphdonate").toLowerCase();
  const caption = config.donateCaption || "☕ If seraphbail has been useful to you, consider supporting development. Thank you! 🙏";
  const log = logger || console;

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase();
        if (text !== trigger) continue;

        const imagePath = resolveDonateImagePath(config.donateImagePath);
        if (!imagePath) {
          log.warn?.("[seraphbail] .seraphdonate triggered but no donasi.(png|jpg|jpeg|webp) found in project root");
          continue;
        }
        await sock.sendMessage(msg.key.remoteJid, {
          image: fs.readFileSync(imagePath),
          caption
        }, { quoted: msg });
      } catch (err) {
        log.warn?.({ err }, "[seraphbail] donate command failed");
      }
    }
  });
};

exports.attachDonateCommand = attachDonateCommand;
