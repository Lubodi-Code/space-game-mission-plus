import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { COMBAT } from '../balance.js'
import { Structure } from './Structure.js'
import { glowBlend } from '../render/blend.js'
import { sfxMissile, sfxLock } from '../sound.js'

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
    this.volleySize = 3
    this.aura = false // lo activa la mejora "Ojiva de plasma" → daño en área al impactar
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
    if (!target) { this._engaged = false; return }

    if (this.energyDrain > 0 && gameState.energy < this.energyDrain) return
    if (this.energyDrain > 0) gameState.energy = Math.max(0, gameState.energy - this.energyDrain)

    if (!this._engaged) { sfxLock(this.x, this.y); this._engaged = true }

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
    sfxMissile(this.x, this.y)
    const sprite = scene.add.image(this.x, this.y, 'missile_rod').setTint(this.fxColor).setScale(0.6).setDepth(20)
    const glow = scene.add.image(this.x, this.y, 'glow')
      .setTint(this.fxColor)
      .setBlendMode(glowBlend())
      .setScale(0.06)
      .setAlpha(0.75)
      .setDepth(19)
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
      speed: this.projSpeed, damage: this.missileDamage, splash: this.splash, aura: this.aura, color: this.fxColor, sprite, glow,
      _dir: { x: dx / d, y: dy / d },
      id: (scene._missileSeq = (scene._missileSeq || 0) + 1),
      vx: (dx / d) * this.projSpeed, vy: (dy / d) * this.projSpeed,
      // Vida calculada para que el misil pueda recorrer exactamente su atkRange.
      maxLife: (this.atkRange / this.projSpeed) * 1000,
    })
  }

  applyUpgrade(upgrade) {
    if (upgrade.atkRange) this.atkRange = Math.round(this.atkRange * upgrade.atkRange)
    if (upgrade.cooldown) this.cooldown = Math.round(this.cooldown * upgrade.cooldown)
    if (upgrade.damage) this.missileDamage = Math.round(this.missileDamage * upgrade.damage)
    if (upgrade.projSpeed) this.projSpeed = Math.round(this.projSpeed * upgrade.projSpeed)
    if (upgrade.volleySize) this.volleySize += upgrade.volleySize
    if (upgrade.spread !== undefined) this.spread = upgrade.spread
    if (upgrade.splash !== undefined) this.splash = upgrade.splash
    if (upgrade.aura) this.aura = true
    this.upgrades.push(upgrade.id)
  }
}
