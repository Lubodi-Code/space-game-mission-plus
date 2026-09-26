import { packById } from '~~/shared/catalog.js'

// Crea la orden (pending) y su Payment Intent en ONVO. El precio sale del catálogo del
// servidor; del cliente solo se acepta el id del paquete.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { packId } = await readBody<{ packId?: string }>(event)
  const pack = packById(String(packId || ''))
  if (!pack) throw createError({ statusCode: 400, statusMessage: 'Paquete inválido' })

  const db = supabaseAdmin()
  const amount = toOnvoAmount(pack.priceCRC)
  const { data: order, error } = await db.from('orders').insert({
    user_id: user.id,
    pack_id: pack.id,
    crystals: pack.crystals + pack.bonus,
    amount,
    currency: 'CRC',
  }).select('id').single()
  if (error || !order) throw createError({ statusCode: 500, statusMessage: 'No se pudo crear la orden' })

  let intent
  try {
    intent = await createIntent({
      amount,
      currency: 'CRC',
      description: `${pack.label} (${pack.crystals + pack.bonus} Cristales)`,
      metadata: { orderId: order.id, userId: user.id },
    })
  } catch {
    await db.from('orders').update({ status: 'failed' }).eq('id', order.id)
    throw createError({ statusCode: 502, statusMessage: 'ONVO no respondió' })
  }

  const { error: upErr } = await db.from('orders').update({ onvo_intent_id: intent.id }).eq('id', order.id)
  if (upErr) throw createError({ statusCode: 500, statusMessage: 'No se pudo registrar el pago' })

  return { orderId: order.id, paymentIntentId: intent.id }
})
