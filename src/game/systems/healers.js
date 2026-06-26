import Phaser from 'phaser'
import { gameState } from '../gameState.js'

// Esferas sanadoras (estructura Healer). delta en MS; dt en segundos.

export function mostDamagedStructure(scene) {
  let best = null
  let worst = 1
  for (const s of scene.structures) {
    if (s.dead) continue
    const frac = s.hp / s.maxHp
    if (frac < worst) {
      worst = frac
      best = s
    }
  }
  return worst < 1 ? best : null
}

export function updateHealers(scene, delta) {
  const dt = delta / 1000

  for (let i = scene.healers.length - 1; i >= 0; i--) {
    const h = scene.healers[i]
    if (h.owner.dead) {
      h.sprite.destroy()
      scene.healers.splice(i, 1)
      continue
    }
    if (!h.target || h.target.dead || h.target.hp >= h.target.maxHp) {
      h.target = mostDamagedStructure(scene)
    }
    const speed = h.owner.def.sphereSpeed
    if (h.target) {
      const t = h.target
      const d = Phaser.Math.Distance.Between(h.x, h.y, t.x, t.y)
      if (d > 22) {
        const inv = d > 0 ? 1 / d : 0
        h.x += (t.x - h.x) * inv * speed * dt
        h.y += (t.y - h.y) * inv * speed * dt
      } else {
        t.hp = Math.min(t.maxHp, t.hp + h.owner.def.healRate * dt)
        if (t.isCore) gameState.coreHp = Math.min(t.maxHp, Math.ceil(t.hp))
        t.drawHpBar()
      }
    } else {
      const a = (scene.time.now * 0.002 + i) % (Math.PI * 2)
      h.x += (h.owner.x + Math.cos(a) * 34 - h.x) * 0.05
      h.y += (h.owner.y + Math.sin(a) * 34 - h.y) * 0.05
    }
    h.sprite.setPosition(h.x, h.y)
  }
}
