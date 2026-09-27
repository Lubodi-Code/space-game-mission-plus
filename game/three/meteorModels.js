import * as THREE from 'three'

// Cada calidad conserva un juego de recursos. Se libera al desaparecer su última instancia.
const caches = new Map()
const TAU = Math.PI * 2

function noise(x, y, z) {
  return Math.sin(x * 12.7 + y * 23.1 + z * 8.3) *
    Math.sin(x * 29.3 - y * 9.7 + z * 17.1)
}

function surfaceHeight(x, y, z, seed, craters = false) {
  let h = 1 + 0.085 * noise(x + seed, y, z) + 0.045 * noise(x * 2, y * 2 + seed, z * 2)
  if (craters) {
    const c1 = Math.max(0, x * 0.34 + y * -0.22 + z * 0.91 - 0.90)
    const c2 = Math.max(0, x * -0.72 + y * 0.25 + z * 0.65 - 0.91)
    const c3 = Math.max(0, x * 0.55 + y * 0.72 + z * 0.40 - 0.92)
    h -= 1.1 * (c1 + c2 + c3)
  }
  return h
}

function surface(detail, seed, craters = false) {
  const geo = new THREE.IcosahedronGeometry(1, detail)
  const p = geo.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const length = Math.hypot(x, y, z)
    x /= length; y /= length; z /= length
    const h = surfaceHeight(x, y, z, seed, craters)
    p.setXYZ(i, x * h, y * h, z * h)
  }
  p.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

function cracks(count, angleOffset, surfaceSeed) {
  const points = []
  const onSurface = (x, y) => {
    const z = Math.sqrt(1 - x * x - y * y)
    const h = surfaceHeight(x, y, z, surfaceSeed) + 0.025
    return [x * h, y * h, z * h]
  }
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + angleOffset
    const reach = 0.29 + (i % 3) * 0.1
    let px = Math.cos(angle) * 0.12, py = Math.sin(angle) * 0.12
    for (let j = 1; j <= 3; j++) {
      const r = reach * j / 3
      const a = angle + Math.sin(i * 4.7 + j * 2.3) * 0.17
      const x = Math.cos(a) * r, y = Math.sin(a) * r
      points.push(...onSurface(px, py), ...onSurface(x, y))
      px = x; py = y
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return geo
}

function resources(variant, lowGfx) {
  const key = `${variant}:${lowGfx ? 1 : 0}`
  let c = caches.get(key)
  if (c) return c
  const detail = lowGfx ? 1 : (variant === 'giant' ? 3 : 2)
  const colors = {
    rock: [0x91857b, 0xa09284, 0x81796f],
    iron: [0x77838c, 0x89959c, 0x6c7b85],
    ice: [0xa4dfeb, 0xb6e8ef, 0x8bcddd],
    crystal: [0x718493, 0x827e99, 0x667f92],
    lava: [0x574c4a, 0x685650, 0x4d5159],
    giant: [0x766458, 0x897260, 0x695b54],
    explosive: [0x72535c, 0x805b5c, 0x67515e],
  }[variant]
  const metallic = variant === 'iron'
  const icy = variant === 'ice'
  const materials = colors.map(color => new THREE.MeshStandardMaterial({
    color, flatShading: true, metalness: metallic ? 0.35 : icy ? 0.05 : 0.04,
    roughness: metallic ? 0.53 : icy ? 0.48 : 0.9,
  }))
  const surfaceSeed = colors[0] * 0.00001
  c = { key, refs: 0, geometries: [surface(detail, surfaceSeed, variant === 'rock')], materials, extras: {} }
  const extra = (name, geo, mat) => {
    c.extras[name] = { geo, mat }
    c.geometries.push(geo)
    c.materials.push(mat)
  }
  if (variant === 'iron') {
    extra('veins', cracks(lowGfx ? 4 : 7, 0.5, surfaceSeed), new THREE.LineBasicMaterial({ color: 0xb9c7cc, transparent: true, opacity: 0.58, depthTest: false, depthWrite: false }))
  }
  if (variant === 'lava' || variant === 'giant' || variant === 'explosive') {
    const color = variant === 'lava' ? 0xff6a16 : variant === 'giant' ? 0xffba55 : 0xff3540
    extra('fissures', cracks(lowGfx ? 4 : variant === 'giant' ? 10 : 6, 1.3, surfaceSeed),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: variant === 'lava' ? 0.78 : 0.82,
        depthTest: false, depthWrite: false }))
    if (variant !== 'lava') extra('core', new THREE.IcosahedronGeometry(1, lowGfx ? 0 : 1),
      new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, depthWrite: false }))
  }
  if (variant === 'crystal') {
    extra('crystals', new THREE.ConeGeometry(0.13, 0.55, lowGfx ? 3 : 5),
      new THREE.MeshStandardMaterial({ color: 0x81eaff, emissive: 0x38cfff, emissiveIntensity: 0.95,
        metalness: 0.05, roughness: 0.38, flatShading: true }))
    const magenta = new THREE.MeshStandardMaterial({ color: 0xf2a0e9, emissive: 0xe04acb,
      emissiveIntensity: 0.95, metalness: 0.05, roughness: 0.38, flatShading: true })
    c.extras.crystals.magenta = magenta
    c.materials.push(magenta)
  }
  if (variant === 'ice' && !lowGfx) {
    extra('halo', new THREE.IcosahedronGeometry(1.15, 1),
      new THREE.MeshBasicMaterial({ color: 0x72cfff, transparent: true, opacity: 0.08,
        side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }))
  }
  if (variant === 'giant') {
    extra('layer', new THREE.IcosahedronGeometry(1, lowGfx ? 0 : 1),
      new THREE.MeshStandardMaterial({ color: 0xa18a75, roughness: 0.9, flatShading: true }))
    if (!lowGfx) extra('debris', new THREE.IcosahedronGeometry(0.085, 0),
      new THREE.MeshStandardMaterial({ color: 0xb19880, roughness: 0.9, flatShading: true }))
  }
  caches.set(key, c)
  return c
}

