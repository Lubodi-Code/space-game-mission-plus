<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { gameState } from '../game/gameState.js'
import { bus } from '../game/bus.js'
import { STRUCTURES, SPEED } from '../game/constants.js'
import { goToLobby } from '../game/appState.js'
import { getUpgradesFor } from '../game/structures/upgrades.js'

const structures = STRUCTURES

const generalTooltip = {
  label: 'General',
  desc: 'Tu comandante. Clic para mover, clic en meteorito para recolectar, dispara automáticamente a enemigos cercanos. Cerca de estructuras dispara y recolecta más rápido.',
  role: 'general',
  css: '#8be9fd',
}

const speedLabels = ['Pausa', 'Lenta', 'Normal', 'Rápida']
const speeds = SPEED.steps.map((v, i) => ({ label: speedLabels[i] || v, value: v }))

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

const energyLabel = computed(() => `${Math.round(gameState.energy)} / ${gameState.energyMax}`)
const brownout = computed(() => gameState.energy < 1)

const waveStatus = computed(() => {
  if (gameState.nextWaveIn > 0) {
    return { kind: 'countdown', text: `Oleada ${gameState.wave + 1} en ${gameState.nextWaveIn}s` }
  }
  return { kind: 'active', text: `Oleada ${gameState.wave} · enemigos: ${gameState.enemiesAlive}` }
})

// Core damage vignette flash.
const vignetteActive = ref(false)
let vignetteTimer = null
watch(() => gameState.coreHp, (newVal, oldVal) => {
  if (newVal < oldVal) {
    vignetteActive.value = true
    if (vignetteTimer) clearTimeout(vignetteTimer)
    vignetteTimer = setTimeout(() => { vignetteActive.value = false }, 250)
  }
})

// ---- Selection / inspection panel
const selectedStructure = ref(null)
const offSelect = bus.on('select', (payload) => {
  selectedStructure.value = payload
})
onUnmounted(() => offSelect())

const availableUpgrades = computed(() => {
  const s = selectedStructure.value
  if (!s) return []
  return getUpgradesFor(s.role, s.upgrades || [])
})

const generalAvailableUpgrades = computed(() =>
  getUpgradesFor('general', gameState.generalUpgrades)
)

function applyGeneralUpgrade(id) {
  bus.emit('upgradeGeneral', id)
}

function toggleFireMode() {
  const s = selectedStructure.value
  if (!s) return
  const newMode = s.fireMode === 'focus' ? 'auto' : 'focus'
  bus.emit('fireMode', { structureId: s.id, mode: newMode })
}

function applyUpgrade(upgradeId) {
  const s = selectedStructure.value
  if (!s) return
  bus.emit('upgrade', { structureId: s.id, upgradeId })
}

function demolish() {
  const s = selectedStructure.value
  if (!s || s.role === 'core') return
  bus.emit('demolish', { structureId: s.id })
  selectedStructure.value = null
}

// Wave banner.
const waveBanner = ref(null)
let waveBannerTimer = null
watch(() => gameState.wave, (newVal, oldVal) => {
  if (newVal > 0) {
    if (waveBannerTimer) clearTimeout(waveBannerTimer)
    const isBoss = gameState.bossWave
    const text = isBoss ? `⚠ OLEADA ${newVal} — JEFE` : `OLEADA ${newVal}`
    waveBanner.value = { text, isBoss }
    waveBannerTimer = setTimeout(() => { waveBanner.value = null }, 1800)
  }
})

// Tooltip state.
const hoveredStructure = ref(null)
const tooltipPos = ref({ x: 0, y: 0 })
function showTooltip(s, event) {
  hoveredStructure.value = s
  const rect = event.target.closest('button').getBoundingClientRect()
  tooltipPos.value = { x: rect.left + rect.width / 2, y: rect.top - 8 }
}
function hideTooltip() {
  hoveredStructure.value = null
}
const tooltipStyle = computed(() => {
  if (!hoveredStructure.value) return {}
  return {
    left: tooltipPos.value.x + 'px',
    top: tooltipPos.value.y + 'px',
  }
})

