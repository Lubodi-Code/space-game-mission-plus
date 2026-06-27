import { COMBAT } from '../balance.js'
import { explosion } from '../render/fx.js'

// Misiles del jugador (torreta de misiles). delta en MS; dt en segundos para el movimiento.

export function damageEnemy(scene, e, dmg) {
  if (e.dead) return
  e.hit(dmg, scene.world)
}

export function updateProjectiles(scene, delta) {
  const dt = delta / 1000
  const turnRate = COMBAT.missileTurnRate
  for (let i = scene.projectiles.length - 1; i >= 0; i--) {
    const p = scene.projectiles[i]
    p.life = (p.life || 0) + delta

    const dx = p.tx - p.x
    const dy = p.ty - p.y
    const d = Math.hypot(dx, dy)
    const step = p.speed * dt
    const hitR = (p.target && !p.target.dead ? p.target.radius || 6 : 6) + 6

    if (d <= Math.max(hitR, step)) {
      if (p.target && !p.target.dead) {
        const dtg = Math.hypot(p.target.x - p.x, p.target.y - p.y)
        if (dtg <= (p.target.radius || 6) + 12) damageEnemy(scene, p.target, p.damage)
      }
      explosion(scene, p.x, p.y, p.color, p.splash > 0 ? p.splash : 12)
      p.sprite.destroy()
      scene.projectiles.splice(i, 1)
      continue
    }

    const inv = 1 / d
    const targetDir = { x: dx * inv, y: dy * inv }
    const curDir = p._dir || targetDir

    const aim = curDir.x * targetDir.x + curDir.y * targetDir.y
    const maxLife = p.maxLife || COMBAT.missileMaxLifeMs
    if ((p.life > 200 && aim < -0.2) || p.life > maxLife) {
      explosion(scene, p.x, p.y, p.color, 8)
      p.sprite.destroy()
      scene.projectiles.splice(i, 1)
      continue
    }

    const angleTo = Math.atan2(targetDir.y, targetDir.x)
    const angleCur = Math.atan2(curDir.y, curDir.x)
    let angleDiff = angleTo - angleCur
    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2
    const maxTurn = turnRate * dt
    const newAngle = angleCur + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn)
    const newDir = { x: Math.cos(newAngle), y: Math.sin(newAngle) }
    p._dir = newDir
    p.vx = newDir.x * p.speed
    p.vy = newDir.y * p.speed
    p.x += newDir.x * step
    p.y += newDir.y * step
    p.sprite.setPosition(p.x, p.y)
    p.sprite.setRotation(Math.atan2(newDir.y, newDir.x) + Math.PI / 2)
  }
}
