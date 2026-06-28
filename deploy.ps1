# ══════════════════════════════════════════════
# Pilates Tech AI Agent — Auto Deploy Script
# Jalankan di VPS Windows Server via PowerShell (Run as Administrator)
# ══════════════════════════════════════════════

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host "  🧘 Pilates Tech AI Agent — Auto Deploy" -ForegroundColor Cyan  
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Install Node.js ──
Write-Host "📦 [1/6] Installing Node.js..." -ForegroundColor Yellow
$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCheck) {
    Write-Host "  ✅ Node.js already installed: $(node --version)" -ForegroundColor Green
} else {
    Write-Host "  ⬇️  Downloading Node.js..." -ForegroundColor Gray
    $nodeUrl = "https://nodejs.org/dist/v22.16.0/node-v22.16.0-x64.msi"
    $nodeMsi = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
    Write-Host "  📦 Installing Node.js (this takes a minute)..." -ForegroundColor Gray
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$nodeMsi`" /qn /norestart"
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "  ✅ Node.js installed: $(node --version)" -ForegroundColor Green
}

# ── Step 2: Install Cloudflared ──
Write-Host ""
Write-Host "🌐 [2/6] Installing Cloudflared..." -ForegroundColor Yellow
$cfCheck = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cfCheck) {
    # Check common install path
    $cfPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
    if (-not (Test-Path $cfPath)) {
        $cfUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi"
        $cfMsi = "$env:TEMP\cloudflared-installer.msi"
        Invoke-WebRequest -Uri $cfUrl -OutFile $cfMsi -UseBasicParsing
        Start-Process msiexec.exe -Wait -ArgumentList "/i `"$cfMsi`" /qn /norestart"
        Write-Host "  ✅ Cloudflared installed" -ForegroundColor Green
    } else {
        Write-Host "  ✅ Cloudflared already at $cfPath" -ForegroundColor Green
    }
} else {
    Write-Host "  ✅ Cloudflared already installed" -ForegroundColor Green
}

# ── Step 3: Create project directory ──
Write-Host ""
Write-Host "📂 [3/6] Setting up project..." -ForegroundColor Yellow
$projectDir = "C:\pilates-wa-agent"
if (-not (Test-Path $projectDir)) {
    New-Item -ItemType Directory -Path $projectDir -Force | Out-Null
}
New-Item -ItemType Directory -Path "$projectDir\src" -Force | Out-Null
New-Item -ItemType Directory -Path "$projectDir\knowledge" -Force | Out-Null
Write-Host "  ✅ Project directory: $projectDir" -ForegroundColor Green

# ── Step 4: Write project files ──
Write-Host ""
Write-Host "📝 [4/6] Writing project files..." -ForegroundColor Yellow

# package.json
@'
{
  "name": "pilates-wa-agent",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@kirimdev/sdk": "^3.3.0",
    "@supabase/supabase-js": "^2.43.0",
    "dotenv": "^16.4.0",
    "express": "^5.1.0",
    "openai": "^4.80.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
'@ | Set-Content "$projectDir\package.json" -Encoding UTF8

# .env
@'
KIRIM_KEY=__KIRIM_KEY_PLACEHOLDER__
KIRIM_PHONE_ID=__KIRIM_PHONE_ID_PLACEHOLDER__
KIRIM_WEBHOOK_SECRET=__WEBHOOK_SECRET_PLACEHOLDER__
DEEPSEEK_API_KEY=__DEEPSEEK_API_KEY_PLACEHOLDER__
PORT=3000
SUPABASE_URL=__SUPABASE_URL_PLACEHOLDER__
SUPABASE_SERVICE_ROLE_KEY=__SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER__
'@ | Set-Content "$projectDir\.env" -Encoding UTF8

# src/server.ts
@'
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
  console.log(`\n  🧘 Pilates Tech AI Agent\n  ✅ Running on port ${PORT}\n`)
})
'@ | Set-Content "$projectDir\src\server.ts" -Encoding UTF8

