import { profile, hasResearch, levelFromXp } from './profile.js'
import { setResearchCheck } from '../structures/upgrades.js'

// Árbol de investigación: progreso ENTRE partidas. Se paga con Chatarra (profile.scrap) y
// algunos nodos piden nivel de comandante. Tres columnas: Ingeniería (nivel 3 de edificios),
// Mando (habilidades del comandante) y Logística (bonos al empezar la partida).
//
// unlock.ability → meta del id en game/abilities.js
// unlock.bonus   → lo lee runBonuses() al crear la escena

export const RESEARCH = [
  // ---- Ingeniería
  { id: 'r_laser3', col: 'Ingeniería', label: 'Láser nivel 3', desc: 'Sobrecarga de ráfaga y Foco prismático para la Torreta Láser.', cost: 120, level: 2 },
  { id: 'r_missile3', col: 'Ingeniería', label: 'Misiles nivel 3', desc: 'Tormenta de misiles y Riel orbital.', cost: 150, level: 3, requires: 'r_laser3' },
  { id: 'r_collector3', col: 'Ingeniería', label: 'Minería nivel 3', desc: 'Extractor cuántico y Red de minado para el Recolector.', cost: 100, level: 2 },
  { id: 'r_heal3', col: 'Ingeniería', label: 'Enjambre nivel 3', desc: 'Colmena y Regeneración cuántica.', cost: 140, level: 4, requires: 'r_collector3' },
  { id: 'r_bat3', col: 'Ingeniería', label: 'Baterías nivel 3', desc: 'Supercondensador y Fusión fría.', cost: 120, level: 3, requires: 'r_collector3' },

  // ---- Mando (habilidades)
  { id: 'r_emp', col: 'Mando', label: 'Pulso EMP', desc: 'Habilidad: paraliza a los enemigos alrededor del comandante.', cost: 150, level: 2, unlock: { ability: 'emp' } },
  { id: 'r_repair', col: 'Mando', label: 'Reparación de emergencia', desc: 'Habilidad: repara al instante las estructuras cercanas.', cost: 180, level: 3, requires: 'r_emp', unlock: { ability: 'repair' } },
  { id: 'r_megalaser2', col: 'Mando', label: 'Mega Rayo+', desc: 'El Mega Rayo hace +50% de daño y recarga 25% más rápido.', cost: 220, level: 5, unlock: { bonus: 'megalaser2' } },
  { id: 'r_strike', col: 'Mando', label: 'Bombardeo orbital', desc: 'Habilidad: lluvia de misiles sobre una zona.', cost: 260, level: 6, requires: 'r_repair', unlock: { ability: 'strike' } },

  // ---- Logística (bonos iniciales)
  { id: 'r_start1', col: 'Logística', label: 'Reservas I', desc: '+100 minerales al empezar.', cost: 80, level: 1, unlock: { bonus: 'minerals100' } },
  { id: 'r_build', col: 'Logística', label: 'Constructores ágiles', desc: 'Estructuras se construyen 20% más rápido.', cost: 110, level: 2, requires: 'r_start1', unlock: { bonus: 'build20' } },
  { id: 'r_core', col: 'Logística', label: 'Núcleo reforzado', desc: '+30% de vida del Núcleo.', cost: 140, level: 3, requires: 'r_start1', unlock: { bonus: 'core30' } },
  { id: 'r_start2', col: 'Logística', label: 'Reservas II', desc: '+200 minerales al empezar.', cost: 200, level: 5, requires: 'r_build', unlock: { bonus: 'minerals200' } },
]

const BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]))

// Las mejoras de edificios con `research` consultan el perfil a través de este hook.
setResearchCheck(hasResearch)

export function researchState(r) {
  if (hasResearch(r.id)) return 'owned'
  if (r.requires && !hasResearch(r.requires)) return 'locked'
  if (levelFromXp(profile.xp).level < (r.level || 1)) return 'level'
  if (profile.scrap < r.cost) return 'poor'
  return 'available'
}

export function buyResearch(id) {
  const r = BY_ID[id]
  if (!r || researchState(r) !== 'available') return false
  profile.scrap -= r.cost
  profile.research.push(id)
  return true
}

function hasBonus(key) {
  return RESEARCH.some((r) => r.unlock?.bonus === key && hasResearch(r.id))
}

// Bonos que aplica la escena al empezar una partida (solo/host).
export function runBonuses() {
  return {
    minerals: (hasBonus('minerals100') ? 100 : 0) + (hasBonus('minerals200') ? 200 : 0),
    buildTimeMult: hasBonus('build20') ? 0.8 : 1,
    coreHpMult: hasBonus('core30') ? 1.3 : 1,
    megalaser2: hasBonus('megalaser2'),
  }
}

export function abilityUnlocked(abilityId) {
  if (abilityId === 'megalaser') return true // disponible desde el principio
  return RESEARCH.some((r) => r.unlock?.ability === abilityId && hasResearch(r.id))
}
