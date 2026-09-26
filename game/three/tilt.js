import * as THREE from 'three'

export const TILT_DEG = 30
export const TILT = TILT_DEG * Math.PI / 180

export function phaserHeightFor(h) {
  return Math.ceil(h / Math.cos(TILT))
}

export function updateTiltCamera(camera, view, viewportPx) {
  const centerX = view.x + view.width / 2
  const centerY = view.y + view.height / 2
  const halfWidth = view.width / 2
  const halfHeight = view.height * Math.cos(TILT) / 2

  camera.left = -halfWidth
  camera.right = halfWidth
  camera.top = -halfHeight // Y de mundo crece hacia abajo en pantalla.
  camera.bottom = halfHeight

  // A 600 unidades sobre el suelo, la mirada cruza z=0 en el centro del view.
  const height = 600
  camera.position.set(centerX, centerY + height * Math.tan(TILT), height)
  camera.rotation.set(-TILT, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
}

export function screenToGround(camera, sx, sy, viewportPx) {
  camera.updateMatrixWorld(true)
  const nx = 2 * sx / viewportPx.w - 1
  const ny = 1 - 2 * sy / viewportPx.h
  const near = new THREE.Vector3(nx, ny, -1).unproject(camera)
  const far = new THREE.Vector3(nx, ny, 1).unproject(camera)
  const t = -near.z / (far.z - near.z)
  return {
    x: near.x + t * (far.x - near.x),
    y: near.y + t * (far.y - near.y),
  }
}

export function groundToScreen(camera, x, y, viewportPx, z = 0) {
  camera.updateMatrixWorld(true)
  const point = new THREE.Vector3(x, y, z).project(camera)
  return {
    x: (point.x + 1) * viewportPx.w / 2,
    y: (1 - point.y) * viewportPx.h / 2,
  }
}
