# seraphbail

CommonJS WhatsApp library, base-nya langsung dari [official Baileys](https://github.com/WhiskeySockets/Baileys) v7 (bukan fork abal-abal), plus toolkit anti-banned yang lumayan niat digarapnya. Buat lo yang komunitasnya masih setia sama `require()` dan males migrasi ke ESM, ini rumah lo.

---

## 📦 Install

```bash
npm i seraphbail
```

Udah termasuk postinstall script yang otomatis benerin bug CJS export di `whatsapp-rust-bridge`. Gak perlu ngoprek manual, tinggal install aja beres.

---

## 🆕 Apa yang baru di v2.1.0
- **Reactive Presence Manager** — akun sekarang idle secara default, baru "online" pas ada yang chat beneran, terus balik idle abis 5 menit sepi. Gak online 24 jam nonstop kayak robot, tapi juga gak ngaruh ke kecepatan bales chat
- **`makeInMemoryStore` balik lagi** — yang lama sering nyari-nyari fitur ini abis Baileys resmi buang dia dari core, sekarang kita bikinin shim-nya biar script lama lo tetep jalan tanpa refactor
- **Anti-ban toolkit** (Risk Score, Adaptive Throttle, Session Health) — auto nempel begitu lo connect, gak perlu setup apa-apa
- **Album message helper** — kirim beberapa foto/video sekaligus dalam satu bundel
- **`.seraphdonate`** — easter egg command opsional buat nerima donasi lewat QR

---

## 🎯 Fitur-fitur

### Reactive Presence Manager (otomatis, gak perlu setup)

Defaultnya nyala otomatis. Behaviornya:

```
Idle (default)
  → ada chat masuk beneran → langsung "online"
  → sepi 5 menit → balik idle lagi
```

Kalo idle-nya kelamaan (30 menit+), ada fallback cycling pelan di background biar akun gak keliatan "mati" berhari-hari. Mau matiin atau custom durasinya?

```js
const sock = makeWASocket({
  enablePresenceManager: true, // default udah true, bisa di-false-in
  presenceManagerOptions: {
    reactiveWindowMs: 5 * 60 * 1000, // berapa lama online setelah chat terakhir
    idleFallback: true,
    idleFallbackAfterMs: 30 * 60 * 1000
  }
})

// Mau akses manual juga bisa
sock.presenceManager.currentState  // 'available' | 'unavailable'
sock.presenceManager.idleForMs     // udah berapa lama sepi
```

---

### `makeInMemoryStore` — buat yang script-nya masih lama

Baileys resmi udah buang fitur ini dari core sejak v6.6+, tapi kalo komunitas lo masih pake pattern lama, tenang aja, kita bikinin lagi:

```js
const { makeInMemoryStore } = require('seraphbail')

const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) })
store.bind(sock.ev)

const sock = makeWASocket({
  auth: state,
  getMessage: async (key) => {
    return store.loadMessage(key.remoteJid, key.id)?.message
  }
})
```

Bisa juga persist ke file kalo mau data-nya nyangkut abis restart:

```js
store.writeToFile('./store.json')       // save
store.readFromFile('./store.json')      // restore
```

**Gak mau pake ini?** Santai, ini full opsional. Bikin store custom sendiri (Redis, SQLite, whatever) juga bisa, tinggal kasih fungsi `getMessage` sendiri ke `makeWASocket()`, gak ada dependency wajib ke shim ini.

---

### Anti-Ban Toolkit (otomatis nempel)

Tiga modul ini jalan sendiri begitu lo connect, gak perlu config apapun. Tapi kalo mau bikin logic sendiri di atasnya, semua bisa diakses manual juga.

**Reachout Risk Score** — ngitung pola kirim pesan lo (frekuensi, rasio grup vs personal, jarak antar pesan) dan kasih level `low` / `medium` / `high` SEBELUM WA nge-flag akun lo, bukan pas udah kena.

```js
sock.getRiskScore()
// { level: 'medium', score: 42, metrics: { messagesInWindow: 18, perMinute: 3.2, groupRatio: 0.6, avgGapMs: 4200, failureRate: 0 } }
```

**Adaptive Send Throttle** — otomatis nge-slow down kirim pesan berdasarkan history error akun lo sendiri, bukan delay hardcode. Kalo baru-baru ini banyak gagal atau kena 429, otomatis lebih santai ngirimnya.

```js
sock.getAdaptiveDelay() // delay yang lagi direkomendasiin, dalam ms
makeWASocket({ enableAdaptiveThrottle: false }) // matiin kalo mau atur sendiri
```

**Session Health Monitor**
```js
sock.getSessionHealth()
// { uptimeMs: 1823000, reconnects: 1, sent: 140, failed: 2, successRate: 0.986, status: 'healthy', lastError: 405 }
```

> Jujur nih bro: fitur-fitur ini ngurangin RESIKO kena banned, bukan bikin akun kebal. WA nge-ban berdasarkan pola perilaku dari server side, gak ada library yang bisa jamin 100% aman kalo lo emang spam berlebihan. Anggep ini pagar pengaman, bukan jaminan.

---

### Kirim Album (banyak foto/video sekaligus)

```js
await sock.sendAlbumMessage(jid, [
  { image: { url: './foto1.jpg' } },
  { image: { url: './foto2.jpg' } },
  { video: { url: './video1.mp4' } }
])
```

Minimal 2 item, otomatis ada jeda natural antar kiriman biar gak keliatan burst-send.

---

### `.seraphdonate` (opsional)

Default mati. Kalo diaktifin, orang yang ngetik command ini bakal dikirimin gambar QR/donasi yang lo taro di root project (`donasi.png` / `.jpg` / `.jpeg` / `.webp`).

```js
makeWASocket({
  enableDonateCommand: true,
  donateCommand: '.seraphdonate', // opsional, ini default-nya
  donateCaption: 'Mampir sini kalo mau traktir kopi ☕'
})
```

---

### Reconnect & Error yang Lebih Manusiawi

```js
const { isSafeToReconnect, getDisconnectDescription } = require('seraphbail')

sock.ev.on('connection.update', ({ connection, lastDisconnect, suggestedReconnectMs }) => {
  if (connection === 'close') {
    const code = lastDisconnect?.error?.output?.statusCode
    console.log(getDisconnectDescription(code)) // deskripsi human-readable, bukan cuma angka
    if (isSafeToReconnect(code)) {
      setTimeout(() => startSock(), suggestedReconnectMs ?? 3000)
    }
  }
})
```

---

### WhatsApp Business

Ikutan dari base official, connect-nya sama kayak akun biasa. Fitur catalog/profile cuma jalan kalo nomornya beneran akun WA Business.

```js
const profile = await sock.getBusinessProfile(jid)
const catalog = await sock.getCatalog({ jid })
await sock.productCreate({ name: 'Produk A', price: 50000, currency: 'IDR' })
```

---

## 🚀 Quick Start (Pairing Code)

```js
const { makeWASocket, useMultiFileAuthState, DisconnectReason,
        fetchLatestBaileysVersion, getDisconnectDescription, Browsers } = require('seraphbail')
const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise(res => rl.question(text, res))

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false
  })

  if (!state.creds.registered) {
    const number = await question('Nomor WA (628xxx): ')
    rl.close()
    const code = await sock.requestPairingCode(number.trim())
    console.log(`Pairing code: ${code}`)
  }

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, suggestedReconnectMs }) => {
    if (connection === 'open') console.log('Connected!')
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      console.log(getDisconnectDescription(code))
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(startSock, suggestedReconnectMs ?? 3000)
      }
    }
  })

  return sock
}

startSock()
```

---

## Credits

Dibangun di atas [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) — full credit ke maintainer dan kontributor asli buat implementasi protokolnya. Kontribusi seraphbail cuma di konversi CommonJS-nya dan toolkit anti-ban di atasnya.

---

## License

MIT
