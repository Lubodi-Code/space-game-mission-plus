import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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
  { id: 'sunrei', name: 'Sunrei' },
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
  // Sunrei: casco en punta de lanza con un abanico de alas-rayo, como un sol naciente detrás.
  sunrei: {
    plates: [
      [0, [[-22, -4], [-8, -7], [14, -5], [30, 0], [14, 5], [-8, 7], [-22, 4]], 3.6],
      [1, [[-4, -6], [-14, -24], [-19, -22], [-12, -6]], 1],
      [1, [[-4, 6], [-12, 6], [-19, 22], [-14, 24]], 1],
      [1, [[-10, -6], [-24, -17], [-27, -13], [-17, -5]], 1],
      [1, [[-10, 6], [-17, 5], [-27, 13], [-24, 17]], 1],
      [2, [[6, -5], [-2, -13], [-6, -12], [-1, -5]], 1.2, 1.6],
      [2, [[6, 5], [-1, 5], [-6, 12], [-2, 13]], 1.2, 1.6],
      [2, [[-20, -3], [-28, -6], [-28, 6], [-20, 3]], 1.6],
    ], cockpit: [13, 0, 2.6], engine: [-28, 0, 0], engineScale: [2.2, 2.4, 1.6],
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


// Naves enemigas: un diseño propio por tipo, pensado para leerse en la vista cenital. Todo se
// define en unidades de radio (r = 1; nariz hacia +X, plano XY, Z hacia la cámara) y se escala al
// final. Cada pieza lleva color por vértice (casco / placas / detalle); el brillo lo pone el emissive.
const HULL = 0x172238
const PLATE = 0x2c3a56
const DETAIL = 0x44557a
const DARK = 0x0b101c

const mir = (pts) => pts.map(([x, y]) => [x, -y])

// Normaliza cualquier pieza a no indexada con position/normal/color, para que mergeGeometries funcione.
function finish(g, hex) {
  const n = g.index ? g.toNonIndexed() : g
  if (n !== g) g.dispose()
  n.deleteAttribute('uv')
  const c = new THREE.Color(hex)
  const count = n.attributes.position.count
  const a = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return n
}

// Placa extruida sin bisel: un polígono cerrado de n puntos cuesta 4n-4 triángulos.
function poly(pts, depth, z, hex) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth, bevelEnabled: false, curveSegments: 1 })
  g.translate(0, 0, z - depth / 2)
  return finish(g, hex)
}
const rect = (x0, x1, y0, y1, depth, z, hex) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], depth, z, hex)
const ngon = (cx, cy, rx, ry, n) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]
})
// Banda de arco (herradura): borde exterior de a0 a a1 y vuelta por el interior.
function arcPts(cx, cy, ro, ri, a0, a1, n) {
  const out = []
  const inn = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([cx + Math.cos(a) * ro, cy + Math.sin(a) * ro])
    inn.push([cx + Math.cos(a) * ri, cy + Math.sin(a) * ri])
  }
  return [...out, ...inn.reverse()]
}
function ring(cx, cy, ro, ri, n, depth, z, hex) {
  const s = shapeOf(ngon(cx, cy, ro, ro, n))
  s.holes.push(new THREE.Path(ngon(cx, cy, ri, ri, n)))
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 })
  g.translate(0, 0, z - depth / 2)
  return finish(g, hex)
}
// Cilindro hexagonal tendido sobre el eje X (cañones).
function barrel(x0, x1, rad, z, hex) {
  const g = new THREE.CylinderGeometry(rad, rad, x1 - x0, 6, 1)
  g.rotateZ(-Math.PI / 2)
  g.translate((x0 + x1) / 2, 0, z)
  return finish(g, hex)
}

