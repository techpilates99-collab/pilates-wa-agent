// ══════════════════════════════════════════════════
// on mat. — WhatsApp AI Agent Server (Railway)
// ══════════════════════════════════════════════════
import 'dotenv/config'
import express from 'express'
import { handleWebhook } from './webhook.js'

const app = express()

app.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'pilates-tech-wa-agent', uptime: process.uptime() })
})

// ── Reminder pinger ──
// Vercel Hobby only runs daily crons, so this always-on service triggers the
// website's reminder endpoint every 30 minutes (H-1 & H-2 class reminders).
// Auth reuses ONMAT_API_SECRET (same bearer as the booking API).
async function pingReminders() {
  const base = (process.env.ONMAT_API_URL || 'https://onmat.id').replace(/\/$/, '')
  const secret = process.env.ONMAT_API_SECRET
  if (!secret) return
  try {
    const res = await fetch(`${base}/api/wa/cron/reminders`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) console.error('[reminders] ping failed:', res.status)
    else if (data?.sent && (data.sent.h1 || data.sent.h2)) {
      console.log(`[reminders] sent h1=${data.sent.h1} h2=${data.sent.h2}`)
    }
  } catch (e: any) {
    console.error('[reminders] ping error:', e.message)
  }
}
setInterval(pingReminders, 30 * 60 * 1000)
setTimeout(pingReminders, 20_000) // first tick shortly after boot

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log('')
  console.log('  🧘 on mat. WhatsApp AI Agent')
  console.log(`  ✅ Server running on port ${PORT}`)
  console.log(`  📡 Webhook: http://localhost:${PORT}/webhook`)
  console.log(`  💚 Health:  http://localhost:${PORT}/health`)
  console.log('')
})
