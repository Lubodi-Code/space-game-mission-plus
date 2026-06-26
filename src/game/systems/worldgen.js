import Phaser from 'phaser'
import { WORLD, METEOR } from '../balance.js'

// Crea un meteorito (sprite + datos) y lo registra en scene.meteorites. Devuelve el meteorito.
export function createMeteorite(scene, x, y) {
  const container = scene.add.container(x, y).setDepth(8)
  const radius = Phaser.Math.Between(16, 26)
  const g = scene.add.graphics()

  g.fillStyle(0x3a342c, 1)
  g.lineStyle(2, 0x5a5247, 1)
  const pts = []
  const segs = 9
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2
    const r = radius * Phaser.Math.FloatBetween(0.75, 1.15)
    pts.push(new Phaser.Geom.Point(Math.cos(a) * r, Math.sin(a) * r))
  }
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
  g.closePath()
  g.fillPath()
  g.strokePath()

  g.fillStyle(0x49e07a, 0.9)
  for (let i = 0; i < 5; i++) {
    g.fillCircle(
      Phaser.Math.Between(-radius * 0.5, radius * 0.5),
      Phaser.Math.Between(-radius * 0.5, radius * 0.5),
      Phaser.Math.FloatBetween(1.5, 3)
    )
  }
  container.add(g)

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
