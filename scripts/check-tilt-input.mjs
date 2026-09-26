import * as THREE from 'three'
import { installTiltInput } from '../game/input/tiltInput.js'
import { phaserHeightFor, screenToGround, updateTiltCamera } from '../game/three/tilt.js'
import { RENDER_SCALE } from '../game/quality.js'

function close(actual, expected, label) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) >= 0.5) {
    throw new Error(`${label}: ${actual} vs ${expected}`)
  }
}

const viewport = { w: 1000 * RENDER_SCALE, h: 620 * RENDER_SCALE }
const worldView = { x: 137, y: -83, width: 1250, height: phaserHeightFor(620) * 1.25 }
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000)
updateTiltCamera(camera, worldView, viewport)
const phaserCamera = { worldView, zoom: 0.8 }
let active = true
let three = { camera, renderer: { domElement: { width: viewport.w, height: viewport.h } } }
let originalCalls = 0
const game = {
  canvas: { getBoundingClientRect: () => ({ left: 25, top: 40 }) },
  scene: {
    isActive: (key) => key === 'Game' && active,
    getScene: () => ({ cameras: { main: phaserCamera } }),
  },
  input: {
    transformPointer(pointer, pageX, pageY) {
      originalCalls++
      pointer.position.x = pageX
      pointer.position.y = pageY
    },
  },
}
installTiltInput(game, () => three)

const pointer = { position: { x: 0, y: 0 }, prevPosition: { x: 0, y: 0 }, smoothFactor: 0 }
for (let i = 0; i < 20; i++) {
  const sx = viewport.w * ((i * 7 % 20) + 0.5) / 20
  const sy = viewport.h * ((i * 13 % 20) + 0.5) / 20
  const previous = { ...pointer.position }
  game.input.transformPointer(pointer, 25 + sx / RENDER_SCALE, 40 + sy / RENDER_SCALE, true)
  close(pointer.prevPosition.x, previous.x, `prevPosition.x ${i}`)
  close(pointer.prevPosition.y, previous.y, `prevPosition.y ${i}`)
  const expected = screenToGround(camera, sx, sy, viewport)
  close(worldView.x + pointer.position.x / phaserCamera.zoom, expected.x, `worldX ${i}`)
  close(worldView.y + pointer.position.y / phaserCamera.zoom, expected.y, `worldY ${i}`)
}

pointer.smoothFactor = 0.25
const previous = { ...pointer.position }
const target = screenToGround(camera, viewport.w / 2, viewport.h / 2, viewport)
game.input.transformPointer(pointer, 25 + viewport.w / (2 * RENDER_SCALE), 40 + viewport.h / (2 * RENDER_SCALE), true)
close(pointer.position.x, (target.x - worldView.x) * phaserCamera.zoom * 0.25 + previous.x * 0.75, 'smooth x')
close(pointer.position.y, (target.y - worldView.y) * phaserCamera.zoom * 0.25 + previous.y * 0.75, 'smooth y')

three = null
game.input.transformPointer(pointer, 3, 4, false)
active = false
three = { camera, renderer: { domElement: { width: viewport.w, height: viewport.h } } }
game.input.transformPointer(pointer, 5, 6, false)
if (originalCalls !== 2) throw new Error(`Original transform called ${originalCalls} times`)

console.log('OK tilt input')
