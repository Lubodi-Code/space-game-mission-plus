import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

// Cliente con service role: salta RLS. Solo existe en el servidor; nunca se expone.
let admin: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin
  const cfg = useRuntimeConfig()
  if (!cfg.public.supabaseUrl || !cfg.supabaseServiceKey) {
    throw createError({ statusCode: 503, statusMessage: 'Cuentas no configuradas' })
  }
  admin = createClient(cfg.public.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return admin
}

// Usuario autenticado a partir del JWT de Supabase (Authorization: Bearer <access_token>).
export async function requireUser(event: H3Event) {
  const auth = getHeader(event, 'authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Sin sesión' })
  const { data, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !data.user) throw createError({ statusCode: 401, statusMessage: 'Sesión inválida' })
  return data.user
}
