import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene.js'
import { GameScene } from './scenes/GameScene.js'
import { RENDER_SCALE } from './quality.js'

/**
 * Build and mount the Phaser game inside the given DOM container.
 * Uses Scale.RESIZE so the canvas always fills the parent (responsive PC + mobile).
 */
export function createGame(parent) {
  const config = {
    type: Phaser.AUTO, // WebGL when available, Canvas fallback
    parent,
    transparent: true, // el fondo lo dibuja la capa Three.js detrás del canvas
    // Canvas a resolución física (RENDER_SCALE × CSS) mostrado con zoom 1/R: nitidez en pantallas
    // de alta densidad. Scale.NONE + ResizeObserver en lugar de RESIZE, que siempre renderiza a 1x.
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.round((parent.clientWidth || window.innerWidth) * RENDER_SCALE),
      height: Math.round((parent.clientHeight || window.innerHeight) * RENDER_SCALE),
      zoom: 1 / RENDER_SCALE,
    },
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
        gravity: { x: 0, y: 0 },
      },
    },
    input: {
      activePointers: 3, // multi-touch support
    },
    render: {
      antialias: true,
      roundPixels: false,
    },
    scene: [BootScene, GameScene],
  }

  const game = new Phaser.Game(config)
  const ro = new ResizeObserver(() => {
    const w = Math.round(parent.clientWidth * RENDER_SCALE)
    const h = Math.round(parent.clientHeight * RENDER_SCALE)
    if (w > 0 && h > 0 && (w !== game.scale.width || h !== game.scale.height)) {
      game.scale.resize(w, h)
      game.scale.setZoom(1 / RENDER_SCALE)
    }
  })
  ro.observe(parent)
  game.events.once('destroy', () => ro.disconnect())
  if (import.meta.env.DEV) {
    window.__PHASER_GAME__ = game
  }
  return game
}
