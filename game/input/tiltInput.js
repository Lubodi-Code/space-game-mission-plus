import { RENDER_SCALE } from '../quality.js'
import { screenToGround } from '../three/tilt.js'

export function installTiltInput(game, getThree) {
  const original = game.input.transformPointer

  game.input.transformPointer = function (pointer, pageX, pageY, wasMove) {
    if (!game.scene.isActive('Game')) {
      return original.call(this, pointer, pageX, pageY, wasMove)
    }

    const three = getThree()
    if (!three) {
      return original.call(this, pointer, pageX, pageY, wasMove)
    }

    const cam = game.scene.getScene('Game').cameras.main
    const rect = game.canvas.getBoundingClientRect()
    const viewport = three.renderer.domElement
    const scrollX = typeof window === 'undefined' ? 0 : window.scrollX
    const scrollY = typeof window === 'undefined' ? 0 : window.scrollY
    const sx = (pageX - scrollX - rect.left) * RENDER_SCALE
    const sy = (pageY - scrollY - rect.top) * RENDER_SCALE
    const ground = screenToGround(three.camera, sx, sy, { w: viewport.width, h: viewport.height })
    const x = (ground.x - cam.worldView.x) * cam.zoom
    const y = (ground.y - cam.worldView.y) * cam.zoom

    const position = pointer.position
    const previous = pointer.prevPosition
    previous.x = position.x
    previous.y = position.y

    const a = pointer.smoothFactor
    if (!wasMove || a === 0) {
      position.x = x
      position.y = y
    } else {
      position.x = x * a + previous.x * (1 - a)
      position.y = y * a + previous.y * (1 - a)
    }
  }
}
