import { REGISTRY } from './EnemyType.js'
import { resolveTarget } from './behaviors/targeting.js'
import { MOVEMENT } from './behaviors/movement.js'
import { ATTACK } from './behaviors/attack.js'
import { EVASION } from './behaviors/evasion.js'
import { RISK } from './behaviors/risk.js'
import { separate, avoidObstacles, wander } from './behaviors/steering.js'
import { STEERING } from '../balance.js'
import Phaser from 'phaser'

export class Enemy {
  constructor(typeKey, x, y, scene) {
    this.type = typeKey
    this.def = REGISTRY[typeKey]
    this.x = x
    this.y = y
    this.vx = 0
    this.vy = 0
    this.ax = 0
    this.ay = 0
    this.hp = this.def.hp
    this.maxHp = this.def.hp
    this.damage = this.def.damage
    this.target = null
    this.atkTimer = 0
    this.flash = 0
    this.dead = false
    this.heading = Math.random() * Math.PI * 2
    this.wanderAngle = this.heading
    this.radius = (STEERING.shipBase * 0.5) * this.def.scale
    this.maxSpeed = this.def.speed
    this.maxForce = this.def.maxForce || this.maxSpeed * 3
    this.retargetTimer = Math.random() * 400

    const key = this.def.textureKey
    this.sprite = scene.add.image(x, y, key)
      .setScale(1).setDepth(15)
    this.glow = scene.add.image(x, y, key)
      .setScale(1.3)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(14)

    this.movement = MOVEMENT[this.def.movement]
    this.attack = ATTACK[this.def.attack]
    this.evasion = this.def.evasion ? EVASION[this.def.evasion] : null
    this.risk = this.def.risk ? RISK[this.def.risk] : null

    if (typeof this.movement !== 'function' || typeof this.attack !== 'function') {
      throw new Error(
        `Enemy "${typeKey}": comportamiento sin resolver. ` +
        `Revisa REGISTRY y los mapas en behaviors/.`
      )
    }
  }

  update(dt, world, time) {
    if (this.dead) return

    this.retargetTimer -= dt * 1000
    if (!this.target || this.target.dead || this.retargetTimer <= 0) {
      this.target = resolveTarget(this, world)
      this.retargetTimer = 400
    }

    let fx = 0, fy = 0

    const mF = this.movement(this, world, dt, time)
    fx += mF.fx * STEERING.wMove
    fy += mF.fy * STEERING.wMove

    if (this.evasion) {
      const eF = this.evasion(this, world, dt, time)
      fx += eF.fx * STEERING.wEvade
      fy += eF.fy * STEERING.wEvade
    }

    const sF = separate(this, world)
    fx += sF.fx * STEERING.wSeparate
    fy += sF.fy * STEERING.wSeparate

    const aF = avoidObstacles(this, world)
    fx += aF.fx * STEERING.wAvoid
    fy += aF.fy * STEERING.wAvoid

    const wF = wander(this, dt)
    fx += wF.fx * STEERING.wWander
    fy += wF.fy * STEERING.wWander

    const fMag = Math.hypot(fx, fy)
    if (fMag > this.maxForce) {
      const s = this.maxForce / fMag
      fx *= s; fy *= s
    }

    this.ax += fx
    this.ay += fy
    this.vx += this.ax * dt
    this.vy += this.ay * dt

    const vMag = Math.hypot(this.vx, this.vy)
    if (vMag > this.maxSpeed) {
      const s = this.maxSpeed / vMag
      this.vx *= s; this.vy *= s
    }

    if (vMag > 1) this.heading = Math.atan2(this.vy, this.vx)

    this.x += this.vx * dt
    this.y += this.vy * dt
    this.ax = 0
    this.ay = 0

    this.sprite.setPosition(this.x, this.y)
    this.glow.setPosition(this.x, this.y)

    if (vMag > 1) {
      this.sprite.setRotation(this.heading)
      this.glow.setRotation(this.heading)
    }

    const glowPulse = 0.3 + Math.sin((time || 0) * 0.008 + this.heading) * 0.15
    this.glow.setAlpha(glowPulse)

    this.attack(this, world, dt)

    if (this.flash > 0) {
      this.flash -= dt * 1000
      if (this.flash <= 0) this.sprite.clearTint()
    }
  }

  hit(dmg, world) {
    if (this.dead) return
    this.hp -= dmg
    this.flash = 70
    this.sprite.setTintFill(0xffffff)
    if (this.hp <= 0) world.killEnemy(this)
  }

  destroy() {
    if (this.sprite) this.sprite.destroy()
    if (this.glow) this.glow.destroy()
  }
}
