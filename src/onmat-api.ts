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

/** Wajib sebelum booking/beli paket: bikin akun penuh dari dalam chat. */
export function registerAccount(customerName: string, email: string, phone: string) {
  return api('/register', {
    method: 'POST',
    body: { phone, name: customerName, email },
  })
}

export function createBooking(
  scheduleId: string,
  customerName: string,
  phone: string,
  usePackage?: boolean,
  promoCode?: string,
  guestNames?: string[],
) {
  return api('/bookings', {
    method: 'POST',
    body: {
      phone,
      name: customerName,
      schedule_id: scheduleId,
      use_package: usePackage,
      promo_code: promoCode,
      guest_names: guestNames,
    },
  })
}

export function cancelBooking(phone: string, bookingId: string) {
  return api('/bookings/cancel', { method: 'POST', body: { phone, booking_id: bookingId } })
}

/** Pindah booking ke jadwal lain dalam satu langkah (>=12 jam, harga sama). */
export function rescheduleBooking(phone: string, bookingId: string, newScheduleId: string) {
  return api('/bookings/reschedule', {
    method: 'POST',
    body: { phone, booking_id: bookingId, new_schedule_id: newScheduleId },
  })
}

/** Masuk antrian kelas penuh — notifikasi slot kosong dikirim via email. */
export function joinWaitlist(phone: string, scheduleId: string) {
  return api('/waitlist', { method: 'POST', body: { phone, schedule_id: scheduleId } })
}

export function getStatus(phone: string) {
  return api(`/customers?phone=${encodeURIComponent(phone)}`)
}

export function listPackages(phone?: string) {
  return api(phone ? `/packages?phone=${encodeURIComponent(phone)}` : '/packages')
}

export function buyPackage(
  packageId: string,
  customerName: string,
  phone: string,
  promoCode?: string,
) {
  return api('/packages/purchase', {
    method: 'POST',
    body: { phone, name: customerName, package_id: packageId, promo_code: promoCode },
  })
}

/** Live knowledge base (schedule/prices generated from the booking DB). */
export async function fetchKnowledge(): Promise<string> {
  const data = await api('/knowledge')
  if (!data?.knowledge) throw new Error('knowledge kosong')
  return data.knowledge as string
}
