<script setup>
import { computed } from 'vue'
import { gameState } from '../game/gameState.js'
import { bus } from '../game/bus.js'
import { STRUCTURES } from '../game/constants.js'
import { goToLobby } from '../game/appState.js'

const structures = STRUCTURES

const speeds = [
  { label: 'Pausa', value: 0 },
  { label: 'Lenta', value: 0.5 },
  { label: 'Normal', value: 1 },
  { label: 'Rápida', value: 2 },
]

function setSpeed(v) {
  bus.emit('speed', v)
}

function mainMenu() {
  goToLobby()
}

const timeLabel = computed(() => {
  const s = gameState.timeElapsed
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
})

const activeLabel = computed(() => {
  const s = STRUCTURES.find((x) => x.key === gameState.activeBuild)
  return s ? s.label : null
})

const coreHpPct = computed(() =>
  Math.max(0, Math.round((gameState.coreHp / gameState.coreHpMax) * 100))
)

const waveStatus = computed(() => {
  if (gameState.nextWaveIn > 0) {
    return { kind: 'countdown', text: `Oleada ${gameState.wave + 1} en ${gameState.nextWaveIn}s` }
  }
  return { kind: 'active', text: `Oleada ${gameState.wave} · enemigos: ${gameState.enemiesAlive}` }
})

function pick(s) {
  if (gameState.minerals < s.cost) return
  // Toggle off if re-clicking the active tool.
  if (gameState.activeBuild === s.key) bus.emit('cancel')
  else bus.emit('build', s.key)
}

function restart() {
  bus.emit('restart')
}
</script>

