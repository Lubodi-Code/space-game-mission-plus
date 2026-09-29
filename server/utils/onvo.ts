import { timingSafeEqual } from 'node:crypto'

// Cliente mínimo de la API de ONVO Pay (https://docs.onvopay.com). Solo servidor.
const API = 'https://api.onvopay.com/v1'

export interface OnvoIntent {
  id: string
  status: string // requires_payment_method | requires_action | processing | succeeded | canceled
  amount: number
  currency: string
}

// Único lugar de conversión colones → unidad de `amount` de ONVO. La doc de webhooks lo dice
// explícito: "Los montos se envían como enteros en la unidad mínima de la moneda… 500000 representa
// ₡5,000.00 en CRC". Fijo en 100 (no configurable): un multiplicador mal puesto cobraría ₡10 por ₡1 000.
export function toOnvoAmount(crc: number): number {
  return Math.round(crc * 100)
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
