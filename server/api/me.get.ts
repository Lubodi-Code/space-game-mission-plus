// Saldo de Cristales e inventario premium del usuario (fuente de verdad del servidor).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = supabaseAdmin()
  const [{ data: wallet }, { data: inv }] = await Promise.all([
    db.from('wallets').select('crystals').eq('user_id', user.id).maybeSingle(),
    db.from('inventory').select('item_id').eq('user_id', user.id),
  ])
  return { crystals: wallet?.crystals ?? 0, inventory: (inv || []).map((r) => r.item_id) }
})