# src/webhook.ts
@'
import type { Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Kirim } from '@kirimdev/sdk'
import { generateReply } from './ai.js'

const kirim = new Kirim({ apiKey: process.env.KIRIM_KEY! })
const phone = kirim.phoneNumbers(process.env.KIRIM_PHONE_ID!)

function verifySignature(rawBody: string, header: string | undefined, secrets: string[], toleranceSeconds = 300): boolean {
  if (!header || secrets.length === 0 || secrets.every(s => !s)) return true
  const parts = header.split(',').map(p => p.trim())
  const tPart = parts.find(p => p.startsWith('t='))?.slice(2)
  const v1s = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3))
  const t = Number(tPart)
  if (!t || v1s.length === 0) return false
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

interface InboundMessage { id: string; from: string; type: string; text?: { body: string }; timestamp: string }

function extractMessages(body: any): InboundMessage[] {
  try { return body?.entry?.[0]?.changes?.[0]?.value?.messages ?? [] } catch { return [] }
}

export async function handleWebhook(req: Request, res: Response) {
  const rawBody = (req.body as Buffer).toString('utf8')
  const sigHeader = req.headers['x-kirim-signature'] as string | undefined
  const secrets = (process.env.KIRIM_WEBHOOK_SECRET || '').split(',')
  if (!verifySignature(rawBody, sigHeader, secrets)) { res.status(401).send('invalid signature'); return }
  res.status(200).send('ok')
  try {
    const body = JSON.parse(rawBody)
    const eventType = req.headers['x-kirim-event'] as string
    if (eventType !== 'message.received') return
    const messages = extractMessages(body)
    if (messages.length === 0) return
    for (const msg of messages) {
      const from = msg.from
      console.log(`📩 [${new Date().toLocaleTimeString('id-ID')}] Dari +${from}: ${msg.text?.body ?? `[${msg.type}]`}`)
      if (msg.type !== 'text' || !msg.text?.body) {
        await phone.messages.send({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: 'Hai! 😊 Saat ini saya hanya bisa membalas pesan teks ya!' } })
        continue
      }
      try { await phone.messages.markAsRead(msg.id) } catch {}
      const aiReply = await generateReply(from, msg.text.body)
      console.log(`🤖 [${new Date().toLocaleTimeString('id-ID')}] Ke +${from}: ${aiReply.slice(0, 80)}...`)
      await phone.messages.send({ messaging_product: 'whatsapp', to: from, type: 'text', text: { body: aiReply } })
    }
  } catch (error) { console.error('❌ Error:', error) }
}
'@ | Set-Content "$projectDir\src\webhook.ts" -Encoding UTF8

# src/ai.ts
@'
// ══════════════════════════════════════════════════
// AI Module — DeepSeek integration with knowledge & memory
// ══════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import https from 'node:https'
import { createClient } from '@supabase/supabase-js'

// Custom fetch to bypass global fetch HTTP/2 / keep-alive socket reuse bugs in newer Node versions
function customFetch(url: any, init: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url.toString())
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: init.method || 'GET',
      headers: { ...init.headers },
      rejectUnauthorized: true,
      agent: false
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        const headers = new Headers()
        for (const [key, val] of Object.entries(res.headers)) {
          if (val) {
            if (Array.isArray(val)) {
              val.forEach(v => headers.append(key, v))
            } else {
              headers.append(key, val)
            }
          }
        }

        const response = {
          status: res.statusCode || 200,
          statusText: res.statusMessage || '',
          headers: headers,
          ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300,
          text: async () => data,
          json: async () => JSON.parse(data)
        }
        resolve(response)
      })
    })

    req.on('error', (err) => { reject(err) })

    if (init.body) {
      req.write(init.body)
    }
    req.end()
  })
}

// ── DeepSeek uses OpenAI-compatible API ──
const ai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com',
  fetch: customFetch
})

// ── Supabase client initialization ──
let supabase: any = null
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// ── Load knowledge base ──
const __dirname = path.dirname(fileURLToPath(import.meta.url))
let activeKnowledge = ''
const localKnowledgePath = path.join(__dirname, '..', 'knowledge', 'studio.txt')

