// Webhook de ONVO. Única vía que acredita Cristales.
// 1) Header X-Webhook-Secret (tiempo constante). 2) No se confía en el payload: se re-consulta
// el intent a ONVO. 3) credit_order valida intent/monto/moneda y es idempotente.
// Respuesta: 2xx solo si el evento quedó procesado (o no es nuestro). Ante fallos de ONVO o de
// Supabase se responde 5xx para que ONVO reintente.

// Errores de negocio de credit_order: reintentar no los arregla → 2xx + log.
const PERMANENT = ['order_not_found', 'order_not_payable', 'intent_mismatch', 'amount_mismatch']

export default defineEventHandler(async (event) => {
  if (!webhookSecretOk(getHeader(event, 'x-webhook-secret'))) {
    throw createError({ statusCode: 401, statusMessage: 'Firma inválida' })
  }
  const body = await readBody<{ type?: string; data?: { id?: string } }>(event)
  const intentId = body?.data?.id
  if (!intentId) return { ok: true, ignored: 'sin id' }
  if (body.type !== 'payment-intent.succeeded' && body.type !== 'payment-intent.failed') {
    return { ok: true, ignored: body.type }
  }

  const db = supabaseAdmin()
  const { data: order, error: qErr } = await db.from('orders').select('id, status').eq('onvo_intent_id', intentId).maybeSingle()
  if (qErr) throw createError({ statusCode: 503, statusMessage: 'DB no disponible' })
  if (!order) return { ok: true, ignored: 'orden desconocida' } // no es nuestro

  // Sea cual sea el evento, manda el estado ACTUAL del intent en ONVO (llegan fuera de orden).
  const intent = await getIntent(intentId) // si ONVO falla → 5xx → reintenta

  if (intent.status === 'succeeded') {
    const { error } = await db.rpc('credit_order', {
      p_order_id: order.id,
      p_intent_id: intent.id,
      p_amount: intent.amount,
      p_currency: intent.currency,
    })
    if (error) {
      if (PERMANENT.some((k) => error.message.includes(k))) {
        console.error('[onvo webhook] no acreditada', order.id, error.message)
        return { ok: false, error: error.message }
      }
      throw createError({ statusCode: 503, statusMessage: 'No se pudo acreditar' })
    }
    return { ok: true }
  }

  // Solo 'canceled' es terminal. Tras un fallo el intent vuelve a requires_payment_method y el
  // comprador puede reintentar: la orden sigue 'pending'.
  if (intent.status === 'canceled' && order.status === 'pending') {
    const { error } = await db.from('orders').update({ status: 'failed' }).eq('id', order.id).eq('status', 'pending')
    if (error) throw createError({ statusCode: 503, statusMessage: 'DB no disponible' })
  }
  return { ok: true, status: intent.status }
})
