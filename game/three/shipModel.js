import * as THREE from 'three'

// Nave del comandante en 3D low-poly retro. Única fuente del diseño: la usan el juego
// (ThreeLayer, vista cenital) y la tienda (ShopPreview, vitrina). La silueta calca
// public/assets/ships/ship_general.svg (viewBox -28..28): nariz hacia +X, alas en flecha.
// Unidades = unidades del SVG; el llamador escala.

const FUSELAGE = [[26, 0], [6, -7], [-15, -4], [-11, 0], [-15, 4], [6, 7]]
const WING_L = [[7, -5], [-3, -21], [-17, -15], [-8, -4]]
const WING_R = WING_L.map(([x, y]) => [x, -y])

function shapeOf(pts) {
  const s = new THREE.Shape()
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  s.closePath()
  return s
}

function extrude(pts, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1,
  })
  g.translate(0, 0, -depth / 2) // centrado en Z
  return g
}

// tint: color del casco (cosmético hull). Devuelve un Group con userData.setTint(c) y
// userData.engine (para pulsar el motor).
function createFalconShip(tint = 0xffaa44) {
  const root = new THREE.Group()
  // DoubleSide: la cámara ortográfica del juego invierte Y (espejo) y culearía las caras.
  const body = new THREE.MeshStandardMaterial({
    color: 0x1a2136, emissive: tint, emissiveIntensity: 0.18,
    metalness: 0.45, roughness: 0.45, flatShading: true, side: THREE.DoubleSide,
  })
  const wingMat = body.clone()
  wingMat.color.setHex(0x232c46)
  const edge = new THREE.LineBasicMaterial({ color: tint })

  const add = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat)
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), edge))
    root.add(m)
    return m
  }
  add(extrude(FUSELAGE, 6, 1.2), body)
  const wl = add(extrude(WING_L, 1.6, 0.4), wingMat)
  const wr = add(extrude(WING_R, 1.6, 0.4), wingMat)
  wl.rotation.x = 0.12; wr.rotation.x = -0.12 // leve diedro: se lee 3D al girar

  // Cabina (octaedro claro) y motor (esfera emisiva).
  const cockpit = new THREE.Mesh(new THREE.OctahedronGeometry(3.2), new THREE.MeshStandardMaterial({
    color: 0xcfeeff, emissive: 0x8be9fd, emissiveIntensity: 0.5, flatShading: true, side: THREE.DoubleSide,
  }))
  cockpit.position.set(9, 0, 3.2)
  cockpit.scale.set(1.4, 0.8, 0.6)
  root.add(cockpit)
  const engine = new THREE.Mesh(new THREE.SphereGeometry(2.8, 10, 8), new THREE.MeshBasicMaterial({ color: tint }))
  engine.position.set(-14, 0, 0)
  root.add(engine)

  root.userData = {
    engine,
    setTint(c) {
      body.emissive.setHex(c); wingMat.emissive.setHex(c); edge.color.setHex(c); engine.material.color.setHex(c)
    },
    dispose() {
      root.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.() })
    },
  }
  return root
}

export const SHIP_DESIGNS = [
  { id: 'falcon', name: 'Falcon' },
  { id: 'interceptor', name: 'Interceptor' },
  { id: 'bulwark', name: 'Bulwark' },
  { id: 'manta', name: 'Manta' },
  { id: 'wasp', name: 'Wasp' },
  { id: 'phantom', name: 'Phantom' },
  { id: 'twin', name: 'Twin' },
  { id: 'crown', name: 'Crown' },
]

