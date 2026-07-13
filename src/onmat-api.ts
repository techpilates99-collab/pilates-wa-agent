// ══════════════════════════════════════════════════
// onmat.id booking API client
//
// ALL booking business logic (seat holds, packages, Xendit payment links,
// cancellation rules) lives in the website codebase and is exposed to this
// bot via /api/wa/*. The bot is a conversation layer only — it never talks
// to Supabase or a payment gateway directly. One fix on the web side is
// instantly live for WhatsApp too.
//
// Env: ONMAT_API_URL (default https://onmat.id), ONMAT_API_SECRET (same
// value as the website's WA_API_SECRET).
// ══════════════════════════════════════════════════

const BASE = (process.env.ONMAT_API_URL || 'https://onmat.id').replace(/\/$/, '')
const SECRET = process.env.ONMAT_API_SECRET || ''

async function api(path: string, init?: { method?: string; body?: unknown }): Promise<any> {
  if (!SECRET) throw new Error('ONMAT_API_SECRET belum diset.')
  const res = await fetch(`${BASE}/api/wa${path}`, {
    method: init?.method || 'GET',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(
      data?.error ? `API error: ${data.error}` : `API error ${res.status} di ${path}`,
    )
  }
  return data
}

export function checkSchedules(date: string) {
  return api(`/schedules?date=${encodeURIComponent(date)}`)
}

export function createBooking(
  scheduleId: string,
  customerName: string,
  phone: string,
  usePackage?: boolean,
) {
  return api('/bookings', {
    method: 'POST',
    body: { phone, name: customerName, schedule_id: scheduleId, use_package: usePackage },
  })
}

export function cancelBooking(phone: string, bookingId: string) {
  return api('/bookings/cancel', { method: 'POST', body: { phone, booking_id: bookingId } })
}

export function getStatus(phone: string) {
  return api(`/customers?phone=${encodeURIComponent(phone)}`)
}

export function listPackages() {
  return api('/packages')
}

export function buyPackage(packageId: string, customerName: string, phone: string) {
  return api('/packages/purchase', {
    method: 'POST',
    body: { phone, name: customerName, package_id: packageId },
  })
}

/** Live knowledge base (schedule/prices generated from the booking DB). */
export async function fetchKnowledge(): Promise<string> {
  const data = await api('/knowledge')
  if (!data?.knowledge) throw new Error('knowledge kosong')
  return data.knowledge as string
}
