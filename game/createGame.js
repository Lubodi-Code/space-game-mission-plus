import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene.js'
import { GameScene } from './scenes/GameScene.js'
import { RENDER_SCALE } from './quality.js'
import { phaserHeightFor } from './three/tilt.js'

/** Configuración de Phaser para el tamaño actual del contenedor. */
export function createGameConfig(parent) {
  return {
    type: Phaser.AUTO, // WebGL when available, Canvas fallback
    parent,
    transparent: true, // el fondo lo dibuja la capa Three.js detrás del canvas
    // Canvas a resolución física (RENDER_SCALE × CSS) mostrado con zoom 1/R: nitidez en pantallas
    // de alta densidad. Scale.NONE + ResizeObserver en lugar de RESIZE, que siempre renderiza a 1x.
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.round((parent.clientWidth || window.innerWidth) * RENDER_SCALE),
      height: phaserHeightFor(Math.round((parent.clientHeight || window.innerHeight) * RENDER_SCALE)),
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
      preserveDrawingBuffer: true,
    },
    scene: [BootScene, GameScene],
  }
}

/** Crea el juego y mantiene el canvas invisible ajustado al contenedor. */
export function createGame(parent) {
  const game = new Phaser.Game(createGameConfig(parent))
  const fitCanvas = () => {
    // Phaser conserva su alto físico extendido; el canvas invisible ocupa la pantalla.
    game.canvas.style.width = '100%'
    game.canvas.style.height = '100%'
    game.canvas.style.opacity = '0'
  }
  fitCanvas()
  const ro = new ResizeObserver(() => {
    const w = Math.round(parent.clientWidth * RENDER_SCALE)
    const h = phaserHeightFor(Math.round(parent.clientHeight * RENDER_SCALE))
    if (w > 0 && h > 0 && (w !== game.scale.width || h !== game.scale.height)) {
      game.scale.resize(w, h)
      game.scale.setZoom(1 / RENDER_SCALE)
      fitCanvas()
    }
  })
  ro.observe(parent)
  game.events.once('destroy', () => ro.disconnect())
  if (import.meta.env.DEV) {
    window.__PHASER_GAME__ = game
  }
  return game
}
