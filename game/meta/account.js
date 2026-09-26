import { reactive } from 'vue'
import { createClient } from '@supabase/supabase-js'
import { useRuntimeConfig } from '#imports'
import { profile } from './profile.js'
import { premium, setPremium, clearPremium } from './premium.js'

// Cuenta del jugador (Supabase Auth). Solo hace falta para lo premium: Cristales y cosméticos
// canjeados viven en el servidor; XP/Chatarra/investigación siguen locales.
export const account = reactive({ ready: false, configured: false, user: null, busy: false, error: '' })

let sb = null

export function initAccount() {
  if (sb || typeof window === 'undefined') return sb
  const cfg = useRuntimeConfig().public
  account.configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey)
  if (!account.configured) { account.ready = true; return null }
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
  sb.auth.getSession().then(({ data }) => {
    account.user = data.session?.user || null
    account.ready = true
    if (account.user) syncAccount()
  })
  sb.auth.onAuthStateChange((_e, session) => {
    const was = account.user?.id
    account.user = session?.user || null
    if (account.user?.id !== was) { clearPremium(); profile.crystals = 0 }
    if (account.user && account.user.id !== was) syncAccount()
  })
  return sb
}

async function token() {
  const { data } = await sb.auth.getSession()
  return data.session?.access_token || ''
}

// fetch autenticado contra las rutas server/ (errores → mensaje legible en account.error).
export async function api(path, opts = {}) {
  const t = await token()
  if (!t) throw new Error('Iniciá sesión primero')
  try {
    return await $fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t}` } })
  } catch (e) {
    throw new Error(e?.data?.statusMessage || e?.statusMessage || 'Error de red')
  }
}

// Vuelca saldo e inventario del servidor sobre el perfil local. `syncSeq` descarta respuestas
// viejas (una sync lenta no pisa a una compra o sync posterior).
let syncSeq = 0
export async function syncAccount() {
  if (!account.user) return
  const my = ++syncSeq
  try {
    const uid = account.user.id
    const me = await api('/api/me')
    if (my !== syncSeq || account.user?.id !== uid) return // respuesta vieja o cambió la sesión
    profile.crystals = me.crystals
    setPremium(uid, me.inventory)
  } catch (e) {
    account.error = e.message
  }
}

export async function loginGoogle() {
  initAccount()
  await sb?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
}

export async function loginEmail(email) {
  initAccount()
  account.busy = true
  account.error = ''
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })
  account.busy = false
  if (error) account.error = error.message
  return !error
}

export async function logout() {
  await sb?.auth.signOut()
}

export async function buyCosmeticWithCrystals(itemId) {
  const r = await api('/api/shop/buy', { method: 'POST', body: { itemId } })
  // La respuesta del canje YA es confirmación del servidor: se aplica y se invalidan syncs viejas.
  syncSeq++
  profile.crystals = r.crystals
  if (!premium.owned.includes(r.itemId)) setPremium(account.user.id, [...premium.owned, r.itemId])
  return r
}