// Polygons are deliberately simple: a closed n-point plate costs 4n-4 triangles.
// All coordinates share the falcon's XY plane, scale and +X heading.
const VARIANTS = {
  interceptor: {
    plates: [
      [0, [[-25, -2], [4, -3], [29, 0], [4, 3], [-25, 2]], 2.8],
      [1, [[10, -2], [-9, -21], [-24, -19], [-14, -4]], 0.9],
      [1, [[10, 2], [-14, 4], [-24, 19], [-9, 21]], 0.9],
      [2, [[-16, -2], [-25, -9], [-22, -2]], 1.3],
      [2, [[-16, 2], [-22, 2], [-25, 9]], 1.3],
    ], cockpit: [8, 0, 2.2], engine: [-25, 0, 0], engineScale: [2.5, 1.5, 1.5],
  },
  bulwark: {
    plates: [
      [0, [[-27, -8], [-20, -11], [12, -10], [27, -4], [27, 4], [12, 10], [-20, 11], [-27, 8]], 5],
      [1, [[-25, -9], [4, -10], [13, -18], [-20, -19], [-29, -14]], 2.2],
      [1, [[-25, 9], [-29, 14], [-20, 19], [13, 18], [4, 10]], 2.2],
      [2, [[-16, -7], [8, -7], [19, -3], [-18, -3]], 1.2, 3.4],
      [2, [[-16, 7], [-18, 3], [19, 3], [8, 7]], 1.2, 3.4],
      [2, [[-26, -14], [-13, -14], [-13, -11], [-26, -11]], 2, 2],
      [2, [[-26, 14], [-26, 11], [-13, 11], [-13, 14]], 2, 2],
    ], cockpit: [11, 0, 4], engine: [-27, 0, 0], engineScale: [2, 3, 2],
  },
  manta: {
    plates: [
      [0, [[-25, 0], [-19, -5], [-4, -9], [16, -6], [28, 0], [16, 6], [-4, 9], [-19, 5]], 2.4],
      [1, [[18, -5], [5, -12], [-13, -23], [-23, -24], [-19, -15], [-7, -7]], 1.1],
      [1, [[18, 5], [-7, 7], [-19, 15], [-23, 24], [-13, 23], [5, 12]], 1.1],
      [2, [[-19, -16], [-27, -22], [-23, -12]], 1.1],
      [2, [[-19, 16], [-23, 12], [-27, 22]], 1.1],
    ], cockpit: [9, 0, 2.2], engine: [-24, 0, 0], engineScale: [2, 2.5, 1.4],
  },
  wasp: {
    plates: [
      [0, [[-26, -3], [-17, -5], [-10, -3], [-4, -5], [4, -3], [10, -4], [28, 0], [10, 4], [4, 3], [-4, 5], [-10, 3], [-17, 5], [-26, 3]], 3.1],
      [1, [[8, -3], [-1, -16], [-13, -19], [-9, -5]], 0.9],
      [1, [[8, 3], [-9, 5], [-13, 19], [-1, 16]], 0.9],
      [1, [[-13, -4], [-21, -13], [-27, -12], [-23, -3]], 0.9],
      [1, [[-13, 4], [-23, 3], [-27, 12], [-21, 13]], 0.9],
      [2, [[-11, -4], [-8, -5], [-5, -4], [-8, -3]], 1.2, 2.3],
      [2, [[-11, 4], [-8, 3], [-5, 4], [-8, 5]], 1.2, 2.3],
    ], cockpit: [13, 0, 2.5], engine: [-26, 0, 0], engineScale: [2, 1.8, 1.8],
  },
  phantom: {
    plates: [
      [0, [[-27, -3], [-16, -7], [-5, -5], [18, -3], [29, 0], [18, 3], [-5, 5], [-16, 7], [-27, 3]], 2.4],
      [1, [[17, -3], [-8, -21], [-23, -20], [-16, -7], [-5, -5]], 1],
      [1, [[17, 3], [-5, 5], [-16, 7], [-23, 20], [-8, 21]], 1],
      [2, [[4, 0], [-8, -12], [-17, -8], [-7, 0]], 0.8, 1.8],
      [2, [[4, 0], [-7, 0], [-17, 8], [-8, 12]], 0.8, 1.8],
      [2, [[-18, -6], [-27, -12], [-25, -4]], 1.4],
      [2, [[-18, 6], [-25, 4], [-27, 12]], 1.4],
    ], cockpit: [8, 0, 2.1], engine: [-27, 0, 0], engineScale: [2, 2.2, 1.3],
  },
  twin: {
    plates: [
      [0, [[-23, -11], [8, -11], [28, -8], [8, -5], [-23, -6]], 3],
      [0, [[-23, 6], [8, 5], [28, 8], [8, 11], [-23, 11]], 3],
      [1, [[-12, -7], [6, -7], [6, 7], [-12, 7]], 1.5],
      [1, [[-15, -10], [-24, -20], [-19, -10]], 1.2],
      [1, [[-15, 10], [-19, 10], [-24, 20]], 1.2],
      [2, [[4, -6], [14, -6], [14, 6], [4, 6]], 1.1, 2],
    ], cockpit: [14, 0, 2.1], engine: [-23, -8.5, 0], engineScale: [2.5, 1.5, 1.5],
    extraEngine: [-23, 8.5, 0],
  },
  crown: {
    plates: [
      [0, [[-27, -5], [-11, -8], [11, -6], [29, 0], [11, 6], [-11, 8], [-27, 5]], 4],
      [1, [[9, -6], [-6, -16], [-21, -14], [-13, -7]], 1.5],
      [1, [[9, 6], [-13, 7], [-21, 14], [-6, 16]], 1.5],
      [2, [[-20, -5], [-27, -12], [-25, -4]], 1.4],
      [2, [[-20, 5], [-25, 4], [-27, 12]], 1.4],
    ], cockpit: [11, 0, 3.1], engine: [-27, 0, 0], engineScale: [2.2, 2.6, 1.7],
    ring: true,
  },
}

