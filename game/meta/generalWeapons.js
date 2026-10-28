import { profile } from './profile.js'
import { owns } from './cosmetics.js'

// Arma del General: se equipa en la tienda ANTES de la partida y queda fija toda la partida
// (ya no hay cambio con T). Multiplicadores sobre GENERAL (balance.js) y las mejoras del General.
// type: tipo de daño para las resistencias de los enemigos (Enemy.hit).
// requires: cosmético que la desbloquea (la Sunrae viene con la nave Sunrei, que se compra con Chatarra).
export const GENERAL_WEAPONS = {
  laser: {
    id: 'laser', label: 'Láser', type: 'beam',
    desc: 'Un rayo rápido a un solo blanco.',
    damage: 1, cooldown: 1, range: 1, beams: 1,
  },
  missile: {
    id: 'missile', label: 'Misiles', type: 'missile',
    desc: 'Misil teledirigido con daño en área. Más lento entre disparos.',
    damage: 2.4, cooldown: 2.6, range: 1, splash: 38, speed: 240,
  },
  sunrae: {
    id: 'sunrae', label: 'Sunrae láser', type: 'beam', requires: 'design_sunrei',
    desc: 'Abanico de 5 rayos a blancos distintos. Cada rayo hace menos daño.',
    damage: 0.4, cooldown: 1.15, range: 1.15, beams: 5, color: 0xffb347,
  },
}

export const WEAPON_ORDER = ['laser', 'missile', 'sunrae']

export function ownsWeapon(id) {
  const w = GENERAL_WEAPONS[id]
  return !!w && (!w.requires || owns(w.requires))
}

// Se guarda en cosmetics.equipped.weapon: ese mapa ya se sincroniza con la cuenta tal cual.
// Si se perdió el requisito (p. ej. cerró sesión), vuelve al láser.
export function equippedWeaponId() {
  const id = profile.cosmetics.equipped.weapon
  return ownsWeapon(id) ? id : 'laser'
}

// Arma de un aliado en cooperativo: viene del 'hello' del cliente (equipped.weapon). El host solo
// acepta ids conocidos; la propiedad de la Sunrei vive en el perfil local del cliente y no se puede
// comprobar desde el host (se compra con Chatarra, no con dinero).
export function weaponFromRemote(id) {
  return typeof id === 'string' && Object.hasOwn(GENERAL_WEAPONS, id) ? id : 'laser'
}

export function equipWeapon(id) {
  if (!ownsWeapon(id)) return false
  profile.cosmetics.equipped.weapon = id
  return true
}
