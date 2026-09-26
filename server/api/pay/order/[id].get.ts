// Estado de una orden, solo para su dueño. El cliente lo sondea tras el onSuccess del SDK.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const { data } = await supabaseAdmin()
    .from('orders').select('id, status, crystals').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Orden no encontrada' })
  return data
})
