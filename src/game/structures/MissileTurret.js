import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { COMBAT } from '../balance.js'
import { Structure } from './Structure.js'

export class MissileTurret extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.atkRange = def.atkRange
    this.cooldown = def.cooldown
    this.missileDamage = def.damage
    this.projSpeed = def.projSpeed
    this.splash = def.splash || 0
    this.energyDrain = def.energyDrain || 0
    this.fireMode = 'auto'
    this.focusTarget = null
    this.upgrades = []
    this.volleySize = 5
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.building || !this.powered) return

    this.fireTimer -= dt // dt llega en ms (igual que cooldown)
    if (this.fireTimer > 0) return

    let target = null
    if (this.fireMode === 'focus' && this.focusTarget && !this.focusTarget.dead) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, this.focusTarget.x, this.focusTarget.y)
      if (d <= this.atkRange) target = this.focusTarget
    }
    if (!target) {
      target = this.nearestEnemy(world)
      if (this.fireMode === 'focus') this.focusTarget = null
    }
    if (!target) return

    if (this.energyDrain > 0 && gameState.energy < this.energyDrain) return
    if (this.energyDrain > 0) gameState.energy = Math.max(0, gameState.energy - this.energyDrain)

    const scene = this.scene
    for (let i = 0; i < this.volleySize; i++) {
      scene.time.delayedCall(i * 1000, () => {
        const t = this.nearestEnemy(world)
        if (t) this.fireMissile(t)
      })
    }
    this.fireTimer = this.cooldown
  }

  nearestEnemy(world) {
    let best = null
    let bestD = this.atkRange
    for (const e of world.enemies) {
      if (e.dead) continue
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y)
      if (d <= bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  fireMissile(target) {
    const scene = this.scene
    const sprite = scene.add.image(this.x, this.y, 'missile_rod').setTint(this.def.color).setScale(0.55).setDepth(20)
    const dx = target.x - this.x
    const dy = target.y - this.y
    const d = Math.hypot(dx, dy) || 1
    sprite.setRotation(Math.atan2(dy, dx) + Math.PI / 2)
    const timeToTarget = d / (this.projSpeed || 130)
    const spreadVal = this.spread ?? 30
    const predX = target.x + (target.vx || 0) * timeToTarget + (Math.random() - 0.5) * spreadVal
    const predY = target.y + (target.vy || 0) * timeToTarget + (Math.random() - 0.5) * spreadVal
    scene.projectiles.push({
      x: this.x, y: this.y, tx: predX, ty: predY, target,
      speed: this.projSpeed, damage: this.missileDamage, splash: this.splash, color: this.def.color, sprite,
      _dir: { x: dx / d, y: dy / d },
      id: (scene._missileSeq = (scene._missileSeq || 0) + 1),
      vx: (dx / d) * this.projSpeed, vy: (dy / d) * this.projSpeed,
    })
  }

  applyUpgrade(upgrade) {
    if (upgrade.atkRange) this.atkRange = Math.round(this.atkRange * upgrade.atkRange)
    if (upgrade.cooldown) this.cooldown = Math.round(this.cooldown * upgrade.cooldown)
    if (upgrade.damage) this.missileDamage = Math.round(this.missileDamage * upgrade.damage)
    if (upgrade.projSpeed) this.projSpeed = Math.round(this.projSpeed * upgrade.projSpeed)
    if (upgrade.volleySize) this.volleySize += upgrade.volleySize
    if (upgrade.spread !== undefined) this.spread = upgrade.spread
    this.upgrades.push(upgrade.id)
  }
}
