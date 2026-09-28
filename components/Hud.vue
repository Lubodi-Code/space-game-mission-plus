<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { gameState } from '~/game/gameState'
import { bus } from '~/game/bus'
import { STRUCTURES, SPEED } from '~/game/constants'
import { goToLobby } from '~/game/appState'
import { net } from '~/game/net'
import { buildUpgradeTree } from '~/game/structures/upgrades'
import '~/game/meta/research'
import { ABILITIES } from '~/game/systems/abilities'
import { sectorByN } from '~/game/meta/sectors'
import { levelFromXp, profile } from '~/game/meta/profile'
import { appState } from '~/game/appState'
import { IS_TOUCH } from '~/game/quality'
import { EnemyType, REGISTRY } from '~/game/enemies/EnemyType'
import { sfxWaveStart, sfxCoreAlarm, sfxVictory, sfxDefeat } from '~/game/sound'
import Settings from './Settings.vue'
import GameIcon from './GameIcon.vue'

const settingsOpen = ref(false)
const exitOpen = ref(false)
const coreExpanded = ref(false)
const buildbarExpanded = ref(true)

function toggleCore() {
  if (IS_TOUCH || window.innerWidth <= 700) coreExpanded.value = !coreExpanded.value
}

function toggleBuildbar() {
  buildbarExpanded.value = !buildbarExpanded.value
  try { localStorage.setItem('sgmp_buildbar', buildbarExpanded.value ? 'open' : 'closed') } catch { /* storage unavailable */ }
}

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
  const savedRun = appState.mp.role === 'solo' ? sessionStorage.getItem('sgmp_solo_run') : null
  if (appState.mp.role !== 'solo') net.leave()
  goToLobby()
  if (savedRun) sessionStorage.setItem('sgmp_solo_run', savedRun)
  appState.mp.role = 'solo'
  appState.mp.connected = false
  appState.mp.players = []
  appState.mp.status = 'idle'
  appState.mp.code = null
  appState.mp.attempt = 0
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

watch(coreHpPct, (pct, previous) => {
  if (gameState.status === 'playing' && pct < 25 && pct < previous) sfxCoreAlarm()
})

watch(() => gameState.status, (status, previous) => {
  if (status === previous) return
  if (status === 'victory') sfxVictory()
  else if (status === 'gameover') sfxDefeat()
})

const energyLabel = computed(() => `${Math.round(gameState.energy)} / ${gameState.energyMax}`)
const brownout = computed(() => gameState.energy < 1)

// Escala compartida: máximos base de balance.js, con margen para las mejoras.
const REF = { hp: 250, damage: 180, atkRange: 1800, fireRate: 3, energyDrain: 8,
  rate: 35, energyRate: 20, miningRange: 300, healRate: 32, spheres: 10,
  energyCap: 240, capBonus: 1600, range: 500, splash: 120 }
const pctOf = (value, max) => `${Math.min(100, Math.max(0, Number(value) / max * 100))}%`
const hpColor = (value, max) => value / (max || 1) > .5 ? '#50fa7b' : value / (max || 1) > .25 ? '#ffcc55' : '#ff5566'
const statRow = (icon, title, value, max, suffix = '') => ({ icon, title, value: `${value}${suffix}`, width: pctOf(value, max) })

