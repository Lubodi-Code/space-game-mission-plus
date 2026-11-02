<script setup>
// Animación de victoria (~3.6 s): destello, onda de choque, fuegos artificiales,
// texto de sector y naves en formación. Solo lee gameState/appState (Vue no llama a Phaser).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { gameState } from '~/game/gameState'
import { appState } from '~/game/appState'
import { sectorByN } from '~/game/meta/sectors'

const DURACION = 3600 // ms hasta que empieza el desvanecido final
const FADE = 600

const canvas = ref(null)
const activo = ref(true) // false = terminada: se desmonta el contenido y no bloquea clics
const saliendo = ref(false)
const reducido = ref(false)

const sectorNombre = computed(() => {
  const s = sectorByN(appState.sector)
  return s && s.name ? s.name : ''
})

const COLORES = ['#8be9fd', '#ffaa44', '#49e07a', '#ff5ad9']
let raf = 0
let tFin = 0
let tQuitar = 0
let parts = []
let w = 0
let h = 0
let dpr = 1
let ultimo = 0
let proxRafaga = 0

function rafaga(ctxW, ctxH) {
  const cx = ctxW * (0.2 + Math.random() * 0.6)
  const cy = ctxH * (0.15 + Math.random() * 0.45)
  const color = COLORES[(Math.random() * COLORES.length) | 0]
  const n = 40
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2
    const v = 90 + Math.random() * 220
    parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 0, max: 0.9 + Math.random() * 0.8, color, r: 1.2 + Math.random() * 1.8 })
  }
}

function ajustar() {
  const c = canvas.value
  if (!c) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = window.innerWidth
  h = window.innerHeight
  c.width = Math.floor(w * dpr)
  c.height = Math.floor(h * dpr)
}

