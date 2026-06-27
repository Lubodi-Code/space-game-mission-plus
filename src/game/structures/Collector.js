import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { Structure } from './Structure.js'
import { sfxMine } from '../sound.js'

const MINERAL_GREEN = 0x49e07a

export class Collector extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.miningRange = def.miningRange
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.building || !this.powered) return

    if (!this.target || this.target.depleted) this.target = this.findMeteor()
    const m = this.target
    if (!m) return

    // Genera energía mientras tiene un meteorito que minar.
    const eRate = this.def.energyRate || 0
    if (eRate > 0) {
      gameState.energy = Math.min(gameState.energyMax, gameState.energy + eRate * (dt / 1000))
    }

    sfxMine(this.x, this.y) // tick de minería (auto-throttled en sound.js)
    const g = this.scene.beamGraphics
    const pulse = 0.45 + 0.3 * Math.sin(time * 0.012)
    g.lineStyle(3, MINERAL_GREEN, pulse)
    g.beginPath()
    g.moveTo(this.x, this.y)
    g.lineTo(m.x, m.y)
    g.strokePath()
    g.fillStyle(MINERAL_GREEN, pulse)
    g.fillCircle(m.x, m.y, 4)

    this.acc += this.def.rate * (dt / 1000) // dt en ms; rate es por segundo
    const whole = Math.floor(this.acc)
    if (whole > 0) {
      this.acc -= whole
      const room = gameState.mineralsCap - gameState.minerals
      const mined = Math.min(whole, room, m.amount)
      if (mined > 0) {
        gameState.minerals += mined
        m.amount -= mined
      }
      if (m.amount <= 0 && !m.depleted) {
        m.depleted = true
        this.scene.tweens.add({
          targets: m.container,
          alpha: 0,
          scale: 0.6,
          duration: 500,
          onComplete: () => m.container.destroy(),
        })
      }
    }
  }

  findMeteor() {
    let best = null
    let bestD = this.miningRange
    for (const m of this.scene.meteorites) {
      if (m.depleted) continue
      const d = Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y)
      if (d <= bestD) {
        bestD = d
        best = m
      }
    }
    return best
  }
}