// Load local fallback knowledge
try {
  activeKnowledge = fs.readFileSync(localKnowledgePath, 'utf-8')
} catch (err: any) {
  console.warn('⚠️ Gagal membaca local studio.txt:', err.message)
}

async function updateKnowledgeFromSupabase() {
  if (!supabase) return
  try {
    const { data, error } = await supabase
      .from('chatbot_settings')
      .select('value')
      .eq('key', 'studio_knowledge')
      .single()

    if (error) throw error
    if (data && data.value) {
      activeKnowledge = data.value
      console.log('✅ Knowledge base updated from Supabase successfully!')
    }
  } catch (err: any) {
    console.warn('⚠️ Gagal memuat knowledge dari Supabase, menggunakan cache/lokal:', err.message)
  }
}

// Fetch at startup
updateKnowledgeFromSupabase()

// Fetch every 10 minutes
setInterval(updateKnowledgeFromSupabase, 10 * 60 * 1000)

// Helper function to build prompt dynamically
function getSystemPrompt() {
  return `
${activeKnowledge}

═══════════════════════════════════
  ATURAN MENJAWAB
═══════════════════════════════════

1. Kamu adalah Lia, CS onmat (Pilates Tech Studio) di WhatsApp.
2. Jawab dengan bahasa yang sama dengan pelanggan (bahasa Indonesia atau Inggris). Selalu ramah, santai tapi tetap profesional.
3. Gunakan emoji secukupnya supaya terasa friendly 😊.
4. Jawab berdasarkan informasi di atas — JANGAN mengarang info yang tidak ada.
5. Jika ada pertanyaan yang tidak bisa kamu jawab (misal hal teknis medis), arahkan ke admin:
   "Untuk pertanyaan ini, saya hubungkan ke admin kami ya kak! Mohon tunggu sebentar 🙏"
6. JANGAN pernah bilang kamu AI/robot/bot — kamu adalah CS onmat/Lia.
7. Jika customer mau booking kelas, tawarkan pilihan jadwal kelas yang tersedia dengan mencari tanggal yang mereka inginkan (menggunakan tool check_schedules) lalu tawarkan untuk buat booking langsung setelah menanyakan nama lengkap mereka (menggunakan tool create_wa_booking).
8. Jika customer mau beli paket, jelaskan pilihan paket dan arahkan untuk transfer.
9. Untuk pertanyaan harga, selalu sebutkan juga opsi Trial Class Rp 75.000 untuk yang belum pernah.
10. Jawab singkat dan to-the-point — ini WhatsApp, bukan email. Max 3-4 paragraf pendek.
11. Jika customer bilang terima kasih / bye, balas singkat dan ramah.
12. Jika tidak yakin dengan jawaban, lebih baik bilang "Saya cek dulu ya kak" daripada salah info.
`
}

// ── Database Helper Functions for AI tools ──

