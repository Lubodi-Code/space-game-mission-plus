// Protocolo multijugador (host autoritativo). Sin Phaser ni DOM: se testea con node
// (scripts/check-net-protocol.mjs).
//
// Cliente → host: *intents*. El host los pasa por parseIntent() antes de tocar el juego; lo que
// no valida se descarta en silencio. parseIntent solo controla forma, tipos, rangos y enums; lo
// económico (minerales, prerequisitos, cooldowns) lo siguen decidiendo applyUpgrade/requestAbility
// en el host, que ya lo validan. El pid NUNCA viene del mensaje: lo sella el host según la conexión.
//
// Host → clientes: 'welcome', 'start', 'roster', 'snap', 'ping', 'quick', 'bye'.

import { WORLD } from '../balance.js'

export const PROTOCOL_VERSION = 2

export const ABILITY_IDS = ['megalaser', 'emp', 'repair', 'strike']
export const FIRE_MODES = ['auto', 'focus']
export const PING_KINDS = ['help', 'attack', 'defend', 'resources']
// Chat rápido: solo frases predefinidas (sin texto libre → nada que moderar).
export const QUICK_MESSAGES = [
  '¡Gracias!', 'Voy', 'Necesito minerales', 'Cuidado: jefe',
  'Defiendan el Núcleo', 'Construyo torretas acá', 'Listo', 'Adelanten la oleada',
]

// Tope de tamaño de un mensaje del cliente (JSON aproximado). Lo aplica net.js antes de parseIntent.
export const MAX_INTENT_BYTES = 2048
export const HEARTBEAT_MS = 2000
export const TIMEOUT_MS = 6000
export const PING_COOLDOWN_MS = 1500
export const PING_LIFETIME_MS = 5000
export const QUICK_COOLDOWN_MS = 1500

const MAX_ID_LEN = 32
const MAX_NAME_LEN = 16

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const inWorld = (x, y) => isNum(x) && isNum(y) && x >= 0 && y >= 0 && x <= WORLD.width && y <= WORLD.height
// Ids de estructura/enemigo: enteros o strings cortos.
const isId = (v) => (Number.isInteger(v) && v >= 0) || (typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LEN)
const isKey = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LEN
// Recorre como mucho 24 claves propias: un objeto enorme no se materializa entero.
function cleanEquipped(e) {
  const out = {}
  if (!e || typeof e !== 'object' || Array.isArray(e)) return out
  let seen = 0; let kept = 0
  for (const k in e) {
    if (++seen > 24 || kept >= 12) break
    if (!Object.prototype.hasOwnProperty.call(e, k)) continue
    if (isKey(k) && isKey(e[k])) { out[k] = e[k]; kept++ }
  }
  return out
}
const cleanName = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME_LEN) : '')

// Validador por tipo de intent: recibe el mensaje crudo y devuelve el intent normalizado o null.
const INTENTS = {
  hello: (d) => ({
    t: 'hello',
    name: cleanName(d.name),
    // Cosméticos visibles para los demás: solo ids de catálogo (el render ignora los desconocidos).
    equipped: cleanEquipped(d.equipped),
    token: isKey(d.token) ? d.token : null, // token de reconexión (rejoin)
    v: Number.isInteger(d.v) ? d.v : 0,
  }),
  heartbeat: () => ({ t: 'heartbeat' }),
  ready: (d) => ({ t: 'ready', ready: d.ready === true }), // sala: invitado listo / no listo
  bye: () => ({ t: 'bye' }), // el invitado sale a propósito (no reintentar ni esperar rejoin)
  cursor: (d) => (inWorld(d.x, d.y) ? { t: 'cursor', x: d.x, y: d.y } : null),
  build: (d) => (isKey(d.key) && inWorld(d.x, d.y) ? { t: 'build', key: d.key, x: d.x, y: d.y } : null),
  // 'general' (legado) y 'move' son lo mismo: mover el comandante propio.
  general: (d) => (inWorld(d.x, d.y) ? { t: 'move', x: d.x, y: d.y } : null),
  move: (d) => (inWorld(d.x, d.y) ? { t: 'move', x: d.x, y: d.y } : null),
  speed: (d) => ([0, 0.5, 1, 2, 3].includes(d.v) ? { t: 'speed', v: d.v } : null),
  upgrade: (d) => (isId(d.sid) && isKey(d.uid) ? { t: 'upgrade', sid: d.sid, uid: d.uid } : null),
  demolish: (d) => (isId(d.sid) ? { t: 'demolish', sid: d.sid } : null),
  fireMode: (d) => (isId(d.sid) && FIRE_MODES.includes(d.mode)
    ? { t: 'fireMode', sid: d.sid, mode: d.mode, targetId: isId(d.targetId) ? d.targetId : null } : null),
  upgradeGeneral: (d) => (isKey(d.uid) ? { t: 'upgradeGeneral', uid: d.uid } : null),
  // Habilidad: 'self' no trae objetivo; 'point' trae x,y; 'enemy' trae targetId (+x,y de respaldo).
  ability: (d) => {
    if (!ABILITY_IDS.includes(d.id)) return null
    const out = { t: 'ability', id: d.id, x: null, y: null, targetId: null }
    if (d.x != null || d.y != null) {
      if (!inWorld(d.x, d.y)) return null
      out.x = d.x; out.y = d.y
    }
    if (d.targetId != null) {
      if (!isId(d.targetId)) return null
      out.targetId = d.targetId
    }
    return out
  },
  callWave: () => ({ t: 'callWave' }),
  ping: (d) => (PING_KINDS.includes(d.kind) && inWorld(d.x, d.y) ? { t: 'ping', kind: d.kind, x: d.x, y: d.y } : null),
  quick: (d) => (Number.isInteger(d.msgId) && d.msgId >= 0 && d.msgId < QUICK_MESSAGES.length ? { t: 'quick', msgId: d.msgId } : null),
}