<template>
  <div class="absolute inset-0 pointer-events-none text-cyan-100 font-sans">
    <!-- Top bar -->
    <div
      class="absolute top-0 left-0 right-0 flex items-center gap-4 px-3 py-2
             bg-gradient-to-b from-black/70 to-transparent pointer-events-auto"
    >
      <div class="flex gap-1">
        <button
          v-for="sp in speeds"
          :key="sp.label"
          class="hud-btn"
          :class="{ 'hud-btn--active': gameState.speed === sp.value }"
          @click="setSpeed(sp.value)"
        >
          {{ sp.label }}
        </button>
      </div>

      <div class="ml-auto flex items-center gap-5 text-sm">
        <span class="text-cyan-300/80">
          Tiempo <span class="text-white font-semibold tabular-nums">{{ timeLabel }}</span>
        </span>
        <span class="text-emerald-300/80">
          Minerales
          <span class="text-emerald-200 font-semibold tabular-nums">{{ gameState.minerals }}</span>
        </span>
        <span class="text-fuchsia-300/80">
          Oleada
          <span class="text-fuchsia-200 font-semibold">{{ gameState.wave }}/{{ gameState.waveTotal }}</span>
        </span>
      </div>
    </div>

    <!-- Resources panel (top-right under bar) -->
    <div class="absolute top-14 right-3 text-right text-xs space-y-0.5">
      <div class="text-emerald-300/90 tabular-nums">
        {{ gameState.minerals }} / {{ gameState.mineralsCap }} minerales
      </div>
      <div class="text-amber-300/90 tabular-nums">
        {{ gameState.energy }} / {{ gameState.energyMax }} energía
      </div>
    </div>

    <!-- Core integrity + wave status (top-left) -->
    <div class="absolute top-14 left-3 w-52 space-y-1">
      <div class="flex items-center justify-between text-[11px]">
        <span class="text-cyan-300/80">Núcleo</span>
        <span class="tabular-nums" :class="coreHpPct > 30 ? 'text-cyan-200' : 'text-red-400'">{{ coreHpPct }}%</span>
      </div>
      <div class="h-2 rounded-full bg-white/10 overflow-hidden ring-1 ring-cyan-400/20">
        <div
          class="h-full rounded-full transition-[width] duration-200"
          :class="coreHpPct > 50 ? 'bg-cyan-400' : coreHpPct > 25 ? 'bg-amber-400' : 'bg-red-500'"
          :style="{ width: coreHpPct + '%' }"
        ></div>
      </div>
      <div
        class="mt-1 inline-block px-2 py-0.5 rounded text-[11px]"
        :class="waveStatus.kind === 'countdown' ? 'bg-fuchsia-500/15 text-fuchsia-200' : 'bg-red-500/15 text-red-200'"
      >
        {{ waveStatus.text }}
      </div>
    </div>

    <!-- Game over / Victory overlay -->
    <div
      v-if="gameState.status === 'gameover' || gameState.status === 'victory'"
      class="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-auto"
    >
      <div class="text-center px-10 py-8 rounded-2xl bg-[#0a0f1c]/90 ring-1 ring-cyan-400/20">
        <h1
          class="text-4xl font-bold mb-2"
          :class="gameState.status === 'victory' ? 'text-cyan-300' : 'text-red-400'"
        >
          {{ gameState.status === 'victory' ? '¡VICTORIA!' : 'NÚCLEO DESTRUIDO' }}
        </h1>
        <p class="text-cyan-200/70 mb-6 text-sm">
          {{ gameState.status === 'victory'
            ? `Sobreviviste las ${gameState.waveTotal} oleadas en ${timeLabel}.`
            : `Caíste en la oleada ${gameState.wave} de ${gameState.waveTotal}.` }}
        </p>
        <div class="flex gap-3 justify-center">
          <button
            class="px-6 py-2 rounded-lg bg-cyan-400/20 ring-1 ring-cyan-300/50 text-white
                   hover:bg-cyan-400/30 transition-colors"
            @click="restart"
          >
            Jugar de nuevo
          </button>
          <button
            class="px-6 py-2 rounded-lg bg-white/5 ring-1 ring-cyan-400/20 text-cyan-200/80
                   hover:bg-cyan-400/10 hover:text-white transition-colors"
            @click="mainMenu"
          >
            Menú principal
          </button>
        </div>
      </div>
    </div>

    <!-- Paused banner -->
    <div
      v-if="gameState.speed === 0 && gameState.status === 'playing'"
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
             text-3xl font-bold tracking-widest text-cyan-200/70 pointer-events-none"
    >
      ⏸ PAUSA
    </div>

    <!-- Placement hint -->
    <div
      v-if="activeLabel"
      class="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
             bg-cyan-400/15 ring-1 ring-cyan-300/40 text-xs text-cyan-100"
    >
      Colocando <b>{{ activeLabel }}</b> — clic para construir · clic derecho / Esc para cancelar
    </div>

    <!-- Bottom build bar -->
    <div
      class="absolute bottom-0 left-1/2 -translate-x-1/2 mb-3 flex gap-2
             px-3 py-2 rounded-xl bg-black/55 backdrop-blur-sm
             ring-1 ring-cyan-400/20 pointer-events-auto"
    >
      <button
        v-for="s in structures"
        :key="s.key"
        class="build-btn group"
        :class="{
          'build-btn--active': gameState.activeBuild === s.key,
          'build-btn--disabled': gameState.minerals < s.cost,
        }"
        :title="`${s.label} — ${s.cost} min`"
        @click="pick(s)"
      >
        <span class="text-2xl leading-none" :style="{ color: s.css }">{{ s.glyph }}</span>
        <span class="text-[10px] text-cyan-200/70 group-hover:text-cyan-100">{{ s.label }}</span>
        <span class="text-[10px] tabular-nums" :class="gameState.minerals < s.cost ? 'text-red-400/80' : 'text-emerald-300/80'">
          {{ s.cost }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

.hud-btn {
  @apply px-3 py-1 text-xs rounded-md bg-white/5 ring-1 ring-cyan-400/20
         text-cyan-200/80 hover:bg-cyan-400/10 hover:text-white transition-colors;
}
.hud-btn--active {
  @apply bg-cyan-400/20 text-white ring-cyan-300/50;
}
.build-btn {
  @apply flex flex-col items-center justify-center gap-0.5 w-16 h-16 rounded-lg
         bg-white/5 ring-1 ring-cyan-400/20 text-cyan-100
         hover:bg-cyan-400/10 hover:ring-cyan-300/50 active:scale-95 transition-all;
}
.build-btn--active {
  @apply bg-cyan-400/25 ring-cyan-300/70 shadow-[0_0_12px_rgba(108,200,255,0.4)];
}
.build-btn--disabled {
  @apply opacity-40 cursor-not-allowed hover:bg-white/5 hover:ring-cyan-400/20;
}
</style>
