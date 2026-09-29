import * as THREE from 'three'

const caches = new WeakMap()
const variants = new Set(['rock', 'iron', 'ice', 'crystal', 'lava', 'giant', 'explosive'])
const TAU = Math.PI * 2
const up = new THREE.Vector3(0, 1, 0)

function resources(base) {
  let c = caches.get(base.geo)
  if (c) return c
  const mats = { rock: base.mat }
  const derived = (kind, color, emissive, intensity, metalness, roughness) => {
    const mat = base.mat.clone()
    mat.color.multiply(new THREE.Color(color))
    mat.emissive.setHex(emissive)
    mat.emissiveIntensity = intensity
    mat.metalness = metalness
    mat.roughness = roughness
    mats[kind] = mat
  }
  derived('iron', 0xa9bdd0, 0xb7c7d7, 0.25, 0.6, 0.45)
  derived('ice', 0xb7efff, 0x53d9f5, 0.22, 0, 0.32)
  derived('crystal', 0xffffff, 0xffffff, 0.75, 0, 1)
  derived('lava', 0x704946, 0xff671c, 0.46, 0, 0.88)
  derived('giant', 0xffd5a0, 0xffaf57, 0.42, 0, 0.9)
  derived('explosive', 0xffffff, 0xff3d2e, 0.55, 0, 1)
  c = {
    mats,
    crystalGeo: new THREE.ConeGeometry(0.13, 0.5, 5),
    cyan: new THREE.MeshStandardMaterial({ color: 0x9befff, emissive: 0x38dfff, emissiveIntensity: 0.9, roughness: 0.38 }),
    magenta: new THREE.MeshStandardMaterial({ color: 0xf6b0f0, emissive: 0xd94dcc, emissiveIntensity: 0.9, roughness: 0.38 }),
  }
  caches.set(base.geo, c)
  return c
}

function addCrystals(root, c, geo, lowGfx) {
  const positions = geo.getAttribute('position')
  const normals = geo.getAttribute('normal')
  const count = lowGfx ? 3 : 6
  const point = new THREE.Vector3()
  const normal = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i + 0.37) * positions.count / count) % positions.count
    point.fromBufferAttribute(positions, index)
    if (normals) normal.fromBufferAttribute(normals, index).normalize()
    else normal.copy(point).normalize()
    // The cone's lower 30% is inside the actual OBJ surface.
    const crystal = new THREE.Mesh(c.crystalGeo, i % 3 === 0 ? c.magenta : c.cyan)
    crystal.quaternion.setFromUnitVectors(up, normal)
    crystal.position.copy(point).addScaledVector(normal, 0.1)
    crystal.scale.setScalar(0.75 + (i % 3) * 0.17)
    root.add(crystal)
  }
}

function addDebris(root, c, geo) {
  const orbit = new THREE.Group()
  const pieces = new THREE.InstancedMesh(geo, c.mats.giant, 7)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 7; i++) {
    const angle = i * TAU / 7
    const distance = 1.35 + (i % 3) * 0.12
    dummy.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.7, i % 2 ? 0.16 : -0.1)
    dummy.rotation.set(i * 1.7, i * 0.9, i * 0.6)
    dummy.scale.setScalar(0.08 + (i % 4) * 0.023)
    dummy.updateMatrix()
    pieces.setMatrixAt(i, dummy.matrix)
  }
  orbit.add(pieces)
  root.add(orbit)
  return orbit
}

export function createMeteorModel(variant, radius, lowGfx = false, base) {
  if (!base?.geo || !base?.mat) throw new Error('Meteor model requires the original OBJ geometry and material')
  const kind = variants.has(variant) ? variant : 'rock'
  const c = resources(base)
  const root = new THREE.Group()
  root.scale.setScalar(radius)
  root.add(new THREE.Mesh(base.geo, c.mats[kind]))
  if (kind === 'crystal') addCrystals(root, c, base.geo, lowGfx)
  const orbit = kind === 'giant' && !lowGfx ? addDebris(root, c, base.geo) : null
  root.userData.urgency = 0
  root.userData.update = (dt) => {
    if (orbit) orbit.rotation.z += dt * 0.22
  }
  root.userData.dispose = () => {} // Shared resources belong to the ThreeLayer, not an instance.
  return root
}

export function updateMeteorMaterials(base, now) {
  if (!base?.geo) return
  const c = caches.get(base.geo)
  if (!c) return
  const t = now * 0.001
  c.mats.lava.emissiveIntensity = 0.42 + 0.17 * Math.sin(t * 2.4)
  c.mats.giant.emissiveIntensity = 0.4 + 0.13 * Math.sin(t * 1.4)
  c.mats.explosive.emissiveIntensity = 0.55 + 0.26 * Math.sin(t * 8)
}

export function disposeMeteorModels(base) {
  if (!base?.geo) return
  const c = caches.get(base.geo)
  if (!c) return
  for (const [kind, mat] of Object.entries(c.mats)) if (kind !== 'rock') mat.dispose()
  c.crystalGeo.dispose()
  c.cyan.dispose()
  c.magenta.dispose()
  caches.delete(base.geo)
}
