import { profile, levelFromXp } from './profile.js'
import { premium } from './premium.js'

// Catálogo de cosméticos. Solo cambian el aspecto: nunca daño, vida ni cadencia.
// slot: 'beam' (rayo del comandante y del Mega Rayo) | 'hull' (nave del comandante) | 'trail' (estela)
// price: { scrap } se compra con Chatarra ganada jugando; { crystals } es moneda premium y
// solo la acredita el servidor tras un pago confirmado (Fase 10E).
// rarity: common | rare | epic | legendary (color del marco en la tienda)

export { RARITY, COSMETICS } from '../../shared/catalog.js'
import { COSMETICS } from '../../shared/catalog.js'

export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]))

export const SLOTS = [
  { id: 'beam', label: 'Rayos' },
  { id: 'design', label: 'Diseños' },
  { id: 'hull', label: 'Colores de nave' },
  { id: 'trail', label: 'Estelas' },
  { id: 'explosion', label: 'Explosiones' },
  { id: 'nexus', label: 'Núcleo' },
  { id: 'turret', label: 'Torretas' },
]

// Lo premium (precio en Cristales) solo cuenta si lo confirma el inventario del servidor.
export function owns(id) {
  const c = COSMETIC_BY_ID[id]
  if (!c) return false
  if (c.price?.crystals) return premium.owned.includes(id)
  if (!c.price && !c.unlock) return true // los 'default' de cada slot
  return profile.cosmetics.owned.includes(id)
}

export function equipped(slot) {
  const id = profile.cosmetics.equipped[slot]
  return (owns(id) && COSMETIC_BY_ID[id]) || COSMETICS.find((c) => c.slot === slot && !c.price && !c.unlock)
}

// Color HSV → 0xRRGGBB (para el rayo animado 'hue').
function hsv(h, s, v) {
  const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255)
}

export function equippedBeam(now = (typeof performance !== 'undefined' ? performance.now() : 0)) {
  const b = equipped('beam')
  if (b.anim === 'hue') return { ...b, color: hsv((now / 2400) % 1, 0.75, 1) }
  return b
}

// Color de un cosmético con 'hue' animado resuelto al instante actual.
function liveColor(c, now = (typeof performance !== 'undefined' ? performance.now() : 0)) {
  return c.anim === 'hue' ? hsv((now / 2400) % 1, 0.75, 1) : c.color
}

// Overrides de color para el render (null/orig = sin cosmético).
export function explosionColor(orig) {
  const c = equipped('explosion')
  return c?.color != null ? liveColor(c) : orig
}
export function turretBeamColor(orig) {
  const c = equipped('turret')
  return c?.color != null ? liveColor(c) : orig
}
export function nexusColor(orig) {
  const c = equipped('nexus')
  return c?.color != null ? c.color : orig
}

// ---------------------------------------------------------------- desbloqueos por progreso
const UNLOCK_LABEL = {
  level: (n) => `Nivel ${n}`,
  sector: (n) => `Ganá el sector ${n}`,
  wins: (n) => `${n} victorias`,
  kills: (n) => `${n.toLocaleString('es-CR')} bajas`,
  runs: (n) => `${n} partidas`,
}

function statFor(key) {
  if (key === 'level') return levelFromXp(profile.xp).level
  if (key === 'sector') return profile.maxSectorWon || 0
  return profile.stats[key] || 0
}

// Estado de un desbloqueo: { key, need, cur, done, label }.
export function unlockProgress(c) {
  if (!c.unlock) return null
  const [key, need] = Object.entries(c.unlock)[0]
  const cur = statFor(key)
  return { key, need, cur: Math.min(cur, need), done: cur >= need, label: UNLOCK_LABEL[key]?.(need) || '' }
}

// Reclama todo lo desbloqueado que falte. Devuelve los cosméticos nuevos.
export function claimUnlocks() {
  const out = []
  for (const c of COSMETICS) {
    if (!c.unlock || profile.cosmetics.owned.includes(c.id)) continue
    if (unlockProgress(c).done) { profile.cosmetics.owned.push(c.id); out.push(c) }
  }
  return out
}

// Compra con Chatarra (moneda blanda, local). Las compras en cristales pasan por el servidor.
export function buyWithScrap(id) {
  const c = COSMETIC_BY_ID[id]
  if (!c || owns(id) || !c.price?.scrap) return false
  if (profile.scrap < c.price.scrap) return false
  profile.scrap -= c.price.scrap
  profile.cosmetics.owned.push(id)
  return true
}

export function equip(id) {
  const c = COSMETIC_BY_ID[id]
  if (!c || !owns(id)) return false
  profile.cosmetics.equipped[c.slot] = id
  return true
}

// Rotación destacada del día (determinista por fecha, como las tiendas de Fortnite).
export function featuredToday(date = new Date()) {
  const seed = date.getUTCFullYear() * 1000 + Math.floor((date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5)
  const pool = COSMETICS.filter((c) => c.price)
  const out = []
  let x = seed
  while (out.length < 3 && out.length < pool.length) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    const pick = pool[x % pool.length]
    if (!out.includes(pick)) out.push(pick)
  }
  return out
}
