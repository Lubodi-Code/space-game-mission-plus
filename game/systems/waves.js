import Phaser from 'phaser'
import { appState, DIFFICULTY } from '~/game/appState.js'
import { gameState } from '~/game/gameState.js'
import { buildWaves, FIRST_WAVE_MS, WORLD } from '~/game/balance.js'
import { currentMode } from '../modes/index.js'
import { sectorByN } from '../meta/sectors.js'
import { Enemy } from '~/game/enemies/Enemy.js'
import { REGISTRY, ROLE_GROUPS } from '~/game/enemies/EnemyType.js'
import { planAttack } from './waveDirector.js'
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
        // Lados previstos según las defensas de ahora; al empezar la oleada el director vuelve a mirar.
        const dirs = scene.core ? directWave(scene, next).dirs : next.dirs
        gameState.nextWave = { counts, dirs, hasBoss: next.hasBoss }
      }
    }
    if (w.timer <= 0) startNextWave(scene)
  } else if (w.state === 'spawning') {
    gameState.nextWaveIn = 0
    w.elapsed += delta
    w.spawnTimer -= delta
    if (w.spawnTimer <= 0 && w.queue.length) {
      const next = w.queue.shift()
      // Partidas guardadas antes del director: la cola son tipos sueltos.
      if (typeof next === 'string') spawnEnemy(scene, next, 0)
      else spawnEnemy(scene, next.type, next.dir)
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
      // Los jefes no se retiran: la nodriza es lenta a propósito y hay que derribarla.
      if (w.elapsed > 210000) {
        for (const e of scene.enemies) if (!e.def.boss) { e.dead = true; e.destroy() }
        // En el lugar: world.enemies apunta a este mismo array.
        for (let i = scene.enemies.length - 1; i >= 0; i--) if (scene.enemies[i].dead) scene.enemies.splice(i, 1)
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
  w.gap = def.gap * (scene.mode.spawnGapMult ?? 1)
  w.spawnTimer = 0
  // Director: mira las defensas de este momento y reparte la oleada (misma cantidad de naves)
  // entre los lados más débiles. Cada entrada de la cola lleva su dirección.
  const plan = scene.core ? directWave(scene, def) : { dirs: def.dirs, assign: def.list.map((_, i) => i % def.dirs.length) }
  w.dirs = plan.dirs
  w.queue = def.list.map((type, i) => ({ type, dir: plan.assign[i] }))
  w.elapsed = 0
  w.state = 'spawning'
  gameState.bossWave = def.hasBoss || false
  gameState.waveDirs = [...w.dirs]
  gameState.nextWave = null
}

// Objetivo preferido de cada tipo, en las categorías del director.
const DIRECTOR_TAG = { DEFENSE: 'defense', SUPPLY: 'economy', GENERATOR: 'economy', INFRA: 'economy', NODE: 'relay', CORE: 'core' }

function structureKind(s) {
  if (s.isCore) return 'core'
  if (ROLE_GROUPS.DEFENSE(s)) return 'defense'
  if (ROLE_GROUPS.NODE(s)) return 'relay'
  return 'economy'
}

function spawnRadius(scene, type) {
  return Math.hypot(WORLD.width, WORLD.height) * 0.48 * (scene.mode?.spawnDistMult ?? 1) * (REGISTRY[type]?.spawnDistMult ?? 1)
}

function directWave(scene, def) {
  const structures = scene.structures.filter((s) => !s.dead).map((s) => ({
    x: s.x, y: s.y, kind: structureKind(s),
    range: s.atkRange || 0,
    // Una torreta sin energía o en obra defiende poco.
    power: ((s.def?.cost || 100) / 100) * (s.powered && !s.building ? 1 : 0.3),
  }))
  const tags = {}
  for (const type of new Set(def.list)) {
    const r = REGISTRY[type]
    tags[type] = r?.boss && type === 'commandship' ? 'boss' : DIRECTOR_TAG[r?.targetPriority] || 'core'
  }
  return planAttack({
    core: scene.core, structures, list: def.list, tags,
    maxDirs: def.maxDirs || def.dirs.length,
    spawnRadius: spawnRadius(scene, 'grunt'),
  })
}

export function spawnEnemy(scene, type, dirIndex) {
  const cx = scene.core.x
  const cy = scene.core.y
  // spawnDistMult: el modo rápido acerca la horda (gran parte de la duración es el viaje).
  // def.spawnDistMult: la nodriza, muy lenta, aparece más cerca para no tardar minutos en llegar.
  const radius = spawnRadius(scene, type)
  const spread = 0.45
  const w = scene.wave
  const dir = w.dirs[dirIndex ?? 0] ?? w.dirs[0]
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
