import * as THREE from 'three'
import { TILT, TILT_DEG, phaserHeightFor, updateTiltCamera, screenToGround, groundToScreen } from '../game/three/tilt.js'

function check(condition, message) {
  if (!condition) throw new Error(message)
}

function close(actual, expected, tolerance, message) {
  check(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance,
    `${message}: ${actual} vs ${expected}`)
}

close(TILT_DEG, 30, 1e-12, 'TILT_DEG')
close(TILT, Math.PI / 6, 1e-12, 'TILT')
for (const h of [1, 620, 844, 1024]) {
  check(phaserHeightFor(h) === Math.ceil(h / Math.cos(TILT)), `phaserHeightFor(${h})`)
}

let seed = 123456789
function random() {
  seed = (1664525 * seed + 1013904223) >>> 0
  return seed / 2 ** 32
}

const viewports = [{ w: 1000, h: 620 }, { w: 390, h: 844 }]
for (const viewport of viewports) {
  const views = [
    { x: 0, y: 0, width: viewport.w, height: phaserHeightFor(viewport.h) },
    { x: 128, y: -93, width: viewport.w * 1.5, height: phaserHeightFor(viewport.h) * 1.5 },
    { x: -740, y: 315, width: 840, height: 510 },
    { x: 2100.25, y: -1800.5, width: 240, height: 730 },
  ]

  for (const view of views) {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000)
    updateTiltCamera(camera, view, viewport)
    close(camera.rotation.x, -TILT, 1e-12, 'rotación X')

    const cx = view.x + view.width / 2
    const cy = view.y + view.height / 2
    const center = groundToScreen(camera, cx, cy, viewport)
    close(center.x, viewport.w / 2, 0.5, 'centro X')
    close(center.y, viewport.h / 2, 0.5, 'centro Y')

    for (const [x, y, sx, sy] of [
      [view.x, view.y, 0, 0],
      [view.x + view.width, view.y, viewport.w, 0],
      [view.x, view.y + view.height, 0, viewport.h],
      [view.x + view.width, view.y + view.height, viewport.w, viewport.h],
    ]) {
      const point = groundToScreen(camera, x, y, viewport)
      close(point.x, sx, 1, 'esquina X')
      close(point.y, sy, 1, 'esquina Y')
    }

    for (let i = 0; i < 50; i++) {
      const x = view.x + random() * view.width
      const y = view.y + random() * view.height
      const screen = groundToScreen(camera, x, y, viewport)
      const ground = screenToGround(camera, screen.x, screen.y, viewport)
      close(ground.x, x, 0.5, 'ida y vuelta X')
      close(ground.y, y, 0.5, 'ida y vuelta Y')
    }

    const lower = groundToScreen(camera, cx, cy + 20, viewport)
    check(lower.y > center.y, 'Y mayor debe verse más abajo')
    const elevated = groundToScreen(camera, cx, cy, viewport, 20)
    check(elevated.y < center.y, 'z mayor debe verse más arriba')
  }
}

console.log('OK tilt')
