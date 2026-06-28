// ══════════════════════════════════════════════════
// Pilates Tech — WhatsApp AI Agent Server
// ══════════════════════════════════════════════════
import 'dotenv/config'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { handleWebhook } from './webhook.js'

const app = express()

app.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'pilates-tech-wa-agent', uptime: process.uptime() })
})

// ── Auto-sync webhook with TryCloudflare URL ──
async function autoSyncWebhook() {
  const logPath = 'C:\\ProgramData\\pm2\\home\\logs\\cf-tunnel-error.log'
  const envPath = path.join(process.cwd(), '.env')
  const kirimKey = process.env.KIRIM_KEY

  if (!kirimKey) {
    console.warn('⚠️ KIRIM_KEY tidak ditemukan di environment. Auto-sync dinonaktifkan.')
    return
  }

  try {
    if (!fs.existsSync(logPath)) {
      return
    }

    const content = fs.readFileSync(logPath, 'utf-8')
    const regex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g
    const matches = content.match(regex)
    if (!matches || matches.length === 0) return

    const activeUrl = matches[matches.length - 1]
    const targetWebhookUrl = `${activeUrl}/webhook`

    // Check current subscriptions from KirimDev
    const listRes = await fetch("https://api.kirimdev.com/v1/webhook_subscriptions", {
      headers: { "Authorization": `Bearer ${kirimKey}` }
    })

    if (!listRes.ok) {
      console.error('❌ Gagal mengambil daftar webhook dari KirimDev:', listRes.statusText)
      return
    }

    const listData = await listRes.json() as any
    const activeSubs = listData?.data || []

    // Check if the current tunnel URL is already registered and active
    const matchingSub = activeSubs.find((s: any) => s.url === targetWebhookUrl && s.status === 'active')

    if (matchingSub) {
      const hasSecretMatch = matchingSub.secrets?.some((sec: any) => sec.id === process.env.KIRIM_WEBHOOK_SECRET)
      if (process.env.KIRIM_WEBHOOK_SECRET && hasSecretMatch) {
        return // Already configured properly
      }
    }

    console.log(`[AutoSync] Mendeteksi perubahan URL tunnel ke: ${activeUrl}. Memulai sinkronisasi webhook...`)

    // 1. Delete all old subscriptions for this chatbot
    for (const sub of activeSubs) {
      if (sub.description === 'Pilates Tech AI Agent' || sub.description === 'Pilates AI') {
        console.log(`[AutoSync] Menghapus webhook lama: ${sub.id} (${sub.url})`)
        try {
          await fetch(`https://api.kirimdev.com/v1/webhook_subscriptions/${sub.id}`, {
            method: 'DELETE',
            headers: { "Authorization": `Bearer ${kirimKey}` }
          })
        } catch (e: any) {
          console.error(`[AutoSync] Gagal menghapus webhook ${sub.id}:`, e.message)
        }
      }
    }

    // 2. Register the new URL
    console.log(`[AutoSync] Mendaftarkan webhook baru: ${targetWebhookUrl}`)
    const createRes = await fetch("https://api.kirimdev.com/v1/webhook_subscriptions", {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${kirimKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: targetWebhookUrl,
        events: ['message.received', 'message.status'],
        description: 'Pilates Tech AI Agent'
      })
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      console.error('[AutoSync] Gagal mendaftarkan webhook baru:', createRes.status, errText)
      return
    }

    const newSub = await createRes.json() as any
    const newSecret = newSub?.initial_secret || newSub?.data?.initial_secret || (newSub as any).initial_secret

    if (newSecret) {
      process.env.KIRIM_WEBHOOK_SECRET = newSecret
      console.log(`[AutoSync] Webhook baru berhasil didaftarkan! Secret updated in memory.`)

      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8')
        if (envContent.includes('KIRIM_WEBHOOK_SECRET=')) {
          envContent = envContent.replace(/KIRIM_WEBHOOK_SECRET=.*/, `KIRIM_WEBHOOK_SECRET=${newSecret}`)
        } else {
          envContent += `\nKIRIM_WEBHOOK_SECRET=${newSecret}`
        }
        fs.writeFileSync(envPath, envContent, 'utf-8')
        console.log('[AutoSync] File .env berhasil diperbarui dengan secret baru.')
      }
    }
  } catch (err: any) {
    console.error('[AutoSync] Gagal sinkronisasi otomatis webhook:', err.message)
  }
}

// Start auto-sync check interval every 2 minutes
setInterval(autoSyncWebhook, 2 * 60 * 1000)
// Run first sync check 10 seconds after startup
setTimeout(autoSyncWebhook, 10000)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log('')
  console.log('  🧘 Pilates Tech AI Agent')
  console.log(`  ✅ Server running on port ${PORT}`)
  console.log(`  📡 Webhook: http://localhost:${PORT}/webhook`)
  console.log(`  💚 Health:  http://localhost:${PORT}/health`)
  console.log('')
})