const structureRows = computed(() => {
  const s = selectedStructure.value
  if (!s) return []
  const st = s.stats || {}
  const rows = []
  if (s.hp !== undefined) rows.push({ icon: 'hp', title: 'HP', value: `${Math.round(s.hp)}/${s.maxHp}`, width: pctOf(s.hp, s.maxHp), color: hpColor(s.hp, s.maxHp) })
  if (st.damage != null) rows.push(statRow('damage', 'Daño', st.damage, REF.damage))
  if (st.splash > 0) rows.push(statRow('splash', 'Área de efecto', st.splash, REF.splash))
  if (st.atkRange != null) rows.push(statRow('range', 'Alcance de ataque', st.atkRange, REF.atkRange))
  if (st.cooldown > 0) rows.push(statRow('fireRate', 'Disparos por segundo', +(1000 / st.cooldown).toFixed(1), REF.fireRate, '/s'))
  if (st.energyDrain > 0) rows.push(statRow('energyDrain', 'Energía por disparo o segundo', st.energyDrain, REF.energyDrain))
  if (st.rate != null) rows.push(statRow('mining', 'Minería por segundo', st.rate, REF.rate, '/s'))
  if (st.energyRate != null) rows.push(statRow('energy', 'Energía generada por segundo', st.energyRate, REF.energyRate, '/s'))
  if (st.miningRange != null) rows.push(statRow('range', 'Rango de minería', st.miningRange, REF.miningRange))
  if (st.healRate != null) rows.push(statRow('heal', 'Curación por segundo', st.healRate, REF.healRate, '/s'))
  if (st.maxSpheres != null) rows.push(statRow('spheres', 'Esferas', st.maxSpheres, REF.spheres))
  if (st.energyCap != null) rows.push(statRow('battery', 'Capacidad extra de energía', st.energyCap, REF.energyCap))
  if (st.capBonus != null) rows.push(statRow('minerals', 'Capacidad extra de minerales', st.capBonus, REF.capBonus))
  if (st.range != null) rows.push(statRow('range', 'Alcance de red', st.range, REF.range))
  return rows
})
const generalRows = computed(() => {
  const g = gameState.general
  return [
    { icon: 'hp', title: 'HP', value: `${Math.round(g.hp)}/${g.hpMax}`, width: pctOf(g.hp, g.hpMax), color: hpColor(g.hp, g.hpMax) },
    statRow('damage', 'Daño', g.damage || 8, REF.damage),
    statRow('range', 'Alcance de ataque', g.atkRange || 160, REF.atkRange),
    statRow('mining', 'Recolección por segundo', +(g.collectRate || 18).toFixed(1), REF.rate, '/s'),
  ]
})

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
    sfxWaveStart(isBoss)
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
const eventDismissed = ref(false)
watch(() => [gameState.event?.kind, gameState.event?.timeLeft], ([kind, timeLeft], [oldKind, oldTimeLeft]) => {
  if (kind !== oldKind || (kind && oldTimeLeft != null && timeLeft > oldTimeLeft + 1)) {
    eventDismissed.value = false
  }
})
// Flecha al borde de la pantalla hacia el evento cuando no está a la vista.
const eventArrow = computed(() => {
  const ev = gameState.event
  if (!ev || ev.onScreen || eventDismissed.value) return null
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
let portraitTimer = null
function checkOrientation() {
  portrait.value = window.innerHeight > window.innerWidth && window.innerWidth < 700
  if (portrait.value && !portraitDismissed.value && !portraitTimer) {
    portraitTimer = setTimeout(() => { portraitDismissed.value = true; portraitTimer = null }, 5000)
  }
}
onMounted(() => {
  try { buildbarExpanded.value = localStorage.getItem('sgmp_buildbar') !== 'closed' } catch { /* storage unavailable */ }
  checkOrientation()
  window.addEventListener('resize', checkOrientation)
})
onUnmounted(() => { window.removeEventListener('resize', checkOrientation); if (portraitTimer) clearTimeout(portraitTimer) })

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
    else if (e.key === 'm' || e.key === 'M') exitOpen.value = true
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
          <span class="speed-label">{{ sp.label }}</span>
          <span class="speed-icon hidden" aria-hidden="true">{{ sp.value === 0 ? '⏸' : sp.value > 1 ? '⏩' : '▶' }}</span>
        </button>
      </div>

      <div class="ml-auto flex items-center gap-5 text-sm">
        <span class="text-cyan-300/80 flex items-center gap-1" title="Tiempo">
          <GameIcon name="time" :size="15" title="Tiempo" /> <span class="text-white font-semibold tabular-nums">{{ timeLabel }}</span>
        </span>
        <span class="text-emerald-300/80 flex items-center gap-1" title="Minerales">
          <GameIcon name="minerals" :size="15" title="Minerales" />
          <span class="text-emerald-200 font-semibold tabular-nums">{{ gameState.minerals }}</span>
        </span>
        <span class="text-fuchsia-300/80 flex items-center gap-1" title="Oleada">
          <GameIcon name="wave" :size="15" title="Oleada" />
          <span class="text-fuchsia-200 font-semibold">{{ gameState.wave }}/{{ gameState.waveTotal }}</span>
        </span>
        <span class="meta-currency text-amber-300/80 flex items-center gap-1" title="Chatarra">
          <GameIcon name="scrap" :size="15" title="Chatarra" /><span class="tabular-nums">{{ profile.scrap }}</span>
        </span>
        <span class="meta-currency text-cyan-300/80 flex items-center gap-1" title="Cristales">
          <GameIcon name="crystals" :size="15" title="Cristales" /><span class="tabular-nums">{{ profile.crystals }}</span>
        </span>
        <button class="hud-btn shrink-0" aria-label="Ajustes" title="Ajustes" @click="settingsOpen = true">⚙ <span class="hidden sm:inline">Ajustes</span></button>
        <button class="hud-btn shrink-0" aria-label="Salir de la partida" title="Salir de la partida" @click="exitOpen = true">⏏ <span class="hidden sm:inline">Salir</span></button>
      </div>
    </div>

    <!-- Resources panel (top-right under bar) -->
    <div class="hud-resources absolute top-14 right-3 text-right text-xs space-y-0.5">
      <div class="text-emerald-300/90 tabular-nums flex justify-end items-center gap-1" title="Minerales / capacidad">
        <GameIcon name="minerals" :size="13" title="Minerales" /> {{ gameState.minerals }} / {{ gameState.mineralsCap }}
      </div>
      <div class="tabular-nums flex justify-end items-center gap-1" :class="brownout ? 'text-red-400 font-semibold' : 'text-amber-300/90'" title="Energía">
        <GameIcon name="energy" :size="13" title="Energía" /> {{ energyLabel }}
      </div>
      <div v-if="brownout" class="text-red-400 font-semibold animate-pulse">
        ⚠ SIN ENERGÍA — torretas apagadas
      </div>
    </div>

    <!-- Core integrity + wave status (top-left) -->
    <div class="hud-core absolute top-14 left-3 w-56 space-y-1.5 p-2.5 rounded-xl bg-[#0a0f1c]/60 backdrop-blur-sm ring-1 ring-cyan-400/20"
      :class="{ 'hud-core--expanded': coreExpanded }" @click="toggleCore">
      <div class="flex items-center gap-2">
        <GameIcon name="node" :size="20" title="Nexo" :class="coreHpPct <= 25 ? 'animate-pulse' : ''" />
        <div class="flex-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="core-name text-cyan-300/80 font-semibold tracking-wide">Nexo</span>
            <span class="tabular-nums font-bold" :class="coreHpPct > 30 ? 'text-cyan-200' : 'text-red-400'">{{ coreHpPct }}%</span>
          </div>
          <div class="h-2.5 rounded-full bg-white/10 overflow-hidden ring-1 ring-cyan-400/30 mt-1">
            <div
              class="h-full rounded-full transition-[width] duration-200"
              :class="coreHpPct > 50 ? 'bg-[#50fa7b] shadow-[0_0_10px_rgba(80,250,123,0.5)]' : coreHpPct > 25 ? 'bg-amber-400' : 'bg-red-500 animate-pulse'"
              :style="{ width: coreHpPct + '%' }"
            ></div>
          </div>
        </div>
      </div>
      <div
        class="core-wave mt-1 inline-block px-2 py-0.5 rounded text-[11px]"
        :class="waveStatus.kind === 'countdown' ? 'bg-fuchsia-500/15 text-fuchsia-200' : 'bg-red-500/15 text-red-200'"
      >
        <span class="inline-flex items-center gap-1" :title="waveStatus.text"><GameIcon name="wave" :size="12" title="Oleada" /><span>{{ waveStatus.kind === 'countdown' ? `${gameState.wave + 1} · ${gameState.nextWaveIn}s` : `${gameState.wave} · ${gameState.enemiesAlive}` }}</span></span>
      </div>
      <button
        v-if="waveStatus.kind === 'countdown' && gameState.status === 'playing' && appState.mp.role !== 'client'"
        class="core-call-wave mt-1 ml-1 inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/40 hover:bg-amber-400/30 pointer-events-auto"
        title="N — salta la espera y gana minerales por el tiempo ahorrado"
        @click.stop="callWave"
      >
        ¡Oleada ya! <span class="core-wave-bonus">+{{ gameState.nextWaveIn * 4 }} <span class="opacity-50">N</span></span>
      </button>
      <div class="hud-sector text-[10px] text-cyan-400/50">Sector {{ sectorInfo.n }} · {{ sectorInfo.name }}</div>

      <!-- General status (below wave) -->
      <div v-if="gameState.general.alive" class="hud-general mt-1 text-xs flex items-center gap-1 text-cyan-300/80"
        :class="{ 'hud-general--healthy': gameState.general.hp >= gameState.general.hpMax }">
        <GameIcon name="commander" :size="13" title="General" />
        <span class="tabular-nums" :class="gameState.general.hp > 40 ? 'text-cyan-200' : 'text-red-400'">
          {{ gameState.general.hp }}/{{ gameState.general.hpMax }}
        </span>
      </div>
      <div v-else class="hud-general mt-1 text-xs text-red-400/90 animate-pulse">
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
            <span class="px-3 py-1 rounded-lg bg-cyan-400/10 ring-1 ring-cyan-300/30 text-cyan-100 inline-flex items-center gap-1" title="Experiencia"><GameIcon name="xp" :size="15" title="Experiencia" /> +{{ gameState.runRewards.xp }}</span>
            <span class="px-3 py-1 rounded-lg bg-amber-400/10 ring-1 ring-amber-300/30 text-amber-100 inline-flex items-center gap-1" title="Chatarra"><GameIcon name="scrap" :size="15" title="Chatarra" /> +{{ gameState.runRewards.scrap }}</span>
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
            @click="exitOpen = true"
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
      <div class="space-y-1" aria-label="Estadísticas de la estructura">
        <div v-for="row in structureRows" :key="row.title" class="stat-row" :title="row.title">
          <GameIcon :name="row.icon" :size="15" :title="row.title" />
          <div class="stat-track"><div class="stat-fill" :style="{ width: row.width, backgroundColor: row.color || '#8be9fd' }" /></div>
          <span class="stat-value">{{ row.value }}</span>
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
      <div class="space-y-1" aria-label="Estadísticas del General">
        <div v-for="row in generalRows" :key="row.title" class="stat-row" :title="row.title">
          <GameIcon :name="row.icon" :size="15" :title="row.title" />
          <div class="stat-track"><div class="stat-fill" :style="{ width: row.width, backgroundColor: row.color || '#8be9fd' }" /></div>
          <span class="stat-value">{{ row.value }}</span>
        </div>
      </div>

      <div class="pt-1 border-t border-cyan-400/10 space-y-1">
        <div class="text-cyan-300/80 text-[11px] font-semibold">Árbol de habilidades</div>
        <UpgradeTree role="general" :owned="gameState.generalUpgrades" hotkeys @buy="applyGeneralUpgrade" />
      </div>
    </div>

    <AbilityBar v-if="gameState.status === 'playing'" :class="{ 'ability-under-sheet': sheetOpen }" />

    <!-- Evento: meteorito gigante (systems/specialMeteors.js) -->
    <div v-if="gameState.event?.kind === 'giant' && gameState.status === 'playing' && !eventDismissed" class="event-card pointer-events-auto">
      <span class="text-lg">☄</span>
      <span class="leading-tight">
        <b class="text-amber-200">Meteorito gigante</b>
        <span class="block text-[10px] text-amber-100/70">Solo el comandante lo mina · x4 · {{ gameState.event.timeLeft }}s</span>
      </span>
      <button v-if="!gameState.event.mining && !gameState.event.remote" class="event-go" @click="goToEvent">Ir</button>
      <span v-else class="text-[10px] text-emerald-200 font-bold">Minando…</span>
      <button class="event-close pointer-events-auto" aria-label="Descartar aviso" @click="eventDismissed = true">✕</button>
    </div>
    <div v-if="eventArrow && gameState.status === 'playing'" class="event-arrow" :style="eventArrow">➤</div>

    <!-- Cancelar (táctil y también útil con mouse) -->
    <button v-if="cancelable" class="cancel-fab pointer-events-auto" @click="cancelAll">✕ Cancelar</button>

    <!-- Aviso de orientación vertical -->
    <div v-if="portrait && !portraitDismissed" class="portrait-hint pointer-events-none">
      <span class="text-2xl">⟳</span>
      <span>Girá el celular para ver más mapa</span>
      <button class="portrait-close pointer-events-auto" aria-label="Cerrar aviso" @click="portraitDismissed = true">✕</button>
    </div>

    <!-- Bottom build bar -->
    <div
      :class="{ 'hud-buildbar--sheet': sheetOpen, 'hud-buildbar--collapsed': !buildbarExpanded }"
      class="hud-buildbar absolute bottom-0 left-1/2 -translate-x-1/2 mb-3 flex gap-2
             px-3 py-2 rounded-xl bg-black/55 backdrop-blur-sm
             ring-1 ring-cyan-400/20 pointer-events-auto max-w-[98vw] overflow-x-auto"
    >
      <button class="buildbar-toggle hidden" type="button" :aria-expanded="buildbarExpanded" aria-label="Mostrar u ocultar construcción" @click="toggleBuildbar">🔨</button>
      <button
        v-for="(s, i) in structures"
        :key="s.key"
        class="build-btn hud-build-item group"
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
        <GameIcon :name="s.key" :size="24" :title="s.label" :style="{ color: s.css }" />
        <span class="build-btn-label text-[9px] leading-none text-cyan-200/70 group-hover:text-cyan-100 truncate max-w-full px-1">{{ s.label }}</span>
        <span class="build-cost inline-flex items-center gap-0.5 text-[10px] tabular-nums" :class="gameState.minerals < s.cost ? 'text-red-400/80' : 'text-emerald-300/80'">
          <GameIcon name="minerals" :size="10" title="Minerales" /> {{ s.cost }}
        </span>
      </button>

      <div class="hud-build-item build-divider w-px h-10 bg-cyan-400/20 mx-1"></div>

      <button
        class="build-btn hud-build-item group"
        :class="{ 'build-btn--active': gameState.generalMode === 'selected' }"
        @mouseenter="showTooltip(generalTooltip, $event)"
        @mousemove="(e) => { tooltipPos.x = e.clientX; tooltipPos.y = e.clientY - 8 }"
        @mouseleave="hideTooltip"
        @click="pickGeneral"
      >
        <span class="key-badge">G</span>
        <GameIcon name="commander" :size="24" title="General" style="color: #8be9fd" />
        <span class="build-btn-label text-[10px] text-cyan-200/70 group-hover:text-cyan-100">General</span>
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
    <Settings v-if="settingsOpen" :open="settingsOpen" @close="settingsOpen = false" />
    <div v-if="exitOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 pointer-events-auto p-4" role="dialog" aria-modal="true" aria-label="Salir de la partida">
      <div class="w-full max-w-xs rounded-xl bg-[#0a0f1c] p-5 text-center ring-1 ring-cyan-300/40 shadow-xl">
        <p class="text-lg font-semibold">¿Salir de la partida?</p>
        <div class="mt-5 flex justify-center gap-3">
          <button class="hud-btn" @click="exitOpen = false">Cancelar</button>
          <button class="rounded-md bg-red-500/80 px-4 py-2 text-sm font-bold text-white" @click="mainMenu">Sí, salir</button>
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
.stat-row { display: flex; align-items: center; gap: 0.4rem; min-height: 1rem; color: #8be9fd; }
.stat-track { flex: 1; height: 0.32rem; min-width: 1.5rem; border-radius: 999px; background: rgba(255,255,255,.1); overflow: hidden; }
.stat-fill { height: 100%; border-radius: inherit; transition: width .2s ease; box-shadow: 0 0 5px currentColor; }
.stat-value { min-width: 3.5rem; text-align: right; font-size: 10px; line-height: 1; font-variant-numeric: tabular-nums; color: #e0faff; }

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
.event-close {
  @apply w-8 h-8 flex shrink-0 items-center justify-center rounded-full text-amber-100/80 hover:bg-white/15 active:scale-95;
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
  .hud-topbar { gap: 0.3rem; padding: max(0.2rem, env(safe-area-inset-top)) calc(0.4rem + env(safe-area-inset-right)) 0.2rem calc(0.4rem + env(safe-area-inset-left)); background: linear-gradient(to bottom, rgba(0,0,0,0.38), transparent); }
  .hud-topbar .hud-btn { padding: 0.2rem 0.35rem; min-width: 1.7rem; font-size: 11px; }
  .hud-topbar .ml-auto { gap: 0.45rem; font-size: 11px; white-space: nowrap; }
  .hud-topbar .speed-label, .hud-topbar .topbar-label { display: none; }
  .hud-topbar .meta-currency { display: none; }
  .hud-topbar .speed-icon, .hud-topbar .topbar-mobile-label { display: inline; }
  .hud-resources { display: none; }
  .hud-core { width: max-content; max-width: calc(100vw - 1rem); padding: 0.25rem 0.4rem; left: calc(0.5rem + env(safe-area-inset-left)); top: calc(2rem + env(safe-area-inset-top)); background: rgba(10,15,28,0.38); cursor: pointer; pointer-events: auto; }
  .hud-core > * + * { margin-top: 0; }
  .hud-core > .flex { gap: 0.3rem; }
  .hud-core > .flex > svg { width: 0.9rem; height: 0.9rem; }
  .hud-core .core-name { display: none; }
  .hud-core > .flex > div { display: flex; align-items: center; gap: 0.35rem; }
  .hud-core > .flex > div > div:first-child { order: 2; font-size: 10px; }
  .hud-core > .flex > div > div:nth-child(2) { order: 1; width: 3.5rem; height: 0.3rem; margin-top: 0; }
  .hud-core { white-space: nowrap; }
  .core-wave, .core-call-wave { margin: 0; padding: 0.1rem 0.3rem; font-size: 9px; line-height: 1.1; }
  .core-wave-full { display: none; }
  .core-wave-short { display: inline; }
  .core-wave-bonus { display: none; }
  .hud-core:not(.hud-core--expanded) .hud-general--healthy { display: none; }
  .hud-general { margin-top: 0.15rem; font-size: 10px; }
  .hud-wave-analysis { display: none; }
  .hud-sheet {
    top: auto !important; left: 0 !important; right: 0 !important; bottom: 0;
    width: auto !important; max-height: 58vh !important;
    border-radius: 1.25rem 1.25rem 0 0;
    padding-bottom: max(0.9rem, env(safe-area-inset-bottom));
    animation: sheetUp 0.18s ease-out;
  }
  .hud-buildbar { max-width: calc(100vw - 0.75rem - env(safe-area-inset-left) - env(safe-area-inset-right)); margin-bottom: calc(0.25rem + env(safe-area-inset-bottom)); padding: 0.2rem; gap: 0.2rem; background: rgba(0,0,0,0.32); }
  .hud-buildbar--sheet { display: none; }
  .build-btn { width: 2.6rem; height: 2.6rem; flex: 0 0 2.6rem; gap: 0; }
  .build-btn svg { width: 1.2rem; height: 1.2rem; }
  .build-btn-label, .key-badge { display: none; }
  .build-cost { font-size: 9px; line-height: 1; }
  .build-divider { height: 2rem; margin: 0 0.1rem; }
  .buildbar-toggle { display: flex; flex: 0 0 2.6rem; width: 2.6rem; height: 2.6rem; align-items: center; justify-content: center; border-radius: 0.5rem; background: rgba(139,233,253,0.12); font-size: 1.25rem; }
  .hud-buildbar--collapsed .hud-build-item { display: none; }
  .cancel-fab { bottom: calc(3.7rem + env(safe-area-inset-bottom)); padding: 0.35rem 0.75rem; font-size: 11px; }
  .portrait-hint { top: auto; bottom: calc(5.25rem + env(safe-area-inset-bottom)); left: 50%; right: auto; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 1rem - env(safe-area-inset-left) - env(safe-area-inset-right)); flex-direction: row; gap: 0.35rem; padding: 0.25rem 0.5rem; border-radius: 999px; font-size: 10px; background: rgba(10,15,28,0.55); }
  .portrait-hint > span:first-child { font-size: 13px; }
  .portrait-close { margin-left: 0.2rem; font-size: 14px; }
  .hud-hint {
    top: auto; bottom: calc(8.25rem + env(safe-area-inset-bottom));
    width: max-content; max-width: 92vw; text-align: center; font-size: 10px; border-radius: 0.75rem;
  }
  :deep(.ability-under-sheet) { display: none; }
  .hud-hint, .hud-sector { display: none; }
  :global(#nuxt-devtools-anchor) { display: none !important; }
}
@keyframes sheetUp {
  from { transform: translateY(24px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
