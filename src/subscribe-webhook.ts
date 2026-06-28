// ══════════════════════════════════════════════════
// Subscribe Webhook — Run once to register webhook URL
// ══════════════════════════════════════════════════
import 'dotenv/config'
import { Kirim } from '@kirimdev/sdk'

const kirim = new Kirim({ apiKey: process.env.KIRIM_KEY! })

const WEBHOOK_URL = process.argv[2]

if (!WEBHOOK_URL) {
  console.error('')
  console.error('  ❌ Usage: npm run subscribe <YOUR_PUBLIC_URL>/webhook')
  console.error('')
  console.error('  Contoh:')
  console.error('    npm run subscribe https://abc123.ngrok-free.app/webhook')
  console.error('    npm run subscribe https://pilates-agent.fly.dev/webhook')
  console.error('')
  process.exit(1)
}

async function main() {
  console.log('')
  console.log('  📡 Mendaftarkan webhook...')
  console.log(`  URL: ${WEBHOOK_URL}`)
  console.log('')

  try {
    const sub = await kirim.webhookSubscriptions.create({
      url: WEBHOOK_URL,
      events: ['message.received', 'message.status'],
      description: 'Pilates Tech AI Agent',
    })

    console.log('  ✅ Webhook berhasil didaftarkan!')
    console.log('')
    console.log('  ╔══════════════════════════════════════════════╗')
    console.log('  ║  SIMPAN WEBHOOK SECRET INI SEKARANG!        ║')
    console.log('  ║  Hanya ditampilkan SEKALI!                  ║')
    console.log('  ╠══════════════════════════════════════════════╣')
    console.log(`  ║  ${(sub as any).initial_secret}`)
    console.log('  ╚══════════════════════════════════════════════╝')
    console.log('')
    console.log('  👉 Copy secret di atas dan paste ke .env:')
    console.log('     KIRIM_WEBHOOK_SECRET=whsec_xxxxxxxx')
    console.log('')
    console.log(`  Subscription ID: ${(sub as any).id}`)
    console.log('')
  } catch (error: any) {
    console.error('  ❌ Gagal mendaftarkan webhook:', error?.message || error)
    if (error?.status === 401) {
      console.error('     → API Key salah atau sudah expired. Cek KIRIM_KEY di .env')
    }
    process.exit(1)
  }
}

main()