// Cada diseño devuelve sus piezas, la cabina [x, y, z] y los motores [x, y, escala].
const DESIGNS = {
  // Caza básico en flecha con alas barridas.
  grunt: () => ({
    parts: [
      poly([[1.1, 0], [-0.2, -0.55], [-1.0, -0.4], [-0.7, 0], [-1.0, 0.4], [-0.2, 0.55]], 0.34, 0, HULL),
      poly([[0.1, -0.4], [-0.6, -1.2], [-1.0, -1.1], [-0.8, -0.35]], 0.16, 0, PLATE),
      poly(mir([[0.1, -0.4], [-0.6, -1.2], [-1.0, -1.1], [-0.8, -0.35]]), 0.16, 0, PLATE),
    ],
    cockpit: [0.35, 0, 0.28], engines: [[-0.95, 0, 1]],
  }),
  // Dardo finísimo y largo con dos colas.
  runner: () => ({
    parts: [
      poly([[1.35, 0], [-0.3, -0.2], [-1.35, -0.35], [-1.0, 0], [-1.35, 0.35], [-0.3, 0.2]], 0.28, 0, HULL),
      poly([[-0.6, -0.2], [-1.3, -0.95], [-1.15, -0.25]], 0.14, 0, PLATE),
      poly(mir([[-0.6, -0.2], [-1.3, -0.95], [-1.15, -0.25]]), 0.14, 0, PLATE),
      rect(-0.2, 0.7, -0.07, 0.07, 0.1, 0.18, DETAIL),
    ],
    cockpit: [0.55, 0, 0.24], engines: [[-1.3, -0.3, 0.8], [-1.3, 0.3, 0.8]],
  }),
  // Misil: cuerpo romo con punta, cuatro aletas y núcleo inestable al centro.
  kamikaze: () => ({
    parts: [
      poly([[1.3, 0], [0.75, -0.34], [-0.9, -0.34], [-0.9, 0.34], [0.75, 0.34]], 0.4, 0, HULL),
      poly([[-0.2, -0.3], [-1.1, -0.95], [-0.95, -0.3]], 0.12, 0, PLATE),
      poly(mir([[-0.2, -0.3], [-1.1, -0.95], [-0.95, -0.3]]), 0.12, 0, PLATE),
      poly([[0.35, 0], [0.05, -0.28], [-0.25, 0], [0.05, 0.28]], 0.3, 0.2, DETAIL),
      rect(0.5, 0.65, -0.34, 0.34, 0.44, 0, DARK),
    ],
    cockpit: [0.9, 0, 0.26], engines: [[-0.95, 0, 1.1]],
  }),
  // Bloque blindado ancho con placas laterales y espolón.
  brute: () => ({
    parts: [
      poly([[-1.0, -0.95], [0.6, -0.95], [1.0, -0.55], [1.0, 0.55], [0.6, 0.95], [-1.0, 0.95]], 0.6, 0, HULL),
      rect(-0.8, 0.7, -1.45, -1.0, 0.36, 0, PLATE),
      rect(-0.8, 0.7, 1.0, 1.45, 0.36, 0, PLATE),
      rect(0.6, 1.15, -0.4, 0.4, 0.44, 0, DETAIL),
      rect(-0.6, 0.2, -0.5, 0.5, 0.2, 0.38, DETAIL),
    ],
    cockpit: [0.3, 0, 0.52], engines: [[-1.0, -0.5, 1.1], [-1.0, 0.5, 1.1]],
  }),
  // Ala volante ancha con bodegas de bombas.
  bomber: () => ({
    parts: [
      poly([[0.9, 0], [0.2, -1.0], [-0.5, -1.45], [-0.9, -1.3], [-0.7, -0.3], [-0.9, 0], [-0.7, 0.3], [-0.9, 1.3], [-0.5, 1.45], [0.2, 1.0]], 0.3, 0, HULL),
      rect(-0.35, 0.3, -1.05, -0.65, 0.2, 0.2, DARK),
      rect(-0.35, 0.3, 0.65, 1.05, 0.2, 0.2, DARK),
      rect(-0.75, -0.45, -0.25, 0.25, 0.4, 0.05, PLATE),
    ],
    cockpit: [0.45, 0, 0.26], engines: [[-0.85, -0.7, 0.9], [-0.85, 0.7, 0.9]],
  }),
  // Escudo en herradura que abraza el frente, con el núcleo detrás.
  warden: () => {
    const shield = arcPts(-0.1, 0, 1.25, 0.85, (-110 * Math.PI) / 180, (110 * Math.PI) / 180, 8)
    return {
      parts: [
        poly(shield, 0.36, 0, PLATE),
        poly([[0.5, 0], [-0.2, -0.4], [-1.0, -0.32], [-1.0, 0.32], [-0.2, 0.4]], 0.34, 0, HULL),
        rect(-0.1, 0.9, -0.08, 0.08, 0.16, 0, DETAIL),
        rect(0.7, 1.25, -0.2, 0.2, 0.44, 0, DETAIL),
      ],
      cockpit: [-0.1, 0, 0.26], engines: [[-1.0, 0, 1]],
    }
  },
  // Garra asimétrica: pinza grande a un lado, cuchilla corta al otro.
  saboteur: () => ({
    parts: [
      poly([[0.9, 0], [0.2, -0.4], [-0.9, -0.3], [-1.2, 0], [-0.9, 0.3], [0.2, 0.4]], 0.32, 0, HULL),
      poly([[-0.3, 0.3], [0.2, 1.05], [1.15, 1.35], [0.75, 0.9], [0.65, 0.55], [0.2, 0.3]], 0.2, 0.02, PLATE),
      poly([[0.0, -0.3], [-0.3, -0.95], [-0.85, -0.9], [-0.6, -0.3]], 0.16, 0, DETAIL),
      poly([[0.55, 0.3], [0.85, 0.7], [0.95, 0.35]], 0.12, 0.1, DARK),
    ],
    cockpit: [0.3, -0.05, 0.26], engines: [[-1.15, 0, 0.9]],
  }),
  // Alas en X: un par adelantado y otro retrasado.
  skirmisher: () => ({
    parts: [
      poly([[1.0, 0], [0.3, -0.2], [-0.8, -0.25], [-0.8, 0.25], [0.3, 0.2]], 0.3, 0, HULL),
      poly([[-0.1, 0.15], [0.8, 1.15], [0.95, 1.0], [0.3, 0.15]], 0.14, 0, PLATE),
      poly(mir([[-0.1, 0.15], [0.8, 1.15], [0.95, 1.0], [0.3, 0.15]]), 0.14, 0, PLATE),
      poly([[-0.3, 0.15], [-1.0, 1.1], [-1.15, 0.95], [-0.7, 0.15]], 0.14, 0, PLATE),
      poly(mir([[-0.3, 0.15], [-1.0, 1.1], [-1.15, 0.95], [-0.7, 0.15]]), 0.14, 0, PLATE),
    ],
    cockpit: [0.35, 0, 0.26], engines: [[-0.85, 0, 0.9]],
  }),
  // Cañón largo central que sobresale; alas cortas y plataforma ancha.
  artillery: () => ({
    parts: [
      poly([[0.5, -0.5], [-0.9, -0.6], [-1.0, 0], [-0.9, 0.6], [0.5, 0.5], [0.7, 0]], 0.36, 0, HULL),
      poly([[0.1, -0.4], [-0.3, -0.95], [-0.8, -0.95], [-0.7, -0.4]], 0.14, 0, PLATE),
      poly(mir([[0.1, -0.4], [-0.3, -0.95], [-0.8, -0.95], [-0.7, -0.4]]), 0.14, 0, PLATE),
      barrel(0.1, 1.6, 0.16, 0.26, DETAIL),
      rect(1.3, 1.6, -0.28, 0.28, 0.2, 0.26, DARK),
      rect(-0.3, 0.3, -0.3, 0.3, 0.2, 0.3, PLATE),
    ],
    cockpit: [-0.4, 0, 0.3], engines: [[-0.95, -0.3, 0.9], [-0.95, 0.3, 0.9]],
  }),
  // Cuerpo segmentado que se afina hacia atrás, con pinzas al frente.
  leech: () => ({
    parts: [
      poly(ngon(0.25, 0, 0.55, 0.5, 8), 0.34, 0, HULL),
      poly(ngon(-0.4, 0, 0.5, 0.42, 8), 0.3, 0, PLATE),
      poly(ngon(-0.95, 0, 0.35, 0.3, 8), 0.26, 0, HULL),
      poly([[0.5, 0.3], [0.9, 0.85], [1.4, 0.75], [1.1, 0.5], [0.95, 0.4]], 0.2, 0, DETAIL),
      poly(mir([[0.5, 0.3], [0.9, 0.85], [1.4, 0.75], [1.1, 0.5], [0.95, 0.4]]), 0.2, 0, DETAIL),
    ],
    cockpit: [0.3, 0, 0.26], engines: [[-1.25, 0, 0.8]],
  }),
  // Cristal facetado: rombo con faceta superior y esquirlas laterales. Claro, no metálico oscuro.
  prism: () => ({
    parts: [
      poly([[1.2, 0], [0, -0.85], [-1.0, 0], [0, 0.85]], 0.5, 0, 0x9fb0cc),
      poly([[0.8, 0], [0, -0.45], [-0.6, 0], [0, 0.45]], 0.36, 0.3, 0xc9d8f0),
      poly([[0.3, 0.6], [0, 1.3], [-0.4, 0.7]], 0.2, 0, 0x6f86ad),
      poly([[0.3, -0.6], [-0.4, -0.7], [0, -1.3]], 0.2, 0, 0x6f86ad),
      poly([[-0.9, 0.12], [-1.3, 0.04], [-1.3, -0.04], [-0.9, -0.12]], 0.2, 0, 0x6f86ad),
    ],
    cockpit: [0.1, 0, 0.55], engines: [[-1.05, 0, 0.8]],
  }),
  // Cazador: interceptor aerodinámico con mandíbulas/garras al frente y alas muy barridas.
  hunter: () => {
    const claw = [[0.8, 0.14], [1.5, 0.55], [1.0, 0.18], [0.5, 0.3]]
    const wing = [[-0.1, -0.3], [-0.8, -0.95], [-1.25, -0.85], [-0.95, -0.3]]
    return {
      parts: [
        poly([[1.35, 0], [0.3, -0.3], [-1.1, -0.4], [-0.8, 0], [-1.1, 0.4], [0.3, 0.3]], 0.3, 0, HULL),
        poly(wing, 0.14, 0, PLATE),
        poly(mir(wing), 0.14, 0, PLATE),
        poly(claw, 0.16, 0.04, DETAIL),
        poly(mir(claw), 0.16, 0.04, DETAIL),
        poly([[0.7, 0], [0.3, -0.1], [-0.2, -0.08], [-0.2, 0.08], [0.3, 0.1]], 0.12, 0.2, DARK),
      ],
      cockpit: [0.2, 0, 0.26], engines: [[-1.0, -0.2, 0.8], [-1.0, 0.2, 0.8]],
    }
  },
  // Espectro: manta fantasmal con velas finísimas y cola de velo.
  phantom: () => {
    const sail = [[0.6, -0.3], [-0.1, -1.3], [-0.75, -1.45], [-1.1, -0.8], [-0.9, -0.2]]
    return {
      parts: [
        poly([[1.2, 0], [0.3, -0.35], [-1.0, -0.25], [-1.3, 0], [-1.0, 0.25], [0.3, 0.35]], 0.22, 0, HULL),
        poly(sail, 0.07, 0, PLATE),
        poly(mir(sail), 0.07, 0, PLATE),
        poly([[-0.1, -0.35], [-0.5, -1.0], [-0.65, -0.3]], 0.05, 0.06, DETAIL),
        poly(mir([[-0.1, -0.35], [-0.5, -1.0], [-0.65, -0.3]]), 0.05, 0.06, DETAIL),
        poly([[-1.2, -0.06], [-1.75, 0], [-1.2, 0.06]], 0.05, 0, DETAIL),
      ],
      cockpit: [0.45, 0, 0.2], engines: [[-1.25, 0, 0.8]],
    }
  },
  // Égida: disco central con anillo y tres emisores de escudo repartidos a 120 grados.
  aegis: () => ({
    parts: [
      poly(ngon(0, 0, 0.95, 0.95, 10), 0.3, 0, HULL),
      ring(0, 0, 0.7, 0.5, 9, 0.2, 0.22, PLATE),
      poly(ngon(1.05, 0, 0.25, 0.25, 5), 0.34, 0.1, DETAIL),
      poly(ngon(-0.525, 0.91, 0.25, 0.25, 5), 0.34, 0.1, DETAIL),
      poly(ngon(-0.525, -0.91, 0.25, 0.25, 5), 0.34, 0.1, DETAIL),
      rect(0.6, 0.85, -0.05, 0.05, 0.12, 0.2, DARK),
    ],
    cockpit: [0, 0, 0.3], engines: [[-0.95, 0, 0.9]],
  }),
  // Gravitón: núcleo facetado con anillo orbital y dos nodos que lo recorren; punta de pulso al frente.
  graviton: () => ({
    parts: [
      poly(ngon(0, 0, 0.6, 0.6, 8), 0.6, 0, HULL),
      poly(ngon(0, 0, 0.35, 0.35, 6), 0.3, 0.38, DETAIL),
      ring(0, 0, 1.15, 1.0, 12, 0.14, 0, PLATE),
      poly(ngon(0, 1.08, 0.2, 0.2, 6), 0.3, 0, DETAIL),
      poly(ngon(0, -1.08, 0.2, 0.2, 6), 0.3, 0, DETAIL),
      poly([[0.55, -0.15], [1.5, 0], [0.55, 0.15]], 0.16, 0, PLATE),
    ],
    cockpit: [0, 0, 0.55], engines: [[-0.95, 0, 0.8]],
  }),
  // Colmena: panal de siete celdas hexagonales (una central y seis vainas acopladas).
  hive: () => {
    const cells = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2
      return [Math.cos(a) * 0.95, Math.sin(a) * 0.95]
    })
    return {
      parts: [
        poly(ngon(0, 0, 0.55, 0.55, 6), 0.5, 0, HULL),
        poly(ngon(0, 0, 0.3, 0.3, 6), 0.3, 0.3, DETAIL),
        ...cells.map(([x, y], i) => poly(ngon(x, y, 0.46, 0.46, 6), 0.34, 0, i % 2 ? PLATE : HULL)),
        ...cells.map(([x, y]) => poly(ngon(x, y, 0.24, 0.24, 6), 0.2, 0.2, DARK)),
      ],
      cockpit: [0, 0, 0.5], engines: [[-1.5, 0, 1.1], [-0.8, -0.85, 0.9], [-0.8, 0.85, 0.9]],
    }
  },
  // Dron: triangulito simple en punta de flecha.
  drone: () => ({
    parts: [
      poly([[1.0, 0], [-0.7, -0.65], [-0.45, 0], [-0.7, 0.65]], 0.26, 0, HULL),
      rect(-0.2, 0.5, -0.05, 0.05, 0.1, 0.16, DETAIL),
    ],
    cockpit: [0.3, 0, 0.22], engines: [[-0.5, 0, 0.8]],
  }),
  // Jefe: casco octogonal con anillo central, hangar frontal y cuatro motores.
  mothership: () => ({
    parts: [
      poly([[1.3, 0], [0.9, -0.8], [0, -1.2], [-1.0, -1.1], [-1.4, -0.5], [-1.4, 0.5], [-1.0, 1.1], [0, 1.2], [0.9, 0.8]], 0.5, 0, HULL),
      ring(-0.2, 0, 0.95, 0.72, 14, 0.3, 0.38, PLATE),
      rect(0.25, 1.1, -0.35, 0.35, 0.3, 0.26, DARK),
      rect(-1.0, -0.4, -1.45, -1.05, 0.36, 0, PLATE),
      rect(-1.0, -0.4, 1.05, 1.45, 0.36, 0, PLATE),
      rect(-1.5, -1.3, -0.9, 0.9, 0.3, 0, DETAIL),
    ],
    cockpit: [-0.2, 0, 0.6], engines: [[-1.5, -0.8, 1.3], [-1.5, -0.3, 1.3], [-1.5, 0.3, 1.3], [-1.5, 0.8, 1.3]],
  }),
  // Jefe: casco quebrado con torre de mando, antenas largas y dos bahías.
  commandship: () => ({
    parts: [
      poly([[1.4, 0], [0.6, -0.7], [-0.3, -1.0], [-1.2, -0.8], [-1.3, -0.3], [-1.3, 0.3], [-1.2, 0.8], [-0.3, 1.0], [0.6, 0.7]], 0.46, 0, HULL),
      rect(-0.7, 0.0, -0.32, 0.32, 0.5, 0.45, PLATE),
      rect(-0.55, -0.15, -0.18, 0.18, 0.3, 0.8, DETAIL),
      rect(0.3, 0.95, -0.55, -0.25, 0.2, 0.26, DARK),
      rect(0.3, 0.95, 0.25, 0.55, 0.2, 0.26, DARK),
      poly([[-0.3, 0.95], [-0.15, 1.5], [-0.05, 0.95]], 0.08, 0, DETAIL),
      poly(mir([[-0.3, 0.95], [-0.15, 1.5], [-0.05, 0.95]]), 0.08, 0, DETAIL),
      poly([[1.4, 0.05], [1.65, 0], [1.4, -0.05]], 0.08, 0, DETAIL),
    ],
    cockpit: [-0.35, 0, 1.0], engines: [[-1.35, -0.6, 1.2], [-1.35, 0, 1.4], [-1.35, 0.6, 1.2]],
  }),
}