function pick(s) {
  if (gameState.minerals < s.cost) return
  if (gameState.activeBuild === s.key) bus.emit('cancel')
  else bus.emit('build', s.key)
}

function pickGeneral() {
  if (gameState.generalMode === 'selected') bus.emit('cancel')
  else bus.emit('selectGeneral')
}

function restart() {
  bus.emit('restart')
}

// Puntos de un polígono regular para el icono SVG de cada estructura.
function polyPoints(sides, radius) {
  const pts = []
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2
    pts.push(`${12 + Math.cos(a) * radius},${12 + Math.sin(a) * radius}`)
  }
  return pts.join(' ')
}
</script>

<template>
  <div class="absolute inset-0 z-20 pointer-events-none text-cyan-100 font-sans">
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
      <div class="tabular-nums" :class="brownout ? 'text-red-400 font-semibold' : 'text-amber-300/90'">
        {{ energyLabel }} energía
      </div>
      <div v-if="brownout" class="text-red-400 font-semibold animate-pulse">
        ⚠ SIN ENERGÍA — torretas apagadas
      </div>
    </div>

    <!-- Core integrity + wave status (top-left) -->
    <div class="absolute top-14 left-3 w-56 space-y-1.5 p-2.5 rounded-xl bg-[#0a0f1c]/60 backdrop-blur-sm ring-1 ring-cyan-400/20">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24">
          <polygon
            :points="polyPoints(6, 10)"
            fill="#8be9fd"
            stroke="rgba(255,255,255,0.9)"
            stroke-width="1.2"
            :class="coreHpPct <= 25 ? 'animate-pulse' : ''"
          />
        </svg>
        <div class="flex-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-cyan-300/80 font-semibold tracking-wide">Nexo</span>
            <span class="tabular-nums font-bold" :class="coreHpPct > 30 ? 'text-cyan-200' : 'text-red-400'">{{ coreHpPct }}%</span>
          </div>
          <div class="h-2.5 rounded-full bg-white/10 overflow-hidden ring-1 ring-cyan-400/30 mt-1">
            <div
              class="h-full rounded-full transition-[width] duration-200"
              :class="coreHpPct > 50 ? 'bg-cyan-400 shadow-[0_0_10px_rgba(139,233,253,0.5)]' : coreHpPct > 25 ? 'bg-amber-400' : 'bg-red-500 animate-pulse'"
              :style="{ width: coreHpPct + '%' }"
            ></div>
          </div>
        </div>
      </div>
      <div
        class="mt-1 inline-block px-2 py-0.5 rounded text-[11px]"
        :class="waveStatus.kind === 'countdown' ? 'bg-fuchsia-500/15 text-fuchsia-200' : 'bg-red-500/15 text-red-200'"
      >
        {{ waveStatus.text }}
      </div>

      <!-- General status (below wave) -->
      <div v-if="gameState.general.alive" class="mt-1 text-xs flex items-center gap-1 text-cyan-300/80">
        <span>General</span>
        <span class="tabular-nums" :class="gameState.general.hp > 40 ? 'text-cyan-200' : 'text-red-400'">
          {{ gameState.general.hp }}/{{ gameState.general.hpMax }}
        </span>
      </div>
      <div v-else class="mt-1 text-xs text-red-400/90 animate-pulse">
        ⚠ General caído — reaparece en {{ gameState.general.respawnIn }}s
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

    <!-- Core damage vignette -->
    <div
      v-if="vignetteActive"
      class="absolute inset-0 pointer-events-none"
      style="background: radial-gradient(ellipse at center, transparent 50%, rgba(255,0,0,0.3) 100%); transition: opacity 0.25s;"
    ></div>

    <!-- Wave / Boss banner -->
    <div
      v-if="waveBanner"
      class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
    >
      <div
        class="px-8 py-3 rounded-xl text-2xl font-bold tracking-wider text-center"
        :class="waveBanner.isBoss ? 'bg-red-900/40 text-red-300 ring-2 ring-red-500/60' : 'bg-cyan-900/40 text-cyan-200 ring-2 ring-cyan-400/40'"
        style="text-shadow: 0 0 20px currentColor; animation: fadeInOut 1.8s ease-out;"
      >
        {{ waveBanner.text }}
      </div>
    </div>

    <!-- Placement hint -->
    <div
      v-if="activeLabel"
      class="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
             bg-cyan-400/15 ring-1 ring-cyan-300/40 text-xs text-cyan-100"
    >
      Colocando <b>{{ activeLabel }}</b> — clic para construir · clic derecho / Esc para cancelar
    </div>
    <div
      v-if="gameState.generalMode === 'selected'"
      class="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
             bg-cyan-400/15 ring-1 ring-cyan-300/40 text-xs text-cyan-100"
    >
      General seleccionado — clic para mover / clic en meteorito para recolectar · derecho / Esc para cancelar
    </div>

    <!-- Inspection panel (right side) -->
    <div
      v-if="selectedStructure"
      class="absolute top-28 right-3 w-56 p-3 rounded-xl bg-[#0a0f1c]/90 backdrop-blur-sm
             ring-1 ring-cyan-400/20 pointer-events-auto text-xs space-y-2"
    >
      <div class="font-bold text-sm" style="color: #6cc8ff">{{ selectedStructure.label }}</div>

      <!-- Estado: building / powered -->
      <div v-if="selectedStructure.building" class="text-cyan-400/70">Construyendo...</div>
      <div v-else-if="!selectedStructure.powered" class="text-red-400/70">Sin señal</div>

      <!-- Stats contextuales -->
      <div class="text-cyan-200/70 space-y-0.5">
        <div v-if="selectedStructure.stats.hp !== null || selectedStructure.hp !== undefined">
          HP: {{ Math.round(selectedStructure.hp || 0) }} / {{ selectedStructure.maxHp }}
        </div>
        <div v-if="selectedStructure.stats.damage !== null">
          Daño: {{ selectedStructure.stats.damage }}
          <span v-if="selectedStructure.stats.splash">· Área: {{ selectedStructure.stats.splash }}</span>
        </div>
        <div v-if="selectedStructure.stats.atkRange !== null">
          Alcance: {{ selectedStructure.stats.atkRange }}
        </div>
        <div v-if="selectedStructure.stats.cooldown !== null">
          Velocidad: {{ (1000 / selectedStructure.stats.cooldown).toFixed(1) }}/s
        </div>
        <div v-if="selectedStructure.stats.energyDrain !== null && selectedStructure.stats.energyDrain > 0">
          Energía/disparo: {{ selectedStructure.stats.energyDrain }}
        </div>
        <div v-if="selectedStructure.stats.rate !== null">
          Tasa mina: {{ selectedStructure.stats.rate }}/s
        </div>
        <div v-if="selectedStructure.stats.energyRate !== null">
          Energía/s: {{ selectedStructure.stats.energyRate }}
        </div>
        <div v-if="selectedStructure.stats.miningRange !== null">
          Rango mina: {{ selectedStructure.stats.miningRange }}
        </div>
        <div v-if="selectedStructure.stats.healRate !== null">
          Cura: {{ selectedStructure.stats.healRate }}/s · {{ selectedStructure.stats.maxSpheres }} esferas
        </div>
        <div v-if="selectedStructure.stats.energyCap !== null">
          Cap energía extra: {{ selectedStructure.stats.energyCap }}
        </div>
        <div v-if="selectedStructure.stats.capBonus !== null">
          Cap mineral extra: {{ selectedStructure.stats.capBonus }}
        </div>
        <div v-if="selectedStructure.stats.range !== null">
          Alcance red: {{ selectedStructure.stats.range }}
        </div>
      </div>

      <!-- Fire mode toggle (solo torretas) -->
      <div v-if="selectedStructure.role === 'turret' || selectedStructure.role === 'missile'" class="pt-1 border-t border-cyan-400/10">
        <div class="flex gap-2 items-center">
          <button
            class="px-2 py-1 rounded text-[11px] ring-1 transition-colors"
            :class="selectedStructure.fireMode === 'auto'
              ? 'bg-cyan-400/20 text-white ring-cyan-300/50'
              : 'bg-white/5 text-cyan-200/60 ring-cyan-400/20'"
            @click="toggleFireMode"
          >
            Automático
          </button>
          <button
            class="px-2 py-1 rounded text-[11px] ring-1 transition-colors"
            :class="selectedStructure.fireMode === 'focus'
              ? 'bg-cyan-400/20 text-white ring-cyan-300/50'
              : 'bg-white/5 text-cyan-200/60 ring-cyan-400/20'"
            @click="toggleFireMode"
          >
            Fijar blanco
          </button>
        </div>
        <div v-if="selectedStructure.fireMode === 'focus'" class="mt-1 text-cyan-400/60 text-[10px]">
          Clic en un enemigo para fijar como blanco
        </div>
      </div>

      <!-- Mejoras disponibles (solo torretas) -->
      <div v-if="availableUpgrades.length" class="pt-1 border-t border-cyan-400/10 space-y-1">
        <div class="text-cyan-300/80 text-[11px] font-semibold">Mejoras</div>
        <div
          v-for="u in availableUpgrades"
          :key="u.id"
          class="flex items-center justify-between px-2 py-1 rounded bg-white/5 ring-1 ring-cyan-400/10"
        >
          <span class="text-cyan-100/80 text-[10px]">{{ u.label }}</span>
          <span class="flex items-center gap-1">
            <span class="text-amber-300/70 text-[10px] tabular-nums">{{ u.cost }}</span>
            <button
              class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-400/15 text-emerald-200
                     hover:bg-emerald-400/25 transition-colors"
              :disabled="gameState.minerals < u.cost"
              :class="{ 'opacity-40 cursor-not-allowed': gameState.minerals < u.cost }"
              @click="applyUpgrade(u.id)"
            >
              +Añadir
            </button>
          </span>
        </div>
      </div>

      <!-- Demoler (cualquier estructura menos el núcleo) -->
      <div v-if="selectedStructure.role !== 'core'" class="pt-1 border-t border-cyan-400/10">
        <button
          class="w-full px-2 py-1 rounded text-[11px] ring-1 ring-red-400/30 bg-red-500/15
                 text-red-200 hover:bg-red-500/25 transition-colors"
          @click="demolish"
        >
          Demoler · recuperás 50%
        </button>
      </div>
    </div>

    <!-- General upgrades panel (right side) -->
    <div
      v-if="gameState.generalMode === 'selected'"
      class="absolute top-28 right-3 w-56 p-3 rounded-xl bg-[#0a0f1c]/90 backdrop-blur-sm
             ring-1 ring-cyan-400/20 pointer-events-auto text-xs space-y-2"
    >
      <div class="font-bold text-sm" style="color: #8be9fd">General</div>
      <div class="text-cyan-200/70 space-y-0.5">
        <div>HP: {{ gameState.general.hp }}/{{ gameState.general.hpMax }}</div>
        <div>Daño: {{ gameState.general.damage || 8 }}</div>
        <div>Alcance: {{ gameState.general.atkRange || 160 }}</div>
        <div>Recolección: {{ Math.round((gameState.general.collectRate || 18) * 10) / 10 }}/s</div>
      </div>

      <div v-if="generalAvailableUpgrades.length" class="pt-1 border-t border-cyan-400/10 space-y-1">
        <div class="text-cyan-300/80 text-[11px] font-semibold">Mejoras</div>
        <div
          v-for="u in generalAvailableUpgrades"
          :key="u.id"
          class="flex items-center justify-between px-2 py-1 rounded bg-white/5 ring-1 ring-cyan-400/10"
        >
          <span class="text-cyan-100/80 text-[10px]">{{ u.label }}</span>
          <span class="flex items-center gap-1">
            <span class="text-amber-300/70 text-[10px] tabular-nums">{{ u.cost }}</span>
            <button
              class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-400/15 text-emerald-200
                     hover:bg-emerald-400/25 transition-colors"
              :disabled="gameState.minerals < u.cost"
              :class="{ 'opacity-40 cursor-not-allowed': gameState.minerals < u.cost }"
              @click="applyGeneralUpgrade(u.id)"
            >
              +Añadir
            </button>
          </span>
        </div>
      </div>
      <div v-else class="text-cyan-400/50 text-[10px]">No hay más mejoras disponibles.</div>
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
        @mouseenter="showTooltip(s, $event)"
        @mousemove="(e) => { tooltipPos.x = e.clientX; tooltipPos.y = e.clientY - 8 }"
        @mouseleave="hideTooltip"
        @click="pick(s)"
      >
        <svg class="w-6 h-6" viewBox="0 0 24 24">
          <polygon
            :points="polyPoints(s.sides, s.size)"
            :fill="s.css"
            stroke="rgba(255,255,255,0.85)"
            stroke-width="1.2"
            opacity="0.95"
          />
        </svg>
        <span class="text-[10px] text-cyan-200/70 group-hover:text-cyan-100">{{ s.label }}</span>
        <span class="text-[10px] tabular-nums" :class="gameState.minerals < s.cost ? 'text-red-400/80' : 'text-emerald-300/80'">
          {{ s.cost }}
        </span>
      </button>

      <div class="w-px h-10 bg-cyan-400/20 mx-1"></div>

      <button
        class="build-btn group"
        :class="{ 'build-btn--active': gameState.generalMode === 'selected' }"
        @mouseenter="hoveredStructure = generalTooltip"
        @mousemove="(e) => { tooltipPos.x = e.clientX; tooltipPos.y = e.clientY - 8 }"
        @mouseleave="hideTooltip"
        @click="pickGeneral"
      >
        <span class="text-2xl leading-none" style="color: #8be9fd">✦</span>
        <span class="text-[10px] text-cyan-200/70 group-hover:text-cyan-100">General</span>
        <span class="text-[10px] tabular-nums text-emerald-300/80">Comandante</span>
      </button>
    </div>

    <!-- Tooltip -->
    <div
      v-if="hoveredStructure"
      class="fixed z-50 pointer-events-none px-3 py-2 rounded-lg bg-[#0a0f1c]/95 ring-1 ring-cyan-400/30 text-xs
             text-cyan-100 shadow-lg"
      :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px', transform: 'translate(-50%, -100%)' }"
    >
      <div class="font-bold text-sm mb-1" :style="{ color: hoveredStructure.css }">{{ hoveredStructure.label }}</div>
      <div class="text-cyan-200/70 mb-1">{{ hoveredStructure.desc }}</div>
      <div class="text-cyan-300/50 space-y-0.5">
        <div v-if="hoveredStructure.role === 'turret' || hoveredStructure.role === 'missile'">
          Daño: {{ hoveredStructure.damage }} · Alcance: {{ hoveredStructure.atkRange }}
        </div>
        <div v-if="hoveredStructure.role === 'turret'">
          Velocidad: {{ (1000 / hoveredStructure.cooldown).toFixed(1) }}/s
        </div>
        <div v-if="hoveredStructure.role === 'missile'">
          Velocidad: {{ (1000 / hoveredStructure.cooldown).toFixed(1) }}/s · Área: {{ hoveredStructure.splash }}
        </div>
        <div v-if="hoveredStructure.role === 'collector'">
          Tasa: {{ hoveredStructure.rate }}/s · Rango mina: {{ hoveredStructure.miningRange }}
        </div>
        <div v-if="hoveredStructure.role === 'battery'">
          Cap extra: {{ hoveredStructure.capBonus }}
        </div>
        <div v-if="hoveredStructure.role === 'healer'">
          Cura: {{ hoveredStructure.healRate }}/s · Esferas: {{ hoveredStructure.maxSpheres }}
        </div>
        <div v-if="hoveredStructure.role === 'relay'">
          Alcance red: {{ hoveredStructure.range }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

@keyframes fadeInOut {
  0% { opacity: 0; transform: translateY(8px); }
  15% { opacity: 1; transform: translateY(0); }
  70% { opacity: 1; }
  100% { opacity: 0; }
}

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
