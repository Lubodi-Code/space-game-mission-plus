import * as THREE from 'three'
import { LOW_GFX } from '../quality.js'

export const EXPLOSION_KINDS = ['small', 'big', 'plasma', 'emp', 'meteor', 'boss']

const MAX = LOW_GFX ? 10 : 24
const FIRE = LOW_GFX ? 6 : 12
const SMOKE = LOW_GFX ? 6 : 12
const SPARK = LOW_GFX ? 12 : 24
const SHARDS = LOW_GFX ? 7 : 14
const pools = new WeakMap()
const assets = {}
const heat = [0xeaf6ff, 0xfff0bc, 0xffa53c, 0xba351b, 0x311a1a].map(c => new THREE.Color(c))
const colorWork = new THREE.Color()
const dummy = new THREE.Object3D()
const TAU = Math.PI * 2

function glowTexture() {
  if (assets.glow) return assets.glow
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.3, 'rgba(255,255,255,.75)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  assets.glow = new THREE.CanvasTexture(canvas)
  return assets.glow
}

function geometry(name) {
  if (!assets[name]) {
    assets[name] = name === 'ring' ? new THREE.RingGeometry(0.91, 1, 32)
      : name === 'shard' ? new THREE.TetrahedronGeometry(1)
        : name === 'body' ? new THREE.CylinderGeometry(1.15, 1.8, 10, 6)
          : name === 'nose' ? new THREE.ConeGeometry(1.2, 4, 6)
            : new THREE.BoxGeometry(4, 1.2, 3)
  }
  return assets[name]
}

function cloud(root, count, size, blend, alpha = false, grow = false) {
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * (alpha ? 4 : 3))
  const scales = grow ? new Float32Array(count) : null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('color', new THREE.BufferAttribute(col, alpha ? 4 : 3).setUsage(THREE.DynamicDrawUsage))
  if (scales) geo.setAttribute('particleScale', new THREE.BufferAttribute(scales, 1).setUsage(THREE.DynamicDrawUsage))
  const mat = new THREE.PointsMaterial({ size, map: glowTexture(), vertexColors: true,
    transparent: true, blending: blend, depthWrite: false, sizeAttenuation: false })
  if (scales) mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>', '#include <common>\nattribute float particleScale;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * particleScale;')
  }
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false // posiciones dinámicas: la esfera calculada al nacer queda obsoleta
  root.add(points)
  return { pos, col, scales, geo, mat }
}

// A slot owns its mutable buffers/materials for its whole lifetime. Spawning only resets it.
function makeSlot(scene) {
  const root = new THREE.Group()
  const fire = cloud(root, FIRE, 10, THREE.AdditiveBlending)
  const smoke = cloud(root, SMOKE, 11, THREE.NormalBlending, true, true)
  const sparks = cloud(root, SPARK, 3, THREE.AdditiveBlending)
  const shardMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const shards = new THREE.InstancedMesh(geometry('shard'), shardMat, SHARDS)
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  shards.frustumCulled = false
  root.add(shards)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc476, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const ring = new THREE.Mesh(geometry('ring'), ringMat)
  ring.position.z = 2
  root.add(ring)
  const ring2Mat = ringMat.clone()
  const ring2 = new THREE.Mesh(geometry('ring'), ring2Mat)
  ring2.position.z = 2.5
  root.add(ring2)
  const flashMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdcefff,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })
  const flash = new THREE.Sprite(flashMat)
  flash.position.z = 20
  root.add(flash)
  return { scene, root, fire, smoke, sparks, shards, shardMat, ring, ringMat,
    ring2, ring2Mat, flash, flashMat,
    seeds: new Float32Array((FIRE + SMOKE + SPARK + SHARDS) * 4),
    active: false, generation: 0, age: 0 }
}

