import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCommanderShip, SHIP_DESIGNS } from '../game/three/shipModel.js'

for (const { id } of SHIP_DESIGNS) {
  const ship = createCommanderShip(0xffaa44, id)
  try {
    assert.ok(ship instanceof THREE.Object3D, `${id}: expected Object3D`)
    assert.ok(ship.userData.engine instanceof THREE.Mesh, `${id}: missing engine Mesh`)
    assert.equal(typeof ship.userData.setTint, 'function', `${id}: missing setTint`)
    assert.equal(typeof ship.userData.dispose, 'function', `${id}: missing dispose`)
    ship.userData.setTint(0x44aaff)

    const size = new THREE.Box3().setFromObject(ship).getSize(new THREE.Vector3())
    assert.ok(size.x >= 40 && size.x <= 80, `${id}: X length ${size.x} is outside 40..80`)

    if (id !== 'falcon') {
      let triangles = 0
      ship.traverse((part) => {
        if (part.isMesh) {
          const geometry = part.geometry
          triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3
        }
      })
      assert.ok(triangles < 300, `${id}: ${triangles} triangles exceeds the budget`)
    }
  } finally {
    ship.userData.dispose()
  }
}

console.log(`OK: ${SHIP_DESIGNS.length} ship designs`)
