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
export function createCommanderShip(tint = 0xffaa44) {
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
