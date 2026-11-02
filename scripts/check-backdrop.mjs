// Comprueba el contrato sin navegador; la compilación GLSL requiere una GPU.
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createSectorBackdrop } from '../game/three/sectorBackdrop.js'

let count = 0
for (const lowGfx of [false, true]) {
  for (let sector = 1; sector <= 10; sector++) {
    const backdrop = createSectorBackdrop(sector, lowGfx)
    const { mesh, mode, update, fit, dispose } = backdrop
    const label = `sector ${sector}, lowGfx=${lowGfx}`
    assert.ok(mesh instanceof THREE.Mesh, label)
    assert.ok(mesh.geometry instanceof THREE.PlaneGeometry, label)
    assert.equal(mesh.geometry.parameters.width, 1, label)
    assert.equal(mesh.geometry.parameters.height, 1, label)
    assert.equal(mesh.position.z, -2400, label)
    assert.equal(mesh.renderOrder, -100, label)
    assert.equal(mesh.material.depthWrite, false, label)
    assert.equal(mesh.material.depthTest, false, label)
    assert.equal(mode, sector - 1, label)
    for (const fn of [update, fit, dispose]) assert.equal(typeof fn, 'function', label)

    const { uniforms, fragmentShader } = mesh.material
    assert.equal(uniforms.uMode.value, mode, label)
    assert.doesNotMatch(fragmentShader, /uTex|texture2D|sector-/, label)
    assert.match(fragmentShader, /uMode\s*==\s*5\b/, label)
    assert.match(fragmentShader, /uMode\s*==\s*7\b/, label)
    assert.match(fragmentShader, new RegExp(`for\\s*\\(int i = 0; i < ${lowGfx ? 3 : 5};`), label)
    assert.match(fragmentShader, /#include <colorspace_fragment>\s*}\s*$/, label)

    update(42.5, 5400, -3600)
    assert.equal(uniforms.uTime.value, 42.5, label)
    assert.equal(uniforms.uOff.value.x, 5400 * 0.000012, label)
    assert.equal(uniforms.uOff.value.y, 3600 * 0.000012, label)
    update(0, 0, 0)
    assert.equal(uniforms.uTime.value, 0, label)
    assert.equal(uniforms.uOff.value.length(), 0, label)

    for (const aspect of [16 / 9, 9 / 16]) {
      const camera = { position: { z: 800 }, fov: 50, aspect }
      fit(camera)
      const height = 2 * (camera.position.z - mesh.position.z)
        * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.04
      assert.equal(mesh.scale.x, height * aspect, label)
      assert.equal(mesh.scale.y, height, label)
      assert.equal(mesh.scale.z, 1, label)
      assert.equal(uniforms.uAspect.value, aspect, label)
    }

    let geometryDisposed = false
    let materialDisposed = false
    mesh.geometry.addEventListener('dispose', () => { geometryDisposed = true })
    mesh.material.addEventListener('dispose', () => { materialDisposed = true })
    dispose()
    assert.ok(geometryDisposed, `${label}: geometría sin liberar`)
    assert.ok(materialDisposed, `${label}: material sin liberar`)
    count++
  }
}

console.log(`OK: ${count} backdrops`)
