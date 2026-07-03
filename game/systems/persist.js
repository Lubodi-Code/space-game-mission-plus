import { gameState } from '~/game/gameState.js'
import { appState } from '~/game/appState.js'
import { createStructure } from '~/game/structures/StructureRegistry.js'
import { UPGRADES } from '~/game/structures/upgrades.js'

// Guarda/restaura una partida en solitario a través de un reload de página
// (sessionStorage: sobrevive al F5, se pierde al cerrar la pestaña). Multijugador
// no se persiste — la conexión PeerJS muere en el reload de todos modos.
// ponytail: no restaura enemigos/proyectiles en vuelo (la oleada actual se
// reinicia desde cero); restaura economía + estructuras + mejoras + progreso de oleada.
const SAVE_KEY = 'sgmp_solo_run'

export function saveSoloSnapshot(scene) {
  if (scene.remote || appState.mp.role !== 'solo' || gameState.status !== 'playing') return
  sessionStorage.setItem(SAVE_KEY, JSON.stringify({
    difficulty: appState.difficulty,
    mode: appState.mode,
    minerals: gameState.minerals,
    mineralsCap: gameState.mineralsCap,
    energy: gameState.energy,
    energyMax: gameState.energyMax,
    coreHp: gameState.coreHp,
    coreHpMax: gameState.coreHpMax,
    timeElapsed: gameState.timeElapsed,
    waveIndex: scene.wave?.index || 0,
    generalUpgrades: gameState.generalUpgrades,
    structs: scene.structures
      .filter((s) => !s.dead && !s.isCore)
      .map((s) => ({ key: s.key, x: Math.round(s.x), y: Math.round(s.y), hp: Math.round(s.hp), maxHp: Math.round(s.maxHp), upgrades: s.upgrades || [] })),
  }))
}

export function loadSoloSnapshot() {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw)
    if (snap.difficulty !== appState.difficulty || snap.mode !== appState.mode) return null
    return snap
  } catch {
    return null
  }
}

export function clearSoloSnapshot() {
  sessionStorage.removeItem(SAVE_KEY)
}

// Reconstruye estructuras/economía/oleada guardadas sobre una escena recién creada
// (ya tiene el Core en pie). Llamar después de recomputeNetwork() del Core y antes de initWaves().
export function restoreSoloSnapshot(scene, snap) {
  Object.assign(gameState, {
    minerals: snap.minerals,
    mineralsCap: snap.mineralsCap,
    energy: snap.energy,
    energyMax: snap.energyMax,
    coreHp: snap.coreHp,
    coreHpMax: snap.coreHpMax,
    timeElapsed: snap.timeElapsed,
    generalUpgrades: snap.generalUpgrades || [],
  })
  scene.elapsedMs = snap.timeElapsed * 1000
  scene.core.hp = snap.coreHp
  scene.core.maxHp = snap.coreHpMax

  for (const row of snap.structs) {
    const s = createStructure(row.key, row.x, row.y, scene)
    s.hp = row.hp
    s.maxHp = row.maxHp
    scene.structures.push(s)
    for (const id of row.upgrades) {
      const u = UPGRADES.find((x) => x.id === id)
      if (u) { s.applyUpgrade(u); s.applyUpgradeVisual?.(u) }
    }
  }
  scene.recomputeNetwork()

  return snap.waveIndex || 0
}
