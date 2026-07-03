import Phaser from 'phaser'
import { appState, DIFFICULTY } from '../appState.js'
import { gameState } from '../gameState.js'
import { buildWaves, FIRST_WAVE_MS, WORLD } from '../balance.js'
import { MODES, DEFAULT_MODE } from '../modes/index.js'
import { Enemy } from '../enemies/Enemy.js'
import { spawnMarker } from '../render/fx.js'

// Estado en la escena: scene.mode (modo elegido), scene.waves (lista construida),
// scene.wave (FSM), scene._enemySeq, scene.enemies.

export function initWaves(scene) {
  scene.mode = MODES[appState.mode] || MODES[DEFAULT_MODE]
  scene.waves = buildWaves(appState.difficulty, scene.mode.waveCount)
  scene.wave = { index: 0, queue: [], spawnTimer: 0, gap: 0, dirs: [], spawnDirIndex: 0, state: 'intermission', timer: FIRST_WAVE_MS }
  gameState.wave = 0
  gameState.waveTotal = scene.mode.waveCount
  gameState.nextWaveIn = Math.ceil(FIRST_WAVE_MS / 1000)
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
    w.spawnTimer -= delta
    if (w.spawnTimer <= 0 && w.queue.length) {
      spawnEnemy(scene, w.queue.shift())
      w.spawnTimer = w.gap
    }
    if (w.queue.length === 0) w.state = 'clearing'
  } else if (w.state === 'clearing') {
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
  w.gap = def.gap
  w.spawnTimer = 0
  w.dirs = def.dirs || [Math.random() * Math.PI * 2]
  w.spawnDirIndex = 0
  w.state = 'spawning'
  gameState.bossWave = def.hasBoss || false
  gameState.waveDirs = [...w.dirs]
  gameState.nextWave = null
}

export function spawnEnemy(scene, type) {
  const cx = scene.core.x
  const cy = scene.core.y
  const radius = Math.hypot(WORLD.width, WORLD.height) * 0.48
  const spread = 0.45
  const w = scene.wave
  const dir = w.dirs[w.spawnDirIndex % w.dirs.length]
  w.spawnDirIndex++
  const angle = dir + Phaser.Math.FloatBetween(-spread, spread)
  const ex = Phaser.Math.Clamp(cx + Math.cos(angle) * radius, 40, WORLD.width - 40)
  const ey = Phaser.Math.Clamp(cy + Math.sin(angle) * radius, 40, WORLD.height - 40)
  const x = ex; const y = ey

  spawnMarker(scene, x, y)

  const mult = DIFFICULTY[appState.difficulty] || DIFFICULTY.normal
  const enemy = new Enemy(type, x, y, scene)
  enemy.id = ++scene._enemySeq
  enemy.hp = Math.round(enemy.def.hp * mult.hpMult)
  enemy.maxHp = enemy.hp
  enemy.damage = enemy.def.damage * mult.dmgMult
  scene.enemies.push(enemy)
}
