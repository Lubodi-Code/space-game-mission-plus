import Phaser from 'phaser'
import { REGISTRY, EnemyType } from '../enemies/EnemyType.js'
import { validateRegistry } from '../enemies/validateRegistry.js'
import { STEERING } from '../balance.js'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload() {
    const map = {
      [EnemyType.GRUNT]: 'ship_grunt',
      [EnemyType.RUNNER]: 'ship_runner',
      [EnemyType.BRUTE]: 'ship_brute',
      [EnemyType.SABOTEUR]: 'ship_saboteur',
      [EnemyType.SKIRMISHER]: 'ship_skirmisher',
      [EnemyType.ARTILLERY]: 'ship_artillery',
      [EnemyType.MOTHERSHIP]: 'ship_mothership',
    }
    for (const [typeKey, def] of Object.entries(REGISTRY)) {
      const file = map[typeKey]
      if (!file) continue
      // Rasterizar al tamaño final (px). Sin esto Phaser no determina el tamaño
      // del SVG (solo tiene viewBox) y la textura sale como un cubo gigante.
      const size = Math.round(STEERING.shipBase * def.scale)
      this.load.svg(def.textureKey, `assets/ships/${file}.svg`, { width: size, height: size })
    }
  }

  create() {
    validateRegistry()
    this.makeStarTexture()
    this.makeGlowTexture()
    this.makeRodTexture()
    this.makeNebulaTexture('nebula_p', 140, 90, 200)
    this.makeNebulaTexture('nebula_b', 80, 140, 220)
    this.makeNebulaTexture('nebula_t', 60, 180, 170)
    this.scene.start('Game')
  }

  makeNebulaTexture(key, r, g, b) {
    const size = 256
    const canvas = this.textures.createCanvas(key, size, size)
    const ctx = canvas.getContext()
    for (let i = 0; i < 6; i++) {
      const cx = Phaser.Math.Between(60, size - 60)
      const cy = Phaser.Math.Between(60, size - 60)
      const rad = Phaser.Math.Between(50, 110)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
      grad.addColorStop(0, `rgba(${r},${g},${b},0.18)`)
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)
    }
    canvas.refresh()
  }

  // A tiny soft white dot used for the parallax starfield.
  makeStarTexture() {
    const size = 8
    const canvas = this.textures.createCanvas('star', size, size)
    const ctx = canvas.getContext()
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    canvas.refresh()
  }

  // A radial neon glow used behind structures (Core, nodes, etc.).
  makeGlowTexture() {
    const size = 128
    const canvas = this.textures.createCanvas('glow', size, size)
    const ctx = canvas.getContext()
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.25, 'rgba(120,200,255,0.45)')
    g.addColorStop(1, 'rgba(120,200,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    canvas.refresh()
  }

  // Proyectil puntiagudo tipo ASCII — palito pequeño con punta en flecha.
  // Blanco para tintar en runtime. Eje largo = vertical.
  makeRodTexture() {
    const w = 7
    const h = 16
    const canvas = this.textures.createCanvas('missile_rod', w, h)
    const ctx = canvas.getContext()
    ctx.fillStyle = 'rgba(255,255,255,1)'
    // vástago delgado
    ctx.fillRect(2, 4, 3, 10)
    // punta en flecha (>)
    ctx.fillRect(0, 4, 7, 3)
    // aleta inferior
    ctx.fillRect(0, 12, 7, 3)
    canvas.refresh()
  }
}
