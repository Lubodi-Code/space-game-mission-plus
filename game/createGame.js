import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene.js'
import { GameScene } from './scenes/GameScene.js'

/**
 * Build and mount the Phaser game inside the given DOM container.
 * Uses Scale.RESIZE so the canvas always fills the parent (responsive PC + mobile).
 */
export function createGame(parent) {
  const config = {
    type: Phaser.AUTO, // WebGL when available, Canvas fallback
    parent,
    transparent: true, // el fondo lo dibuja la capa Three.js detrás del canvas
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
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
  if (import.meta.env.DEV) {
    window.__PHASER_GAME__ = game
  }
  return game
}