function start(s, x, y, tint, radius, kind) {
  s.generation++
  s.active = true
  s.age = 0
  s.radius = Math.max(4, radius || 12)
  s.kind = EXPLOSION_KINDS.includes(kind) ? kind : 'small'
  s.duration = s.kind === 'boss' ? 2.2 : 2.05 // el fuego termina antes; el humo dura ~2 s
  s.bursts = s.kind === 'boss' ? 3 : s.kind === 'big' || s.radius >= 55 ? 2 : 1
  s.shards.count = s.kind === 'small' ? Math.min(SHARDS, LOW_GFX ? 6 : 8) : SHARDS
  s.root.position.set(x, y, 0)
  s.shardMat.color.setHex(tint ?? 0xffa850)
  s.ringMat.color.setHex(s.kind === 'emp' ? 0x7ddfff : 0xffc476)
  s.ring2Mat.color.setHex(0xeaf6ff)
  for (let i = 0; i < s.seeds.length; i += 4) {
    s.seeds[i] = Math.random() * TAU
    s.seeds[i + 1] = 0.55 + Math.random() * 0.85
    s.seeds[i + 2] = Math.random()
    s.seeds[i + 3] = Math.random() * TAU
  }
  s.scene.add(s.root)
  updateSlot(s, 0)
}

function updateSlot(s, dt) {
  s.age += Math.max(0, dt || 0)
  const age = s.age
  const radius = s.radius
  const big = s.kind === 'big' || s.kind === 'boss'
  const flameLife = big ? 1.25 : 0.72
  const flashAge = s.bursts > 1 && age < (s.bursts - 1) * 0.2 + 0.08 ? age % 0.2 : age
  const flash = Math.max(0, 1 - flashAge / 0.08)
  s.flash.visible = flash > 0
  s.flashMat.opacity = flash * flash
  s.flash.scale.setScalar(radius * (2.3 + age * 13))
  const ringT = Math.min(1, age / (big ? 0.72 : 0.48))
  s.ring.visible = ringT < 1
  s.ring.scale.setScalar(radius * (0.25 + ringT * (s.kind === 'boss' ? 4 : 2.9)))
  s.ringMat.opacity = 0.8 * (1 - ringT) ** 1.5
  const second = s.kind === 'boss'
  s.ring2.visible = second && age >= 0.2 && age < 1.05
  if (second) {
    const t = Math.max(0, Math.min(1, (age - 0.2) / 0.85))
    s.ring2.scale.setScalar(radius * (0.15 + 3.4 * t))
    s.ring2Mat.opacity = 0.65 * (1 - t) ** 1.4
  }

  const fp = s.fire.pos; const fc = s.fire.col
  for (let i = 0; i < FIRE; i++) {
    const k = i * 4; const j = i * 3
    const delay = (i % s.bursts) * (second ? 0.2 : 0.16)
    const t = Math.max(0, (age - delay) / flameLife)
    const life = Math.max(0, 1 - t)
    const reach = radius * (0.12 + 1.15 * Math.min(1, t * 2)) * s.seeds[k + 1]
    const wobble = Math.sin(age * 19 + s.seeds[k + 3]) * radius * 0.065
    fp[j] = Math.cos(s.seeds[k]) * reach + wobble
    fp[j + 1] = Math.sin(s.seeds[k]) * reach - wobble
    fp[j + 2] = 11 + radius * (0.1 + 0.18 * Math.sin(s.seeds[k + 3])) + t * radius * 0.13
    const stage = Math.min(3.999, t * 4)
    colorWork.lerpColors(heat[Math.floor(stage)], heat[Math.floor(stage) + 1], stage % 1)
    const strength = life * (0.7 + s.seeds[k + 2] * 0.3) * (age >= delay ? 1 : 0)
    fc[j] = colorWork.r * strength; fc[j + 1] = colorWork.g * strength; fc[j + 2] = colorWork.b * strength
  }
  s.fire.mat.size = radius * (0.55 + Math.min(1, age * 2) * 0.4)
  s.fire.mat.opacity = Math.max(0, 1 - age / (flameLife + (s.bursts - 1) * 0.2))
  s.fire.geo.attributes.position.needsUpdate = true
  s.fire.geo.attributes.color.needsUpdate = true

  const sp = s.smoke.pos; const sc = s.smoke.col
  for (let i = 0; i < SMOKE; i++) {
    const k = (FIRE + i) * 4; const j = i * 3; const q = i * 4
    const delay = s.seeds[k + 2] * 0.28
    const t = Math.max(0, (age - delay) / 1.9)
    const strength = age < delay ? 0 : Math.max(0, 1 - t) ** 1.4
    const drift = radius * (0.12 + t * 1.2) * s.seeds[k + 1]
    sp[j] = Math.cos(s.seeds[k]) * drift + Math.sin(age * 4 + s.seeds[k + 3]) * radius * 0.06
    sp[j + 1] = Math.sin(s.seeds[k]) * drift
    sp[j + 2] = 8 + t * radius * 0.55
    const gray = 0.22 + s.seeds[k + 2] * 0.12
    sc[q] = gray; sc[q + 1] = gray * 1.04; sc[q + 2] = gray * 1.12
    sc[q + 3] = strength
    s.smoke.scales[i] = 0.7 + Math.min(1, t) * 1.7
  }
  s.smoke.mat.size = radius * (0.48 + Math.min(1, age / 1.5) * 0.85)
  s.smoke.mat.opacity = 0.65 * Math.min(1, age * 5) * Math.max(0, 1 - (age - 0.5) / 1.7)
  s.smoke.geo.attributes.position.needsUpdate = true
  s.smoke.geo.attributes.color.needsUpdate = true
  s.smoke.geo.attributes.particleScale.needsUpdate = true

  const pp = s.sparks.pos; const pc = s.sparks.col
  for (let i = 0; i < SPARK; i++) {
    const k = (FIRE + SMOKE + i) * 4; const j = i * 3
    const t = Math.min(1, age * (1.1 + s.seeds[k + 1]))
    const travel = radius * 2.6 * s.seeds[k + 1] * (1 - Math.exp(-3.5 * t))
    if (i < s.shards.count) {
      const d = (FIRE + SMOKE + SPARK + i) * 4
      const shardT = Math.min(1, age / 1.35)
      const behind = radius * 2.2 * s.seeds[d + 1] * (1 - Math.exp(-2.3 * shardT)) - radius * 0.16
      pp[j] = Math.cos(s.seeds[d]) * behind
      pp[j + 1] = Math.sin(s.seeds[d]) * behind
      pp[j + 2] = Math.max(2, 15 + radius * 0.55 * shardT - radius * 0.9 * shardT * shardT)
    } else {
      pp[j] = Math.cos(s.seeds[k]) * travel
      pp[j + 1] = Math.sin(s.seeds[k]) * travel
      pp[j + 2] = Math.max(2, 17 + radius * 0.27 * t - radius * 0.35 * t * t)
    }
    const bright = Math.max(0, 1 - age / 0.85) ** 2 * (0.6 + s.seeds[k + 2] * 0.4)
    pc[j] = bright; pc[j + 1] = bright * 0.62; pc[j + 2] = bright * 0.24
  }
  s.sparks.mat.size = Math.max(2, radius * 0.075)
  s.sparks.geo.attributes.position.needsUpdate = true
  s.sparks.geo.attributes.color.needsUpdate = true

  for (let i = 0; i < s.shards.count; i++) {
    const k = (FIRE + SMOKE + SPARK + i) * 4
    const t = Math.min(1, age / 1.35)
    const travel = radius * 2.2 * s.seeds[k + 1] * (1 - Math.exp(-2.3 * t))
    dummy.position.set(Math.cos(s.seeds[k]) * travel, Math.sin(s.seeds[k]) * travel,
      Math.max(1, 15 + radius * 0.55 * t - radius * 0.9 * t * t))
    dummy.rotation.set(t * 13 * s.seeds[k + 2], t * 9, s.seeds[k] + t * 11)
    dummy.scale.setScalar(radius * (0.055 + s.seeds[k + 2] * 0.045) * Math.max(0.01, 1 - t))
    dummy.updateMatrix()
    s.shards.setMatrixAt(i, dummy.matrix)
  }
  s.shards.instanceMatrix.needsUpdate = true
  return age < s.duration
}