function createVariantShip(tint, design) {
  const spec = VARIANTS[design]
  const root = new THREE.Group()
  const body = new THREE.MeshStandardMaterial({
    color: 0x1a2136, emissive: tint, emissiveIntensity: 0.18,
    metalness: 0.45, roughness: 0.45, flatShading: true, side: THREE.DoubleSide,
  })
  const wing = body.clone(); wing.color.setHex(0x232c46)
  const armor = body.clone(); armor.color.setHex(0x35405e)
  const edge = new THREE.LineBasicMaterial({ color: tint })
  const materials = [body, wing, armor]
  const add = (geometry, material) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), edge))
    root.add(mesh)
    return mesh
  }

  for (const [material, points, depth, z = 0] of spec.plates) {
    const geometry = new THREE.ExtrudeGeometry(shapeOf(points), {
      depth, bevelEnabled: false, curveSegments: 1,
    })
    geometry.translate(0, 0, -depth / 2 + z)
    add(geometry, materials[material])
  }
  if (spec.ring) {
    const ring = add(new THREE.RingGeometry(13, 15, 12), armor)
    ring.position.set(-2, 0, 2.8)
  }

  const cockpit = new THREE.Mesh(new THREE.OctahedronGeometry(3), new THREE.MeshStandardMaterial({
    color: 0xcfeeff, emissive: 0x8be9fd, emissiveIntensity: 0.5,
    flatShading: true, side: THREE.DoubleSide,
  }))
  cockpit.position.set(...spec.cockpit)
  cockpit.scale.set(1.4, 0.8, 0.6)
  root.add(cockpit)

  const engineMaterial = new THREE.MeshBasicMaterial({ color: tint, side: THREE.DoubleSide })
  const engine = new THREE.Mesh(new THREE.OctahedronGeometry(2.4), engineMaterial)
  engine.position.set(...spec.engine)
  engine.scale.set(...spec.engineScale)
  root.add(engine)
  if (spec.extraEngine) {
    const second = new THREE.Mesh(engine.geometry.clone(), engineMaterial)
    second.position.set(...spec.extraEngine)
    second.scale.copy(engine.scale)
    root.add(second)
  }

  root.userData = {
    engine,
    setTint(c) {
      for (const material of materials) material.emissive.setHex(c)
      edge.color.setHex(c)
      engineMaterial.color.setHex(c)
    },
    dispose() {
      root.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.() })
    },
  }
  return root
}

export function createCommanderShip(tint = 0xffaa44, design = 'falcon') {
  return VARIANTS[design] ? createVariantShip(tint, design) : createFalconShip(tint)
}

