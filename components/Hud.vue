<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { gameState } from '~/game/gameState'
import { bus } from '~/game/bus'
import { STRUCTURES, SPEED } from '~/game/constants'
import { goToLobby } from '~/game/appState'
import { buildUpgradeTree } from '~/game/structures/upgrades'
import '~/game/meta/research'
import { ABILITIES } from '~/game/systems/abilities'
import { sectorByN } from '~/game/meta/sectors'
import { levelFromXp, profile } from '~/game/meta/profile'
import { appState } from '~/game/appState'
import { IS_TOUCH } from '~/game/quality'
import { EnemyType, REGISTRY } from '~/game/enemies/EnemyType'

// Mapeo de tipos de enemigos a nombres legibles
const ENEMY_LABELS = {
  [EnemyType.GRUNT]: { label: 'Grunt', color: '#49e07a' },
  [EnemyType.RUNNER]: { label: 'Runner', color: '#38e0d0' },
  [EnemyType.SABOTEUR]: { label: 'Saboteador', color: '#d24aff' },
  [EnemyType.SKIRMISHER]: { label: 'Skirmisher', color: '#a6e022' },
  [EnemyType.BRUTE]: { label: 'Brute', color: '#ff6b3d' },
  [EnemyType.ARTILLERY]: { label: 'Artillería', color: '#ffb02e' },
  [EnemyType.MOTHERSHIP]: { label: 'Nave Madre', color: '#ff8a3d' },
  [EnemyType.COMMANDSHIP]: { label: 'Nave Nodriza', color: '#b06bff' },
  [EnemyType.KAMIKAZE]: { label: 'Kamikaze', color: '#ff4d2e' },
  [EnemyType.WARDEN]: { label: 'Guardián', color: '#7fb2ff' },
  [EnemyType.LEECH]: { label: 'Sanguijuela', color: '#ff3dbd' },
  [EnemyType.BOMBER]: { label: 'Bombardero', color: '#ffb02e' },
}

import { buildableStructures, WEAPON_ROLES } from '~/game/meta/arsenal'
const structures = computed(() => buildableStructures())

const generalTooltip = {
  label: 'General',
  desc: 'Tu comandante. Clic para mover, clic en meteorito para recolectar, dispara automáticamente a enemigos cercanos. Cerca de estructuras dispara y recolecta más rápido.',
  role: 'general',
  css: '#8be9fd',
}

const speedLabels = ['Pausa', 'Lenta', 'Normal', 'Rápida']
const speeds = SPEED.steps
  .map((v, i) => ({ label: speedLabels[i] || v, value: v }))
  .filter((sp) => !IS_TOUCH || sp.value !== 0.5) // en móvil: Pausa · Normal · Rápida

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
  const next = gameState.waveTimeLeft > 0 && gameState.wave < gameState.waveTotal ? ` · próxima en ${gameState.waveTimeLeft}s` : ''
  return { kind: 'active', text: `Oleada ${gameState.wave} · enemigos: ${gameState.enemiesAlive}${next}` }
})