export function createExplosion(scene, { x, y, color, radius, kind }) {
  let pool = pools.get(scene)
  if (!pool) { pool = []; pools.set(scene, pool) }
  let slot = pool.find(s => !s.active)
  if (!slot && pool.length < MAX) { slot = makeSlot(scene); pool.push(slot) }
  if (!slot) {
    slot = pool[0]
    for (let i = 1; i < pool.length; i++) if (pool[i].age > slot.age) slot = pool[i]
  }
  start(slot, x, y, color, radius, kind)
  const generation = slot.generation
  return {
    update(dt) {
      return slot.active && slot.generation === generation ? updateSlot(slot, dt) : false
    },
    dispose() {
      if (slot.generation !== generation || !slot.active) return
      slot.active = false
      scene.remove(slot.root)
    },
  }
}

const SMOKE_TRAIL = LOW_GFX ? 8 : 16
const HOT_TRAIL = LOW_GFX ? 4 : 8
function trail(root, count, size, blend, alpha = false, grow = false) {
  const v = cloud(root, count, size, blend, alpha, grow)
  const xs = new Float32Array(count)
  const ys = new Float32Array(count)
  const births = new Float32Array(count)
  births.fill(-10)
  return { ...v, xs, ys, births, cursor: 0, count }
}

export function createMissileModel(color) {
  const root = new THREE.Group()
  const tint = new THREE.Color(color ?? 0xffaa55)
  const hull = new THREE.Mesh(geometry('body'), new THREE.MeshBasicMaterial({ color: 0x75889e }))
  hull.rotation.z = -Math.PI / 2
  root.add(hull)
  const nose = new THREE.Mesh(geometry('nose'), new THREE.MeshBasicMaterial({ color: tint }))
  nose.rotation.z = -Math.PI / 2
  nose.position.x = 7
  root.add(nose)
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(geometry('fin'), nose.material)
    fin.position.set(-3, side * 2, 0)
    fin.rotation.z = side * 0.25
    root.add(fin)
  }
  const flameMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa344,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const flame = new THREE.Sprite(flameMat)
  flame.position.x = -8
  root.add(flame)
  const smoke = trail(root, SMOKE_TRAIL, 8, THREE.NormalBlending, true, true)
  const hotTrail = trail(root, HOT_TRAIL, 4, THREE.AdditiveBlending)
  let clock = 0; let smokeAcc = 0; let hotAcc = 0; let disposed = false
  function emit(v, x, y, cos, sin) {
    const i = v.cursor
    v.xs[i] = x - cos * 8
    v.ys[i] = y - sin * 8
    v.births[i] = clock
    v.cursor = (i + 1) % v.count
  }
  function updateTrail(v, x, y, cos, sin, lifetime, isSmoke) {
    for (let i = 0; i < v.count; i++) {
      const j = i * 3
      const age = clock - v.births[i]
      const alpha = Math.max(0, 1 - age / lifetime)
      const dx = v.xs[i] - x; const dy = v.ys[i] - y
      v.pos[j] = dx * cos + dy * sin
      v.pos[j + 1] = -dx * sin + dy * cos + (isSmoke && alpha ? Math.sin(i * 9.7) * age * 7 : 0)
      v.pos[j + 2] = isSmoke && alpha ? age * 5 : 0
      if (isSmoke) {
        const q = i * 4
        v.col[q] = 0.35; v.col[q + 1] = 0.36; v.col[q + 2] = 0.38
        v.col[q + 3] = alpha * alpha * 0.58
        v.scales[i] = 0.65 + Math.min(1, age / lifetime) * 1.8
      } else {
        const shade = alpha * alpha
        v.col[j] = shade * tint.r
        v.col[j + 1] = shade * tint.g
        v.col[j + 2] = shade * tint.b
      }
    }
    v.geo.attributes.position.needsUpdate = true
    v.geo.attributes.color.needsUpdate = true
    if (isSmoke) v.geo.attributes.particleScale.needsUpdate = true
  }
  root.userData.update = (x, y, angle, dt) => {
    if (disposed) return
    dt = Math.min(0.05, Math.max(0, dt || 0))
    clock += dt
    root.position.set(x, y, 24)
    root.rotation.z = angle
    const cos = Math.cos(angle); const sin = Math.sin(angle)
    smokeAcc += dt; hotAcc += dt
    if (smokeAcc >= 0.035) { emit(smoke, x, y, cos, sin); smokeAcc %= 0.035 }
    if (hotAcc >= 0.02) { emit(hotTrail, x, y, cos, sin); hotAcc %= 0.02 }
    updateTrail(smoke, x, y, cos, sin, 0.6, true)
    updateTrail(hotTrail, x, y, cos, sin, 0.18, false)
    flame.scale.set(8 + Math.sin(clock * 73) * 2.5, 4 + Math.sin(clock * 51) * 1.2, 1)
    flameMat.opacity = 0.72 + Math.sin(clock * 59) * 0.18
  }
  root.userData.dispose = () => {
    if (disposed) return
    disposed = true
    smoke.geo.dispose(); smoke.mat.dispose()
    hotTrail.geo.dispose(); hotTrail.mat.dispose()
    hull.material.dispose(); nose.material.dispose(); flameMat.dispose()
    root.clear()
  }
  return root
}
