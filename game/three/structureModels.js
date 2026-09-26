import * as THREE from 'three'

export const DECORS = ['fast', 'triple', 'wide', 'heavy', 'pods', 'plasma', 'long', 'pierce']

// All dimensions are world pixels. The tilted inner group exposes the side walls to a -Z camera.
export function createStructureModel({ role, sides, size, color, isCore }) {
  const root = new THREE.Group()
  const model = new THREE.Group()
  model.rotation.x = -0.45
  root.add(model)
  const r = Math.max(1, size || 10)
  const count = Math.max(3, Math.round(sides || 6))
  const kind = isCore ? 'core' : role
  let tint = new THREE.Color(color ?? 0x6cc8ff)
  let powered = true
  let building = 1
  let upgradeAge = 1
  let decorGroup = null
  let decorAge = 1
  let plasma = null
  const tintMaterials = new Set()
  const lineMaterials = new Set()
  const geometries = new Set()
  const materials = new Set()

  function ownGeometry(g) { geometries.add(g); return g }
  function ownMaterial(m) { materials.add(m); return m }
  function bodyMaterial(hex = tint, bright = 0.55) {
    const m = ownMaterial(new THREE.MeshStandardMaterial({
      color: 0x1b2438, emissive: hex, emissiveIntensity: powered ? bright : 0.025,
      metalness: 0.45, roughness: 0.42, flatShading: true, side: THREE.DoubleSide,
    }))
    m.userData.litIntensity = bright
    tintMaterials.add(m)
    return m
  }
  function edgeMaterial(hex = tint) {
    const m = ownMaterial(new THREE.LineBasicMaterial({ color: hex, transparent: true,
      opacity: powered ? 0.95 : 0.12, side: THREE.DoubleSide }))
    lineMaterials.add(m)
    return m
  }
  function add(parent, geometry, hex = tint, bright = 0.55, edges = true) {
    const g = ownGeometry(geometry)
    const mesh = new THREE.Mesh(g, bodyMaterial(hex, bright))
    if (edges) {
      const outline = new THREE.LineSegments(ownGeometry(new THREE.EdgesGeometry(g, 25)), edgeMaterial(hex))
      mesh.add(outline)
    }
    parent.add(mesh)
    return mesh
  }
  function prism(parent, radius, height, z, n = count, hex = tint) {
    const mesh = add(parent, new THREE.CylinderGeometry(radius, radius, height, n), hex)
    mesh.rotation.x = Math.PI / 2
    mesh.position.z = z
    return mesh
  }
  function box(parent, x, y, z, sx, sy, sz, hex = tint) {
    const mesh = add(parent, new THREE.BoxGeometry(sx, sy, sz), hex)
    mesh.position.set(x, y, z)
    return mesh
  }
  function ring(parent, radius, tube, z, hex = tint) {
    const mesh = add(parent, new THREE.TorusGeometry(radius, tube, 3, 10), hex, 0.8, false)
    mesh.position.z = z
    return mesh
  }
  function orb(parent, radius, x, y, z, hex = tint) {
    const mesh = add(parent, new THREE.OctahedronGeometry(radius), hex, 0.9)
    mesh.position.set(x, y, z)
    return mesh
  }
  function barrel(parent, length, width, x, y, z, hex = tint) {
    const mesh = box(parent, x + length / 2, y, z, length, width, width, hex)
    box(parent, x + length, y, z, width * 0.55, width * 1.3, width * 1.3, hex)
    return mesh
  }
  function disposeBranch(branch) {
    if (!branch) return
    branch.parent?.remove(branch)
    branch.traverse((o) => {
      if (o.geometry) { o.geometry.dispose(); geometries.delete(o.geometry) }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) {
        m.dispose(); materials.delete(m); tintMaterials.delete(m); lineMaterials.delete(m)
      }
    })
  }

  // Low polygon chassis, raised in +Z so its visible wall carries the silhouette.
  const baseHeight = r * (kind === 'core' ? 0.42 : kind === 'railgun' ? 0.3 : 0.55)
  const baseSides = kind === 'turret' ? 3 : kind === 'cryo' ? 8
    : kind === 'flak' || kind === 'core' || kind === 'missile' ? 6 : kind === 'tesla' ? 4 : count
  prism(model, r, baseHeight, baseHeight / 2, baseSides)
  prism(model, r * 0.72, r * 0.18, baseHeight + r * 0.09, baseSides)
  const top = baseHeight + r * 0.18
  let head = null
  let spinner = null
  let coreCrystal = null
  let healerOrbs = []
  let chargeBars = []
  let teslaArcs = null
  let lastSpark = -Infinity
  let cryoMist = null
  let railCoils = []
  let shieldCrystal = null
  let shieldDome = null

  if (kind === 'core') {
    prism(model, r * 0.43, r * 0.7, top + r * 0.35, 6)
    coreCrystal = orb(model, r * 0.3, 0, 0, top + r * 0.95)
    spinner = ring(model, r * 0.72, r * 0.035, top + r * 0.75)
    spinner.rotation.x = 0.34
  } else if (kind === 'relay') {
    prism(model, r * 0.25, r * 0.85, top + r * 0.42, 4)
    orb(model, r * 0.22, 0, 0, top + r * 0.95)
    spinner = ring(model, r * 0.55, r * 0.045, top + r * 0.8)
    spinner.rotation.x = 0.25
  } else if (kind === 'collector') {
    prism(model, r * 0.43, r * 0.45, top + r * 0.23, 5)
    spinner = new THREE.Group()
    spinner.position.z = top + r * 0.55
    model.add(spinner)
    box(spinner, r * 0.33, 0, 0, r * 0.95, r * 0.16, r * 0.17)
    const bit = add(spinner, new THREE.ConeGeometry(r * 0.17, r * 0.42, 5), tint)
    bit.rotation.z = -Math.PI / 2
    bit.position.x = r * 0.94
  } else if (kind === 'battery') {
    for (const x of [-0.42, 0, 0.42]) {
      const bar = box(model, x * r, 0, top + r * 0.35, r * 0.22, r * 0.48, r * 0.65)
      chargeBars.push(bar)
    }
    ring(model, r * 0.7, r * 0.035, top + r * 0.7)
  } else if (kind === 'healer') {
    orb(model, r * 0.35, 0, 0, top + r * 0.4)
    healerOrbs = Array.from({ length: 4 }, () => orb(model, r * 0.14, 0, 0, top + r * 0.55))
  } else if (kind === 'turret' || kind === 'missile') {
    head = new THREE.Group()
    head.position.z = top + r * 0.22
    model.add(head)
    prism(head, r * 0.38, r * 0.4, 0, kind === 'turret' ? 3 : 6)
    if (kind === 'turret') {
      barrel(head, r * 1.05, r * 0.17, r * 0.2, 0, r * 0.1)
      orb(head, r * 0.18, 0, 0, r * 0.28)
    } else {
      for (const y of [-r * 0.22, r * 0.22]) {
        box(head, r * 0.38, y, r * 0.12, r * 0.82, r * 0.3, r * 0.32)
        const nose = add(head, new THREE.ConeGeometry(r * 0.15, r * 0.36, 5), tint)
        nose.rotation.z = -Math.PI / 2
        nose.position.set(r * 0.95, y, r * 0.12)
      }
    }
  } else if (kind === 'tesla') {
    prism(model, r * 0.23, r * 1.25, top + r * 0.62, 4)
    for (const z of [0.35, 0.68, 1.01]) ring(model, r * 0.46, r * 0.075, top + r * z)
    const tip = add(model, new THREE.IcosahedronGeometry(r * 0.23, 1), tint, 1)
    tip.position.z = top + r * 1.42
    const positions = new Float32Array(4 * 4 * 2 * 3)
    const sparks = ownGeometry(new THREE.BufferGeometry())
    sparks.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    teslaArcs = new THREE.LineSegments(sparks, edgeMaterial())
    model.add(teslaArcs)
  } else if (kind === 'cryo') {
    prism(model, r * 0.44, r * 0.9, top + r * 0.45, 10)
    for (const z of [0.15, 0.45, 0.75]) ring(model, r * 0.45, r * 0.045, top + r * z)
    head = new THREE.Group()
    head.position.z = top + r * 0.8
    model.add(head)
    box(head, r * 0.25, 0, 0, r * 0.52, r * 0.4, r * 0.4)
    const emitter = add(head, new THREE.OctahedronGeometry(r * 0.25), tint, 1)
    emitter.scale.x = 2.3
    emitter.position.x = r * 0.72
    cryoMist = new THREE.Mesh(ownGeometry(new THREE.SphereGeometry(r * 0.38, 8, 5)),
      ownMaterial(new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.2, depthWrite: false })))
    cryoMist.position.x = r * 1.05
    head.add(cryoMist)
  } else if (kind === 'railgun') {
    head = new THREE.Group()
    head.position.z = top + r * 0.24
    model.add(head)
    prism(head, r * 0.38, r * 0.35, 0, 6)
    for (const y of [-r * 0.21, r * 0.21]) {
      box(head, r * 0.72, y, r * 0.12, r * 1.5, r * 0.12, r * 0.17)
      for (let i = 0; i < 5; i++) {
        const coil = box(head, r * (0.24 + i * 0.29), y, r * 0.12, r * 0.075, r * 0.22, r * 0.27)
        railCoils.push(coil)
      }
    }
    box(head, r * 0.34, 0, r * 0.12, r * 0.3, r * 0.5, r * 0.15)
  } else if (kind === 'flak') {
    prism(model, r * 0.8, r * 0.38, top + r * 0.19, 6)
    head = new THREE.Group()
    head.position.z = top + r * 0.4
    model.add(head)
    prism(head, r * 0.43, r * 0.36, 0, 6)
    for (const y of [-r * 0.2, r * 0.2]) {
      for (const z of [-r * 0.1, r * 0.19]) barrel(head, r * 0.72, r * 0.15, r * 0.18, y, z)
    }
  } else if (kind === 'mortar') {
    prism(model, r * 0.8, r * 0.3, top + r * 0.15, 8)
    head = new THREE.Group()
    head.position.z = top + r * 0.3
    model.add(head)
    const tube = new THREE.Group()
    tube.rotation.y = 0.42
    head.add(tube)
    prism(tube, r * 0.34, r * 1.15, r * 0.62, 10)
    ring(tube, r * 0.38, r * 0.065, r * 1.2)
    prism(tube, r * 0.23, r * 0.025, r * 1.22, 10, 0x101b30)
    for (const y of [-r * 0.48, r * 0.48]) box(head, 0, y, r * 0.2, r * 0.3, r * 0.16, r * 0.42)
  } else if (kind === 'shield') {
    prism(model, r * 0.26, r * 0.86, top + r * 0.43, 6)
    shieldCrystal = orb(model, r * 0.31, 0, 0, top + r * 1.08)
    shieldDome = new THREE.Mesh(ownGeometry(new THREE.SphereGeometry(r * 1.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
      ownMaterial(new THREE.MeshBasicMaterial({ color: tint, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })))
    shieldDome.rotation.x = Math.PI / 2
    shieldDome.position.z = top + r * 0.2
    model.add(shieldDome)
  }

  const progress = new THREE.Mesh(
    ownGeometry(new THREE.RingGeometry(r * 1.12, r * 1.2, 24)),
    ownMaterial(new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.8,
      side: THREE.DoubleSide, depthWrite: false })),
  )
  progress.position.z = r * 0.03
  progress.visible = false
  root.add(progress)
  const flash = new THREE.Mesh(
    ownGeometry(new THREE.RingGeometry(r * 0.8, r * 0.92, 24)),
    ownMaterial(new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false })),
  )
  flash.position.z = top + r * 0.65
  flash.visible = false
  root.add(flash)

  function setColor(hex) {
    tint = new THREE.Color(hex)
    for (const m of tintMaterials) m.emissive.copy(tint)
    for (const m of lineMaterials) m.color.copy(tint)
    if (cryoMist) cryoMist.material.color.copy(tint)
    if (shieldDome) shieldDome.material.color.copy(tint)
    progress.material.color.copy(tint)
  }
  function setPowered(value) {
    powered = !!value
    for (const m of tintMaterials) m.emissiveIntensity = powered ? m.userData.litIntensity : 0.025
    for (const m of lineMaterials) m.opacity = powered ? 0.95 : 0.12
    if (cryoMist) cryoMist.material.opacity = powered ? 0.2 : 0.035
    if (shieldDome) shieldDome.material.opacity = powered ? 0.3 : 0.035
  }
  function setBuilding(frac) {
    building = THREE.MathUtils.clamp(Number.isFinite(frac) ? frac : 0, 0, 1)
    model.scale.z = Math.max(0.03, building)
    progress.visible = building < 1
    // Arc conveys the actual completed fraction, including at zero.
    progress.geometry.dispose()
    geometries.delete(progress.geometry)
    progress.geometry = ownGeometry(new THREE.RingGeometry(r * 1.12, r * 1.2, 24, 1, -Math.PI / 2, Math.max(0.001, building * Math.PI * 2)))
  }
  function setAim(angleRad) {
    if (head && Number.isFinite(angleRad)) head.rotation.z = angleRad
  }
  function setDecor(decor, hex = tint) {
    disposeBranch(decorGroup)
    decorGroup = new THREE.Group()
    const host = head || model
    host.add(decorGroup)
    const c = new THREE.Color(hex)
    const z = head ? r * 0.35 : top + r * 0.8
    switch (decor) {
      case 'fast':
        for (const y of [-r * 0.2, r * 0.2]) barrel(decorGroup, r * 0.65, r * 0.12, r * 0.18, y, z, c)
        break
      case 'triple':
        for (const a of [-0.34, 0, 0.34]) {
          const arm = new THREE.Group(); arm.rotation.z = a; decorGroup.add(arm)
          barrel(arm, r * 0.85, r * 0.12, r * 0.12, 0, z, c)
        }
        break
      case 'wide':
        ring(decorGroup, r * 1.02, r * 0.045, z, c)
        ring(decorGroup, r * 0.8, r * 0.03, z + r * 0.14, c)
        break
      case 'heavy':
        barrel(decorGroup, r * 1.15, r * 0.36, r * 0.1, 0, z, c)
        for (const x of [0.48, 0.68, 0.88]) box(decorGroup, x * r, 0, z + r * 0.22, r * 0.1, r * 0.58, r * 0.09, c)
        break
      case 'pods':
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5
          const pod = prism(decorGroup, r * 0.14, r * 0.42, z + r * 0.16, 5, c)
          pod.position.x = Math.cos(a) * r * 0.82
          pod.position.y = Math.sin(a) * r * 0.82
        }
        break
      case 'plasma':
        plasma = orb(decorGroup, r * 0.42, 0, 0, z + r * 0.18, c)
        ring(decorGroup, r * 0.55, r * 0.035, z + r * 0.18, c)
        break
      case 'long':
        barrel(decorGroup, r * 1.7, r * 0.12, 0, 0, z, c)
        orb(decorGroup, r * 0.12, r * 1.65, 0, z, c)
        break
      case 'pierce': {
        const spike = add(decorGroup, new THREE.ConeGeometry(r * 0.18, r * 1.45, 4), c)
        spike.rotation.z = -Math.PI / 2
        spike.position.set(r * 0.95, 0, z)
        break
      }
      default:
        ring(decorGroup, r * 0.72, r * 0.06, z, c)
    }
    decorAge = 1
    plasma = decor === 'plasma' ? plasma : null
  }
  function pulseUpgrade(hex = tint) {
    upgradeAge = 0
    flash.material.color.set(hex)
    flash.visible = true
    if (decorGroup) decorAge = 0
  }
  function update(dtSeg, timeMs) {
    const dt = Math.max(0, Number.isFinite(dtSeg) ? dtSeg : 0)
    const t = Number.isFinite(timeMs) ? timeMs / 1000 : 0
    if (spinner) spinner.rotation.z += dt * (kind === 'collector' ? 1.9 : 0.6)
    if (coreCrystal) coreCrystal.scale.setScalar(1 + 0.1 * Math.sin(t * 2.5))
    for (let i = 0; i < healerOrbs.length; i++) {
      const a = t * 1.35 + i * Math.PI * 2 / healerOrbs.length
      healerOrbs[i].position.set(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, top + r * (0.57 + 0.1 * Math.sin(t * 3 + i)))
      healerOrbs[i].scale.setScalar(0.9 + 0.2 * Math.sin(t * 4 + i))
    }
    for (let i = 0; i < chargeBars.length; i++) {
      const h = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.2))
      chargeBars[i].scale.z = h
    }
    if (teslaArcs && timeMs - lastSpark >= 80) {
      lastSpark = timeMs
      const a = teslaArcs.geometry.attributes.position
      for (let arc = 0; arc < 4; arc++) {
        const angle = arc * Math.PI / 2 + Math.random() * 0.5
        let x = Math.cos(angle) * r * 0.12
        let y = Math.sin(angle) * r * 0.12
        let z = top + r * 1.42
        for (let step = 0; step < 4; step++) {
          const nx = Math.cos(angle) * r * (0.22 + step * 0.13) + (Math.random() - 0.5) * r * 0.18
          const ny = Math.sin(angle) * r * (0.22 + step * 0.13) + (Math.random() - 0.5) * r * 0.18
          const nz = z + (Math.random() - 0.5) * r * 0.22
          const offset = (arc * 4 + step) * 2
          a.setXYZ(offset, x, y, z)
          a.setXYZ(offset + 1, nx, ny, nz)
          x = nx; y = ny; z = nz
        }
      }
      a.needsUpdate = true
    }
    if (cryoMist) {
      cryoMist.scale.setScalar(0.9 + 0.16 * Math.sin(t * 3.2))
      cryoMist.material.opacity = (powered ? 0.2 : 0.035) * (0.8 + 0.2 * Math.sin(t * 3.2))
    }
    for (let i = 0; i < railCoils.length; i++) {
      railCoils[i].material.emissiveIntensity = powered ? (Math.floor(t * 9) % 5 === i % 5 ? 1.8 : 0.2) : 0.025
    }
    if (shieldCrystal) {
      shieldCrystal.rotation.z += dt * 0.9
      shieldCrystal.position.z = top + r * (1.08 + 0.08 * Math.sin(t * 2))
    }
    if (shieldDome) {
      shieldDome.scale.setScalar(1 + 0.04 * Math.sin(t * 2.1))
      shieldDome.material.opacity = (powered ? 0.3 : 0.035) * (0.85 + 0.15 * Math.sin(t * 2.1))
    }
    if (plasma) plasma.scale.setScalar(1 + 0.13 * Math.sin(t * 4))
    if (decorGroup && decorAge < 1) {
      decorAge = Math.min(1, decorAge + dt / 0.55)
      const x = decorAge
      decorGroup.scale.setScalar(1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2))
    }
    if (upgradeAge < 0.8) {
      upgradeAge = Math.min(0.8, upgradeAge + dt)
      const p = upgradeAge / 0.8
      flash.visible = p < 1
      flash.scale.setScalar(1 + p * 1.6)
      flash.material.opacity = (1 - p) * 0.9
    }
  }
  function dispose() {
    root.parent?.remove(root)
    for (const g of geometries) g.dispose()
    for (const m of materials) m.dispose()
    geometries.clear(); materials.clear(); tintMaterials.clear(); lineMaterials.clear()
  }
  root.userData = { setColor, setDecor, setPowered, setBuilding, setAim, pulseUpgrade, update, dispose }
  return root
}
