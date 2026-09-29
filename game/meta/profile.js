import { reactive, watch } from 'vue'

// Perfil persistente del comandante (entre partidas). Vive en localStorage; en 10E se
// sincroniza con la cuenta. Lo que se compra con dinero real NO se decide aquí: este
// objeto solo refleja lo que el servidor confirme (ver docs/PLAN-fase10-expansion.md).
//
// - xp → nivel (curva en levelFromXp)
// - scrap: "Chatarra", moneda blanda que se gana jugando (investigación y cosméticos básicos)
// - research: ids de nodos de investigación comprados (meta/research.js)
// - sectorUnlocked: sector máximo jugable (meta/sectors.js)
// - cosmetics: { owned: [ids], equipped: { beam, trail, hull } } (meta/cosmetics.js)

const KEY = 'sgmp_profile'
const hasStorage = typeof window !== 'undefined' && !!window.localStorage

function blank() {
  return {
    v: 1,
    xp: 0,
    scrap: 0,
    crystals: 0, // premium: solo lo escribe la sincronización con el servidor (10E)
    research: [],
    arsenal: [], // keys de torretas del Arsenal compradas (meta/arsenal.js)
    sectorUnlocked: 1,
    maxSectorWon: 0,
    bestWave: {}, // `${mode}:${sector}` → mejor oleada alcanzada
    cosmetics: { owned: ['beam_default', 'trail_none', 'hull_default'], equipped: { beam: 'beam_default', trail: 'trail_none', hull: 'hull_default', design: 'design_falcon', explosion: 'boom_default', nexus: 'nexus_default', turret: 'turret_default' } },
    stats: { runs: 0, wins: 0, kills: 0, bosses: 0, playtimeMs: 0, bestWaveAll: 0, structuresBuilt: 0, abilitiesUsed: 0, coopRuns: 0, giantsMined: 0 },
  }
}

function load() {
  if (!hasStorage) return blank()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw || raw.v !== 1) return blank()
    const b = blank()
    return { ...b, ...raw, cosmetics: { ...b.cosmetics, ...raw.cosmetics, equipped: { ...b.cosmetics.equipped, ...raw.cosmetics?.equipped } }, stats: { ...b.stats, ...raw.stats } }
  } catch {
    return blank()
  }
}

export const profile = reactive(load())
// Perfiles viejos (antes de maxSectorWon): ganar el sector N desbloqueaba el N+1.
profile.maxSectorWon = Math.max(profile.maxSectorWon || 0, (profile.sectorUnlocked || 1) - 1)

if (hasStorage) {
  watch(profile, (p) => {
    try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* cuota llena o modo privado */ }
  }, { deep: true })
}

// Vuelve el perfil local a uno de invitado nuevo (al cerrar sesión: el progreso queda en la cuenta
// y no debe pasar a la próxima cuenta que entre en este dispositivo).
export function resetProfile() {
  const b = blank()
  for (const k of Object.keys(profile)) if (!(k in b)) delete profile[k]
  Object.assign(profile, b)
}

// XP necesaria para pasar del nivel L al L+1: 200, 300, 400, ...
export function xpForLevel(level) {
  return 100 + level * 100
}

export function levelFromXp(xp) {
  let level = 1
  let rest = xp
  while (rest >= xpForLevel(level)) { rest -= xpForLevel(level); level++ }
  return { level, into: rest, need: xpForLevel(level) }
}

export function hasResearch(id) {
  return profile.research.includes(id)
}

// Recompensa de fin de partida. Devuelve el resumen para el overlay de fin.
export function grantRunRewards({ mode, sector, wave, waveTotal, victory, kills, sectorReward, bosses = 0, playtimeMs = 0, structuresBuilt = 0, abilitiesUsed = 0, coop = false, giantsMined = 0 }) {
  const before = levelFromXp(profile.xp).level
  const modeMult = mode === 'quick' ? 0.7 : 1
  const xp = Math.round((wave * 30 + kills * 0.5 + (victory ? 250 : 0)) * (1 + 0.1 * (sector - 1)) * modeMult)
  const scrap = Math.round((wave * 6 + (victory ? sectorReward : 0)) * modeMult)
  profile.xp += xp
  profile.scrap += scrap
  profile.stats.runs++
  profile.stats.kills += kills
  profile.stats.bosses += bosses
  profile.stats.playtimeMs += playtimeMs
  profile.stats.bestWaveAll = Math.max(profile.stats.bestWaveAll, wave)
  profile.stats.structuresBuilt += structuresBuilt
  profile.stats.abilitiesUsed += abilitiesUsed
  profile.stats.coopRuns += coop ? 1 : 0
  profile.stats.giantsMined += giantsMined
  const key = `${mode}:${sector}`
  profile.bestWave[key] = Math.max(profile.bestWave[key] || 0, wave)
  let unlocked = null
  if (victory) {
    profile.stats.wins++
    profile.maxSectorWon = Math.max(profile.maxSectorWon || 0, sector)
    if (sector >= profile.sectorUnlocked && sector < 10) { profile.sectorUnlocked = sector + 1; unlocked = sector + 1 }
  }
  const after = levelFromXp(profile.xp).level
  import('./cloudSave.js').then(({ flushCloud }) => flushCloud()).catch(() => {})
  return { xp, scrap, levelUp: after > before ? after : null, sectorUnlocked: unlocked, waveTotal }
}
