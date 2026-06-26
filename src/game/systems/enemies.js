import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { spawnFloatingText, explosion } from '../render/fx.js'

// Loop de enemigos: grid espacial + update por enemigo + barras de HP en lote. delta en MS.
export function updateEnemies(scene, delta) {
  const dt = delta / 1000
  gameState.enemiesAlive = scene.enemies.length

  // Poblar grid espacial para consultas O(1) de vecindad.
  scene.enemyGrid.clear()
  for (const e of scene.enemies) if (!e.dead) scene.enemyGrid.insert(e)

  for (let i = scene.enemies.length - 1; i >= 0; i--) {
    const e = scene.enemies[i]
    e.update(dt, scene.world, scene.time.now)
    if (e.dead) {
      scene.enemies.splice(i, 1)
    }
  }

  // Barras de HP en lote (un solo Graphics para todos).
  const g = scene.enemyBars
  g.clear()
  for (const e of scene.enemies) {
    if (e.dead || e.hp >= e.maxHp) continue
    const w = 14 * e.def.scale
    const frac = Math.max(0, e.hp / e.maxHp)
    const by = e.y - 12 * e.def.scale
    g.fillStyle(0x000000, 0.6).fillRect(e.x - w / 2 - 1, by - 1, w + 2, 4)
    g.fillStyle(0xff5566, 1).fillRect(e.x - w / 2, by, w * frac, 2)
  }
}

export function nearestStructure(scene, x, y) {
  let best = null
  let bestD = Infinity
  for (const s of scene.structures) {
    if (s.dead) continue
    const d = Phaser.Math.Distance.Between(x, y, s.x, s.y)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

export function killEnemy(scene, e) {
  e.dead = true
  gameState.minerals = Math.min(gameState.mineralsCap, gameState.minerals + e.def.reward)
  spawnFloatingText(scene, e.x, e.y, `+${e.def.reward}`, '#49e07a')
  explosion(scene, e.x, e.y, e.def.color, 14 * e.def.scale)
  e.destroy()
}
