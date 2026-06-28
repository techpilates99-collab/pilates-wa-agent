# 🧘 Pilates Tech — WhatsApp AI Agent

AI customer service otomatis untuk Pilates Tech Studio via WhatsApp.
Powered by **KirimDev** + **DeepSeek**.

## Quick Start

### 1. Isi `.env`

```env
KIRIM_KEY=kdv_live_xxxxx           # API Key dari KirimDev
KIRIM_PHONE_ID=123456789           # Phone Number ID
KIRIM_WEBHOOK_SECRET=              # Diisi setelah step 3
DEEPSEEK_API_KEY=sk-xxxxx          # API Key dari DeepSeek
PORT=3000
```

### 2. Jalankan server

```bash
npm run dev
```

### 3. Expose ke internet (untuk development)

```bash
# Pakai ngrok (download di ngrok.com)
ngrok http 3000
```

Copy URL yang muncul (misal `https://abc123.ngrok-free.app`).

### 4. Daftarkan webhook

```bash
npm run subscribe https://abc123.ngrok-free.app/webhook
```

Copy `initial_secret` yang muncul → paste ke `.env` bagian `KIRIM_WEBHOOK_SECRET`.

### 5. Test!

Kirim pesan ke nomor WA Business kamu → AI akan balas otomatis! 🎉

## Edit Knowledge

Semua "pengetahuan" AI ada di file `knowledge/studio.txt`.
Edit file tersebut → restart server → AI langsung pakai info terbaru.

## File Structure

```
pilates-wa-agent/
├── src/
│   ├── server.ts              # Express server
│   ├── webhook.ts             # Webhook handler + signature verification
│   ├── ai.ts                  # DeepSeek AI + conversation memory
│   └── subscribe-webhook.ts   # Script daftarkan webhook
├── knowledge/
│   └── studio.txt             # Knowledge base studio (EDIT INI!)
├── .env                       # Environment variables (JANGAN COMMIT!)
└── package.json
```
