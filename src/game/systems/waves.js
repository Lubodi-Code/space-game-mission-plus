import Phaser from 'phaser'
import { appState, DIFFICULTY } from '../appState.js'
import { gameState } from '../gameState.js'
import { buildWaves, FIRST_WAVE_MS, WORLD } from '../balance.js'
import { MODES, DEFAULT_MODE } from '../modes/index.js'
import { Enemy } from '../enemies/Enemy.js'

// Estado en la escena: scene.mode (modo elegido), scene.waves (lista construida),
// scene.wave (FSM), scene._enemySeq, scene.enemies.

export function initWaves(scene) {
  scene.mode = MODES[appState.mode] || MODES[DEFAULT_MODE]
  scene.waves = buildWaves(appState.difficulty, scene.mode.waveCount)
  scene.wave = { index: 0, queue: [], spawnTimer: 0, gap: 0, dir: 0, state: 'intermission', timer: FIRST_WAVE_MS }
  gameState.wave = 0
  gameState.waveTotal = scene.mode.waveCount
  gameState.nextWaveIn = Math.ceil(FIRST_WAVE_MS / 1000)
}

// delta en MILISEGUNDOS (el `d` del loop): los timers de oleada están en ms, no dividir.
export function updateWaves(scene, delta) {
  const w = scene.wave
  if (w.state === 'intermission') {
    w.timer -= delta
    gameState.nextWaveIn = Math.max(0, Math.ceil(w.timer / 1000))
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
  w.dir = def.dir ?? Math.random() * Math.PI * 2
  w.state = 'spawning'
  gameState.bossWave = def.hasBoss || false
}

export function spawnEnemy(scene, type) {
  const cx = scene.core.x
  const cy = scene.core.y
  const radius = Math.hypot(WORLD.width, WORLD.height) * 0.48
  const spread = 0.45
  const angle = scene.wave.dir + Phaser.Math.FloatBetween(-spread, spread)
  const ex = Phaser.Math.Clamp(cx + Math.cos(angle) * radius, 40, WORLD.width - 40)
  const ey = Phaser.Math.Clamp(cy + Math.sin(angle) * radius, 40, WORLD.height - 40)
  const x = ex; const y = ey

  const marker = scene.add.graphics().setDepth(14)
  marker.lineStyle(2, 0xff5566, 0.7)
  marker.strokeCircle(x, y, 12)
  marker.fillStyle(0xff5566, 0.15)
  marker.fillCircle(x, y, 12)
  scene.tweens.add({
    targets: marker,
    alpha: 0,
    scale: 1.8,
    duration: 500,
    ease: 'Quad.out',
    onComplete: () => marker.destroy(),
  })

  const mult = DIFFICULTY[appState.difficulty] || DIFFICULTY.normal
  const enemy = new Enemy(type, x, y, scene)
  enemy.id = ++scene._enemySeq
  enemy.hp = Math.round(enemy.def.hp * mult.hpMult)
  enemy.maxHp = enemy.hp
  enemy.damage = enemy.def.damage * mult.dmgMult
  scene.enemies.push(enemy)
}
