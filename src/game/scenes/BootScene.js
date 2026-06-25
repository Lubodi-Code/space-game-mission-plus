import Phaser from 'phaser'
import { ENEMY_TYPES } from '../constants.js'

// Little space-invader-ish critter (1 = filled pixel).
const ENEMY_PATTERN = [
  '00100100',
  '01111110',
  '11111111',
  '11100111',
  '11111111',
  '01100110',
  '10000001',
]

/**
 * BootScene generates all visual assets procedurally (no external files needed
 * for the scaffold) and then hands off to the GameScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create() {
    this.makeStarTexture()
    this.makeGlowTexture()
    for (const t of Object.values(ENEMY_TYPES)) {
      this.makeEnemyTexture(`enemy_${t.key}`, t.color)
    }
    this.scene.start('Game')
  }

  // Pixel-art enemy sprite generated from ENEMY_PATTERN, tinted per type,
  // with a 1px dark drop-shadow so it reads against the dark background.
  makeEnemyTexture(key, color) {
    const px = 3
    const cols = ENEMY_PATTERN[0].length
    const rows = ENEMY_PATTERN.length
    const w = cols * px + px
    const h = rows * px + px
    const canvas = this.textures.createCanvas(key, w, h)
    const ctx = canvas.getContext()
    const c = Phaser.Display.Color.IntegerToColor(color)
    const main = `rgb(${c.red},${c.green},${c.blue})`
    const shade = `rgb(${Math.floor(c.red * 0.35)},${Math.floor(c.green * 0.35)},${Math.floor(c.blue * 0.4)})`

    const draw = (ox, oy, fill) => {
      ctx.fillStyle = fill
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          if (ENEMY_PATTERN[r][col] === '1') ctx.fillRect(ox + col * px, oy + r * px, px, px)
        }
      }
    }
    draw(px, px, shade) // shadow/outline
    draw(0, 0, main) // body
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
}