function bucle(t) {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  const dt = Math.min((t - ultimo) / 1000, 0.05)
  ultimo = t
  const el = t - tIni
  // Ráfagas escalonadas (3 partículas*40 = ~120-200 vivas a la vez)
  if (el < DURACION - 600 && t >= proxRafaga && parts.length < 200) {
    rafaga(w, h)
    proxRafaga = t + 380 + Math.random() * 220
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    p.vida += dt
    if (p.vida >= p.max) { parts.splice(i, 1); continue }
    p.vy += 140 * dt // gravedad suave
    p.vx *= 0.985
    p.x += p.vx * dt
    p.y += p.vy * dt
    const k = 1 - p.vida / p.max
    ctx.globalAlpha = k
    ctx.fillStyle = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * (0.5 + k * 0.5), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  raf = requestAnimationFrame(bucle)
}

let tIni = 0

function saltar() {
  if (!activo.value || saliendo.value) return
  saliendo.value = true
  clearTimeout(tFin)
  tQuitar = setTimeout(terminar, FADE)
}

function terminar() {
  activo.value = false
  cancelAnimationFrame(raf)
  raf = 0
}

onMounted(() => {
  reducido.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  tFin = setTimeout(saltar, reducido.value ? 2200 : DURACION)
  if (reducido.value) return
  ajustar()
  window.addEventListener('resize', ajustar)
  tIni = performance.now()
  ultimo = tIni
  proxRafaga = tIni + 500 // tras el destello
  raf = requestAnimationFrame(bucle)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearTimeout(tFin)
  clearTimeout(tQuitar)
  window.removeEventListener('resize', ajustar)
})
</script>

<template>
  <div
    v-if="activo"
    class="vfx"
    :class="{ 'vfx-out': saliendo, 'vfx-reduced': reducido }"
    @click="saltar"
  >
    <template v-if="!reducido">
      <div class="vfx-flash" />
      <div class="vfx-ring" />
      <div class="vfx-ring vfx-ring2" />
      <canvas ref="canvas" class="vfx-canvas" />
      <svg class="vfx-ship vfx-ship-a" viewBox="0 0 60 30" width="70" height="35" aria-hidden="true">
        <path d="M2 15 L26 4 L58 15 L26 26 Z M26 4 L20 15 L26 26" fill="none" stroke="#8be9fd" stroke-width="2" stroke-linejoin="round" />
      </svg>
      <svg class="vfx-ship vfx-ship-b" viewBox="0 0 60 30" width="52" height="26" aria-hidden="true">
        <path d="M2 15 L26 4 L58 15 L26 26 Z M26 4 L20 15 L26 26" fill="none" stroke="#ff5ad9" stroke-width="2" stroke-linejoin="round" />
      </svg>
      <svg class="vfx-ship vfx-ship-c" viewBox="0 0 60 30" width="52" height="26" aria-hidden="true">
        <path d="M2 15 L26 4 L58 15 L26 26 Z M26 4 L20 15 L26 26" fill="none" stroke="#49e07a" stroke-width="2" stroke-linejoin="round" />
      </svg>
    </template>
    <div class="vfx-text">
      <div class="vfx-title">SECTOR DESPEJADO</div>
      <div v-if="sectorNombre" class="vfx-sector">{{ sectorNombre }}</div>
      <div class="vfx-wave">{{ gameState.waveTotal }} oleadas superadas</div>
    </div>
  </div>
</template>

<style scoped>
.vfx {
  position: absolute;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  background: rgba(2, 6, 14, 0.82);
  pointer-events: auto;
  cursor: pointer;
  transition: opacity 0.6s ease;
}
.vfx-out { opacity: 0; pointer-events: none; }
.vfx-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

.vfx-flash {
  position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 20%, #e8ffff 45%, #8be9fd 55%, transparent 80%);
  transform: translateX(-100%);
  animation: vfx-sweep 0.7s ease-out forwards;
  pointer-events: none;
}
@keyframes vfx-sweep {
  0% { transform: translateX(-100%); opacity: 0.95; }
  100% { transform: translateX(100%); opacity: 0; }
}

.vfx-ring {
  position: absolute; left: 50%; top: 50%;
  width: 40px; height: 40px; margin: -20px 0 0 -20px;
  border-radius: 50%;
  border: 3px solid #8be9fd;
  box-shadow: 0 0 24px #8be9fd, inset 0 0 24px #8be9fd;
  opacity: 0;
  animation: vfx-ring 1.4s ease-out 0.1s forwards;
  pointer-events: none;
}
.vfx-ring2 { animation-delay: 0.35s; border-color: #ff5ad9; box-shadow: 0 0 24px #ff5ad9, inset 0 0 24px #ff5ad9; }
@keyframes vfx-ring {
  0% { transform: scale(0.2); opacity: 0.9; }
  100% { transform: scale(38); opacity: 0; }
}

.vfx-text {
  position: absolute; left: 0; right: 0; top: 38%;
  text-align: center; pointer-events: none;
  animation: vfx-pop 0.9s cubic-bezier(0.2, 1.4, 0.4, 1) 0.4s both;
}
.vfx-title {
  position: relative;
  display: inline-block;
  font-size: clamp(1.8rem, 6vw, 4rem);
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #e8ffff;
  text-shadow: 0 0 12px #8be9fd, 0 0 32px #8be9fd;
  background: linear-gradient(100deg, #e8ffff 40%, #ffffff 50%, #e8ffff 60%) no-repeat;
  background-size: 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: vfx-shine 1.4s ease-out 1.2s both;
}
.vfx-sector { margin-top: 0.4rem; color: #ffaa44; letter-spacing: 0.3em; text-transform: uppercase; font-size: clamp(0.7rem, 2vw, 1rem); text-shadow: 0 0 10px #ffaa44; }
.vfx-wave { margin-top: 0.6rem; color: #49e07a; font-size: clamp(0.85rem, 2.4vw, 1.2rem); text-shadow: 0 0 10px #49e07a; animation: vfx-fade 0.6s ease-out 1.2s both; }
@keyframes vfx-pop {
  0% { opacity: 0; transform: scale(0.4); filter: brightness(3); }
  100% { opacity: 1; transform: scale(1); filter: brightness(1); }
}
@keyframes vfx-shine {
  0% { background-position: 150% 0; }
  100% { background-position: -50% 0; }
}
@keyframes vfx-fade { from { opacity: 0; } to { opacity: 1; } }

.vfx-ship { position: absolute; left: -120px; filter: drop-shadow(0 0 6px currentColor); pointer-events: none; animation: vfx-fly 2.4s ease-in-out both; }
.vfx-ship-a { top: 22%; animation-delay: 0.9s; }
.vfx-ship-b { top: 27%; animation-delay: 1.05s; }
.vfx-ship-c { top: 17%; animation-delay: 1.05s; }
@keyframes vfx-fly {
  0% { transform: translateX(0); }
  100% { transform: translateX(calc(100vw + 240px)); }
}

/* Movimiento reducido: solo desvanecido del texto */
.vfx-reduced .vfx-text { animation: vfx-fade 0.8s ease-out both; }
.vfx-reduced .vfx-title { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .vfx-text, .vfx-wave { animation: vfx-fade 0.8s ease-out both; }
  .vfx-title { animation: none; }
}
</style>
