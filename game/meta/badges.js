// Insignias de progreso por sector. Al ganar un sector se obtiene una insignia cuyo nivel
// depende de la dificultad (1 bronce · 2 plata · 3 oro) y nunca baja.
//
// Persistencia: claves numéricas dentro de `profile.stats` (`badgeS1` … `badgeS10` = 0..3).
// La nube fusiona `stats` tomando el MÁXIMO por clave numérica, así que no hace falta
// ningún campo nuevo en el perfil ni cambios en el servidor.
//
// Este módulo es puro (no importa profile.js, para evitar un import circular y poder
// probarlo con node): recibe el objeto `stats` — normalmente `profile.stats`.

export const BADGE_TIERS = [
  null, // 0 = bloqueada
  { tier: 1, name: 'Bronce', light: '#f0b47c', mid: '#cd7f32', dark: '#6b3b14', glow: '#e08a3c' },
  { tier: 2, name: 'Plata', light: '#f4f8ff', mid: '#b8c4d6', dark: '#5d6b80', glow: '#9fd0ff' },
  { tier: 3, name: 'Oro', light: '#fff3b0', mid: '#ffc933', dark: '#9a6200', glow: '#ffd24a' },
]

export const BADGE_SECTORS = 10
export const BADGE_MAX_LEVELS = BADGE_SECTORS * 3

const TIER_BY_DIFFICULTY = { easy: 1, normal: 2, hard: 3 }

// Nivel de insignia (1..3) que otorga una dificultad. Desconocida → Normal.
export function badgeTierFor(difficulty) {
  return TIER_BY_DIFFICULTY[difficulty] || 2
}

// Forma de la insignia según el sector: { kind, chevrons? }.
export function badgeShapeFor(sector) {
  const n = Math.max(1, Math.min(BADGE_SECTORS, Math.floor(Number(sector)) || 1))
  if (n <= 3) return { kind: 'chevrons', chevrons: n }
  if (n <= 6) return { kind: 'winged-shield' }
  if (n <= 9) return { kind: 'winged-star' }
  return { kind: 'crown' }
}

export const badgeKey = (sector) => `badgeS${sector}`

// Nivel actual (0..3) de la insignia de un sector.
export function getBadge(sector, stats) {
  const v = Number(stats?.[badgeKey(sector)])
  return Number.isFinite(v) ? Math.max(0, Math.min(3, Math.floor(v))) : 0
}

// Cálculo puro: no escribe nada.
export function nextBadge(stats, sector, difficulty) {
  const prevTier = getBadge(sector, stats)
  const earned = badgeTierFor(difficulty)
  const tier = Math.max(prevTier, earned)
  return { sector, tier, prevTier, isNew: earned > prevTier }
}

// Otorga la insignia escribiendo el máximo en `stats`.
export function awardBadge(sector, difficulty, stats) {
  const res = nextBadge(stats, sector, difficulty)
  if (res.tier > res.prevTier) stats[badgeKey(sector)] = res.tier
  return res
}

// Niveles de insignia acumulados (0..30), para la vitrina del perfil.
export function badgeLevels(stats) {
  let total = 0
  for (let s = 1; s <= BADGE_SECTORS; s++) total += getBadge(s, stats)
  return total
}