async function checkSchedules(date: string) {
  if (!supabase) throw new Error('Supabase client is not configured.')

  const start = new Date(`${date}T00:00:00.000Z`).toISOString()
  const end = new Date(new Date(`${date}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()

  const { data, error } = await supabase
    .from('schedules')
    .select(`
      id, start_at, capacity, price, status,
      class_types ( name ),
      bookings ( status )
    `)
    .eq('status', 'published')
    .gte('start_at', start)
    .lte('start_at', end)
    .order('start_at', { ascending: true })

  if (error) throw error
  if (!data || data.length === 0) return { message: `Tidak ada kelas yang dijadwalkan pada tanggal ${date}.` }

  return data.map((s: any) => {
    const activeBookings = (s.bookings || []).filter((b: any) => ['pending', 'confirmed', 'attended'].includes(b.status))
    const availableSlots = s.capacity - activeBookings.length

    const timeString = new Date(s.start_at).toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })

    return {
      schedule_id: s.id,
      class_name: s.class_types?.name || 'Pilates Class',
      time: `${timeString} WIB`,
      price: `Rp ${Number(s.price).toLocaleString('id-ID')}`,
      available_slots: availableSlots > 0 ? availableSlots : 0,
      is_full: availableSlots <= 0
    }
  })
}

async function createWaBooking(scheduleId: string, name: string, phone: string) {
  if (!supabase) throw new Error('Supabase client is not configured.')

  const normalizedPhone = phone.replace(/[^\d+]/g, '')

  // 1. Get or create customer by phone
  let { data: customer, error: cFetchErr } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  if (cFetchErr) throw cFetchErr

  if (!customer) {
    const { data: newCustomer, error: cInsErr } = await supabase
      .from('customers')
      .insert({ name: name, phone: normalizedPhone, source_channel: 'wa' })
      .select('id')
      .single()

    if (cInsErr) throw cInsErr
    customer = newCustomer
  }

  // 2. Fetch schedule details & verify capacity
  const { data: schedule, error: sErr } = await supabase
    .from('schedules')
    .select(`
      id, capacity, price, status,
      class_types ( name ),
      bookings ( status )
    `)
    .eq('id', scheduleId)
    .single()

  if (sErr || !schedule) throw new Error('Jadwal kelas tidak ditemukan.')
  if (schedule.status !== 'published') throw new Error('Jadwal kelas ini tidak aktif.')

  const activeBookings = (schedule.bookings || []).filter((b: any) => ['pending', 'confirmed', 'attended'].includes(b.status))
  const availableSlots = schedule.capacity - activeBookings.length

  if (availableSlots <= 0) {
    throw new Error('Maaf, kelas ini sudah penuh.')
  }

  // 3. Create booking
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .insert({
      customer_id: customer.id,
      schedule_id: schedule.id,
      status: 'pending',
      source: 'wa'
    })
    .select('id')
    .single()

  if (bErr) throw bErr

  // 4. Create Midtrans Transaction Snap Link
  const midtransServerKey = process.env.MIDTRANS_SERVER_KEY
  if (!midtransServerKey) {
    console.warn('⚠️ MIDTRANS_SERVER_KEY tidak ditemukan di environment. Booking terbuat tetapi link pembayaran gagal.')
    return {
      booking_id: booking.id,
      message: 'Booking berhasil dibuat (Pending). Silakan hubungi admin untuk pembayaran karena metode pembayaran otomatis belum dikonfigurasi.'
    }
  }

  const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true'
  const SNAP_BASE = isProd
    ? 'https://app.midtrans.com/snap/v1'
    : 'https://app.sandbox.midtrans.com/snap/v1'

  const auth = Buffer.from(`${midtransServerKey}:`).toString('base64')

  const nameParts = name.trim().split(/\s+/)
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(' ') || firstName

  const payload = {
    transaction_details: {
      order_id: `booking-${booking.id}`,
      gross_amount: Math.round(Number(schedule.price))
    },
    customer_details: {
      first_name: firstName,
      last_name: lastName,
      phone: normalizedPhone
    },
    item_details: [
      {
        id: schedule.id,
        name: (schedule.class_types?.name || 'Pilates Class').slice(0, 50),
        price: Math.round(Number(schedule.price)),
        quantity: 1
      }
    ],
    expiry: {
      duration: 24,
      unit: 'hours'
    }
  }

  const response = await fetch(`${SNAP_BASE}/transactions`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Midtrans Snap creation failed:', response.status, errorText)
    throw new Error(`Gagal membuat pembayaran Midtrans: ${errorText}`)
  }

  const snapData = await response.json() as { token: string, redirect_url: string }

  return {
    booking_id: booking.id,
    payment_url: snapData.redirect_url,
    message: 'Booking pending berhasil dibuat. Silakan lakukan pembayaran melalui link pembayaran Midtrans.'
  }
}

// ── Conversation history per user (in-memory) ──
const conversations = new Map<string, Array<any>>()

// Auto-cleanup: hapus conversation yang idle > 2 jam
const IDLE_TIMEOUT = 2 * 60 * 60 * 1000
const lastActivity = new Map<string, number>()

setInterval(() => {
  const now = Date.now()
  for (const [userId, lastTime] of lastActivity) {
    if (now - lastTime > IDLE_TIMEOUT) {
      conversations.delete(userId)
      lastActivity.delete(userId)
    }
  }
}, 10 * 60 * 1000) // check every 10 minutes

// ══════════════════════════════════════════════════
// Generate AI Reply
// ══════════════════════════════════════════════════
export async function generateReply(userId: string, userMessage: string): Promise<string> {
  // Get or create conversation history
  if (!conversations.has(userId)) {
    conversations.set(userId, [])
  }
  const history = conversations.get(userId)!
  lastActivity.set(userId, Date.now())

  // Add user message
  history.push({ role: 'user', content: userMessage })

  // Keep only last 20 messages (10 exchanges) to save tokens
  const recentHistory = history.slice(-20)

  try {
    let messages: any[] = [
      { role: 'system', content: getSystemPrompt() },
      ...recentHistory,
    ]

    let completion = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages,
      tools: [
        {
          type: 'function',
          function: {
            name: 'check_schedules',
            description: 'Mencari daftar jadwal kelas yang aktif pada tanggal tertentu (format YYYY-MM-DD) dan menghitung sisa slot kosong.',
            parameters: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Tanggal kelas yang dicari dalam format YYYY-MM-DD, contoh: 2026-06-25' }
              },
              required: ['date']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'create_wa_booking',
            description: 'Membuat booking baru untuk kelas tertentu (schedule_id) atas nama customer. Hanya panggil jika user mengonfirmasi mau booking kelas tertentu dan sudah memberikan nama lengkapnya.',
            parameters: {
              type: 'object',
              properties: {
                schedule_id: { type: 'string', description: 'UUID dari jadwal kelas yang dipilih (dapat diperoleh dari check_schedules)' },
                customer_name: { type: 'string', description: 'Nama lengkap customer yang melakukan booking' }
              },
              required: ['schedule_id', 'customer_name']
            }
          }
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    let message = completion.choices[0]?.message

    // If DeepSeek requests a tool call
    if (message?.tool_calls && message.tool_calls.length > 0) {
      console.log(`🤖 DeepSeek memanggil tool: ${message.tool_calls[0].function.name} dengan argumen ${message.tool_calls[0].function.arguments}`)
      messages.push(message) // Add assistant's tool call request

      for (const toolCall of message.tool_calls) {
        const name = toolCall.function.name
        const args = JSON.parse(toolCall.function.arguments)

        let result = ''
        if (name === 'check_schedules') {
          try {
            const schedules = await checkSchedules(args.date)
            result = JSON.stringify(schedules)
          } catch (err: any) {
            result = JSON.stringify({ error: err.message })
          }
        } else if (name === 'create_wa_booking') {
          try {
            const bookingResult = await createWaBooking(args.schedule_id, args.customer_name, userId)
            result = JSON.stringify(bookingResult)
          } catch (err: any) {
            result = JSON.stringify({ error: err.message })
          }
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        })
      }

      // Call DeepSeek again with the tool output
      completion = await ai.chat.completions.create({
        model: 'deepseek-chat',
        messages: messages,
        max_tokens: 500,
        temperature: 0.7
      })
    }

    const reply = completion.choices[0]?.message?.content?.trim() || 'Maaf kak, ada gangguan teknis. Coba chat lagi ya! 🙏'

    // Save AI reply to history
    history.push({ role: 'assistant', content: reply })

    return reply
  } catch (error: any) {
    return 'Maaf kak, ada gangguan sistem. Coba lagi nanti ya! 🙏'
  }
}
'@ | Set-Content "$projectDir\src\ai.ts" -Encoding UTF8

# src/subscribe-webhook.ts
@'
import 'dotenv/config'
import { Kirim } from '@kirimdev/sdk'
const kirim = new Kirim({ apiKey: process.env.KIRIM_KEY! })
const WEBHOOK_URL = process.argv[2]
if (!WEBHOOK_URL) { console.error('Usage: npx tsx src/subscribe-webhook.ts <URL>'); process.exit(1) }
async function main() {
  console.log(`\n📡 Registering webhook: ${WEBHOOK_URL}\n`)
  const sub = await kirim.webhookSubscriptions.create({ url: WEBHOOK_URL, events: ['message.received', 'message.status'], description: 'Pilates AI Agent' })
  console.log('✅ Webhook registered!')
  console.log(`\n🔑 SECRET (save this!): ${(sub as any).initial_secret}\n`)
  console.log(`ID: ${(sub as any).id}\n`)
}
main().catch(e => { console.error('❌ Failed:', e.message); process.exit(1) })
'@ | Set-Content "$projectDir\src\subscribe-webhook.ts" -Encoding UTF8

# Copy knowledge file
Copy-Item "knowledge\studio.txt" "$projectDir\knowledge\studio.txt" -ErrorAction SilentlyContinue
if (-not (Test-Path "$projectDir\knowledge\studio.txt")) {
    # Create default if not copied
    "Kamu adalah Lia, asisten virtual Pilates Tech Studio. Jawab pertanyaan customer dengan ramah." | Set-Content "$projectDir\knowledge\studio.txt" -Encoding UTF8
}

Write-Host "  ✅ All files written" -ForegroundColor Green

# ── Step 5: Install dependencies ──
Write-Host ""
Write-Host "📦 [5/6] Installing npm dependencies..." -ForegroundColor Yellow
Set-Location $projectDir
npm install 2>&1 | Out-Null
Write-Host "  ✅ Dependencies installed" -ForegroundColor Green

# ── Step 6: Install PM2 & start ──
Write-Host ""
Write-Host "🚀 [6/6] Setting up PM2 (process manager)..." -ForegroundColor Yellow
npm install -g pm2 2>&1 | Out-Null

# Start the app with PM2
pm2 delete pilates-agent 2>&1 | Out-Null
pm2 start "node --import tsx src/server.ts" --name pilates-agent
pm2 save

Write-Host "  ✅ App started with PM2" -ForegroundColor Green

# ── Step 7: Start Cloudflare Tunnel ──
Write-Host ""
Write-Host "🌐 [BONUS] Starting Cloudflare Tunnel..." -ForegroundColor Yellow

$cfExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (Test-Path $cfExe) {
    # Start tunnel in background
    Start-Process -FilePath $cfExe -ArgumentList "tunnel --url http://localhost:3000" -WindowStyle Normal
    Write-Host "  ✅ Tunnel starting... check the new window for the URL" -ForegroundColor Green
    Write-Host ""
    Write-Host "  ╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║  NEXT STEP:                                         ║" -ForegroundColor Cyan
    Write-Host "  ║  1. Copy the trycloudflare.com URL from the tunnel  ║" -ForegroundColor Cyan
    Write-Host "  ║  2. Run this command:                               ║" -ForegroundColor Cyan
    Write-Host "  ║     npx tsx src/subscribe-webhook.ts <URL>/webhook  ║" -ForegroundColor Cyan
    Write-Host "  ║  3. Copy the secret to .env KIRIM_WEBHOOK_SECRET    ║" -ForegroundColor Cyan
    Write-Host "  ║  4. Restart: pm2 restart pilates-agent              ║" -ForegroundColor Cyan
    Write-Host "  ╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
} else {
    Write-Host "  ⚠️  Cloudflared not found. Install it manually." -ForegroundColor Red
}

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Green
Write-Host "  ✅ DEPLOY COMPLETE!" -ForegroundColor Green
Write-Host "  ========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Gray
Write-Host "    pm2 status            — cek status app" -ForegroundColor Gray
Write-Host "    pm2 logs pilates-agent — lihat log" -ForegroundColor Gray
Write-Host "    pm2 restart pilates-agent — restart" -ForegroundColor Gray
Write-Host ""
