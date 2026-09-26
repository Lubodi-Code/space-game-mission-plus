import * as THREE from 'three'

export const EXPLOSION_KINDS = ['small', 'big', 'plasma', 'emp', 'meteor', 'boss']

// Shared GPU assets live for the lifetime of the module. Per-effect buffers and materials do not.
const shared = {}
function geometry(name) {
  if (!shared[name]) {
    shared[name] = name === 'ring' ? new THREE.RingGeometry(0.88, 1, 40)
      : name === 'sphere' ? new THREE.SphereGeometry(1, 12, 8)
        : name === 'rock' ? new THREE.TetrahedronGeometry(1, 0)
          : name === 'body' ? new THREE.CylinderGeometry(1.15, 1.8, 10, 6)
            : name === 'nose' ? new THREE.ConeGeometry(1.2, 4, 6)
              : new THREE.BoxGeometry(4, 1.2, 3)
  }
  return shared[name]
}

function glowTexture() {
  if (shared.glow) return shared.glow
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  shared.glow = new THREE.CanvasTexture(canvas)
  return shared.glow
}

const DURATIONS = { small: 0.5, big: 0.95, plasma: 0.85, emp: 0.7, meteor: 1.05, boss: 1.4 }
const COUNTS = {
  small: [28, 0], big: [68, 24], plasma: [46, 0],
  emp: [40, 0], meteor: [40, 35], boss: [98, 32],
}

