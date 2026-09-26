import { Structure } from './Structure.js'

export class Node extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.maxPorts = def.maxPorts
    this.upgrades = []
  }

  applyUpgrade(upg) {
    if (upg.range) this.range = Math.round(this.range * upg.range)
    if (upg.ports) this.maxPorts += upg.ports
    if (upg.hpMult) {
      this.maxHp = Math.round(this.maxHp * upg.hpMult)
      this.hp = Math.round(this.hp * upg.hpMult)
    }
    this.upgrades.push(upg.id)
    this.scene.recomputeNetwork?.()
  }
}
