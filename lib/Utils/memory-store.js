"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryStore = exports.createInMemoryStore = exports.makeInMemoryStore = void 0;

const fs = require("fs");

/**
 * seraphbail — makeInMemoryStore compatibility shim
 *
 * Official Baileys dropped `makeInMemoryStore` since v6.6+ — it's now on
 * developers to bring their own store. A lot of community bot scripts still
 * call `makeInMemoryStore({ logger })` though, so this shim brings that API
 * back (same shape: chats/contacts/messages, `.bind(ev)`, `.loadMessage()`)
 * while internally using the modern event-listener pattern under the hood.
 *
 * Old scripts keep working as-is. If you'd rather roll your own store
 * (Redis, SQLite, whatever), just don't use this — pass your own
 * `getMessage` into makeWASocket() instead, nothing in seraphbail requires
 * this shim to function.
 *
 * Usage (same as classic Baileys):
 *   const store = makeInMemoryStore({ logger })
 *   store.bind(sock.ev)
 *
 *   const sock = makeWASocket({
 *     auth: state,
 *     getMessage: async (key) => store.loadMessage(key.remoteJid, key.id)?.message
 *   })
 */
class InMemoryStore {
  /**
   * @param {object} [options]
   * @param {object} [options.logger]  optional logger (falls back to console, silent by default)
   * @param {number} [options.maxMessagesPerChat=200]  cap stored messages per chat, oldest dropped first
   */
  constructor(options = {}) {
    this.logger = options.logger || { info() {}, warn() {}, error() {}, debug() {} };
    this.maxMessagesPerChat = options.maxMessagesPerChat ?? 200;

    this.chats = new Map();
    this.contacts = new Map();
    this.messages = new Map(); // Map<jid, Map<messageId, message>>
    this.groupMetadata = new Map();

    this._bound = false;
  }

  // --- internal helpers ------------------------------------------------------
  _saveMessage(msg) {
    if (!msg?.key?.remoteJid || !msg?.key?.id) return;
    const jid = msg.key.remoteJid;
    if (!this.messages.has(jid)) this.messages.set(jid, new Map());
    const bucket = this.messages.get(jid);
    bucket.set(msg.key.id, msg);

    // cap per-chat memory growth — drop oldest when over the limit
    if (bucket.size > this.maxMessagesPerChat) {
      const oldestKey = bucket.keys().next().value;
      bucket.delete(oldestKey);
    }
  }

  _updateMessage(update) {
    const jid = update.key?.remoteJid;
    const id = update.key?.id;
    if (!jid || !id) return;
    const bucket = this.messages.get(jid);
    const existing = bucket?.get(id);
    if (existing) {
      bucket.set(id, { ...existing, ...update.update });
    }
  }

  _deleteMessage(key) {
    const bucket = this.messages.get(key.remoteJid);
    bucket?.delete(key.id);
  }

  // --- public API --------------------------------------------------------
  /**
   * Wire this store up to a socket's event emitter. Call once, right after
   * makeWASocket().
   * @param {import('events').EventEmitter} ev  sock.ev
   */
  bind(ev) {
    if (this._bound) return;
    this._bound = true;

    ev.on("messaging-history.set", ({ chats, contacts, messages }) => {
      chats?.forEach(c => this.chats.set(c.id, c));
      contacts?.forEach(c => this.contacts.set(c.id, c));
      messages?.forEach(m => this._saveMessage(m));
    });

    ev.on("chats.upsert", chats => {
      chats.forEach(c => this.chats.set(c.id, c));
    });

    ev.on("chats.update", updates => {
      updates.forEach(u => {
        const existing = this.chats.get(u.id) || { id: u.id };
        this.chats.set(u.id, { ...existing, ...u });
      });
    });

    ev.on("chats.delete", ids => {
      ids.forEach(id => this.chats.delete(id));
    });

    ev.on("contacts.upsert", contacts => {
      contacts.forEach(c => this.contacts.set(c.id, c));
    });

    ev.on("contacts.update", updates => {
      updates.forEach(u => {
        const existing = this.contacts.get(u.id) || { id: u.id };
        this.contacts.set(u.id, { ...existing, ...u });
      });
    });

    ev.on("messages.upsert", ({ messages }) => {
      messages.forEach(m => this._saveMessage(m));
    });

    ev.on("messages.update", updates => {
      updates.forEach(u => this._updateMessage(u));
    });

    ev.on("messages.delete", item => {
      if (Array.isArray(item?.keys)) {
        item.keys.forEach(k => this._deleteMessage(k));
      }
    });

    ev.on("groups.update", updates => {
      updates.forEach(u => {
        const existing = this.groupMetadata.get(u.id) || { id: u.id };
        this.groupMetadata.set(u.id, { ...existing, ...u });
      });
    });
  }

  /**
   * Load a single stored message by chat JID + message id. Most commonly
   * used to implement `getMessage` for retry/quote resolution.
   * @param {string} jid
   * @param {string} id
   * @returns {object|undefined}
   */
  loadMessage(jid, id) {
    return this.messages.get(jid)?.get(id);
  }

  /** All messages stored for a given chat, oldest to newest. */
  loadMessagesForChat(jid) {
    const bucket = this.messages.get(jid);
    return bucket ? Array.from(bucket.values()) : [];
  }

  /** Serialize the whole store to a plain JSON-friendly object. */
  toJSON() {
    const mapToObj = m => Object.fromEntries(m);
    return {
      chats: mapToObj(this.chats),
      contacts: mapToObj(this.contacts),
      groupMetadata: mapToObj(this.groupMetadata),
      messages: Object.fromEntries(
        Array.from(this.messages.entries()).map(([jid, bucket]) => [jid, mapToObj(bucket)])
      )
    };
  }

  /** Restore store state from a previously-serialized toJSON() object. */
  fromJSON(data) {
    if (data.chats) this.chats = new Map(Object.entries(data.chats));
    if (data.contacts) this.contacts = new Map(Object.entries(data.contacts));
    if (data.groupMetadata) this.groupMetadata = new Map(Object.entries(data.groupMetadata));
    if (data.messages) {
      this.messages = new Map(
        Object.entries(data.messages).map(([jid, bucket]) => [jid, new Map(Object.entries(bucket))])
      );
    }
  }

  /** Persist the store to a JSON file on disk. */
  writeToFile(filePath) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(this.toJSON()));
    } catch (err) {
      this.logger.warn?.({ err }, "[seraphbail] store.writeToFile failed");
    }
  }

  /** Load store state from a JSON file previously written by writeToFile(). */
  readFromFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return;
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      this.fromJSON(data);
    } catch (err) {
      this.logger.warn?.({ err }, "[seraphbail] store.readFromFile failed");
    }
  }
}

/**
 * Factory — matches the classic Baileys `makeInMemoryStore(options)` call
 * shape so old scripts work unmodified.
 * @param {object} [options]
 * @returns {InMemoryStore}
 */
const makeInMemoryStore = exports.makeInMemoryStore = (options) => new InMemoryStore(options);

// Alias for anyone who prefers the newer naming convention.
const createInMemoryStore = exports.createInMemoryStore = makeInMemoryStore;

exports.InMemoryStore = InMemoryStore;