// Análisis de la siguiente oleada (para el panel de intermisión)
const nextWaveAnalysis = computed(() => {
  const nw = gameState.nextWave
  if (!nw) return null
  const types = []
  for (const [type, count] of Object.entries(nw.counts)) {
    const info = ENEMY_LABELS[type]
    if (info) {
      types.push({ ...info, count })
    }
  }
  // Ordenar por cantidad descendente
  types.sort((a, b) => b.count - a.count)
  return {
    types,
    dirs: nw.dirs,
    hasBoss: nw.hasBoss,
    waveNum: gameState.wave + 1,
  }
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

// Orden de Q/E/R = orden de nodos disponibles en el árbol (rama A primero).
function availableFromTree(role, owned) {
  return buildUpgradeTree(role, owned).flatMap((b) => b.nodes).filter((n) => n.state === 'available')
}
const availableUpgrades = computed(() => {
  const s = selectedStructure.value
  if (!s) return []
  return availableFromTree(s.role, s.upgrades || [])
})

const generalAvailableUpgrades = computed(() => availableFromTree('general', gameState.generalUpgrades))

const hasTree = computed(() => {
  const s = selectedStructure.value
  return !!s && buildUpgradeTree(s.role, []).length > 0
})

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
const tooltipsDisabled = ref(localStorage.getItem('sgmp_hide_tooltips') === '1')
function showTooltip(s, event) {
  if (tooltipsDisabled.value || IS_TOUCH) return // en táctil el "hover" llega al tocar y tapaba todo
  hoveredStructure.value = s
  const rect = event.target.closest('button').getBoundingClientRect()
  tooltipPos.value = { x: rect.left + rect.width / 2, y: rect.top - 8 }
}
function hideTooltip() {
  hoveredStructure.value = null
}
function dontShowTooltipsAgain() {
  tooltipsDisabled.value = true
  localStorage.setItem('sgmp_hide_tooltips', '1')
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

function callWave() {
  bus.emit('callWave')
}

// Táctil: no hay clic derecho ni Esc → botón flotante que cancela lo que esté activo.
const cancelable = computed(() => !!(activeLabel.value || gameState.generalMode === 'selected' || gameState.abilityTargeting))
function goToEvent() {
  bus.emit('gotoEvent')
}
// Flecha al borde de la pantalla hacia el evento cuando no está a la vista.
const eventArrow = computed(() => {
  const ev = gameState.event
  if (!ev || ev.onScreen) return null
  const a = ev.angle
  const x = 50 + Math.cos(a) * 44
  const y = 50 + Math.sin(a) * 40
  return { left: x + '%', top: y + '%', transform: `translate(-50%, -50%) rotate(${a}rad)` }
})

function cancelAll() {
  bus.emit('cancel')
}
function closeInspection() {
  selectedStructure.value = null
  bus.emit('deselect')
}
const sheetOpen = computed(() => !!selectedStructure.value || gameState.generalMode === 'selected')

// Aviso de orientación: en vertical el mapa se ve muy chico. Descartable.
const portrait = ref(false)
const portraitDismissed = ref(false)
function checkOrientation() {
  portrait.value = window.innerHeight > window.innerWidth && window.innerWidth < 700
}
onMounted(() => { checkOrientation(); window.addEventListener('resize', checkOrientation) })
onUnmounted(() => window.removeEventListener('resize', checkOrientation))

const sectorInfo = computed(() => sectorByN(appState.sector))
const levelInfo = computed(() => levelFromXp(profile.xp))

// Teclas de habilidades (Z/C/V/B), definidas en systems/abilities.js.
const ABILITY_KEYS = Object.fromEntries(Object.values(ABILITIES).map((a) => [a.key.toLowerCase(), a.id]))

// ---- Teclas rápidas: espejo de los botones del GUI (emiten los mismos intents).
// Teclas ya usadas por Phaser (no tocar): Esc=cancelar, Espacio=centrar cámara, WASD/flechas=mover.
let lastSpeed = SPEED.steps[2] // velocidad previa, para que P (pausa) la restaure
function stepSpeed(dir) {
  const i = SPEED.steps.indexOf(gameState.speed)
  const clamped = Math.max(0, Math.min(SPEED.steps.length - 1, (i < 0 ? 2 : i) + dir))
  setSpeed(SPEED.steps[clamped])
}
function togglePause() {
  if (gameState.speed === 0) setSpeed(lastSpeed || SPEED.steps[2])
  else { lastSpeed = gameState.speed; setSpeed(0) }
}

// Mejoras: Q/E/R aplican la 1ª/2ª/3ª mejora del panel abierto (estructura o general).
const upgradeKeys = ['Q', 'E', 'R']
function applyUpgradeHotkey(i) {
  if (selectedStructure.value) {
    const u = availableUpgrades.value[i]
    if (u && gameState.minerals >= u.cost) applyUpgrade(u.id)
  } else if (gameState.generalMode === 'selected') {
    const u = generalAvailableUpgrades.value[i]
    if (u && gameState.minerals >= u.cost) applyGeneralUpgrade(u.id)
  }
}

function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

  // Fin de partida: solo reinicio / menú.
  if (gameState.status === 'gameover' || gameState.status === 'victory') {
    if (e.key === 'r' || e.key === 'R' || e.key === 'Enter') restart()
    else if (e.key === 'm' || e.key === 'M') mainMenu()
    return
  }

  if (e.key >= '0' && e.key <= '9') { const s = structures.value[e.key === '0' ? 9 : +e.key - 1]; if (s) pick(s); return }
  const ab = ABILITY_KEYS[e.key.toLowerCase()]
  if (ab) { bus.emit('ability', ab); return }
  if (e.key === 'n' || e.key === 'N') { callWave(); return }
  switch (e.key) {
    case 'g': case 'G': pickGeneral(); break
    case 'p': case 'P': togglePause(); break
    case ',': case '<': stepSpeed(-1); break
    case '.': case '>': stepSpeed(1); break
    case 'f': case 'F': toggleFireMode(); break       // no-op si no hay torreta seleccionada
    case 'x': case 'X': case 'Delete': demolish(); break // no-op si no hay estructura seleccionada
    case 'q': case 'Q': applyUpgradeHotkey(0); break
    case 'e': case 'E': applyUpgradeHotkey(1); break
    case 'r': case 'R': applyUpgradeHotkey(2); break
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

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
      class="hud-topbar absolute top-0 left-0 right-0 flex items-center gap-4 px-3 py-2
             bg-gradient-to-b from-black/70 to-transparent pointer-events-auto"
    >
      <div class="flex gap-1">
        <button
          v-for="sp in speeds"
          :key="sp.label"
          class="hud-btn"
          :class="{ 'hud-btn--active': gameState.speed === sp.value }"
          title="P pausa/reanuda · , más lenta · . más rápida"
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
    <div class="hud-resources absolute top-14 right-3 text-right text-xs space-y-0.5">
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
    <div class="hud-core absolute top-14 left-3 w-56 space-y-1.5 p-2.5 rounded-xl bg-[#0a0f1c]/60 backdrop-blur-sm ring-1 ring-cyan-400/20">
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
      <button
        v-if="waveStatus.kind === 'countdown' && gameState.status === 'playing' && appState.mp.role !== 'client'"
        class="mt-1 ml-1 inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/40 hover:bg-amber-400/30 pointer-events-auto"
        title="N — salta la espera y gana minerales por el tiempo ahorrado"
        @click="callWave"
      >
        ¡Oleada ya! +{{ gameState.nextWaveIn * 4 }} <span class="opacity-50">N</span>
      </button>
      <div class="hud-sector text-[10px] text-cyan-400/50">Sector {{ sectorInfo.n }} · {{ sectorInfo.name }}</div>

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

    <!-- Wave analysis panel (intermission) -->
    <div
      v-if="nextWaveAnalysis"
      class="hud-wave-analysis absolute top-14 left-64 ml-2 w-64 p-2.5 rounded-xl bg-[#0a0f1c]/60 backdrop-blur-sm ring-1 ring-fuchsia-400/20 pointer-events-auto"
    >
      <div class="text-[11px] font-semibold text-fuchsia-300/90 mb-1.5">
        Oleada {{ nextWaveAnalysis.waveNum }} entrante
      </div>
      <div class="space-y-1 mb-2">
        <div
          v-for="t of nextWaveAnalysis.types"
          :key="t.label"
          class="flex items-center justify-between text-[10px]"
        >
          <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: t.color }"></span>
            <span class="opacity-90">{{ t.label }}</span>
          </span>
          <span class="font-semibold tabular-nums opacity-80">×{{ t.count }}</span>
        </div>
      </div>
      <div v-if="nextWaveAnalysis.hasBoss" class="text-[10px] text-red-400 font-semibold animate-pulse mb-1.5">
        ⚠ NAVE NODRIZA
      </div>
      <!-- Compass minimal -->
      <div class="relative w-20 h-20 mx-auto mt-1.5 rounded-full bg-fuchsia-500/5 ring-1 ring-fuchsia-400/20">
        <div class="absolute inset-0 flex items-center justify-center text-[9px] text-fuchsia-300/60">
          <svg viewBox="0 0 100 100" class="w-full h-full">
            <!-- Marcas de dirección para cada sector de spawn -->
            <line
              v-for="(dir, i) in nextWaveAnalysis.dirs"
              :key="i"
              :x1="50"
              :y1="50"
              :x2="50 + 40 * Math.cos(dir)"
              :y2="50 + 40 * Math.sin(dir)"
              :stroke="nextWaveAnalysis.hasBoss ? '#ef4444' : '#d946ef'"
              :stroke-width="nextWaveAnalysis.hasBoss ? '2.5' : '1.8'"
              stroke-linecap="round"
            />
            <circle v-for="(dir, i) in nextWaveAnalysis.dirs" :key="'c'+i"
              :cx="50 + 42 * Math.cos(dir)"
              :cy="50 + 42 * Math.sin(dir)"
              r="3"
              :fill="nextWaveAnalysis.hasBoss ? '#ef4444' : '#d946ef'"
            />
          </svg>
        </div>
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
        <div v-if="gameState.runRewards" class="mb-6 space-y-2">
          <div class="flex justify-center gap-3 text-sm">
            <span class="px-3 py-1 rounded-lg bg-cyan-400/10 ring-1 ring-cyan-300/30 text-cyan-100">+{{ gameState.runRewards.xp }} XP</span>
            <span class="px-3 py-1 rounded-lg bg-amber-400/10 ring-1 ring-amber-300/30 text-amber-100">+{{ gameState.runRewards.scrap }} Chatarra</span>
          </div>
          <div class="mx-auto w-64">
            <div class="flex justify-between text-[10px] text-cyan-300/70">
              <span>Nivel {{ levelInfo.level }}</span><span>{{ levelInfo.into }}/{{ levelInfo.need }} XP</span>
            </div>
            <div class="h-2 rounded-full bg-white/10 overflow-hidden mt-0.5">
              <div class="h-full bg-cyan-300 transition-[width] duration-700" :style="{ width: (100 * levelInfo.into / levelInfo.need) + '%' }"></div>
            </div>
          </div>
          <div v-if="gameState.runRewards.levelUp" class="text-amber-300 font-bold animate-pulse">¡Subiste a nivel {{ gameState.runRewards.levelUp }}!</div>
          <div v-if="gameState.runRewards.sectorUnlocked" class="text-fuchsia-300 font-semibold">Sector {{ gameState.runRewards.sectorUnlocked }} desbloqueado</div>
          <div v-if="gameState.runRewards.newCosmetics?.length" class="mx-auto max-w-xs px-3 py-2 rounded-xl bg-fuchsia-400/10 ring-1 ring-fuchsia-300/40">
            <div class="text-fuchsia-200 font-bold text-sm">🎁 ¡Cosméticos nuevos!</div>
            <div class="text-[11px] text-fuchsia-100/80">{{ gameState.runRewards.newCosmetics.join(' · ') }}</div>
            <div class="text-[10px] text-fuchsia-100/50 mt-0.5">Equipalos en la Tienda</div>
          </div>
        </div>
        <div class="flex gap-3 justify-center">
          <button
            class="px-6 py-2 rounded-lg bg-cyan-400/20 ring-1 ring-cyan-300/50 text-white
                   hover:bg-cyan-400/30 transition-colors"
            @click="restart"
          >
            Jugar de nuevo <span class="opacity-50">(R)</span>
          </button>
          <button
            class="px-6 py-2 rounded-lg bg-white/5 ring-1 ring-cyan-400/20 text-cyan-200/80
                   hover:bg-cyan-400/10 hover:text-white transition-colors"
            @click="mainMenu"
          >
            Menú principal <span class="opacity-50">(M)</span>
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
      class="hud-hint absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
             bg-cyan-400/15 ring-1 ring-cyan-300/40 text-xs text-cyan-100"
    >
      Colocando <b>{{ activeLabel }}</b> — clic para construir · clic derecho / Esc para cancelar
    </div>
    <div
      v-if="gameState.generalMode === 'selected'"
      class="hud-hint absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
             bg-cyan-400/15 ring-1 ring-cyan-300/40 text-xs text-cyan-100"
    >
      General seleccionado — clic para mover / clic en meteorito para recolectar · derecho / Esc para cancelar
    </div>
    <div
      v-if="gameState.multiSelCount > 0 && !activeLabel && gameState.generalMode !== 'selected'"
      class="hud-hint absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
             bg-cyan-400/15 ring-1 ring-cyan-300/40 text-xs text-cyan-100"
    >
      {{ gameState.multiSelCount }} torretas seleccionadas — clic en un enemigo para fijar blanco común · shift+clic añade/quita · clic vacío suelta
    </div>

    <!-- Inspection panel (right side) -->
    <div
      v-if="selectedStructure"
      class="hud-inspection hud-sheet absolute top-28 right-3 w-72 max-h-[calc(100vh-15rem)] overflow-y-auto p-3 rounded-xl bg-[#0a0f1c]/90 backdrop-blur-sm
             ring-1 ring-cyan-400/20 pointer-events-auto text-xs space-y-2"
    >
      <div class="flex items-center justify-between">
        <div class="font-bold text-sm" style="color: #6cc8ff">{{ selectedStructure.label }}</div>
        <button class="sheet-close" aria-label="Cerrar" @click="closeInspection">✕</button>
      </div>

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
      <div v-if="WEAPON_ROLES.includes(selectedStructure.role)" class="pt-1 border-t border-cyan-400/10">
        <div class="flex gap-2 items-center" title="F alterna modo de fuego">
          <button
            class="px-2 py-1 rounded text-[11px] ring-1 transition-colors"
            :class="selectedStructure.fireMode === 'auto'
              ? 'bg-cyan-400/20 text-white ring-cyan-300/50'
              : 'bg-white/5 text-cyan-200/60 ring-cyan-400/20'"
            @click="toggleFireMode"
          >
            Automático <span class="opacity-50">F</span>
          </button>
          <button
            class="px-2 py-1 rounded text-[11px] ring-1 transition-colors"
            :class="selectedStructure.fireMode === 'focus'
              ? 'bg-cyan-400/20 text-white ring-cyan-300/50'
              : 'bg-white/5 text-cyan-200/60 ring-cyan-400/20'"
            @click="toggleFireMode"
          >
            Fijar blanco <span class="opacity-50">F</span>
          </button>
        </div>
        <div v-if="selectedStructure.fireMode === 'focus'" class="mt-1 text-cyan-400/60 text-[10px]">
          Clic en un enemigo para fijar como blanco
        </div>
      </div>

      <!-- Árbol de mejoras propio del edificio -->
      <div v-if="hasTree" class="pt-1 border-t border-cyan-400/10 space-y-1">
        <div class="text-cyan-300/80 text-[11px] font-semibold">Árbol de mejoras</div>
        <UpgradeTree :role="selectedStructure.role" :owned="selectedStructure.upgrades || []" hotkeys @buy="applyUpgrade" />
      </div>

      <!-- Demoler (cualquier estructura menos el núcleo) -->
      <div v-if="selectedStructure.role !== 'core'" class="pt-1 border-t border-cyan-400/10">
        <button
          class="w-full px-2 py-1 rounded text-[11px] ring-1 ring-red-400/30 bg-red-500/15
                 text-red-200 hover:bg-red-500/25 transition-colors"
          title="Tecla X o Supr"
          @click="demolish"
        >
          Demoler · recuperás 50% <span class="opacity-50">(X)</span>
        </button>
      </div>
    </div>

    <!-- General upgrades panel (right side) -->
    <div
      v-if="gameState.generalMode === 'selected'"
      class="hud-inspection hud-sheet absolute top-28 right-3 w-72 max-h-[calc(100vh-15rem)] overflow-y-auto p-3 rounded-xl bg-[#0a0f1c]/90 backdrop-blur-sm
             ring-1 ring-cyan-400/20 pointer-events-auto text-xs space-y-2"
    >
      <div class="flex items-center justify-between">
        <div class="font-bold text-sm" style="color: #8be9fd">General</div>
        <button class="sheet-close" aria-label="Cerrar" @click="cancelAll">✕</button>
      </div>
      <div class="text-cyan-200/70 space-y-0.5">
        <div>HP: {{ gameState.general.hp }}/{{ gameState.general.hpMax }}</div>
        <div>Daño: {{ gameState.general.damage || 8 }}</div>
        <div>Alcance: {{ gameState.general.atkRange || 160 }}</div>
        <div>Recolección: {{ Math.round((gameState.general.collectRate || 18) * 10) / 10 }}/s</div>
      </div>

      <div class="pt-1 border-t border-cyan-400/10 space-y-1">
        <div class="text-cyan-300/80 text-[11px] font-semibold">Árbol de habilidades</div>
        <UpgradeTree role="general" :owned="gameState.generalUpgrades" hotkeys @buy="applyGeneralUpgrade" />
      </div>
    </div>

    <AbilityBar v-if="gameState.status === 'playing'" :class="{ 'ability-under-sheet': sheetOpen }" />

    <!-- Evento: meteorito gigante (systems/specialMeteors.js) -->
    <div v-if="gameState.event?.kind === 'giant' && gameState.status === 'playing'" class="event-card pointer-events-auto">
      <span class="text-lg">☄</span>
      <span class="leading-tight">
        <b class="text-amber-200">Meteorito gigante</b>
        <span class="block text-[10px] text-amber-100/70">Solo el comandante lo mina · x4 · {{ gameState.event.timeLeft }}s</span>
      </span>
      <button v-if="!gameState.event.mining && !gameState.event.remote" class="event-go" @click="goToEvent">Ir</button>
      <span v-else class="text-[10px] text-emerald-200 font-bold">Minando…</span>
    </div>
    <div v-if="eventArrow && gameState.status === 'playing'" class="event-arrow" :style="eventArrow">➤</div>

    <!-- Cancelar (táctil y también útil con mouse) -->
    <button v-if="cancelable" class="cancel-fab pointer-events-auto" @click="cancelAll">✕ Cancelar</button>

    <!-- Aviso de orientación vertical -->
    <div v-if="portrait && !portraitDismissed" class="portrait-hint pointer-events-auto">
      <span class="text-2xl">⟳</span>
      <span>Girá el celular para ver más mapa</span>
      <button class="underline opacity-70" @click="portraitDismissed = true">Seguir así</button>
    </div>

    <!-- Bottom build bar -->
    <div
      :class="{ 'hud-buildbar--sheet': sheetOpen }"
      class="hud-buildbar absolute bottom-0 left-1/2 -translate-x-1/2 mb-3 flex gap-2
             px-3 py-2 rounded-xl bg-black/55 backdrop-blur-sm
             ring-1 ring-cyan-400/20 pointer-events-auto max-w-[98vw] overflow-x-auto"
    >
      <button
        v-for="(s, i) in structures"
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
        <span class="key-badge">{{ i < 9 ? i + 1 : i === 9 ? 0 : '' }}</span>
        <svg class="w-6 h-6" viewBox="0 0 24 24">
          <polygon
            :points="polyPoints(s.sides, s.size)"
            :fill="s.css"
            stroke="rgba(255,255,255,0.85)"
            stroke-width="1.2"
            opacity="0.95"
          />
        </svg>
        <span class="build-btn-label text-[10px] text-cyan-200/70 group-hover:text-cyan-100">{{ s.label }}</span>
        <span class="text-[10px] tabular-nums" :class="gameState.minerals < s.cost ? 'text-red-400/80' : 'text-emerald-300/80'">
          {{ s.cost }}
        </span>
      </button>

      <div class="w-px h-10 bg-cyan-400/20 mx-1"></div>

      <button
        class="build-btn group"
        :class="{ 'build-btn--active': gameState.generalMode === 'selected' }"
        @mouseenter="showTooltip(generalTooltip, $event)"
        @mousemove="(e) => { tooltipPos.x = e.clientX; tooltipPos.y = e.clientY - 8 }"
        @mouseleave="hideTooltip"
        @click="pickGeneral"
      >
        <span class="key-badge">G</span>
        <span class="text-2xl leading-none" style="color: #8be9fd">✦</span>
        <span class="build-btn-label text-[10px] text-cyan-200/70 group-hover:text-cyan-100">General</span>
        <span class="text-[10px] tabular-nums text-emerald-300/80">Comandante</span>
      </button>
    </div>

    <!-- Tooltip -->
    <div
      v-if="hoveredStructure"
      class="fixed z-50 pointer-events-auto px-2 py-1.5 rounded-lg bg-[#0a0f1c]/95 ring-1 ring-cyan-400/30 text-[10px]
             text-cyan-100 shadow-lg max-w-[180px]"
      :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px', transform: 'translate(-50%, -100%)' }"
      @mouseleave="hideTooltip"
    >
      <div class="font-bold text-[11px] mb-0.5" :style="{ color: hoveredStructure.css }">{{ hoveredStructure.label }}</div>
      <div class="text-cyan-200/70 mb-0.5 leading-snug">{{ hoveredStructure.desc }}</div>
      <div class="text-cyan-300/50 space-y-0.5">
        <div v-if="WEAPON_ROLES.includes(hoveredStructure.role)">
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
      <button
        class="mt-1 text-[9px] text-cyan-400/50 hover:text-cyan-200 underline decoration-dotted"
        @click="dontShowTooltipsAgain"
      >
        No mostrar más
      </button>
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
  @apply relative flex flex-col items-center justify-center gap-0.5 w-16 h-16 rounded-lg
         bg-white/5 ring-1 ring-cyan-400/20 text-cyan-100
         hover:bg-cyan-400/10 hover:ring-cyan-300/50 active:scale-95 transition-all;
}
.key-badge {
  @apply absolute top-0.5 left-1 text-[9px] font-mono text-cyan-400/50 leading-none;
}
.build-btn--active {
  @apply bg-cyan-400/25 ring-cyan-300/70 shadow-[0_0_12px_rgba(108,200,255,0.4)];
}
.build-btn--disabled {
  @apply opacity-40 cursor-not-allowed hover:bg-white/5 hover:ring-cyan-400/20;
}

/* Móvil horizontal: poco alto de viewport, comprimir el HUD para dejar sitio al juego. */
@media (max-height: 520px) {
  .hud-topbar { padding-top: 0.25rem; padding-bottom: 0.25rem; font-size: 0.75rem; }
  .hud-topbar .hud-btn { padding: 0.15rem 0.5rem; }
  .hud-resources, .hud-core { top: 2.25rem; }
  .hud-core { width: 11rem; padding: 0.4rem; }
  .hud-wave-analysis { top: 2.25rem; left: 12rem; width: 9rem; padding: 0.4rem; }
  .hud-inspection { top: 2.25rem; width: 11rem; max-height: 70vh; overflow-y: auto; }
  .hud-buildbar { margin-bottom: 0.25rem; padding: 0.25rem; gap: 0.25rem; }
  .build-btn { width: 2.6rem; height: 2.6rem; }
  .build-btn-label { display: none; }
}

.event-card {
  @apply absolute left-1/2 -translate-x-1/2 top-12 flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full text-xs
         bg-[#1a1206]/85 ring-1 ring-amber-300/50;
  box-shadow: 0 0 18px rgba(255, 210, 74, 0.35);
  animation: eventIn 0.3s ease-out;
}
.event-go {
  @apply px-3 py-1 rounded-full font-bold text-[#05070f] bg-amber-300 active:scale-95;
}
.event-arrow {
  @apply absolute text-2xl text-amber-300 pointer-events-none;
  text-shadow: 0 0 10px rgba(255, 210, 74, 0.9);
  animation: arrowPulse 0.9s ease-in-out infinite;
}
@keyframes eventIn { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes arrowPulse { 50% { opacity: 0.45; } }

.sheet-close {
  @apply w-7 h-7 -mr-1 flex items-center justify-center rounded-full bg-white/5 text-cyan-100/70 hover:bg-white/15;
}
.cancel-fab {
  @apply absolute left-1/2 -translate-x-1/2 px-5 py-2 rounded-full text-sm font-bold
         bg-red-500/80 text-white ring-1 ring-red-300/60 active:scale-95;
  bottom: calc(6.25rem + env(safe-area-inset-bottom));
  box-shadow: 0 0 18px rgba(255, 85, 102, 0.45);
}
.portrait-hint {
  @apply absolute left-3 right-3 top-1/3 flex flex-col items-center gap-1 p-4 rounded-2xl text-center text-sm
         bg-[#0a0f1c]/90 ring-1 ring-cyan-300/30;
}
.hud-topbar { padding-top: max(0.5rem, env(safe-area-inset-top)); }
.hud-buildbar { margin-bottom: max(0.75rem, env(safe-area-inset-bottom)); }

/* Celular (vertical u horizontal angosto): paneles como hoja inferior, HUD compacto. */
@media (max-width: 700px), (pointer: coarse) and (max-height: 520px) {
  .hud-topbar { gap: 0.5rem; padding-left: 0.5rem; padding-right: 0.5rem; font-size: 0.7rem; }
  .hud-topbar .hud-btn { padding: 0.35rem 0.55rem; font-size: 0.7rem; }
  .hud-topbar .ml-auto { gap: 0.6rem; }
  .hud-resources { display: none; }
  .hud-core { width: 10.5rem; padding: 0.4rem; left: 0.5rem; top: 2.75rem; }
  .hud-wave-analysis { display: none; }
  .hud-sheet {
    top: auto !important; left: 0 !important; right: 0 !important; bottom: 0;
    width: auto !important; max-height: 58vh !important;
    border-radius: 1.25rem 1.25rem 0 0;
    padding-bottom: max(0.9rem, env(safe-area-inset-bottom));
    animation: sheetUp 0.18s ease-out;
  }
  .hud-buildbar { max-width: calc(100vw - 1rem); }
  .hud-buildbar--sheet { display: none; }
  .build-btn { width: 3.3rem; height: 3.3rem; }
  .cancel-fab { bottom: calc(5.25rem + env(safe-area-inset-bottom)); }
  .hud-hint {
    top: auto; bottom: calc(8.25rem + env(safe-area-inset-bottom));
    width: max-content; max-width: 92vw; text-align: center; font-size: 10px; border-radius: 0.75rem;
  }
  :deep(.ability-under-sheet) { display: none; }
  .hud-hint, .hud-sector { display: none; }
}
@media (max-width: 700px) {
  .hud-topbar .ml-auto > span:first-child { display: none; } /* tiempo: poco espacio */
}
@keyframes sheetUp {
  from { transform: translateY(24px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