export const INTENT_TYPES = Object.keys(INTENTS)

/** Valida un intent del cliente. Devuelve el intent normalizado o null si hay que descartarlo. */
export function parseIntent(d) {
  if (!d || typeof d !== 'object' || typeof d.t !== 'string') return null
  // hasOwn: 'constructor'/'toString' heredados no son intents.
  if (!Object.prototype.hasOwnProperty.call(INTENTS, d.t)) return null
  return INTENTS[d.t](d)
}

// Límite de frecuencia por (pid, tipo). Un cliente modificado no puede inundar al host de
// construcciones, señales o chat. Intervalos mínimos en ms; lo no listado no se limita.
export const RATE_LIMITS_MS = {
  build: 60, upgrade: 120, demolish: 200, fireMode: 100, upgradeGeneral: 200,
  ability: 250, callWave: 1000, speed: 250, ping: PING_COOLDOWN_MS, quick: QUICK_COOLDOWN_MS,
}

export function createRateLimiter(limits = RATE_LIMITS_MS) {
  const last = new Map() // `${pid}:${t}` -> ms
  return {
    allow(pid, t, now) {
      const min = limits[t]
      if (!min) return true
      const k = `${pid}:${t}`
      const prev = last.get(k)
      if (prev != null && now - prev < min) return false
      last.set(k, now)
      return true
    },
    forget(pid) {
      for (const k of last.keys()) if (k.startsWith(`${pid}:`)) last.delete(k)
    },
  }
}

// Mensajes del host (el cliente también los valida: podría conectarse a un peer malicioso).
export function parseHostMessage(d) {
  if (!d || typeof d !== 'object') return null
  switch (d.t) {
    case 'welcome':
      return Number.isInteger(d.pid) && d.pid > 0 ? { t: 'welcome', pid: d.pid, token: isKey(d.token) ? d.token : null, v: d.v | 0 } : null
    case 'start':
      return typeof d.difficulty === 'string' && typeof d.mode === 'string' && Number.isInteger(d.sector) && Number.isInteger(d.seed)
        ? { t: 'start', difficulty: d.difficulty, mode: d.mode, sector: d.sector, seed: d.seed } : null
    case 'roster':
      return Array.isArray(d.players) ? { t: 'roster', players: d.players.slice(0, 4)
        .filter((p) => p && typeof p === 'object' && Number.isInteger(p.pid))
        .map((p) => ({ pid: p.pid, name: cleanName(p.name), ready: !!p.ready, host: !!p.host, equipped: cleanEquipped(p.equipped) })) } : null
    case 'ping':
      return Number.isInteger(d.pid) && PING_KINDS.includes(d.kind) && inWorld(d.x, d.y) ? { t: 'ping', pid: d.pid, kind: d.kind, x: d.x, y: d.y } : null
    case 'quick':
      return Number.isInteger(d.pid) && Number.isInteger(d.msgId) && d.msgId >= 0 && d.msgId < QUICK_MESSAGES.length ? { t: 'quick', pid: d.pid, msgId: d.msgId } : null
    case 'heartbeat':
      return { t: 'heartbeat' }
    case 'bye':
      return { t: 'bye', reason: typeof d.reason === 'string' ? d.reason.slice(0, 64) : '' }
    case 'snap':
      // Forma mínima: applySnapshot itera estos arreglos directamente.
      for (const k of ['structs', 'enemies', 'gen']) if (d[k] != null && !Array.isArray(d[k])) return null
      if (d.eco != null && typeof d.eco !== 'object') return null
      return { ...d, structs: d.structs || [], enemies: d.enemies || [], gen: d.gen || [] }
    default:
      return null
  }
}

/** Colores por pid (host 0 + hasta 3 invitados), compartidos por marcadores, chat y comandantes. */
export const PLAYER_COLORS = [0x8be9fd, 0xffcc55, 0xff6ad5, 0x50fa7b]
export const playerColor = (pid) => PLAYER_COLORS[((pid % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]

/** Token de sesión aleatorio para reconectar con el mismo pid/comandante. */
export function newSessionToken() {
  const a = new Uint8Array(12)
  globalThis.crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}
