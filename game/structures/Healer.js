import { gameState } from '../gameState.js'
import { Structure } from './Structure.js'
import { glowBlend } from '../render/blend.js'
import { HEAL_ORB_COLOR } from '../render/fx.js'

export class Healer extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.maxSpheres = def.maxSpheres
    this.healRate = def.healRate
    this.sphereSpeed = def.sphereSpeed
    this.healInterval = def.healInterval
    this.energyDrain = def.energyDrain || 0
    this.upgrades = []
  }

  applyUpgrade(upg) {
    if (upg.healInterval) this.healInterval = Math.round(this.healInterval * upg.healInterval)
    if (upg.healRate) this.healRate = this.healRate * upg.healRate
    if (upg.maxSpheres) this.maxSpheres += upg.maxSpheres
    if (upg.sphereSpeed) this.sphereSpeed = this.sphereSpeed * upg.sphereSpeed
    this.upgrades.push(upg.id)
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.building || !this.powered) return

    const healers = this.scene.healers || []
    const owned = healers.reduce((n, h) => n + (h.owner === this ? 1 : 0), 0)
    this.spawnTimer -= dt // dt llega en ms (igual que healInterval)
    if (this.spawnTimer <= 0 && owned < this.maxSpheres) {
      // Sin energía no puede generar esferas (reintenta el próximo frame).
      if (this.energyDrain > 0 && gameState.energy < this.energyDrain) return
      if (this.energyDrain > 0) gameState.energy = Math.max(0, gameState.energy - this.energyDrain)
      this.spawnSphere()
      this.spawnTimer = this.healInterval
    }
  }

  spawnSphere() {
    const scene = this.scene
    const sprite = scene.add.image(this.x, this.y, 'glow').setTint(HEAL_ORB_COLOR).setScale(0.15)
      .setBlendMode(glowBlend()).setDepth(18)
    if (!this.scene.healers) this.scene.healers = []
    this.scene.healers.push({ owner: this, x: this.x, y: this.y, target: null, sprite })
  }
}
