import Phaser from 'phaser'
import { WORLD, METEOR } from '~/game/balance.js'

// Crea un meteorito (sprite + datos) y lo registra en scene.meteorites. Devuelve el meteorito.
export function createMeteorite(scene, x, y) {
  const container = scene.add.container(x, y).setDepth(8)
  const radius = Phaser.Math.Between(16, 26)

  // Tanto host como cliente remoto ahora tienen ThreeLayer, así que el meteorito se renderiza en 3D.
  // El container se crea siempre (tween/destroy/red).
  const meteor = { x, y, container, radius, amount: Phaser.Math.Between(METEOR.amountMin, METEOR.amountMax), depleted: false }
  // Hash visual: no consume el RNG de Phaser ni altera la generación del mundo.
  let hash = (Math.imul(Math.round(x), 73856093) ^ Math.imul(Math.round(y), 19349663) ^
    Math.imul(radius, 83492791) ^ Math.imul(meteor.amount, 2654435761)) >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 2246822507) >>> 0
  const roll = (hash >>> 0) / 4294967296
  meteor.variant = roll < 0.45 ? 'rock' : roll < 0.65 ? 'iron' : roll < 0.80 ? 'ice' : roll < 0.90 ? 'crystal' : 'lava'
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