// Enemigos: siluetas low-poly pequeñas, extruidas y ligeramente inclinadas para que
// conserven la lectura cenital del juego, pero ya no parezcan pegatinas planas.
// El llamador aplica la escala final según el radio real de cada enemigo.
export function createEnemyShipModel({ tint = 0x49e07a, radius = 10, type = 'grunt' } = {}) {
  const root = new THREE.Group()
  const r = Math.max(4, radius)
  const long = r * (type === 'runner' || type === 'kamikaze' ? 2.7 : type === 'mothership' || type === 'commandship' ? 2.35 : 2.2)
  const wide = r * (type === 'brute' || type === 'bomber' || type === 'warden' ? 1.35 : 0.95)
  const depth = r * (type === 'mothership' || type === 'commandship' ? 0.46 : 0.34)
  const hullPoints = type === 'brute' || type === 'bomber'
    ? [[-long * 0.52, -wide], [long * 0.2, -wide * 0.96], [long * 0.55, -wide * 0.45], [long * 0.55, wide * 0.45], [long * 0.2, wide * 0.96], [-long * 0.52, wide]]
    : type === 'runner' || type === 'kamikaze'
      ? [[-long * 0.58, -wide * 0.42], [long * 0.55, 0], [-long * 0.58, wide * 0.42], [-long * 0.2, 0]]
      : [[-long * 0.58, -wide * 0.6], [long * 0.18, -wide * 0.72], [long * 0.56, 0], [long * 0.18, wide * 0.72], [-long * 0.58, wide * 0.6], [-long * 0.32, 0]]

  const body = new THREE.MeshStandardMaterial({
    color: 0x172238, emissive: tint, emissiveIntensity: 0.22,
    metalness: 0.55, roughness: 0.4, flatShading: true, side: THREE.DoubleSide,
  })
  const armor = body.clone()
  armor.color.setHex(0x2c3a56)
  const edge = new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.95 })
  const add = (geometry, material) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 18), edge))
    root.add(mesh)
    return mesh
  }

  add(extrude(hullPoints, depth, Math.max(0.5, r * 0.06)), body)
  const wingSpan = wide * (type === 'artillery' || type === 'saboteur' ? 1.9 : 1.35)
  const wingDepth = Math.max(0.45, depth * 0.45)
  const wingL = add(extrude([[-r * 0.15, -wide * 0.45], [-r * 0.65, -wingSpan], [-long * 0.4, -wingSpan * 0.82], [-long * 0.18, -wide * 0.4]], wingDepth, 0.35), armor)
  const wingR = add(extrude([[-r * 0.15, wide * 0.45], [-long * 0.18, wide * 0.4], [-long * 0.4, wingSpan * 0.82], [-r * 0.65, wingSpan]], wingDepth, 0.35), armor)
  wingL.rotation.x = 0.12
  wingR.rotation.x = -0.12

  const cockpit = new THREE.Mesh(new THREE.OctahedronGeometry(Math.max(1.4, r * 0.22), 0), new THREE.MeshStandardMaterial({
    color: 0xbfeaff, emissive: 0x8be9fd, emissiveIntensity: 0.8,
    metalness: 0.2, roughness: 0.2, flatShading: true,
  }))
  cockpit.position.set(long * 0.25, 0, Math.max(1.5, r * 0.28))
  cockpit.scale.set(1.5, 0.72, 0.55)
  root.add(cockpit)

  const engineMaterial = new THREE.MeshBasicMaterial({ color: tint })
  const engine = new THREE.Mesh(new THREE.OctahedronGeometry(Math.max(1.4, r * 0.2), 0), engineMaterial)
  engine.position.set(-long * 0.52, 0, 0)
  engine.scale.set(type === 'mothership' || type === 'commandship' ? 1.9 : 1.25, 1, 0.8)
  root.add(engine)
  if (type === 'runner' || type === 'kamikaze' || type === 'mothership' || type === 'commandship') {
    const second = engine.clone()
    second.position.y = r * 0.35
    root.add(second)
  }

  // Inclinação base: suficiente para mostrar paredes y sombras sin convertir el juego en
  // una cámara isométrica ni desplazar las coordenadas lógicas del mapa.
  root.rotation.x = -0.24
  root.userData = {
    engine,
    setTint(c) {
      body.emissive.setHex(c)
      armor.emissive.setHex(c)
      edge.color.setHex(c)
      engineMaterial.color.setHex(c)
    },
    dispose() {
      root.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.() })
    },
  }
  return root
}
