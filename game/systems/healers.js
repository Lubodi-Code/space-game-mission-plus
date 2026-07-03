import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { HEAL_ORB_COLOR, orbScale } from '../render/fx.js'

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

// Asignación por reclamo (claim): cada esfera cura "su" edificio; dos esferas
// no comparten objetivo mientras haya otros edificios dañados.
function claimTarget(scene, sphere) {
  const claimed = new Set(scene.healers.map((h) => h.target).filter(Boolean))
  let best = null, bestFrac = 1
  let bestShared = null, bestSharedFrac = 1
  for (const s of scene.structures) {
    if (s.dead || s.hp >= s.maxHp) continue
    const frac = s.hp / s.maxHp
    if (!claimed.has(s)) { if (frac < bestFrac) { bestFrac = frac; best = s } }
    else if (frac < bestSharedFrac) { bestSharedFrac = frac; bestShared = s }
  }
  return best || bestShared
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
    // Re-evaluar claim solo cada 500 ms (histéresis)
    if (h.retarget === undefined) h.retarget = 0
    h.retarget -= delta
    if (!h.target || h.target.dead || h.target.hp >= h.target.maxHp || h.retarget <= 0) {
      h.target = claimTarget(scene, h)
      h.retarget = 500
    }
    const speed = h.owner.def.sphereSpeed
    let healing = false
    if (h.target) {
      const t = h.target
      const d = Phaser.Math.Distance.Between(h.x, h.y, t.x, t.y)
      if (d > 22) {
        const inv = d > 0 ? 1 / d : 0
        h.x += (t.x - h.x) * inv * speed * dt
        h.y += (t.y - h.y) * inv * speed * dt
      } else {
        // Órbita alrededor del edificio mientras cura (radio "respirando")
        const orbitAngle = (scene.time.now * 0.004 + i) % (Math.PI * 2)
        const orbitR = 18 + 4 * Math.sin(scene.time.now * 0.006 + i)
        h.x = t.x + Math.cos(orbitAngle) * orbitR
        h.y = t.y + Math.sin(orbitAngle) * orbitR
        t.hp = Math.min(t.maxHp, t.hp + h.owner.def.healRate * dt)
        if (t.isCore) gameState.coreHp = Math.min(t.maxHp, Math.ceil(t.hp))
        t.drawHpBar()
        // Hilo de curación esfera→edificio
        const a = 0.35 + 0.25 * Math.sin(scene.time.now * 0.012 + i)
        scene.beamGraphics.lineStyle(1.5, HEAL_ORB_COLOR, a)
        scene.beamGraphics.lineBetween(h.x, h.y, t.x, t.y)
        healing = true
      }
    } else {
      const a = (scene.time.now * 0.002 + i) % (Math.PI * 2)
      h.x += (h.owner.x + Math.cos(a) * 34 - h.x) * 0.05
      h.y += (h.owner.y + Math.sin(a) * 34 - h.y) * 0.05
    }
    h.sprite.setPosition(h.x, h.y)
    h.sprite.setScale(orbScale(scene.time.now, i, healing))
    h.sprite.setAlpha(healing ? 1 : 0.75)
  }
}
