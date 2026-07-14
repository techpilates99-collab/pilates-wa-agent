// ══════════════════════════════════════════════════
// Webhook Handler — Receive & process WhatsApp messages
// ══════════════════════════════════════════════════
import type { Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Kirim } from '@kirimdev/sdk'
import { generateReply } from './ai.js'

// ── KirimDev client ──
const kirim = new Kirim({ apiKey: process.env.KIRIM_KEY! })
const phone = kirim.phoneNumbers(process.env.KIRIM_PHONE_ID!)

// ══════════════════════════════════════════════════
// Signature Verification (HMAC-SHA256)
// ══════════════════════════════════════════════════
function verifySignature(
  rawBody: string,
  header: string | undefined,
  secrets: string[],
  toleranceSeconds = 300,
): boolean {
  if (!header || secrets.length === 0 || secrets.every(s => !s)) return true // skip if no secret configured yet
  
  const parts = header.split(',').map(p => p.trim())
  const tPart = parts.find(p => p.startsWith('t='))?.slice(2)
  const v1s = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3))

  const t = Number(tPart)
  if (!t || v1s.length === 0) return false

  // Replay protection
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false

  const signed = `${t}.${rawBody}`

  return secrets.filter(Boolean).some(secret => {
    const expected = createHmac('sha256', secret).update(signed).digest('hex')
    return v1s.some(received => {
      const a = Buffer.from(expected, 'hex')
      const b = Buffer.from(received, 'hex')
      return a.length === b.length && timingSafeEqual(a, b)
    })
  })
}

// ══════════════════════════════════════════════════
// Parse inbound Meta WhatsApp payload
// ══════════════════════════════════════════════════
interface InboundMessage {
  id: string
  from: string
  type: string
  text?: { body: string }
  timestamp: string
}

function extractMessages(body: any): InboundMessage[] {
  try {
    const entry = body?.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    return value?.messages ?? []
  } catch {
    return []
  }
}

// ══════════════════════════════════════════════════
// Main Webhook Handler
// ══════════════════════════════════════════════════
export async function handleWebhook(req: Request, res: Response) {
  const rawBody = (req.body as Buffer).toString('utf8')
  
  // 1. Verify signature
  const sigHeader = req.headers['x-kirim-signature'] as string | undefined
  const secrets = (process.env.KIRIM_WEBHOOK_SECRET || '').split(',')
  
  if (!verifySignature(rawBody, sigHeader, secrets)) {
    console.warn('⚠️  Invalid webhook signature — rejecting')
    res.status(401).send('invalid signature')
    return
  }

  // 2. Always respond 200 fast (KirimDev 10s timeout contract)
  res.status(200).send('ok')

  // 3. Parse & process
  try {
    const body = JSON.parse(rawBody)
    const eventType = req.headers['x-kirim-event'] as string
    
    // Only handle inbound messages
    if (eventType !== 'message.received') return

    const messages = extractMessages(body)
    if (messages.length === 0) return

    for (const msg of messages) {
      const from = msg.from
      const msgType = msg.type

      console.log(`📩 [${new Date().toLocaleTimeString('id-ID')}] Pesan dari +${from}: ${msg.text?.body ?? `[${msgType}]`}`)

      // Handle non-text messages. Customers are told to send transfer proof
      // to this chat (manual-transfer fallback), so images must be
      // acknowledged usefully — not rejected with "text only".
      if (msgType !== 'text' || !msg.text?.body) {
        const body =
          msgType === 'image' || msgType === 'document'
            ? 'Terima kasih kak, sudah kami terima 🙏 Kalau ini bukti transfer, admin kami akan cek dan konfirmasi secepatnya ya. Untuk pertanyaan atau booking, silakan ketik pesan teks.'
            : 'Hai! 😊 Saat ini saya hanya bisa membalas pesan teks. Silakan ketik pertanyaan kamu ya!'
        await phone.messages.send({
          messaging_product: 'whatsapp',
          to: from,
          type: 'text',
          text: { body },
        })
        continue
      }

      // Mark as read (centang biru)
      try {
        await phone.messages.markAsRead(msg.id)
      } catch (e) {
        // Non-critical, don't block the reply
      }

      // Generate AI reply
      const aiReply = await generateReply(from, msg.text.body)

      console.log(`🤖 [${new Date().toLocaleTimeString('id-ID')}] Balas ke +${from}: ${aiReply.slice(0, 80)}...`)

      // Send reply via KirimDev
      await phone.messages.send({
        messaging_product: 'whatsapp',
        to: from,
        type: 'text',
        text: { body: aiReply },
      })
    }
  } catch (error) {
    console.error('❌ Webhook processing error:', error)
  }
}
