// Standalone conversation test — drives generateReply directly (no WhatsApp,
// no Express). Run: npx tsx test-conversation.ts
// Uses .env: ONMAT_API_URL (local dev server), ONMAT_API_SECRET, DEEPSEEK_API_KEY.
import 'dotenv/config'
import { generateReply } from './src/ai.js'

const PHONE = '6289900012345' // fake test number, cleaned up after the test

const turns = process.argv.slice(2).length
  ? [process.argv.slice(2).join(' ')]
  : [
      'Halo kak, ada kelas tanggal 22 september ga?',
      'Wah oke, aku mau yang Beginner jam 8 pagi ya. Nama aku WA Test Claude',
      'kelas aku apa aja sih yang kebooking?',
      'yg beginner itu batalin dong kak',
    ]

for (const t of turns) {
  console.log('\n================================================')
  console.log('👤 USER:', t)
  const reply = await generateReply(PHONE, t)
  console.log('💬 LIA :', reply)
}
// Give the 10-min knowledge interval no chance to keep the process alive.
process.exit(0)
