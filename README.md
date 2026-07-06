# seraphbail

> CommonJS WhatsApp Web API library — CJS conversion of official [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) v7.0.0-rc13, with an added anti-ban toolkit.

---

## ⚠️ v2.0.0 — Base Changed
change to the official baileys base which is in v convert to commonJS
---

## Install

```bash
npm i seraphbail
```

A postinstall script automatically patches a known `whatsapp-rust-bridge` CJS export issue — no manual steps needed.

---

## What's Included

| Feature | Status |
|---|---|
| Full CommonJS (official Baileys is ESM-only) | ✅ |
| WhatsApp Business support (catalog, profile, orders) | ✅ (inherited from upstream) |
| Custom pairing code support | ✅ (inherited, 8-char, verified clean) |
| Smart Presence Manager | ✅ |
| Auto-retry on failed send | ✅ |
| Better WA disconnect error messages | ✅ |
| `suggestedReconnectMs` on connection close | ✅ |
| Memory leak fix on device cache | ✅ |
| Album message helper | ✅ |
| Reachout Risk Score | ✅ |
| Adaptive Send Throttle | ✅ |
| Session Health Monitor | ✅ |
| `.seraphdonate` easter egg command | ✅ (opt-in) |
| Auto-patched `whatsapp-rust-bridge` install | ✅ |

---

## A note on account bans

The features below are designed to reduce the *risk* of WhatsApp's automated behavioral detection flagging your account — they cannot make an account immune to it. Restrictions (soft bans) are enforced server-side based on send patterns, volume, and account trust signals; no client library can guarantee avoidance if usage is aggressive. Use the risk score and throttle as guardrails, not guarantees.

---

## Anti-Ban Toolkit

These three modules work together automatically once you connect — no setup required, though each is also exported standalone if you want to build your own logic on top.

### Reachout Risk Score
Tracks your account's own send pattern in a rolling window (frequency, group vs personal ratio, burst gaps) and produces a `low` / `medium` / `high` risk level — proactively, before WhatsApp issues a 463 restriction.

```js
sock.getRiskScore()
// { level: 'medium', score: 42, metrics: { messagesInWindow: 18, perMinute: 3.2, groupRatio: 0.6, avgGapMs: 4200, failureRate: 0 } }
```

### Adaptive Send Throttle
Automatically applied inside `sock.sendMessage()`. Slows down based on your account's own recent error history — not a hardcoded delay. A clean history eases back toward a fast base delay; recent failures or a 429 push it up (429 enforces a hard 60s+ cooldown).

```js
sock.getAdaptiveDelay() // current recommended delay in ms
// disable auto-throttling if you want to manage pacing yourself:
makeWASocket({ enableAdaptiveThrottle: false })
```

### Session Health Monitor
```js
sock.getSessionHealth()
// { uptimeMs: 1823000, reconnects: 1, sent: 140, failed: 2, successRate: 0.986, status: 'healthy', lastError: 405 }
```

---

## Album Message

```js
await sock.sendAlbumMessage(jid, [
  { image: { url: './foto1.jpg' } },
  { image: { url: './foto2.jpg' } },
  { video: { url: './video1.mp4' } }
])
```
Sends a linked album (min. 2 items) with a small natural delay between items to avoid a burst-send pattern.

---

## `.seraphdonate` (opt-in)

Disabled by default. When enabled, replying with the trigger command sends back a QR/image found at `donasi.<png|jpg|jpeg|webp>` in your project root.

```js
makeWASocket({
  enableDonateCommand: true,
  donateCommand: '.seraphdonate',   // optional, this is the default
  donateCaption: 'Support seraphbail! ☕'
})
```

---

## Smart Presence Manager

```js
const { createPresenceManager } = require('seraphbail')

sock.ev.on('connection.update', async ({ connection }) => {
  if (connection === 'open') {
    const pm = createPresenceManager(sock)
    await pm.start()   // cycles available ↔ unavailable naturally
    sock.ev.once('connection.update', ({ connection }) => {
      if (connection === 'close') pm.stop()
    })
  }
})
```

---

## Smarter Reconnect & Errors

```js
const { isSafeToReconnect, getDisconnectDescription } = require('seraphbail')

sock.ev.on('connection.update', ({ connection, lastDisconnect, suggestedReconnectMs }) => {
  if (connection === 'close') {
    const code = lastDisconnect?.error?.output?.statusCode
    console.log(getDisconnectDescription(code))
    if (isSafeToReconnect(code)) {
      setTimeout(() => startSock(), suggestedReconnectMs ?? 3000)
    }
  }
})
```

---

## WhatsApp Business

Inherited from official Baileys — connect a Business account the same way as a regular one via `makeWASocket`. Catalog/profile features only work if the connected number is genuinely a WhatsApp Business account.

```js
const profile = await sock.getBusinessProfile(jid)
const catalog = await sock.getCatalog({ jid })
await sock.productCreate({ name: 'Produk A', price: 50000, currency: 'IDR' })
```

---

## Credits

Built on [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) — full credit to the original maintainers and contributors for the underlying protocol implementation. seraphbail's contribution is the CommonJS conversion and the anti-ban toolkit layered on top.

 Join [Telegram!](https://t.me/flathK) for more information!

---

## License

MIT
