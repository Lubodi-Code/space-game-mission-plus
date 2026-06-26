import { gameState } from '../gameState.js'
import { ENERGY } from '../balance.js'
import { Structure } from './Structure.js'

export class Battery extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.selfCharge = false // lo activa una mejora (Fase 3)
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.building || !this.powered || !this.selfCharge) return

    // Auto-recarga solo cuando ya no quedan meteoritos que minar.
    const anyMinable = this.scene.meteorites.some((m) => !m.depleted)
    if (anyMinable) return
    gameState.energy = Math.min(
      gameState.energyMax,
      gameState.energy + ENERGY.batterySelfChargeRate * (dt / 1000),
    )
  }
}
