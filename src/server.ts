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

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log('')
  console.log('  🧘 on mat. WhatsApp AI Agent')
  console.log(`  ✅ Server running on port ${PORT}`)
  console.log(`  📡 Webhook: http://localhost:${PORT}/webhook`)
  console.log(`  💚 Health:  http://localhost:${PORT}/health`)
  console.log('')
})
