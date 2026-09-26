import { gameState } from '~/game/gameState.js'
import { appState } from '~/game/appState.js'
import { createStructure } from '~/game/structures/StructureRegistry.js'
import { UPGRADES } from '~/game/structures/upgrades.js'
import { Enemy } from '~/game/enemies/Enemy.js'

// Guarda/restaura una partida en solitario a través de un reload de página
// (sessionStorage: sobrevive al F5, se pierde al cerrar la pestaña). Multijugador
// no se persiste — la conexión PeerJS muere en el reload de todos modos.
// ponytail: no restaura proyectiles/rayos en vuelo ni el objetivo/cooldown exacto
// de cada enemigo (recalculan en el primer frame); sí restaura sus posiciones/hp
// y la cola de spawns pendiente de la oleada, que es lo que se nota si falta.
const SAVE_KEY = 'sgmp_solo_run'

export function saveSoloSnapshot(scene) {
  if (scene.remote || appState.mp.role !== 'solo' || gameState.status !== 'playing') return
  const w = scene.wave
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
    generalUpgrades: gameState.generalUpgrades,
    enemySeq: scene._enemySeq,
    wave: w && {
      index: w.index, queue: w.queue, gap: w.gap, spawnTimer: w.spawnTimer,
      dirs: w.dirs, spawnDirIndex: w.spawnDirIndex, state: w.state, timer: w.timer,
    },
    bossWave: gameState.bossWave,
    structs: scene.structures
      .filter((s) => !s.dead && !s.isCore)
      .map((s) => ({ key: s.key, x: Math.round(s.x), y: Math.round(s.y), hp: Math.round(s.hp), maxHp: Math.round(s.maxHp), upgrades: s.upgrades || [] })),
    enemies: scene.enemies
      .filter((e) => !e.dead)
      .map((e) => ({ type: e.type, x: Math.round(e.x), y: Math.round(e.y), hp: Math.round(e.hp), maxHp: Math.round(e.maxHp), damage: e.damage, heading: e.heading })),
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

// Reconstruye estructuras/economía/oleada/enemigos guardados sobre una escena recién
// creada. Llamar después de initWaves(scene) (que ya deja scene.wave/scene.waves listos
// con la forma correcta; aquí se sobreescriben con el progreso real guardado).
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
    bossWave: snap.bossWave || false,
  })
  scene.elapsedMs = snap.timeElapsed * 1000
  scene.core.hp = snap.coreHp
  scene.core.maxHp = snap.coreHpMax
  scene._enemySeq = snap.enemySeq || 0

  for (const row of snap.structs) {
    const s = createStructure(row.key, row.x, row.y, scene)
    scene.structures.push(s)
    for (const id of row.upgrades) {
      const u = UPGRADES.find((x) => x.id === id)
      if (u) { s.applyUpgrade(u); s.applyUpgradeVisual?.(u) }
    }
    // Después de las mejoras: los valores guardados ya incluyen hpMult (si no, se aplicaría dos veces).
    s.maxHp = row.maxHp
    s.hp = row.hp
  }
  scene.recomputeNetwork()

  if (snap.wave) {
    Object.assign(scene.wave, snap.wave)
    gameState.wave = snap.wave.index
    gameState.nextWaveIn = snap.wave.state === 'intermission' ? Math.max(0, Math.ceil(snap.wave.timer / 1000)) : 0
  }

  for (const row of snap.enemies || []) {
    const enemy = new Enemy(row.type, row.x, row.y, scene)
    enemy.id = ++scene._enemySeq
    enemy.hp = row.hp
    enemy.maxHp = row.maxHp
    enemy.damage = row.damage
    enemy.heading = row.heading || 0
    scene.enemies.push(enemy)
  }
}
