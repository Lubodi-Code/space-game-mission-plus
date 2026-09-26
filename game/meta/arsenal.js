import { STRUCTURES } from '../balance.js'
import { profile, levelFromXp } from './profile.js'

// Arsenal: torretas extra que se desbloquean para siempre con Chatarra (y nivel mínimo).
// Solo con moneda que se gana jugando: nada que dé ventaja se vende con dinero real.
// Las estructuras sin `arsenal` están siempre disponibles.

export const ARSENAL = STRUCTURES.filter((s) => s.arsenal)

export function arsenalOwned(key) {
  return (profile.arsenal || []).includes(key)
}

// 'owned' | 'level' (falta nivel) | 'poor' (falta Chatarra) | 'available'
export function arsenalState(def) {
  if (!def.arsenal || arsenalOwned(def.key)) return 'owned'
  if (levelFromXp(profile.xp).level < (def.arsenal.level || 1)) return 'level'
  if (profile.scrap < def.arsenal.scrap) return 'poor'
  return 'available'
}

export function buyArsenal(key) {
  const def = ARSENAL.find((s) => s.key === key)
  if (!def || arsenalState(def) !== 'available') return false
  profile.scrap -= def.arsenal.scrap
  ;(profile.arsenal ||= []).push(key)
  return true
}

// Lo que aparece en la barra de construcción (en orden de catálogo).
export function buildableStructures() {
  return STRUCTURES.filter((s) => !s.arsenal || arsenalOwned(s.key))
}

// Roles que disparan (modo de fuego automático / fijar blanco en el HUD).
export const WEAPON_ROLES = ['turret', 'missile', 'tesla', 'cryo', 'railgun', 'flak', 'mortar']
