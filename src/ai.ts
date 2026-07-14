// ══════════════════════════════════════════════════
// AI Module — DeepSeek conversation layer over the onmat.id booking API
//
// This file holds NO business logic: schedules, seat holds, packages,
// payment links, and cancellation rules all live in the website's
// /api/wa/* routes (see onmat-api.ts). The model's job is conversation +
// relaying tool results (message_for_customer is always relayed verbatim).
// ══════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import https from 'node:https'
import {
  checkSchedules,
  createBooking,
  cancelBooking,
  getStatus,
  listPackages,
  buyPackage,
  registerAccount,
  fetchKnowledge,
} from './onmat-api.js'

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

// ── Knowledge base: live from the onmat.id API, studio.txt as offline fallback ──
const __dirname = path.dirname(fileURLToPath(import.meta.url))
let activeKnowledge = ''
const localKnowledgePath = path.join(__dirname, '..', 'knowledge', 'studio.txt')

try {
  activeKnowledge = fs.readFileSync(localKnowledgePath, 'utf-8')
} catch (err: any) {
  console.warn('⚠️ Gagal membaca local studio.txt:', err.message)
}

async function updateKnowledge() {
  try {
    activeKnowledge = await fetchKnowledge()
    console.log('✅ Knowledge base updated from onmat.id API')
  } catch (err: any) {
    console.warn('⚠️ Gagal memuat knowledge dari API, pakai cache/lokal:', err.message)
  }
}

updateKnowledge()
setInterval(updateKnowledge, 10 * 60 * 1000)

function todayBali(): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

function todayBaliISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date())
}

function getSystemPrompt() {
  return `
${activeKnowledge}

═══════════════════════════════════
  ATURAN MENJAWAB
═══════════════════════════════════

1. Kamu adalah Lia, CS on mat. (onmat) di WhatsApp. Ramah, santai, tetap profesional. Jangan pernah bilang kamu AI/robot/bot.
2. HARI INI: ${todayBali()} (${todayBaliISO()}, zona waktu Bali/WITA). Gunakan ini untuk menghitung "besok", "lusa", "Senin depan", dst.
3. Jawab dengan bahasa yang sama dengan customer (Indonesia/Inggris). Gunakan emoji secukupnya. Singkat dan to-the-point — ini WhatsApp, max 3-4 paragraf pendek. Format WhatsApp: bold pakai SATU bintang *seperti ini* — JANGAN pakai **dua bintang** (tidak dirender di WhatsApp).
4. Jawab HANYA berdasarkan informasi di atas dan hasil tools. JANGAN mengarang jadwal, harga, atau kebijakan.
5. ALUR BOOKING: (a) tahu tanggal yang diinginkan → panggil check_schedules; (b) tawarkan pilihan kelas + sisa slot; (c) pastikan nama lengkap customer (kalau dia sudah pernah booking, my_status sudah tahu namanya — jangan tanya ulang); (d) setelah customer konfirmasi satu kelas → create_booking.
5b. WAJIB AKUN: semua booking dan pembelian paket butuh akun. Kalau create_booking / buy_package mengembalikan error "not-registered", minta nama lengkap DAN email customer, lalu panggil register_account, lalu ULANGI create_booking/buy_package-nya di giliran yang sama. Kalau my_status bilang nomor belum terdaftar dan customer mau booking, langsung mulai pendaftaran. Jangan pernah menolak customer karena belum punya akun — daftarin aja di chat, prosesnya 30 detik.
6. PENTING: kalau hasil tool berisi "message_for_customer", SAMPAIKAN isi itu APA ADANYA (boleh ditambah satu kalimat pembuka singkat). JANGAN mengubah/mengetik ulang link pembayaran, nominal, atau nomor rekening.
7. Customer dengan paket aktif otomatis booking pakai paket (create_booking mengurusnya). Kalau dia minta bayar terpisah padahal punya paket, panggil create_booking dengan use_package=false.
8. CANCEL: panggil my_status dulu untuk melihat booking dia, konfirmasi kelas mana yang dibatalkan, lalu cancel_booking dengan booking_id-nya. Pembatalan hanya bisa >= 12 jam sebelum kelas.
9. RESCHEDULE: cancel dulu (aturan sama), lalu booking jadwal baru.
10. Pertanyaan "kelas saya kapan" / "sisa paket saya berapa" / "email saya apa" → my_status (email hanya tersedia dalam bentuk tersamar, mis. f***@gmail.com — sampaikan apa adanya, jangan menebak sisanya). Booking berstatus "expired_unpaid" = dibuat tapi tidak dibayar dalam 15 menit, slotnya sudah dilepas — jelaskan itu dan tawarkan booking ulang (create_booking di jadwal yang sama menghasilkan link pembayaran baru). Pertanyaan harga paket → list_packages (atau info di atas). Beli paket → pastikan nama lengkap, lalu buy_package.
11. Eskalasi ke admin (bilang "saya teruskan ke admin ya kak"): bukti transfer manual, refund, komplain, pertanyaan medis spesifik, partnership.
12. Kalau tidak yakin, bilang "Saya cek dulu ya kak" — jangan salah info.
`
}

