import { crystalPrice } from '~~/shared/catalog.js'

// Canje de un cosmético premium con Cristales. Precio desde el catálogo del servidor.
const ERRORS: Record<string, [number, string]> = {
  insufficient_funds: [402, 'No te alcanzan los Cristales'],
  already_owned: [409, 'Ya lo tenés'],
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { itemId } = await readBody<{ itemId?: string }>(event)
  const price = crystalPrice(String(itemId || ''))
  if (!price) throw createError({ statusCode: 400, statusMessage: 'Ítem no se vende con Cristales' })

  const { data, error } = await supabaseAdmin().rpc('buy_cosmetic', {
    p_user_id: user.id, p_item_id: itemId, p_price: price,
  })
  if (error) {
    const key = Object.keys(ERRORS).find((k) => error.message.includes(k))
    const [code, msg] = key ? ERRORS[key] : [500, 'No se pudo completar el canje']
    throw createError({ statusCode: code, statusMessage: msg })
  }
  return { crystals: data as number, itemId }
})
