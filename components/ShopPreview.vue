<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { COSMETIC_BY_ID } from '~/game/meta/cosmetics'
import { createCommanderShip } from '~/game/three/shipModel'

// Vitrina 3D retro de la tienda: nave del comandante low-poly con bordes neón girando sobre
// un pedestal, disparando el rayo del cosmético que se está mirando.
const props = defineProps<{ hull: string; beam: string; trail: string }>()

const host = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let raf = 0
let ro: ResizeObserver | null = null
const state: any = {}

function hullColor() { return COSMETIC_BY_ID[props.hull]?.tint ?? 0xffaa44 }
function beamDef() { return COSMETIC_BY_ID[props.beam] || COSMETIC_BY_ID.beam_default }
function trailDef() { return COSMETIC_BY_ID[props.trail] }

function setColors() {
  const c = hullColor()
  state.ship.userData.setTint(c)
  state.pedRing.material.color.setHex(c)
}

onMounted(() => {
  const el = host.value!
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  el.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  cam.position.set(0, 2.4, 6.2)
  cam.lookAt(0, 0.6, 0)
  scene.add(new THREE.AmbientLight(0x6070a0, 0.7))
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(3, 5, 4); scene.add(key)
  const rim = new THREE.DirectionalLight(0xff7ad9, 0.8); rim.position.set(-4, 2, -3); scene.add(rim)

  // Pedestal + grilla retro.
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.25, 32), new THREE.MeshStandardMaterial({ color: 0x0b1020, metalness: 0.6, roughness: 0.4 }))
  ped.position.y = -0.4
  scene.add(ped)
  const pedRing = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.035, 8, 64), new THREE.MeshBasicMaterial({ color: 0x8be9fd }))
  pedRing.rotation.x = Math.PI / 2; pedRing.position.y = -0.26
  scene.add(pedRing)
  const grid = new THREE.GridHelper(30, 30, 0xff7ad9, 0x2a3a6a)
  grid.position.y = -0.53
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.35
  scene.add(grid)

  // Misma nave que en el juego (shipModel.js). El modelo vive en el plano XY con la nariz en
  // +X; aquí se acuesta sobre el pedestal (XZ) y gira alrededor de Y.
  const ship = new THREE.Group()
  const model = createCommanderShip(hullColor())
  model.rotation.x = -Math.PI / 2
  model.scale.setScalar(0.065)
  ship.add(model)
  ship.position.y = 0.7
  scene.add(ship)

  // Rayo: cilindro aditivo que sale de la nariz del modelo (+X local); dispara cada ~1.6 s.
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x8be9fd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  const beamCore = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  const LEN = 130
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, LEN, 10, 1, true), beamMat)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, LEN, 8, 1, true), beamCore)
  beam.rotation.z = core.rotation.z = -Math.PI / 2
  beam.position.x = core.position.x = 26 + LEN / 2
  model.add(beam, core)

  // Estela: puntos que se desprenden del motor.
  const N = 60
  const trailGeo = new THREE.BufferGeometry()
  const pos = new Float32Array(N * 3)
  trailGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const trailMat = new THREE.PointsMaterial({ size: 0.12, color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  const trail = new THREE.Points(trailGeo, trailMat)
  scene.add(trail)
  const parts = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, life: 0 }))

  Object.assign(state, { scene, cam, ship: model, pedRing, beamMat, beamCore, trail, trailMat, parts, pos })
  setColors()

  const resize = () => {
    const w = el.clientWidth || 1; const h = el.clientHeight || 1
    renderer!.setSize(w, h, false)
    cam.aspect = w / h
    cam.updateProjectionMatrix()
  }
  ro = new ResizeObserver(resize)
  ro.observe(el)
  resize()

  let spawnI = 0
  const tick = (t: number) => {
    raf = requestAnimationFrame(tick)
    ship.rotation.y = t * 0.0006
    ship.position.y = 0.7 + Math.sin(t * 0.002) * 0.08
    const b = beamDef()
    const phase = (t % 1600) / 1600
    const on = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) : 0
    let color = b.color
    if (b.anim === 'hue') color = new THREE.Color().setHSL((t / 2400) % 1, 0.8, 0.6).getHex()
    beamMat.color.setHex(color); beamCore.color.setHex(b.core || 0xffffff)
    beamMat.opacity = on * 0.75; beamCore.opacity = on

    // Estela en coordenadas de mundo (detrás del motor).
    const td = trailDef()
    trail.visible = !!td?.style
    if (td?.style) {
      trailMat.color.setHex(td.color || 0xffffff)
      trailMat.size = td.style === 'pixel' ? 0.2 : td.style === 'comet' ? 0.16 : 0.1
      const wp = new THREE.Vector3(-17, 0, 0).applyMatrix4(model.matrixWorld)
      const p = parts[spawnI++ % N]
      p.x = wp.x + (Math.random() - 0.5) * 0.1; p.y = wp.y + (Math.random() - 0.5) * 0.1; p.z = wp.z; p.life = 1
      for (let i = 0; i < N; i++) {
        const q = parts[i]
        q.life -= 0.018
        q.y -= td.style === 'comet' ? 0.004 : 0.002
        if (td.style === 'spark') { q.x += (Math.random() - 0.5) * 0.02; q.z += (Math.random() - 0.5) * 0.02 }
        const k = q.life > 0 ? 1 : 0
        pos[i * 3] = td.style === 'pixel' ? Math.round(q.x * 8) / 8 : q.x
        pos[i * 3 + 1] = (td.style === 'pixel' ? Math.round(q.y * 8) / 8 : q.y) * k - (1 - k) * 99
        pos[i * 3 + 2] = q.z
      }
      trailGeo.attributes.position.needsUpdate = true
    }
    renderer!.render(scene, cam)
  }
  raf = requestAnimationFrame(tick)
})

watch(() => props.hull, () => state.ship && setColors())

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  renderer?.dispose()
  renderer?.domElement.remove()
  renderer = null
})
</script>

<template>
  <div ref="host" class="w-full h-full [&>canvas]:w-full [&>canvas]:h-full" />
</template>
