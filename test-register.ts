// Registration flow test: unregistered number -> register in chat -> booking.
import 'dotenv/config'
import { generateReply } from './src/ai.js'

const PHONE = process.env.TEST_PHONE || '6289900067890'
const turns = [
  'mau booking kelas beginner tanggal 22 september jam 8 pagi kak',
  'oke, nama aku WA Regis Test, email aku waregis@yopmail.com',
  'aku mau beli paket intro 3 pack juga dong',
]

for (const t of turns) {
  console.log('\n================================')
  console.log('👤 USER:', t)
  console.log('💬 LIA :', await generateReply(PHONE, t))
}
process.exit(0)
