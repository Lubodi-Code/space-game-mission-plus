import { timingSafeEqual } from 'node:crypto'

// Cliente mínimo de la API de ONVO Pay (https://docs.onvopay.com). Solo servidor.
const API = 'https://api.onvopay.com/v1'

export interface OnvoIntent {
  id: string
  status: string // requires_payment_method | requires_action | processing | succeeded | canceled
  amount: number
  currency: string
}

// Único lugar de conversión colones → unidad de `amount` de ONVO. PENDIENTE de verificar en
// test mode: la doc usa 500000 en su ejemplo (sugiere céntimos), pero el colón no se usa con
// céntimos. Ajustar NUXT_ONVO_AMOUNT_MULTIPLIER (100 o 1) tras ver un intent de ₡1 000.
export function toOnvoAmount(crc: number): number {
  const mult = Number(useRuntimeConfig().onvoAmountMultiplier) || 100
  return Math.round(crc * mult)
}

async function onvo<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = useRuntimeConfig().onvoSecretKey
  if (!key) throw createError({ statusCode: 503, statusMessage: 'Pagos no configurados' })
  return await $fetch<T>(API + path, {
    method: (init.method || 'GET') as any,
    headers: { Authorization: `Bearer ${key}` },
    body: init.body as any,
  })
}

export function createIntent(input: { amount: number; currency: string; description: string; metadata: Record<string, string> }) {
  return onvo<OnvoIntent>('/payment-intents', { method: 'POST', body: input })
}

export function getIntent(id: string) {
  return onvo<OnvoIntent>(`/payment-intents/${encodeURIComponent(id)}`)
}

// Compara el header X-Webhook-Secret con el configurado en tiempo constante.
export function webhookSecretOk(received: string | undefined): boolean {
  const expected = useRuntimeConfig().onvoWebhookSecret
  if (!expected || !received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
