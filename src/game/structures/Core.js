import Phaser from 'phaser'
import { CORE } from '../balance.js'
import { drawPolygon, darken } from './draw.js'
import { Structure } from './Structure.js'

export class Core extends Structure {
  constructor(x, y, scene) {
    super(CORE, x, y, scene, true)
    this.building = false

    const glow = this.container.getByName('glow')
    const inner = scene.add.graphics()
    drawPolygon(inner, 0, 0, 22, 4, CORE.color, 2, 1, 0x0a2030)
    inner.setName('inner')
    this.container.add(inner)
    this.innerShape = inner

    scene.tweens.add({ targets: this.shape, angle: 360, duration: 18000, repeat: -1 })
    scene.tweens.add({ targets: inner, scale: 1.18, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    scene.tweens.add({ targets: glow, alpha: 0.6, scale: 2.6, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
  }
}