export function createMeteorModel(variant, radius, lowGfx = false) {
  const kind = ['rock', 'iron', 'ice', 'crystal', 'lava', 'giant', 'explosive'].includes(variant) ? variant : 'rock'
  const c = resources(kind, lowGfx)
  c.refs++
  const root = new THREE.Group()
  root.scale.setScalar(radius)
  const body = new THREE.Mesh(c.geometries[0], c.materials[Math.floor(Math.random() * 3)])
  root.add(body)
  let pulse = null, orbit = null, fissures = null
  const add = name => {
    const e = c.extras[name]
    const mesh = new THREE.Mesh(e.geo, e.mat)
    root.add(mesh)
    return mesh
  }
  if (c.extras.veins) {
    const e = c.extras.veins
    const veins = new THREE.LineSegments(e.geo, e.mat)
    veins.renderOrder = 1
    root.add(veins)
  }
  if (c.extras.fissures) {
    const e = c.extras.fissures
    fissures = new THREE.LineSegments(e.geo, e.mat)
    fissures.renderOrder = 1
    root.add(fissures)
    if (c.extras.core) {
      pulse = add('core')
      pulse.position.set(0.1, -0.08, 1.02)
      pulse.scale.setScalar(kind === 'giant' ? 0.17 : 0.11)
    }
  }
  if (c.extras.crystals) {
    const e = c.extras.crystals
    const count = lowGfx ? 4 : 9
    const cyanCount = count - Math.ceil(count / 3)
    const cyan = new THREE.InstancedMesh(e.geo, e.mat, cyanCount)
    const magenta = new THREE.InstancedMesh(e.geo, e.magenta, count - cyanCount)
    const dummy = new THREE.Object3D()
    const normal = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    let ci = 0, mi = 0
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996, r = 0.35 + (i % 3) * 0.18
      normal.set(Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(1 - r * r)).normalize()
      dummy.position.copy(normal).multiplyScalar(1.12)
      dummy.quaternion.setFromUnitVectors(up, normal)
      dummy.scale.setScalar(0.7 + (i % 3) * 0.28)
      dummy.updateMatrix()
      if (i % 3 === 0) magenta.setMatrixAt(mi++, dummy.matrix)
      else cyan.setMatrixAt(ci++, dummy.matrix)
    }
    root.add(cyan, magenta)
  }
  if (c.extras.halo) add('halo')
  if (c.extras.layer) {
    const layer = add('layer')
    layer.scale.set(1.17, 0.19, 1.16)
    layer.rotation.z = 0.4
  }
  if (c.extras.debris) {
    orbit = new THREE.Group()
    const e = c.extras.debris
    const debris = new THREE.InstancedMesh(e.geo, e.mat, 8)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, r = 1.38 + (i % 3) * 0.13
      dummy.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.72, (i % 2 ? 0.16 : -0.1))
      dummy.scale.setScalar(0.65 + (i % 3) * 0.2)
      dummy.updateMatrix()
      debris.setMatrixAt(i, dummy.matrix)
    }
    orbit.add(debris)
    root.add(orbit)
  }
  root.userData.urgency = 0
  root.userData.update = (dt, now) => {
    if (orbit) orbit.rotation.z += dt * 0.22
    if (fissures) {
      const speed = kind === 'explosive' ? 5 + 9 * root.userData.urgency : kind === 'lava' ? 2.4 : 1.4
      const beat = Math.sin(now * 0.001 * speed)
      if (pulse) pulse.scale.setScalar((kind === 'giant' ? 0.17 : 0.11) * (0.9 + 0.25 * beat))
      fissures.scale.setScalar(1 + 0.008 * beat)
    }
  }
  let disposed = false
  root.userData.dispose = () => {
    if (disposed) return
    disposed = true
    if (--c.refs === 0) {
      c.geometries.forEach(g => g.dispose())
      c.materials.forEach(m => m.dispose())
      caches.delete(c.key)
    }
  }
  return root
}