export function createExplosion(scene, { x, y, color, radius, kind }) {
  kind = DURATIONS[kind] ? kind : 'small'
  radius = Math.max(1, radius || 1)
  const duration = DURATIONS[kind]
  const tint = new THREE.Color(color ?? 0xff9944)
  const root = new THREE.Group()
  root.position.set(x, y, 0)
  scene.add(root)
  const owned = []
  const animated = []
  let age = 0
  let disposed = false

  function add(object, ownedGeometry = false) {
    root.add(object)
    owned.push({ object, ownedGeometry })
    return object
  }

  function particles(count, smoke = false) {
    if (!count) return
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const speed = (smoke ? 0.3 : 0.75) + Math.random() * (smoke ? 0.85 : 1.65)
      seeds.set([Math.cos(a) * speed, Math.sin(a) * speed, Math.random(), Math.random()], i * 4)
      positions.set([0, 0, smoke ? 13 : 21], i * 3)
      const c = smoke ? new THREE.Color(0x222638)
        : Math.random() < 0.28 ? new THREE.Color(0xfff5d5) : tint
      colors.set([c.r, c.g, c.b], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const map = glowTexture()
    const mat = new THREE.PointsMaterial({
      size: Math.max(3, radius * (smoke ? 0.72 : 0.32)),
      ...(map ? { map } : {}), vertexColors: true, transparent: true,
      opacity: smoke ? 0.45 : 1, blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    })
    const points = add(new THREE.Points(geo, mat), true)
    animated.push(t => {
      const travel = radius * (smoke ? 1.65 : 3.6) * t * (1 - 0.28 * t)
      for (let i = 0; i < count; i++) {
        const j = i * 3; const k = i * 4
        positions[j] = seeds[k] * travel
        positions[j + 1] = seeds[k + 1] * travel
        positions[j + 2] = (smoke ? 13 : 21) + seeds[k + 2] * 6 + (smoke ? 2 : -8) * t
      }
      geo.attributes.position.needsUpdate = true
      mat.opacity = (smoke ? 0.45 : 1) * (1 - t) ** (smoke ? 1.3 : 0.8)
      points.rotation.z = smoke ? t * 0.18 : 0
    })
  }

  function ring(delay, speed, opacity, ringColor = tint) {
    const mat = new THREE.MeshBasicMaterial({ color: ringColor, transparent: true,
      opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    const mesh = add(new THREE.Mesh(geometry('ring'), mat))
    mesh.position.z = 17
    animated.push(t => {
      const p = Math.max(0, (t - delay) / (1 - delay))
      mesh.visible = t >= delay
      mesh.scale.setScalar(radius * (0.22 + speed * p))
      mat.opacity = opacity * (1 - p) ** 1.5
    })
  }

  function flash(delay, size, strength = 1) {
    const map = glowTexture()
    const mat = new THREE.SpriteMaterial({ color: 0xffffff, ...(map ? { map } : {}),
      transparent: true, opacity: strength, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false })
    const sprite = add(new THREE.Sprite(mat))
    sprite.position.z = 28
    animated.push(t => {
      const p = (t - delay) / 0.24
      sprite.visible = p >= 0 && p < 1
      mat.opacity = strength * Math.max(0, 1 - p) ** 2
      sprite.scale.setScalar(radius * size * (1 + Math.max(0, p) * 0.7))
    })
  }

  function shards(count, rocks = false) {
    const mat = new THREE.MeshBasicMaterial({ color: rocks ? 0x858294 : tint,
      side: THREE.DoubleSide })
    const mesh = add(new THREE.InstancedMesh(geometry('rock'), mat, count))
    mesh.position.z = 19
    const dummy = new THREE.Object3D()
    const data = Array.from({ length: count }, () => ({
      a: Math.random() * Math.PI * 2, v: 0.7 + Math.random() * 1.3,
      spin: (Math.random() - 0.5) * 14, size: radius * (rocks ? 0.12 : 0.055) * (0.5 + Math.random()),
    }))
    animated.push(t => {
      data.forEach((d, i) => {
        const distance = radius * (rocks ? 2.7 : 2.2) * d.v * t
        dummy.position.set(Math.cos(d.a) * distance, Math.sin(d.a) * distance, 0)
        dummy.rotation.set(d.spin * t, d.spin * t * 0.7, d.a + d.spin * t)
        dummy.scale.setScalar(d.size * Math.max(0.01, 1 - t))
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    })
  }

  function electric(arcs, blue = false) {
    const segments = arcs * 8
    const pos = new Float32Array(segments * 6)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.LineBasicMaterial({ color: blue ? 0x61cfff : tint,
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    add(new THREE.LineSegments(geo, mat), true)
    const phase = Array.from({ length: arcs }, () => Math.random() * Math.PI * 2)
    animated.push(t => {
      const reach = radius * (0.35 + 2.5 * t)
      for (let a = 0; a < arcs; a++) {
        for (let s = 0; s < 8; s++) {
          const angle = phase[a] + (s / 8) * (blue ? 0.85 : 1.6) + t * 2
          const next = phase[a] + ((s + 1) / 8) * (blue ? 0.85 : 1.6) + t * 2
          const r0 = reach * (0.35 + s / 12) * (0.85 + Math.random() * 0.3)
          const r1 = reach * (0.35 + (s + 1) / 12) * (0.85 + Math.random() * 0.3)
          pos.set([Math.cos(angle) * r0, Math.sin(angle) * r0, 25,
            Math.cos(next) * r1, Math.sin(next) * r1, 25], (a * 8 + s) * 6)
        }
      }
      geo.attributes.position.needsUpdate = true
      mat.opacity = 0.95 * (1 - t) ** 1.3
    })
  }

  const [sparks, smoke] = COUNTS[kind]
  particles(sparks)
  particles(smoke, true)
  if (kind === 'small') flash(0, 2.7)
  if (kind === 'big' || kind === 'boss') {
    ring(0, 3.1, 0.9); ring(0.12, 2.35, 0.55, 0xffffff)
    shards(kind === 'boss' ? 10 : 7)
    flash(0, kind === 'boss' ? 5 : 3.5)
    if (kind === 'boss') { flash(0.18, 3.3, 0.8); flash(0.38, 2.6, 0.65) }
  }
  if (kind === 'plasma') {
    const mat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: true })
    const bubble = add(new THREE.Mesh(geometry('sphere'), mat))
    bubble.position.z = 20
    animated.push(t => { bubble.scale.setScalar(radius * (0.35 + 2.5 * t)); mat.opacity = 0.45 * (1 - t) })
    electric(3); flash(0, 2.2, 0.8)
  }
  if (kind === 'emp') {
    ring(0, 3.6, 1, 0x56cfff)
    electric(7, true)
    flash(0, 2.4, 0.8)
  }
  if (kind === 'meteor') {
    shards(10, true)
    ring(0, 2.4, 0.35, 0xffba74)
    flash(0, 2.3, 0.7)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    scene.remove(root)
    for (const { object, ownedGeometry } of owned) {
      if (ownedGeometry) object.geometry.dispose()
      if (object.material) object.material.dispose()
    }
    root.clear()
  }
  return {
    update(dt) {
      if (disposed) return false
      age = Math.min(duration, age + Math.max(0, dt || 0))
      const t = age / duration
      for (const animate of animated) animate(t)
      return age < duration
    },
    dispose,
  }
}

export function createMissileModel(color) {
  const root = new THREE.Group()
  root.position.z = 24
  const tint = new THREE.Color(color ?? 0xffaa55)
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x75889e, side: THREE.DoubleSide })
  const brightMat = new THREE.MeshBasicMaterial({ color: tint, side: THREE.DoubleSide })
  const body = new THREE.Mesh(geometry('body'), hullMat)
  body.rotation.z = -Math.PI / 2
  root.add(body)
  const nose = new THREE.Mesh(geometry('nose'), brightMat)
  nose.rotation.z = -Math.PI / 2
  nose.position.x = 7
  root.add(nose)
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(geometry('fin'), brightMat)
    fin.position.set(-3, side * 2, 0)
    fin.rotation.z = side * 0.25
    root.add(fin)
  }

  const count = 24
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const trailGeo = new THREE.BufferGeometry()
  trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  trailGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  trailGeo.setDrawRange(0, 0)
  const map = glowTexture()
  const trailMat = new THREE.PointsMaterial({ size: 5, ...(map ? { map } : {}),
    vertexColors: true, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const trail = new THREE.Points(trailGeo, trailMat)
  root.add(trail)
  const samples = []
  let clock = 0
  let disposed = false
  root.userData.update = (x, y, angleRad, dt) => {
    if (disposed) return
    dt = Math.max(0, dt || 0)
    clock += dt
    root.position.set(x, y, 24)
    root.rotation.z = angleRad
    const cos = Math.cos(angleRad); const sin = Math.sin(angleRad)
    samples.unshift({ x: x - cos * 7, y: y - sin * 7, time: clock })
    while (samples.length > count) samples.pop()
    for (let i = samples.length - 1; i >= 0; i--) {
      if (clock - samples[i].time > 0.38) samples.splice(i, 1)
    }
    samples.forEach((sample, i) => {
      const dx = sample.x - x; const dy = sample.y - y
      positions.set([dx * cos + dy * sin, -dx * sin + dy * cos, -1], i * 3)
      const fade = (1 - i / count) * Math.max(0, 1 - (clock - sample.time) / 0.38)
      colors.set([tint.r * fade, tint.g * fade, tint.b * fade], i * 3)
    })
    trailGeo.setDrawRange(0, samples.length)
    trailGeo.attributes.position.needsUpdate = true
    trailGeo.attributes.color.needsUpdate = true
  }
  root.userData.dispose = () => {
    if (disposed) return
    disposed = true
    trail.removeFromParent()
    trailGeo.dispose()
    trailMat.dispose()
    hullMat.dispose()
    brightMat.dispose()
    root.clear()
  }
  return root
}
