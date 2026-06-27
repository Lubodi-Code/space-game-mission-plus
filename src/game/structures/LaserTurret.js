import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { COMBAT } from '../balance.js'
import { Structure } from './Structure.js'
import { sfxLaser, sfxLock } from '../sound.js'

export class LaserTurret extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.atkRange = def.atkRange
    this.cooldown = def.cooldown
    this.laserDamage = def.damage
    this.energyDrain = def.energyDrain || 0
    this.fireMode = 'auto'
    this.focusTarget = null
    this.upgrades = []
    this.style = 'default'      // 'default' | 'spread' | 'bigbeam'
    this.damageRamp = 0
    this.lastTarget = null
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.building || !this.powered) return

    this.fireTimer -= dt
    if (this.fireTimer > 0) return

    // 1) Selección de objetivo según modo y estilo.
    let target = null
    if (this.fireMode === 'focus') {
      if (this.focusTarget && !this.focusTarget.dead) {
        const d = Phaser.Math.Distance.Between(this.x, this.y, this.focusTarget.x, this.focusTarget.y)
        if (d <= this.atkRange) target = this.focusTarget
      } else {
        this.focusTarget = null
      }
    } else if (this.style === 'bigbeam') {
      target = this.largestEnemy(world)
    } else {
      target = this.nearestEnemy(world)
    }
    if (!target) { this._engaged = false; return }

    // 2) Energía.
    if (this.energyDrain > 0 && gameState.energy < this.energyDrain) return
    if (this.energyDrain > 0) gameState.energy = Math.max(0, gameState.energy - this.energyDrain)

    // 3) Disparo. Blip de "lock" al enganchar un objetivo tras estar ocioso.
    if (!this._engaged) { sfxLock(this.x, this.y); this._engaged = true }
    sfxLaser(this.x, this.y)
    this.fireLaser(target, world)

    // 4) Recarga: el rayo progresivo es continuo; el resto respeta su cooldown.
    this.fireTimer = this.style === 'bigbeam' ? COMBAT.bigbeamCooldown : this.cooldown
  }

  // --- selección de enemigos ---
  nearestEnemy(world) {
    let best = null
    let bestD = this.atkRange
    for (const e of world.enemies) {
      if (e.dead) continue
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y)
      if (d <= bestD) { bestD = d; best = e }
    }
    return best
  }

  nearestEnemies(world, n) {
    const inRange = []
    for (const e of world.enemies) {
      if (e.dead) continue
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y)
      if (d <= this.atkRange) inRange.push({ e, d })
    }
    inRange.sort((a, b) => a.d - b.d)
    return inRange.slice(0, n).map((o) => o.e)
  }

  largestEnemy(world) {
    let best = null
    let bestScore = -1
    for (const e of world.enemies) {
      if (e.dead) continue
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y)
      if (d > this.atkRange) continue
      const score = (e.radius || 0) * 1000 + (e.maxHp || 0)
      if (score > bestScore) { bestScore = score; best = e }
    }
    return best
  }

  // --- disparo según estilo ---
  fireLaser(target, world) {
    if (this.style === 'spread') {
      const targets = this.nearestEnemies(world, 3)
      for (const t of targets) {
        t.hit(this.laserDamage, world)
        this.pushBeam(t.x, t.y, false)
      }
      return
    }

    if (this.style === 'bigbeam') {
      if (this.lastTarget === target) {
        this.damageRamp = Math.min(COMBAT.bigbeamRampMax, this.damageRamp + COMBAT.bigbeamRampStep)
      } else {
        this.damageRamp = 0
      }
      this.lastTarget = target
      target.hit(this.laserDamage * (1 + this.damageRamp), world)
      this.pushBeam(target.x, target.y, true)
      return
    }

    target.hit(this.laserDamage, world)
    this.pushBeam(target.x, target.y, false)
  }

  pushBeam(x2, y2, big) {
    this.scene.lasers.push({
      x1: this.x, y1: this.y, x2, y2,
      ttl: big ? COMBAT.laserTtlMs * 3 : COMBAT.laserTtlMs,
      color: this.def.color,
      width: big ? 5 : 2.5,
    })
    if (this.scene.netHost) this.scene._beamQueue.push(
      [Math.round(this.x), Math.round(this.y), Math.round(x2), Math.round(y2), this.def.color, big ? 5 : 2.5,
       big ? COMBAT.laserTtlMs * 3 : COMBAT.laserTtlMs, COMBAT.laserTtlMs]) // ttl + base de alfa: el cliente reusa drawBeam() y desvanece igual
  }

  applyUpgrade(upgrade) {
    if (upgrade.atkRange) this.atkRange = Math.round(this.atkRange * upgrade.atkRange)
    if (upgrade.cooldown) this.cooldown = Math.round(this.cooldown * upgrade.cooldown)
    if (upgrade.damage) this.laserDamage = Math.round(this.laserDamage * upgrade.damage)
    if (upgrade.style) this.style = upgrade.style
    this.upgrades.push(upgrade.id)
  }
}
