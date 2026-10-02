import * as THREE from 'three'
import { enemyShipParts } from './shipModel.js'

// Naves enemigas instanciadas: todas las naves del mismo tipo y tamaño se dibujan con 4 draw calls
// (casco, cabina, motor y contorno) y todos los halos con uno. Antes cada nave era un Group propio
// con ~10 mallas y geometría recién extruida al aparecer: con 150 naves eran 1500 draw calls y cada
// oleada creaba cientos de geometrías. Uso: begin() → push() por nave → end() una vez por frame.

const STUN = new THREE.Color(0x8be9fd)
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _euler = new THREE.Euler()
const _one = new THREE.Vector3(1, 1, 1)
const _scale = new THREE.Vector3()
const _mat = new THREE.Matrix4()
const _col = new THREE.Color()

// LineBasicMaterial no soporta instancing; se le inyecta la matriz por instancia. project_vertex ya
// aplica `instanceMatrix` bajo USE_INSTANCING, así que basta con declararla.
function instancedLineMaterial(color) {
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = '#define USE_INSTANCING\nattribute mat4 instanceMatrix;\n' + shader.vertexShader
  }
  m.customProgramCacheKey = () => 'sg-instanced-line'
  return m
}

export function createEnemyInstances(scene, glowTex, { haloScale = 4.4 } = {}) {
  const kinds = new Map()
  const engineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const cockpitMat = new THREE.MeshStandardMaterial({
    color: 0xbfeaff, emissive: 0x8be9fd, emissiveIntensity: 0.8,
    metalness: 0.2, roughness: 0.2, flatShading: true,
  })
  const haloGeo = new THREE.PlaneGeometry(1, 1)
  const haloMat = new THREE.MeshBasicMaterial({
    map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  })
  let halo = null
  let haloCap = 0
  let haloN = 0

  function dynamic(attr) { attr.setUsage(THREE.DynamicDrawUsage); return attr }

  // Al crecer se copian las instancias ya escritas en este frame (si no, parpadean en el origen).
  function makeHalo(cap) {
    const old = halo
    halo = new THREE.InstancedMesh(haloGeo, haloMat, cap)
    dynamic(halo.instanceMatrix)
    halo.instanceColor = dynamic(new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3))
    if (old) {
      halo.instanceMatrix.array.set(old.instanceMatrix.array)
      halo.instanceColor.array.set(old.instanceColor.array)
      scene.remove(old); old.dispose()
    }
    halo.frustumCulled = false
    halo.count = 0
    scene.add(halo)
    haloCap = cap
  }

  function build(k, cap) {
    const prev = k.hull ? { matrix: k.matrix.array, color: k.engine.instanceColor.array } : null
    if (k.hull) {
      for (const o of [k.hull, k.cockpit, k.engine]) { scene.remove(o); o.dispose() }
      scene.remove(k.edges); k.edges.geometry.dispose()
    }
    const matrix = dynamic(new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16))
    if (prev) matrix.array.set(prev.matrix)
    const mesh = (geo, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, cap)
      m.instanceMatrix = matrix // las cuatro partes comparten la misma transformación
      m.frustumCulled = false
      m.count = 0
      scene.add(m)
      return m
    }
    k.hull = mesh(k.geo.solid, k.hullMat)
    k.cockpit = mesh(k.geo.cockpit, cockpitMat)
    k.engine = mesh(k.geo.engine, engineMat)
    k.engine.instanceColor = dynamic(new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3))
    if (prev) k.engine.instanceColor.array.set(prev.color)
    const eg = new THREE.InstancedBufferGeometry()
    eg.setAttribute('position', k.geo.edges.attributes.position)
    eg.setAttribute('instanceMatrix', matrix)
    eg.instanceCount = 0
    k.edges = new THREE.LineSegments(eg, k.edgeMat)
    k.edges.frustumCulled = false
    scene.add(k.edges)
    k.matrix = matrix
    k.cap = cap
  }

  function kindFor(st, type, tint) {
    let k = kinds.get(st.key)
    if (k) return k
    k = {
      geo: enemyShipParts({ radius: st.radius, type }),
      tint: new THREE.Color(tint),
      hullMat: new THREE.MeshStandardMaterial({
        vertexColors: true, emissive: tint, emissiveIntensity: 0.22,
        metalness: 0.55, roughness: 0.4, flatShading: true, side: THREE.DoubleSide,
      }),
      edgeMat: instancedLineMaterial(tint),
      n: 0,
    }
    build(k, 16)
    kinds.set(st.key, k)
    return k
  }

  return {
    begin() {
      for (const k of kinds.values()) k.n = 0
      haloN = 0
    },

    // st: { key, radius } estable por nave. bank: alabeo acumulado. glow: opacidad del halo.
    push(st, type, tint, x, y, heading, bank, stunned, glow) {
      const k = kindFor(st, type, tint)
      if (k.n >= k.cap) build(k, k.cap * 2)
      const i = k.n++
      _pos.set(x, y, 12)
      _quat.setFromEuler(_euler.set(-0.24 + bank, 0, heading))
      _mat.compose(_pos, _quat, _one)
      _mat.toArray(k.matrix.array, i * 16)
      const ec = stunned ? STUN : k.tint
      k.engine.instanceColor.setXYZ(i, ec.r, ec.g, ec.b)

      if (!halo) makeHalo(64)
      if (haloN >= haloCap) makeHalo(haloCap * 2)
      const h = haloN++
      const s = st.radius * haloScale
      _pos.set(x, y, 10)
      _mat.compose(_pos, _quat.identity(), _scale.set(s, s, 1))
      halo.setMatrixAt(h, _mat)
      // Aditivo: escalar el color equivale a la opacidad del sprite anterior.
      _col.copy(stunned ? STUN : k.tint).multiplyScalar(glow)
      halo.setColorAt(h, _col)
    },

    // far: cámara alejada → sin contorno ni cabina (miden ~1 px), la mitad de los draw calls.
    end(far = false) {
      for (const k of kinds.values()) {
        const vis = k.n > 0
        k.hull.visible = k.engine.visible = vis
        k.cockpit.visible = k.edges.visible = vis && !far
        if (!vis) continue
        k.hull.count = k.cockpit.count = k.engine.count = k.n
        k.edges.geometry.instanceCount = k.n
        k.matrix.needsUpdate = true
        k.engine.instanceColor.needsUpdate = true
      }
      if (halo) {
        halo.count = haloN
        halo.visible = haloN > 0
        halo.instanceMatrix.needsUpdate = true
        halo.instanceColor.needsUpdate = true
      }
    },

    dispose() {
      for (const k of kinds.values()) {
        for (const o of [k.hull, k.cockpit, k.engine]) { scene.remove(o); o.dispose() }
        scene.remove(k.edges); k.edges.geometry.dispose()
        for (const g of Object.values(k.geo)) g.dispose()
        k.hullMat.dispose(); k.edgeMat.dispose()
      }
      kinds.clear()
      if (halo) { scene.remove(halo); halo.dispose() }
      haloGeo.dispose(); haloMat.dispose(); engineMat.dispose(); cockpitMat.dispose()
    },
  }
}
