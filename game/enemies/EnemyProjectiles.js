import Phaser from 'phaser'
import { sfxEnemyBeam } from '../sound.js'

export class EnemyProjectileSystem {
  constructor(scene) {
    this.scene = scene
    this.projectiles = []
    this.beams = []
  }

  spawnMissile(opts) {
    const { x, y, target, speed, damage, splash, color } = opts
    const sprite = this.scene.add.image(x, y, 'star')
      .setTint(color).setScale(0.8).setBlendMode(Phaser.BlendModes.ADD).setDepth(20)
    const dx = target.x - x
    const dy = target.y - y
    const d = Math.hypot(dx, dy) || 1
    const timeToTarget = d / (speed || 160)
    const predX = target.x + (target.vx || 0) * timeToTarget
    const predY = target.y + (target.vy || 0) * timeToTarget
    this.projectiles.push({
      x, y, tx: predX, ty: predY,
      target, speed: speed || 160,
      damage, splash: splash || 0, color,
      sprite, alive: true,
      _dir: { x: dx / d, y: dy / d },
      id: (this.scene._missileSeq = (this.scene._missileSeq || 0) + 1),
      vx: (dx / d) * (speed || 160), vy: (dy / d) * (speed || 160),
    })
  }

  fireBeam(opts) {
    const { from, to, damage, color, width } = opts
    sfxEnemyBeam(from.x, from.y)
    this.beams.push({
      x1: from.x, y1: from.y,
      x2: to.x, y2: to.y,
      ttl: 120, color, width: width || 3,
    })
    if (this.scene.netHost) this.scene._beamQueue.push(
      [Math.round(from.x), Math.round(from.y), Math.round(to.x), Math.round(to.y), color, width || 3, 120, 120]) // ttl + base de alfa
  }

  update(dt) {
    // Update missiles.
    const turnRate = 2.5
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      if (!p.alive) {
        if (p.sprite) p.sprite.destroy()
        this.projectiles.splice(i, 1)
        continue
      }

      const dx = p.tx - p.x
      const dy = p.ty - p.y
      const d = Math.hypot(dx, dy)
      const step = p.speed * dt

      if (d <= step + 6) {
        // Impact.
        p.sprite.destroy()
        if (p.splash > 0) {
          this.scene.explosion(p.tx, p.ty, p.color, p.splash)
          for (const s of [...this.scene.structures]) {
            if (s.dead) continue
            if (Phaser.Math.Distance.Between(p.tx, p.ty, s.x, s.y) <= p.splash) {
              this.scene.damageStructure(s, p.damage)
            }
          }
        } else {
          if (p.target && !p.target.dead) {
            this.scene.damageStructure(p.target, p.damage)
          }
        }
        this.projectiles.splice(i, 1)
      } else {
        const inv = 1 / d
        // Limited turn rate: rotate current direction toward target.
        const curDir = { x: dx * inv, y: dy * inv }
        const prevDir = this.projectiles[i]._dir || curDir
        const angleTo = Math.atan2(curDir.y, curDir.x)
        const angleCur = Math.atan2(prevDir.y, prevDir.x)
        let angleDiff = angleTo - angleCur
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2
        const maxTurn = turnRate * dt
        const newAngle = angleCur + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn)
        const newDir = { x: Math.cos(newAngle), y: Math.sin(newAngle) }
        this.projectiles[i]._dir = newDir
        p.vx = newDir.x * p.speed
        p.vy = newDir.y * p.speed

        p.x += newDir.x * step
        p.y += newDir.y * step
        p.sprite.setPosition(p.x, p.y)
      }
    }

    // Update beams (transient draw).
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].ttl -= dt * 1000
      if (this.beams[i].ttl <= 0) {
        this.beams.splice(i, 1)
      }
    }
  }

  draw(graphics) {
    for (const b of this.beams) {
      const a = Math.max(0, b.ttl / 120)
      const w = b.width
      graphics.lineStyle(w * 3, b.color, a * 0.22); graphics.lineBetween(b.x1, b.y1, b.x2, b.y2)
      graphics.lineStyle(w, b.color, a);            graphics.lineBetween(b.x1, b.y1, b.x2, b.y2)
      graphics.fillStyle(b.color, a * 0.9); graphics.fillCircle(b.x2, b.y2, w * 2.2)
      graphics.fillStyle(b.color, a * 0.6); graphics.fillCircle(b.x1, b.y1, w * 1.4)
    }
  }

  // Clean up all projectiles (for scene restart).
  clear() {
    for (const p of this.projectiles) {
      if (p.sprite) p.sprite.destroy()
    }
    this.projectiles = []
    this.beams = []
  }
}
