import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const knowledgePath = path.join(__dirname, '..', 'knowledge', 'studio.txt')

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  console.log('Reading local knowledge/studio.txt...')
  const content = fs.readFileSync(knowledgePath, 'utf-8')

  console.log('Uploading to Supabase (table: chatbot_settings)...')
  const { data, error } = await supabase
    .from('chatbot_settings')
    .upsert(
      { key: 'studio_knowledge', value: content },
      { onConflict: 'key' }
    )
    .select()

  if (error) {
    console.error('❌ Failed to upload:', error.message)
    process.exit(1)
  }

  console.log('✅ Successfully uploaded knowledge base to Supabase!')
  console.log(data)
}

main().catch(console.error)
