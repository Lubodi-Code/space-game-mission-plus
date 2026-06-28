import Phaser from 'phaser'
import { COMBAT, FX } from '../balance.js'
import { net } from '../net.js'
import { glowBlend } from './blend.js'
import { sfxImpact } from '../sound.js'

// Efectos visuales transitorios. Funciones que reciben `scene`; sin estado propio.

export function spawnFloatingText(scene, x, y, text, color) {
  const t = scene.add.text(x, y - 10, text, {
    fontSize: '13px',
    fontFamily: 'monospace',
    color: color,
    fontStyle: 'bold',
    stroke: '#000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(35)
  scene.tweens.add({
    targets: t,
    y: y - 10 - FX.floatRise,
    alpha: 0,
    duration: FX.floatTextMs,
    ease: 'Quad.out',
    onComplete: () => t.destroy(),
  })
}

export function hitFlash(scene, x, y) {
  const fl = scene.add.image(x, y, 'glow')
    .setTint(0xffffff).setBlendMode(glowBlend())
    .setScale(0.08).setDepth(20)
  scene.tweens.add({
    targets: fl, alpha: 0, scale: 0.16, duration: 160,
    onComplete: () => fl.destroy(),
  })
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2
    const dist = 8 + Math.random() * 20
    const p = scene.add.graphics().setDepth(30)
    p.fillStyle(0xffffff, 0.9).fillCircle(0, 0, 1.5 + Math.random() * 2)
    p.setPosition(x, y)
    scene.tweens.add({ targets: p, x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0, scale: 0.3, duration: 280 + Math.random() * 150, onComplete: () => p.destroy() })
  }
}

export function explosion(scene, x, y, color, radius) {
  if (net.isHost && scene._explQueue) scene._explQueue.push([Math.round(x), Math.round(y), color, Math.round(radius)])
  sfxImpact(x, y, radius / 14)
  if (scene.three) scene.three.explode(x, y, color, radius)

  // Camera shake on zoom or proximity to action (noticeable intensity)
  const cam = scene.cameras?.main
  if (cam) {
    const zoom = cam.zoom
    const camCenterX = cam.worldView.x + cam.worldView.width / 2
    const camCenterY = cam.worldView.y + cam.worldView.height / 2
    const dist = Phaser.Math.Distance.Between(x, y, camCenterX, camCenterY)
    const maxDist = Math.max(cam.worldView.width, cam.worldView.height) * 0.85

    if (dist < maxDist) {
      const proximityFactor = Math.max(0, 1 - dist / maxDist)
      const zoomFactor = Phaser.Math.Percent(zoom, 0.25, 1.0)
      
      const baseIntensity = 0.006 * (radius / 12)
      const intensity = baseIntensity * (0.5 + 0.5 * zoomFactor) * proximityFactor

      if (intensity > 0.001) {
        const duration = Math.min(350, 150 + radius * 3)
        cam.shake(duration, intensity, true) // Force shake
      }
    }
  }

  const ring = scene.add.graphics().setDepth(28).setBlendMode(Phaser.BlendModes.ADD)
  ring.fillStyle(color, 0.5).fillCircle(x, y, radius * 0.6)
  ring.lineStyle(2, color, 0.9).strokeCircle(x, y, radius * 0.6)
  scene.tweens.add({
    targets: ring, scale: 2.2, alpha: 0,
    duration: FX.explosionMs, ease: 'Quad.out',
    onComplete: () => ring.destroy(),
  })

  const burst = scene.add.particles(x, y, 'star', {
    speed: { min: 40, max: 40 + radius * 6 },
    angle: { min: 0, max: 360 },
    lifespan: 380,
    scale: { start: Math.max(0.5, radius / 24), end: 0 },
    alpha: { start: 1, end: 0 },
    blendMode: 'ADD',
    tint: color,
    quantity: Math.min(24, 8 + Math.round(radius / 3)),
    emitting: false,
  }).setDepth(29)
  burst.explode()
  scene.time.delayedCall(450, () => burst.destroy())
}

// Aura de plasma: anillo translúcido que se expande y desvanece en el punto de impacto.
export function auraBurst(scene, x, y, color, radius) {
  const g = scene.add.graphics().setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setPosition(x, y)
  // Aura más tenue y granular: anillos concéntricos en lugar de relleno plano.
  g.lineStyle(2, color, 0.55).strokeCircle(0, 0, radius)
  g.lineStyle(1, color, 0.35).strokeCircle(0, 0, radius * 0.65)
  g.lineStyle(1, color, 0.22).strokeCircle(0, 0, radius * 0.35)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const r = radius * (0.55 + Math.random() * 0.35)
    g.fillStyle(color, 0.35).fillCircle(Math.cos(a) * r, Math.sin(a) * r, 1.5 + Math.random())
  }
  scene.tweens.add({
    targets: g, scale: 1.6, alpha: 0,
    duration: 420, ease: 'Quad.out',
    onComplete: () => g.destroy(),
  })
}

// Pura: dibuja un haz sobre el Graphics `g` (la usan el host y el cliente remoto).
export function drawBeam(g, x1, y1, x2, y2, color, width, a) {
  g.lineStyle(width * 3, color, a * 0.22); g.lineBetween(x1, y1, x2, y2)
  g.lineStyle(width, color, a);            g.lineBetween(x1, y1, x2, y2)
  g.fillStyle(color, a * 0.9); g.fillCircle(x2, y2, width * 2.2)
  g.fillStyle(color, a * 0.6); g.fillCircle(x1, y1, width * 1.4)
}

export function drawFx(scene, delta) {
  const g = scene.fxGraphics
  g.clear()
  for (let i = scene.lasers.length - 1; i >= 0; i--) {
    const l = scene.lasers[i]
    l.ttl -= delta
    if (l.ttl <= 0) {
      scene.lasers.splice(i, 1)
      continue
    }
    const a = l.ttl / COMBAT.laserTtlMs
    drawBeam(g, l.x1, l.y1, l.x2, l.y2, l.color, l.width ?? 2.5, a)
  }
  scene.epSystem.draw(g)
}
