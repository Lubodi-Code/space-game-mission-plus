<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { gameState } from '~/game/gameState'

const props = defineProps<{ solo: boolean }>()

const STORAGE_KEY = 'sgmp_tutorial_done'
const steps = [
  { title: '¡Bienvenido, comandante!', text: 'Defendé el Núcleo durante 10 oleadas. Si cae, termina la partida.', selector: '.hud-core' },
  { title: 'Recolectores', text: 'Construí Recolectores cerca de meteoritos para conseguir minerales y energía.', selector: '.hud-buildbar' },
  { title: 'Nodos y energía', text: 'La energía viaja por Nodos desde el Núcleo. Lo que queda sin conexión se apaga.', selector: '.hud-buildbar', label: 'Nodo' },
  { title: 'Torretas', text: 'Construí una Torreta Láser. Tocá un edificio para ver su árbol de mejoras.', selector: '.hud-buildbar', label: 'Láser' },
  { title: 'Comandante', text: 'Seleccioná al General para moverlo. Recolecta meteoritos y dispara solo.', selector: '.hud-buildbar', label: 'General' },
  { title: 'Habilidades y oleadas', text: 'Usá las habilidades y «¡Oleada ya!» para acelerar. El Mega Rayo se apunta a una nave enemiga.', selector: '.ability-bar' },
] as const

const ready = ref(false)
const done = ref(false)
const step = ref(0)
const highlight = ref<{ top: number; left: number; width: number; height: number } | null>(null)
const visible = computed(() => ready.value && props.solo && !done.value)
let frame = 0

function updateHighlight() {
  frame = 0
  if (!visible.value) {
    highlight.value = null
    return
  }
  const current = steps[step.value]
  let target: Element | null = document.querySelector(current.selector)
  if ('label' in current && target) {
    target = [...target.querySelectorAll('button')].find((button) =>
      button.textContent?.includes(current.label),
    ) ?? null
  }
  const rect = target?.getBoundingClientRect()
  if (!rect || !rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
    highlight.value = null
    return
  }
  highlight.value = {
    top: Math.max(0, rect.top - 5),
    left: Math.max(0, rect.left - 5),
    width: Math.min(window.innerWidth, rect.right + 5) - Math.max(0, rect.left - 5),
    height: Math.min(window.innerHeight, rect.bottom + 5) - Math.max(0, rect.top - 5),
  }
}

function scheduleHighlight() {
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(updateHighlight)
}

function finish() {
  done.value = true
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // The tutorial still closes when storage is unavailable.
  }
}

function next() {
  if (step.value === steps.length - 1) finish()
  else step.value += 1
}

function back() {
  if (step.value > 0) step.value -= 1
}

watch(() => gameState.activeBuild, (build) => {
  if (visible.value && step.value === 1 && build === 'collector') next()
})
watch([visible, step, () => gameState.status], async () => {
  await nextTick()
  scheduleHighlight()
})

onMounted(() => {
  try {
    done.value = localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    done.value = false
  }
  ready.value = true
  window.addEventListener('resize', scheduleHighlight)
  window.addEventListener('scroll', scheduleHighlight, true)
  scheduleHighlight()
})
onUnmounted(() => {
  if (frame) cancelAnimationFrame(frame)
  window.removeEventListener('resize', scheduleHighlight)
  window.removeEventListener('scroll', scheduleHighlight, true)
})
</script>

<template>
  <div v-if="visible" class="tutorial-overlay" aria-live="polite">
    <div v-if="highlight" class="tutorial-ring" :style="{
      top: `${highlight.top}px`, left: `${highlight.left}px`,
      width: `${highlight.width}px`, height: `${highlight.height}px`,
    }" aria-hidden="true" />

    <section class="tutorial-card" :class="{ 'tutorial-card--centered': !highlight }" aria-label="Tutorial de primera partida">
      <div class="tutorial-count">GUÍA RÁPIDA · {{ step + 1 }} / {{ steps.length }}</div>
      <h2>{{ steps[step].title }}</h2>
      <p>{{ steps[step].text }}</p>
      <div class="tutorial-actions">
        <button v-if="step > 0" type="button" class="tutorial-back" @click="back">Atrás</button>
        <button type="button" class="tutorial-next" @click="next">{{ step === steps.length - 1 ? 'Terminar' : 'Siguiente' }}</button>
      </div>
      <button type="button" class="tutorial-skip" @click="finish">Saltar tutorial</button>
    </section>
  </div>
</template>

<style scoped>
.tutorial-overlay { position: fixed; inset: 0; z-index: 60; pointer-events: none; color: #e6faff; font-family: sans-serif; }
.tutorial-ring { position: fixed; border: 2px solid #8be9fd; border-radius: 14px; box-shadow: 0 0 0 4px #8be9fd33, 0 0 24px #8be9fd88; animation: tutorial-pulse 2s ease-in-out infinite; pointer-events: none; }
.tutorial-card { position: fixed; left: max(16px, env(safe-area-inset-left)); bottom: calc(7rem + env(safe-area-inset-bottom)); width: min(340px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 18px; border: 1px solid #8be9fd77; border-radius: 18px; background: #0a0f1ce8; box-shadow: 0 16px 48px #0009, 0 0 26px #8be9fd22; backdrop-filter: blur(10px); pointer-events: auto; }
.tutorial-card--centered { top: 50%; left: 50%; bottom: auto; transform: translate(-50%, -50%); }
.tutorial-count { color: #ffcc55; font-size: 11px; font-weight: 700; letter-spacing: .12em; }
h2 { margin: 8px 0 5px; color: #8be9fd; font-size: 20px; font-weight: 750; line-height: 1.2; }
p { margin: 0; color: #e6faff; font-size: 14px; line-height: 1.45; }
.tutorial-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 17px; }
button { min-height: 44px; padding: 0 15px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; touch-action: manipulation; }
.tutorial-back { border: 1px solid #8be9fd77; color: #8be9fd; background: #8be9fd16; }
.tutorial-next { color: #0a0f1c; background: #ffcc55; }
.tutorial-skip { display: block; width: 100%; margin-top: 7px; color: #c4d6dd; background: transparent; font-weight: 500; text-decoration: underline; }
button:focus-visible { outline: 2px solid #8be9fd; outline-offset: 3px; }
@keyframes tutorial-pulse { 50% { box-shadow: 0 0 0 8px #8be9fd11, 0 0 34px #8be9fdcc; } }
@media (max-width: 700px), (pointer: coarse) and (max-height: 520px) {
  .tutorial-card { top: calc(9rem + env(safe-area-inset-top)); bottom: auto; left: max(10px, env(safe-area-inset-left)); width: min(340px, calc(100vw - 20px)); max-height: calc(100dvh - 16rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)); padding: 14px; }
  .tutorial-card--centered { top: 50%; left: 50%; max-height: calc(100dvh - 24px); }
}
@media (max-height: 520px) {
  .tutorial-card { top: calc(2.5rem + env(safe-area-inset-top)); max-height: calc(100dvh - 7rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }
  .tutorial-card--centered { top: 50%; max-height: calc(100dvh - 24px); }
}
@media (prefers-reduced-motion: reduce) { .tutorial-ring { animation: none; } }
</style>