// ── Tool definitions (DeepSeek function calling) ──
const TOOLS: any[] = [
  {
    type: 'function',
    function: {
      name: 'check_schedules',
      description: 'Daftar kelas pada tanggal tertentu (waktu Bali/WITA) beserta sisa slot real-time dan harga. Selalu pakai ini sebelum menawarkan jadwal.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Tanggal dalam format YYYY-MM-DD, contoh: 2026-07-28' }
        },
        required: ['date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_booking',
      description: 'Buat booking kelas untuk customer ini. Panggil hanya setelah customer mengonfirmasi kelas tertentu dan nama lengkapnya diketahui. schedule_id HARUS berupa UUID persis dari hasil check_schedules — JANGAN mengarang; kalau belum punya UUID-nya, panggil check_schedules dulu. Otomatis memakai paket aktif kalau ada; kalau tidak, mengembalikan link pembayaran.',
      parameters: {
        type: 'object',
        properties: {
          schedule_id: { type: 'string', description: 'UUID jadwal dari check_schedules' },
          customer_name: { type: 'string', description: 'Nama lengkap customer' },
          use_package: { type: 'boolean', description: 'Default true. Set false hanya kalau customer secara eksplisit tidak mau memakai paketnya.' }
        },
        required: ['schedule_id', 'customer_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'register_account',
      description: 'Daftarkan akun untuk customer ini (wajib sebelum booking pertama / beli paket). Panggil HANYA setelah customer memberikan nama lengkap DAN email. Nomor WhatsApp otomatis terverifikasi dari chat ini.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'Nama lengkap customer' },
          email: { type: 'string', description: 'Alamat email customer' }
        },
        required: ['customer_name', 'email']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'my_status',
      description: 'Booking mendatang + paket aktif milik customer ini (berdasarkan nomor WhatsApp-nya). Pakai untuk "kelas saya kapan", "sisa sesi paket", dan untuk mengambil booking_id sebelum cancel.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_booking',
      description: 'Batalkan satu booking milik customer ini. Ambil booking_id dari my_status dan konfirmasi dulu kelas mana yang dibatalkan. Hanya bisa >= 12 jam sebelum kelas.',
      parameters: {
        type: 'object',
        properties: {
          booking_id: { type: 'string', description: 'UUID booking dari my_status' }
        },
        required: ['booking_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_packages',
      description: 'Katalog paket aktif (nama, harga, jumlah sesi, masa berlaku) langsung dari sistem.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buy_package',
      description: 'Beli paket untuk customer ini — mengembalikan link pembayaran. Panggil setelah customer memilih paket dan nama lengkapnya diketahui.',
      parameters: {
        type: 'object',
        properties: {
          package_id: { type: 'string', description: 'UUID paket dari list_packages' },
          customer_name: { type: 'string', description: 'Nama lengkap customer' }
        },
        required: ['package_id', 'customer_name']
      }
    }
  }
]

async function runTool(name: string, args: any, phone: string): Promise<string> {
  try {
    switch (name) {
      case 'check_schedules':
        return JSON.stringify(await checkSchedules(args.date))
      case 'create_booking':
        return JSON.stringify(
          await createBooking(args.schedule_id, args.customer_name, phone, args.use_package),
        )
      case 'register_account':
        return JSON.stringify(await registerAccount(args.customer_name, args.email, phone))
      case 'my_status':
        return JSON.stringify(await getStatus(phone))
      case 'cancel_booking':
        return JSON.stringify(await cancelBooking(phone, args.booking_id))
      case 'list_packages':
        return JSON.stringify(await listPackages())
      case 'buy_package':
        return JSON.stringify(await buyPackage(args.package_id, args.customer_name, phone))
      default:
        return JSON.stringify({ error: `Tool tidak dikenal: ${name}` })
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message })
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
  if (!conversations.has(userId)) {
    conversations.set(userId, [])
  }
  const history = conversations.get(userId)!
  lastActivity.set(userId, Date.now())

  history.push({ role: 'user', content: userMessage })

  // Keep only last 20 messages (10 exchanges) to save tokens
  const recentHistory = history.slice(-20)

  try {
    const messages: any[] = [
      { role: 'system', content: getSystemPrompt() },
      ...recentHistory,
    ]

    let completion = await ai.chat.completions.create({
      model: 'deepseek-v4-pro',
      messages,
      tools: TOOLS,
      max_tokens: 800,
      temperature: 0.7,
    })

    // Multi-round tool loop: e.g. my_status → cancel_booking in one turn.
    let rounds = 0
    while (completion.choices[0]?.message?.tool_calls?.length && rounds < 3) {
      const message = completion.choices[0].message
      messages.push(message)

      for (const toolCall of message.tool_calls!) {
        const name = toolCall.function.name
        let args: any = {}
        try { args = JSON.parse(toolCall.function.arguments || '{}') } catch { /* empty args */ }
        console.log(`🤖 Tool: ${name}(${toolCall.function.arguments}) untuk +${userId}`)

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: await runTool(name, args, userId),
        })
      }

      rounds++
      completion = await ai.chat.completions.create({
        model: 'deepseek-v4-pro',
        messages,
        tools: rounds < 3 ? TOOLS : undefined,
        max_tokens: 800,
        temperature: 0.7,
      })
    }

    const reply = completion.choices[0]?.message?.content?.trim() || 'Maaf kak, ada gangguan teknis. Coba chat lagi ya! 🙏'

    history.push({ role: 'assistant', content: reply })

    return reply
  } catch (error: any) {
    console.error('❌ DeepSeek API error:', error?.message || error)

    if (error?.status === 401) {
      return 'Maaf kak, ada gangguan sistem. Admin kami akan segera membantu ya! 🙏'
    }

    return 'Maaf kak, saya sedang mengalami gangguan. Coba beberapa saat lagi ya! 🙏'
  }
}
