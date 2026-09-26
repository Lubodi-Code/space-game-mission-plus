// Verificación headless (sin WebGL) de los módulos 3D: construye, actualiza y libera.
// Uso: node scripts/check-three-models.mjs
import * as THREE from 'three'

const { createStructureModel, DECORS } = await import('../game/three/structureModels.js')
const roles = ['core', 'relay', 'collector', 'battery', 'healer', 'turret', 'missile']
let n = 0
for (const role of roles) {
  const m = createStructureModel({ role, sides: 6, size: role === 'core' ? 46 : 10, color: 0x6cc8ff, isCore: role === 'core' })
  if (!(m instanceof THREE.Object3D)) throw new Error(role + ': no es Object3D')
  const u = m.userData
  for (const fn of ['setColor', 'setDecor', 'setPowered', 'setBuilding', 'setAim', 'pulseUpgrade', 'update', 'dispose']) {
    if (typeof u[fn] !== 'function') throw new Error(`${role}: falta userData.${fn}`)
  }
  for (const d of DECORS) { u.setDecor(d, 0xffae5b); u.update(0.016, 1000) }
  u.setColor(0xff5566); u.setPowered(false); u.setBuilding(0.5); u.setAim(1.2); u.pulseUpgrade(0xffe066)
  for (let i = 0; i < 90; i++) u.update(0.016, 1000 + i * 16)
  u.dispose()
  n++
}

const fx = await import('../game/three/fxModels.js')
const scene = new THREE.Scene()
for (const kind of fx.EXPLOSION_KINDS) {
  const e = fx.createExplosion(scene, { x: 10, y: 20, color: 0xff8a3d, radius: 40, kind })
  let alive = true
  let steps = 0
  while (alive && steps < 600) { alive = e.update(1 / 60); steps++ }
  if (alive) throw new Error(kind + ': nunca termina')
  e.dispose()
}
const mis = fx.createMissileModel(0xc08bff)
if (!(mis instanceof THREE.Object3D)) throw new Error('misil: no es Object3D')
for (let i = 0; i < 60; i++) mis.userData.update(i * 3, i * 2, 0.4, 1 / 60)
mis.userData.dispose()
if (scene.children.length) throw new Error('fx: quedaron objetos en la escena tras dispose: ' + scene.children.length)

console.log(`OK: ${n} estructuras, ${fx.EXPLOSION_KINDS.length} tipos de explosión, misil`)
