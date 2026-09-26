import { profile } from './profile.js'
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
  { id: 'hull', label: 'Naves' },
  { id: 'trail', label: 'Estelas' },
]

// Lo premium (precio en Cristales) solo cuenta si lo confirma el inventario del servidor.
export function owns(id) {
  const c = COSMETIC_BY_ID[id]
  if (c?.price?.crystals) return premium.owned.includes(id)
  return profile.cosmetics.owned.includes(id)
}

export function equipped(slot) {
  const id = profile.cosmetics.equipped[slot]
  return (owns(id) && COSMETIC_BY_ID[id]) || COSMETICS.find((c) => c.slot === slot && !c.price)
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
