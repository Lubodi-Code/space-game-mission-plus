<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { getAudioPrefs, initUiSound, setMusicVolume, setSfxVolume, sfxUi } from '~/game/sound'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

type Quality = 'auto' | 'high' | 'medium' | 'low'
const qualities: { value: Quality; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
]

const musicVolume = ref(100)
const sfxVolume = ref(100)
const quality = ref<Quality>('auto')
const tutorialReset = ref(false)
const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let lastPreviewAt = -Infinity

onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const prefs = getAudioPrefs()
  musicVolume.value = Math.round(prefs.music * 100)
  sfxVolume.value = Math.round(prefs.sfx * 100)
  try {
    const saved = localStorage.getItem('sgmp_quality')
    if (qualities.some((option) => option.value === saved)) quality.value = saved as Quality
  } catch { /* almacenamiento no disponible */ }
  window.addEventListener('keydown', onWindowKey, true)
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('[data-settings-close]')?.focus()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onWindowKey, true)
  previousFocus?.focus()
})

function onWindowKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    emit('close')
  } else if (event.key === 'Tab' && dialog.value) {
    const controls = Array.from(dialog.value.querySelectorAll<HTMLElement>('button, input'))
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
}

function changeMusic(event: Event) {
  musicVolume.value = Number((event.target as HTMLInputElement).value)
  setMusicVolume(musicVolume.value / 100)
}

function changeSfx(event: Event) {
  sfxVolume.value = Number((event.target as HTMLInputElement).value)
  setSfxVolume(sfxVolume.value / 100)
  const now = performance.now()
  if (now - lastPreviewAt >= 120) {
    initUiSound()
    sfxUi('click')
    lastPreviewAt = now
  }
}

function changeQuality(value: Quality) {
  quality.value = value
  try { localStorage.setItem('sgmp_quality', value) } catch { /* almacenamiento no disponible */ }
}

function resetTutorial() {
  try {
    localStorage.removeItem('sgmp_tutorial_done')
    tutorialReset.value = true
  } catch { /* almacenamiento no disponible */ }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="settings-overlay" @click.self="emit('close')">
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        class="settings-panel"
        @keydown.stop
      >
        <header class="flex items-center justify-between gap-4 border-b border-[#8be9fd]/20 pb-4">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ffcc55]">Preferencias</p>
            <h2 id="settings-title" class="mt-1 text-2xl font-bold text-[#8be9fd]">⚙ Ajustes</h2>
          </div>
          <button data-settings-close type="button" class="settings-close" aria-label="Cerrar ajustes" @click="emit('close')">✕</button>
        </header>

        <div class="mt-5 space-y-6">
          <div class="space-y-4">
            <h3 class="settings-heading">Audio</h3>
            <div>
              <label for="settings-music" class="settings-label"><span>Música</span><output>{{ musicVolume }}%</output></label>
              <input id="settings-music" class="settings-slider" type="range" min="0" max="100" step="1" :value="musicVolume" @input="changeMusic" />
            </div>
            <div>
              <label for="settings-sfx" class="settings-label"><span>Efectos</span><output>{{ sfxVolume }}%</output></label>
              <input id="settings-sfx" class="settings-slider" type="range" min="0" max="100" step="1" :value="sfxVolume" @input="changeSfx" />
            </div>
          </div>

          <div class="border-t border-[#8be9fd]/15 pt-5">
            <h3 id="settings-quality-label" class="settings-heading">Calidad gráfica</h3>
            <div class="mt-3 grid grid-cols-2 gap-2" role="group" aria-labelledby="settings-quality-label">
              <button
                v-for="option in qualities"
                :key="option.value"
                type="button"
                class="settings-choice"
                :class="{ 'settings-choice--active': quality === option.value }"
                :aria-pressed="quality === option.value"
                @click="changeQuality(option.value)"
              >{{ option.label }}</button>
            </div>
            <p class="mt-3 text-xs text-[#ffcc55]">Se aplica al recargar la página</p>
          </div>

          <div class="border-t border-[#8be9fd]/15 pt-5">
            <h3 class="settings-heading">Tutorial</h3>
            <button type="button" class="settings-tutorial mt-3" @click="resetTutorial">Mostrar tutorial de nuevo</button>
            <p v-if="tutorialReset" role="status" class="mt-2 text-xs text-[#8be9fd]">El tutorial aparecerá al empezar la próxima partida.</p>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  background: rgba(2, 5, 12, 0.78);
  backdrop-filter: blur(8px);
}
.settings-panel {
  width: min(100%, 28rem);
  max-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid rgba(139, 233, 253, 0.32);
  border-radius: 1.25rem;
  background: #0a0f1c;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6), 0 0 30px rgba(139, 233, 253, 0.1);
  padding: 1.25rem;
  color: #e5faff;
}
.settings-close, .settings-choice, .settings-tutorial { min-height: 2.75rem; border-radius: 0.65rem; touch-action: manipulation; }
.settings-close { width: 2.75rem; flex: none; background: rgba(255,255,255,0.07); color: #8be9fd; font-size: 1.2rem; }
.settings-heading { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #8be9fd; }
.settings-label { display: flex; justify-content: space-between; margin-bottom: 0.35rem; font-size: 0.95rem; }
.settings-label output { color: #ffcc55; font-variant-numeric: tabular-nums; }
.settings-slider { display: block; width: 100%; height: 2.5rem; accent-color: #8be9fd; cursor: pointer; touch-action: pan-y; }
.settings-choice { background: rgba(255,255,255,0.05); border: 1px solid rgba(139,233,253,0.25); color: #c7e8ef; font-weight: 600; }
.settings-choice--active { background: rgba(139,233,253,0.18); border-color: #8be9fd; color: #fff; }
.settings-tutorial { width: 100%; border: 1px solid rgba(255,204,85,0.45); background: rgba(255,204,85,0.1); color: #ffcc55; font-weight: 600; }
.settings-close:hover, .settings-choice:hover, .settings-tutorial:hover { filter: brightness(1.2); }
:where(button, input):focus-visible { outline: 2px solid #ffcc55; outline-offset: 3px; }
@media (max-height: 520px) { .settings-panel { padding: 1rem; } .settings-panel .mt-5 { margin-top: 0.75rem; } .settings-panel .space-y-6 > :not(:first-child) { margin-top: 0.75rem; } }
</style>
