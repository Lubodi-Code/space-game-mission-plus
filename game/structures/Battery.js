import { gameState } from '../gameState.js'
import { ENERGY } from '../balance.js'
import { Structure } from './Structure.js'

export class Battery extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.selfCharge = false // lo activa una mejora (Fase 3)
    this.upgrades = []
    // Stats que pueden mejorar; por defecto vienen de def.
    this.energyCap = def.energyCap || 0
    this.capBonus = def.capBonus || 0
    this.energyRate = ENERGY.batteryPassiveRate
  }

  applyUpgrade(upg) {
    if (upg.energyCap) {
      this.energyCap = Math.round(this.energyCap * upg.energyCap)
    }
    if (upg.capBonus) {
      const old = this.capBonus
      this.capBonus = Math.round(this.capBonus * upg.capBonus)
      gameState.mineralsCap += this.capBonus - old
    }
    if (upg.energyRate) {
      this.energyRate += upg.energyRate
    }
    this.upgrades.push(upg.id)
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.building || !this.powered) return

    // Generación pasiva constante de energía mientras la batería está encendida.
    gameState.energy = Math.min(
      gameState.energyMax,
      gameState.energy + this.energyRate * (dt / 1000),
    )

    if (!this.selfCharge) return

    // Auto-recarga adicional solo cuando ya no quedan meteoritos que minar.
    const anyMinable = this.scene.meteorites.some((m) => !m.depleted)
    if (anyMinable) return
    gameState.energy = Math.min(
      gameState.energyMax,
      gameState.energy + ENERGY.batterySelfChargeRate * (dt / 1000),
    )
  }
}
