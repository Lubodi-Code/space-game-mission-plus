import { EnemyType } from '../enemies/EnemyType.js'

// Sectores = nivel de campaña. Mismas 10 oleadas, pero cada sector endurece la horda
// (multiplicadores sobre la dificultad) y habilita tipos de enemigo nuevos. Ganar el
// sector N desbloquea el N+1 (profile.sectorUnlocked).
//
// `roster` es la lista de tipos NUEVOS que aparecen desde ese sector (se acumulan).

const BASE_ROSTER = [
  EnemyType.GRUNT, EnemyType.RUNNER, EnemyType.SABOTEUR, EnemyType.SKIRMISHER,
  EnemyType.BRUTE, EnemyType.ARTILLERY, EnemyType.MOTHERSHIP, EnemyType.COMMANDSHIP,
]

const DEFS = [
  { name: 'Cinturón de Orión', roster: BASE_ROSTER },
  { name: 'Nebulosa Carmesí', roster: [EnemyType.KAMIKAZE] },
  { name: 'Fosa de Hielo', roster: [EnemyType.WARDEN] },
  { name: 'Colmena Lejana', roster: [EnemyType.LEECH] },
  { name: 'Frente Ámbar', roster: [EnemyType.BOMBER] },
  { name: 'Anillo Roto', roster: [] },
  { name: 'Vacío Silente', roster: [] },
  { name: 'Corona Estelar', roster: [] },
  { name: 'Horizonte de Eventos', roster: [] },
  { name: 'Núcleo del Enjambre', roster: [] },
]

export const SECTORS = DEFS.map((d, i) => {
  const n = i + 1
  return {
    n,
    name: d.name,
    newEnemies: d.roster === BASE_ROSTER ? [] : d.roster,
    roster: DEFS.slice(0, n).flatMap((x) => x.roster),
    hpMult: 1 + 0.18 * i,
    dmgMult: 1 + 0.1 * i,
    countMult: 1 + 0.08 * i,
    // Recompensa de Chatarra por victoria (crece con el sector).
    reward: 60 + 40 * i,
  }
})

export const MAX_SECTOR = SECTORS.length

export function sectorByN(n) {
  return SECTORS[Math.min(Math.max(1, n | 0), MAX_SECTOR) - 1]
}
