import Phaser from 'phaser'
import { appState, DIFFICULTY } from '~/game/appState.js'
import { gameState } from '~/game/gameState.js'
import { buildWaves, FIRST_WAVE_MS, WORLD } from '~/game/balance.js'
import { currentMode } from '../modes/index.js'
import { sectorByN } from '../meta/sectors.js'
import { Enemy } from '~/game/enemies/Enemy.js'
import { MOVEMENT } from '~/game/enemies/behaviors/movement.js'
import { spawnMarker } from '~/game/render/fx.js'

// Estado en la escena: scene.mode (modo elegido), scene.waves (lista construida),
// scene.wave (FSM), scene._enemySeq, scene.enemies.

// Multiplicadores de HP/daño de un enemigo recién creado: dificultad × sector.
export function enemyStatMult() {
  const diff = DIFFICULTY[appState.difficulty] || DIFFICULTY.normal
  const sec = sectorByN(appState.sector)
  return { hp: diff.hpMult * sec.hpMult, dmg: diff.dmgMult * sec.dmgMult }
}

export function initWaves(scene) {
  scene.mode = currentMode()
  scene.sector = sectorByN(appState.sector)
  scene.waves = buildWaves(appState.difficulty, scene.mode.waveCount, { countScale: scene.mode.countScale, sector: scene.sector })
  const first = scene.mode.firstWaveMs ?? FIRST_WAVE_MS
  scene.wave = { index: 0, queue: [], spawnTimer: 0, gap: 0, dirs: [], spawnDirIndex: 0, state: 'intermission', timer: first, elapsed: 0 }
  gameState.wave = 0
  gameState.waveTotal = scene.mode.waveCount
  gameState.nextWaveIn = Math.ceil(first / 1000)
  gameState.nextWave = null
  gameState.waveDirs = []
}

// delta en MILISEGUNDOS (el `d` del loop): los timers de oleada están en ms, no dividir.
export function updateWaves(scene, delta) {
  const w = scene.wave
  if (w.state === 'intermission') {
    w.timer -= delta
    gameState.nextWaveIn = Math.max(0, Math.ceil(w.timer / 1000))
    // Calcular resumen de la siguiente oleada al entrar en intermisión
    if (!gameState.nextWave && w.index < scene.mode.waveCount) {
      const next = scene.waves[w.index]
      if (next) {
        const counts = {}
        for (const t of next.list) counts[t] = (counts[t] || 0) + 1
        gameState.nextWave = { counts, dirs: next.dirs, hasBoss: next.hasBoss }
      }
    }
    if (w.timer <= 0) startNextWave(scene)
  } else if (w.state === 'spawning') {
    gameState.nextWaveIn = 0
    w.elapsed += delta
    w.spawnTimer -= delta
    if (w.spawnTimer <= 0 && w.queue.length) {
      spawnEnemy(scene, w.queue.shift())
      w.spawnTimer = w.gap
    }
    if (w.queue.length === 0) w.state = 'clearing'
  } else if (w.state === 'clearing') {
    w.elapsed += delta
    // La siguiente oleada no entra hasta que muere la última nave; después hay un respiro
    // (intermissionMs) que el jugador puede saltar con "¡Oleada ya!".
    gameState.waveTimeLeft = 0
    // Seguro anti-atasco: tras 150 s, las últimas naves (≤3) van directo al Núcleo y más rápido,
    // así una perdida en una esquina no congela la partida y la oleada termina por sí sola.
    // Si a los 210 s aún quedan (p. ej. una nave madre que solo suelta naves), se retiran sin dar
    // recompensa.
    if (w.elapsed > 150000 && scene.enemies.length > 0 && scene.enemies.length <= 3) {
      for (const e of scene.enemies) {
        if (e.rushing || e.dead || !scene.core) continue
        e.rushing = true
        e.target = scene.core
        e.retargetTimer = Infinity // no vuelve a elegir otro objetivo
        e.movement = MOVEMENT.STRAIGHT // STANDOFF/KEEP_DISTANCE se quedarían lejos
        e.maxSpeed *= 2
      }
      if (w.elapsed > 210000) {
        for (const e of scene.enemies) { e.dead = true; e.destroy() }
        scene.enemies.length = 0
      }
    }
    if (scene.enemies.length === 0) {
      if (w.index >= scene.mode.waveCount) scene.victory()
      else {
        w.state = 'intermission'
        w.timer = scene.mode.intermissionMs
        gameState.nextWave = null
      }
    }
  }
}

export function startNextWave(scene) {
  const w = scene.wave
  w.index++
  gameState.wave = w.index
  const def = scene.waves[w.index - 1]
  w.queue = [...def.list]
  w.gap = def.gap * (scene.mode.spawnGapMult ?? 1)
  w.spawnTimer = 0
  w.dirs = def.dirs || [Math.random() * Math.PI * 2]
  w.spawnDirIndex = 0
  w.elapsed = 0
  w.state = 'spawning'
  gameState.bossWave = def.hasBoss || false
  gameState.waveDirs = [...w.dirs]
  gameState.nextWave = null
}

export function spawnEnemy(scene, type) {
  const cx = scene.core.x
  const cy = scene.core.y
  // spawnDistMult: el modo rápido acerca la horda (gran parte de la duración es el viaje).
  const radius = Math.hypot(WORLD.width, WORLD.height) * 0.48 * (scene.mode?.spawnDistMult ?? 1)
  const spread = 0.45
  const w = scene.wave
  const dir = w.dirs[w.spawnDirIndex % w.dirs.length]
  w.spawnDirIndex++
  const angle = dir + Phaser.Math.FloatBetween(-spread, spread)
  const ex = Phaser.Math.Clamp(cx + Math.cos(angle) * radius, 40, WORLD.width - 40)
  const ey = Phaser.Math.Clamp(cy + Math.sin(angle) * radius, 40, WORLD.height - 40)
  const x = ex; const y = ey

  spawnMarker(scene, x, y)

  const mult = enemyStatMult()
  const enemy = new Enemy(type, x, y, scene)
  enemy.id = ++scene._enemySeq
  enemy.hp = Math.round(enemy.def.hp * mult.hp)
  enemy.maxHp = enemy.hp
  enemy.damage = enemy.def.damage * mult.dmg
  scene.enemies.push(enemy)
}

// "¡Oleada ya!": salta el intermedio y paga un bono proporcional al tiempo ahorrado.
export function callWaveEarly(scene) {
  const w = scene.wave
  if (!w || w.state !== 'intermission' || w.index >= scene.mode.waveCount) return 0
  const bonus = Math.round(Math.max(0, w.timer) / 1000 * 4)
  gameState.minerals = Math.min(gameState.mineralsCap, gameState.minerals + bonus)
  startNextWave(scene)
  return bonus
}
