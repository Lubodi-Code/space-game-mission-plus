import { reactive, watch } from 'vue'
import { sb, displayName } from './account.js'
import { profile } from './profile.js'

export const cloud = reactive({ status: 'off', lastSavedAt: null, friendCode: null })

const FIELDS = ['v', 'xp', 'scrap', 'research', 'arsenal', 'sectorUnlocked', 'maxSectorWon', 'bestWave', 'cosmetics', 'stats']
let user = null
let generation = 0
let initialized = false
let mergedOnce = false // la fusión inicial (Chatarra con máximo) ya se aplicó en la nube esta sesión
let revision = 0
let pending = false
let flight = null
let debounceTimer = null
let retryTimer = null
let presenceTimer = null
let stopWatching = null
let backoffMs = 1000

function clearTimers() {
  clearTimeout(debounceTimer)
  clearTimeout(retryTimer)
  clearInterval(presenceTimer)
  debounceTimer = retryTimer = presenceTimer = null
}

function localPayload() {
  const copy = JSON.parse(JSON.stringify(profile))
  return Object.fromEntries(FIELDS.map((key) => [key, copy[key]]))
}

function applyMerged(merged) {
  // El watch síncrono observa cada asignación; durante esta sección no programa subidas.
  suppress = true
  try {
    for (const key of FIELDS) {
      if (!Object.hasOwn(merged, key)) continue
      profile[key] = key === 'stats' ? { ...profile.stats, ...merged.stats }
        : key === 'cosmetics' ? { ...profile.cosmetics, ...merged.cosmetics, equipped: { ...profile.cosmetics.equipped, ...merged.cosmetics?.equipped } }
          : merged[key]
    }
  } finally {
    suppress = false
  }
}

let suppress = false

function scheduleRetry() {
  if (!user || retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flushCloud()
  }, backoffMs)
  backoffMs = Math.min(backoffMs * 2, 60000)
}

async function syncLoop() {
  while (user && pending) {
    pending = false
    clearTimeout(debounceTimer)
    debounceTimer = null
    const current = generation
    const currentUser = user
    cloud.status = 'syncing'
    try {
      if (!initialized) {
        const { data, error } = await sb.rpc('ensure_profile', {
          p_name: displayName(currentUser),
          p_avatar: currentUser.user_metadata?.avatar_url || null,
        })
        if (current !== generation) return
        if (error) throw error
        cloud.friendCode = data
      }

      const sentRevision = revision
      const sentScrap = profile.scrap
      const initial = !mergedOnce
      // p_initial: solo la primera fusión de la sesión junta la Chatarra con el máximo (progreso de
      // invitado + cuenta). Después manda el dispositivo, o gastar Chatarra no tendría efecto.
      const { data, error } = await sb.rpc('merge_profile', { p: localPayload(), p_initial: initial })
      if (current !== generation) return
      if (error) throw error
      // La nube ya guardó la fusión inicial aunque descartemos esta respuesta por un cambio local:
      // un reintento con p_initial devolvería la Chatarra gastada mientras tanto.
      mergedOnce = true
      // Una partida puede terminar durante el RPC. Conservamos sus cambios y repetimos
      // la fusión antes de aplicar una respuesta basada en un perfil anterior.
      if (sentRevision !== revision) {
        // Tras la fusión inicial la nube puede tener MÁS Chatarra que lo enviado (la de la cuenta).
        // El reintento va sin p_initial y mandaría solo la local: rebasamos lo ganado/gastado
        // durante la espera sobre el saldo fusionado para no perder la de la cuenta.
        if (initial && Number.isFinite(Number(data?.scrap))) {
          profile.scrap = Math.max(0, Number(data.scrap) + (profile.scrap - sentScrap))
        }
        pending = true
        continue
      }
      applyMerged(data)
      initialized = true
      backoffMs = 1000
      cloud.lastSavedAt = new Date().toISOString()
      cloud.status = 'saved'
    } catch {
      if (current !== generation) return
      pending = true
      cloud.status = 'error'
      scheduleRetry()
      return
    }
  }
}

function requestSync() {
  if (!user || !sb) return Promise.resolve()
  clearTimeout(retryTimer)
  retryTimer = null
  pending = true
  if (!flight) {
    const currentFlight = syncLoop().finally(() => {
      if (flight !== currentFlight) return
      flight = null
      if (pending && user && !retryTimer) queueMicrotask(() => { void requestSync() })
    })
    flight = currentFlight
  }
  return flight
}

export function flushCloud() {
  return requestSync()
}

async function touchPresence() {
  if (!user || !initialized || document.visibilityState !== 'visible') return
  const current = generation
  try {
    const { error } = await sb.rpc('touch_presence')
    if (current !== generation) return
    if (error) throw error
  } catch {
    if (current !== generation) return
    cloud.status = 'error'
    scheduleRetry()
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') void touchPresence()
}

export function startCloud(nextUser) {
  if (!nextUser || !sb || typeof window === 'undefined') return
  if (user?.id === nextUser.id) return
  stopCloud()
  user = nextUser
  initialized = false
  mergedOnce = false
  pending = true
  cloud.status = 'syncing'
  stopWatching = watch(profile, () => {
    if (suppress || !user) return
    revision++
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void requestSync()
    }, 5000)
  }, { deep: true, flush: 'sync' })
  presenceTimer = setInterval(() => { void touchPresence() }, 60000)
  document.addEventListener('visibilitychange', onVisibilityChange)
  // Supabase Auth pide salir del callback de onAuthStateChange antes de llamar RPC.
  setTimeout(() => { if (user?.id === nextUser.id) void requestSync() }, 0)
}

export function stopCloud() {
  generation++
  user = null
  initialized = false
  mergedOnce = false
  pending = false
  flight = null
  clearTimers()
  stopWatching?.()
  stopWatching = null
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
  cloud.status = 'off'
  cloud.lastSavedAt = null
  cloud.friendCode = null
  backoffMs = 1000
}