// Geometría de una nave enemiga ya horneada en espacio local y fusionada, para dibujar todas las
// naves del mismo tipo con InstancedMesh (enemyInstances.js). El casco lleva color por vértice.
export function enemyShipParts({ radius = 10, type = 'grunt' } = {}) {
  const r = Math.max(4, radius)
  const spec = (DESIGNS[type] || DESIGNS.grunt)()
  const solids = spec.parts
  const edgeParts = solids.map((g) => new THREE.EdgesGeometry(g, 18))

  const [cx, cy, cz] = spec.cockpit
  const cockpit = new THREE.OctahedronGeometry(0.22, 0)
  cockpit.scale(1.5, 0.72, 0.55)
  cockpit.translate(cx, cy, cz)
  cockpit.scale(r, r, r)

  const engines = spec.engines.map(([x, y, k]) => {
    const e = new THREE.OctahedronGeometry(0.2, 0)
    e.scale(1.25 * k, k, 0.8 * k)
    e.translate(x, y, 0)
    return e
  })

  const solid = mergeGeometries(solids)
  const edges = mergeGeometries(edgeParts)
  const engine = engines.length > 1 ? mergeGeometries(engines) : engines[0].clone()
  solid.scale(r, r, r)
  edges.scale(r, r, r)
  engine.scale(r, r, r)
  for (const g of [...solids, ...edgeParts, ...engines]) g.dispose()
  return { solid, edges, cockpit, engine }
}
