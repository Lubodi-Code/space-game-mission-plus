import Phaser from 'phaser'
import { WORLD, METEOR } from '../balance.js'

// Crea un meteorito (sprite + datos) y lo registra en scene.meteorites. Devuelve el meteorito.
export function createMeteorite(scene, x, y) {
  const container = scene.add.container(x, y).setDepth(8)
  const radius = Phaser.Math.Between(16, 26)

  // Tanto host como cliente remoto ahora tienen ThreeLayer, así que el meteorito se renderiza en 3D.
  // El container se crea siempre (tween/destroy/red).
  const meteor = { x, y, container, radius, amount: Phaser.Math.Between(METEOR.amountMin, METEOR.amountMax), depleted: false }
  scene.meteorites.push(meteor)
  return meteor
}

// Siembra los meteoritos iniciales alrededor del centro del mundo.
export function populateMeteorites(scene) {
  const cx = WORLD.width / 2
  const cy = WORLD.height / 2
  const margin = 80
  for (let i = 0; i < METEOR.count; i++) {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
    const dist = Phaser.Math.Between(METEOR.minDist, METEOR.maxDist)
    const x = Phaser.Math.Clamp(cx + Math.cos(angle) * dist, margin, WORLD.width - margin)
    const y = Phaser.Math.Clamp(cy + Math.sin(angle) * dist, margin, WORLD.height - margin)
    createMeteorite(scene, x, y)
  }
}
