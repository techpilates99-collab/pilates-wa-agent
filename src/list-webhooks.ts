import 'dotenv/config'
import { Kirim } from '@kirimdev/sdk'

const kirim = new Kirim({ apiKey: process.env.KIRIM_KEY! })

async function main() {
  console.log("Listing webhooks via REST API:")
  try {
    const res = await fetch("https://api.kirimdev.com/v1/webhook_subscriptions", {
      headers: {
        "Authorization": `Bearer ${process.env.KIRIM_KEY}`
      }
    })
    const data = await res.json()
    console.log("REST Webhooks:", JSON.stringify(data, null, 2))
  } catch (e: any) {
    console.log("REST list failed:", e.message)
  }
}

main().catch(console.error)
