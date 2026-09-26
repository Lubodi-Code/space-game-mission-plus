<script setup>
import { ref, computed } from 'vue'
import { startGame, DIFFICULTY } from '~/game/appState'
import { appState } from '~/game/appState'
import { MODES, DEFAULT_MODE } from '~/game/modes/index'
import { SECTORS } from '~/game/meta/sectors'
import { profile, levelFromXp } from '~/game/meta/profile'
import { net } from '~/game/net'
import { initUiSound, sfxUi } from '~/game/sound'
import Settings from './Settings.vue'

const settingsOpen = ref(false)

const difficulty = ref(appState.difficulty || 'normal')
const mode = ref(MODES[appState.mode] ? appState.mode : DEFAULT_MODE)
const sector = ref(Math.min(appState.sector || 1, profile.sectorUnlocked))
const lvl = computed(() => levelFromXp(profile.xp))
const ENEMY_NAMES = { kamikaze: 'Kamikaze', warden: 'Guardián', leech: 'Sanguijuela', bomber: 'Bombardero' }

function pickSector(n) {
  if (n > profile.sectorUnlocked) { sfxUi('error'); return }
  sector.value = n
  sfxUi('click')
}

function openView(v) {
  initUiSound()
  sfxUi('click')
  appState.view = v
}
const joinCode = ref(new URLSearchParams(location.search).get('join')?.toUpperCase() || '')
const playerName = ref(localStorage.getItem('sgmp_name') || 'Comandante')
const linkCopied = ref(false)

function copyInviteLink() {
  const url = `${location.origin}${location.pathname}?join=${appState.mp.code}`
  navigator.clipboard.writeText(url)
  linkCopied.value = true
  setTimeout(() => { linkCopied.value = false }, 1500)
}

function play() {
  appState.playerName = playerName.value.slice(0, 16) || 'Comandante'
  localStorage.setItem('sgmp_name', appState.playerName)
  initUiSound()
  startGame(difficulty.value, mode.value, sector.value)
}

function saveName() {
  appState.playerName = playerName.value.slice(0, 16) || 'Comandante'
  localStorage.setItem('sgmp_name', appState.playerName)
}

function hostGame() {
  saveName()
  const code = Math.random().toString(36).slice(2, 6).toUpperCase()
  appState.mp.role = 'host'
  appState.mp.code = code
  appState.mp.players = [{ name: appState.playerName, host: true }]
  net.onOpen = (conn) => { appState.mp.connected = true; net.send({ t: 'ping', name: appState.playerName }) }
  net.onData = (d, conn) => {
    if (d.t === 'pong') {
      appState.mp.ping = true
      if (d.name) {
        conn.name = d.name // el host recuerda el nombre por conexión (general etiquetado en juego)
        if (!appState.mp.players.find((p) => p.name === d.name)) {
          appState.mp.players.push({ name: d.name, host: false })
        }
      }
    }
  }
  net.onError = () => { appState.mp.role = 'solo'; appState.mp.code = null; appState.mp.players = [] }
  net.onDisconnect = (conn) => {
    appState.mp.players = appState.mp.players.filter((p) => p.name !== conn.name)
  }
  net.host(code, appState.playerName)
}

function joinGame() {
  saveName()
  if (!joinCode.value) return
  appState.mp.role = 'client'
  appState.mp.code = joinCode.value.toUpperCase()
  appState.mp.players = [{ name: appState.playerName, host: false }]
  net.onOpen = (conn) => { appState.mp.connected = true }
  net.onData = (d, conn) => {
    if (d.t === 'ping') {
      appState.mp.ping = true
      if (d.name && !appState.mp.players.find((p) => p.name === d.name)) {
        appState.mp.players.push({ name: d.name, host: true })
      }
      net.send({ t: 'pong', name: appState.playerName })
    } else if (d.t === 'snap') {
      appState.mp.connected = true
      appState.view = 'game'
    }
  }
  net.onError = () => { appState.mp.role = 'solo'; appState.mp.players = [] }
  net.join(appState.mp.code, appState.playerName)
}


</script>

<template>
  <div class="lobby">
    <!-- Decorative parallax starfield (pure CSS) -->
    <div class="stars stars--far"></div>
    <div class="stars stars--near"></div>

    <div class="relative z-10 my-auto flex flex-col items-center text-center px-4 sm:px-6 w-full">
      <!-- Emblem -->
      <svg viewBox="0 0 64 64" class="w-20 h-20 mb-6 drop-shadow-[0_0_18px_rgba(108,200,255,0.6)]">
        <polygon points="32,6 53,18 53,42 32,54 11,42 11,18" fill="none" stroke="#6cc8ff" stroke-width="2.5" />
        <polygon points="32,18 43,32 32,46 21,32" fill="#8be9fd" opacity="0.9" />
      </svg>

      <h1 class="title">SPACE GAME</h1>
      <p class="subtitle">MISSION&nbsp;PLUS</p>

      <p class="mt-4 max-w-md text-sm text-cyan-200/60 leading-relaxed">
        Expande tu red de energía desde el Núcleo, mina meteoritos, construye
        defensas y sobrevive a <b class="text-cyan-200">{{ MODES[mode].waveCount }} oleadas</b> de la horda.
      </p>

      <!-- Nombre de jugador -->
      <div class="mt-6 w-full max-w-xs">
        <p class="text-xs text-cyan-300/50 mb-2 tracking-widest">NOMBRE</p>
        <input
          v-model="playerName"
          class="w-full bg-white/5 border border-cyan-400/20 rounded px-3 py-1.5 text-sm
                 text-cyan-200 placeholder-cyan-400/30 outline-none focus:border-cyan-300/50 text-center"
          placeholder="Tu nombre"
          maxlength="16"
        />
      </div>

      <!-- Perfil: nivel, XP, monedas -->
      <div class="mt-6 w-full max-w-md flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5 ring-1 ring-cyan-400/15">
        <div class="lvl-badge">{{ lvl.level }}</div>
        <div class="flex-1 text-left">
          <div class="flex justify-between text-[10px] text-cyan-300/70"><span>NIVEL DE COMANDANTE</span><span>{{ lvl.into }}/{{ lvl.need }} XP</span></div>
          <div class="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1"><div class="h-full bg-cyan-300" :style="{ width: (100 * lvl.into / lvl.need) + '%' }"></div></div>
        </div>
        <div class="text-right text-xs leading-tight">
          <div class="text-amber-200 tabular-nums">⚙ {{ profile.scrap }}</div>
          <div class="text-fuchsia-200 tabular-nums">◆ {{ profile.crystals }}</div>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap justify-center gap-2">
        <button class="menu-btn" @click="openView('research')">🔬 Investigación</button>
        <button class="menu-btn menu-btn--shop" @click="openView('shop')">🛒 Tienda</button>
        <button class="menu-btn" @click="settingsOpen = true">⚙ Ajustes</button>
      </div>

      <!-- Modo -->
      <div class="mt-6 w-full max-w-md">
        <p class="text-xs text-cyan-300/50 mb-2 tracking-widest">MODO</p>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="(m, key) in MODES"
            :key="key"
            class="mode-card"
            :class="{ 'mode-card--active': mode === key }"
            @click="mode = key; sfxUi('click')"
          >
            <img :src="m.art" :alt="m.label" class="mode-art" loading="lazy" />
            <span class="mode-body">
              <span class="block text-base font-bold text-white">{{ m.label }}</span>
              <span class="block text-[11px] text-amber-200/90 font-semibold">{{ m.minutes }}</span>
              <span class="block text-[10px] text-cyan-100/70 leading-snug mt-0.5">{{ m.desc }}</span>
            </span>
          </button>
        </div>
      </div>

      <!-- Sector -->
      <div class="mt-5 w-full max-w-md">
        <p class="text-xs text-cyan-300/50 mb-2 tracking-widest">SECTOR</p>
        <div class="grid grid-cols-5 gap-1.5">
          <button
            v-for="sc in SECTORS"
            :key="sc.n"
            class="sector-btn"
            :class="{ 'sector-btn--active': sector === sc.n, 'sector-btn--locked': sc.n > profile.sectorUnlocked }"
            :title="sc.n > profile.sectorUnlocked ? 'Ganá el sector anterior para desbloquearlo' : sc.name"
            @click="pickSector(sc.n)"
          >
            {{ sc.n > profile.sectorUnlocked ? '🔒' : sc.n }}
          </button>
        </div>
        <div class="mt-2 text-[11px] text-cyan-200/70">
          <b class="text-cyan-100">{{ SECTORS[sector - 1].name }}</b>
          · enemigos +{{ Math.round((SECTORS[sector - 1].hpMult - 1) * 100) }}% vida
          <span v-if="SECTORS[sector - 1].newEnemies.length" class="text-fuchsia-300">
            · nuevo: {{ SECTORS[sector - 1].newEnemies.map((e) => ENEMY_NAMES[e] || e).join(', ') }}
          </span>
        </div>
      </div>

      <!-- Difficulty -->
      <div class="mt-4">
        <p class="text-xs text-cyan-300/50 mb-2 tracking-widest">DIFICULTAD</p>
        <div class="flex gap-2">
          <button
            v-for="(d, key) in DIFFICULTY"
            :key="key"
            class="diff-btn"
            :class="{ 'diff-btn--active': difficulty === key }"
            @click="difficulty = key"
          >
            {{ d.label }}
          </button>
        </div>
      </div>

      <button class="play-btn mt-8" @click="play">JUGAR</button>

      <!-- Multijugador -->
      <div class="mt-8 border-t border-cyan-400/10 pt-6 w-full max-w-xs">
        <p class="text-xs text-cyan-300/50 mb-3 tracking-widest">MULTIJUGADOR</p>

        <div v-if="appState.mp.role === 'solo'" class="flex flex-col gap-3">
          <button class="mp-btn" @click="hostGame">Crear partida</button>
          <div class="flex gap-2">
            <input
              v-model="joinCode"
              class="flex-1 bg-white/5 border border-cyan-400/20 rounded px-3 py-1.5 text-sm
                     text-cyan-200 placeholder-cyan-400/30 outline-none focus:border-cyan-300/50"
              placeholder="Código"
              maxlength="4"
              @keyup.enter="joinGame"
            />
            <button class="mp-btn" @click="joinGame">Unirse</button>
          </div>
        </div>

        <div v-else class="flex flex-col items-center gap-2 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-cyan-300/60">Código:</span>
            <span class="text-cyan-200 font-mono tracking-widest">{{ appState.mp.code }}</span>
          </div>
          <div v-if="appState.mp.connected" class="text-xs text-green-400/80">Conectado</div>
          <div v-else class="text-xs text-yellow-400/60 animate-pulse">Esperando...</div>
          <div v-if="appState.mp.ping" class="text-xs text-green-400/80">ping OK ✓</div>
          <button v-if="appState.mp.role === 'host'" class="mp-btn mt-1" @click="copyInviteLink">
            {{ linkCopied ? 'Enlace copiado ✓' : 'Copiar enlace de invitación' }}
          </button>
        </div>
      </div>

      <div class="mt-10 text-[11px] text-cyan-300/40 space-y-1">
        <p>Clic en una estructura del panel inferior y clic en el mapa para construir.</p>
        <p>Clic derecho o Esc para cancelar · usa Nodos para extender la red.</p>
        <p>Habilidades del comandante: Z Mega Rayo · C EMP · V Reparación · B Bombardeo · N adelanta la oleada.</p>
      </div>
    </div>
    <Settings v-if="settingsOpen" :open="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

.lobby {
  @apply absolute inset-0 flex justify-center overflow-y-auto overflow-x-hidden py-8;
  background: radial-gradient(ellipse at 50% 40%, #0e1b33 0%, #05070f 70%);
}

.title {
  @apply text-5xl sm:text-6xl font-extrabold tracking-[0.15em] text-white;
  text-shadow: 0 0 24px rgba(108, 200, 255, 0.55);
}
.subtitle {
  @apply text-xl sm:text-2xl font-semibold tracking-[0.5em] text-cyan-300/80 mt-1;
}

.diff-btn {
  @apply px-5 py-1.5 text-sm rounded-full bg-white/5 ring-1 ring-cyan-400/20
         text-cyan-200/70 hover:bg-cyan-400/10 hover:text-white transition-colors;
}
.diff-btn--active {
  @apply bg-cyan-400/20 text-white ring-cyan-300/60;
}

.play-btn {
  @apply px-14 py-3 text-lg font-bold tracking-widest rounded-xl text-[#05070f]
         bg-cyan-300 hover:bg-cyan-200 active:scale-95 transition-all;
  box-shadow: 0 0 30px rgba(108, 200, 255, 0.5);
}

.menu-btn {
  @apply px-4 py-1.5 text-sm font-semibold rounded-lg bg-white/5 ring-1 ring-cyan-400/25
         text-cyan-100 hover:bg-cyan-400/15 active:scale-95 transition-all;
}
.menu-btn--shop {
  @apply ring-amber-300/40 text-amber-100 hover:bg-amber-400/15;
  box-shadow: 0 0 14px rgba(255, 176, 46, 0.25);
}
.lvl-badge {
  @apply w-9 h-9 shrink-0 flex items-center justify-center rounded-lg font-extrabold text-[#05070f] bg-cyan-300;
  box-shadow: 0 0 14px rgba(139, 233, 253, 0.5);
}
.mode-card {
  @apply relative overflow-hidden rounded-xl ring-1 ring-cyan-400/20 text-left transition-all
         hover:ring-cyan-300/50 active:scale-[0.98];
  min-height: 9rem;
}
.mode-card--active {
  @apply ring-2 ring-cyan-300;
  box-shadow: 0 0 22px rgba(108, 200, 255, 0.35);
}
.mode-art {
  @apply absolute inset-0 w-full h-full object-cover opacity-60;
}
.mode-body {
  @apply relative block p-3 pt-12 h-full;
  background: linear-gradient(to top, rgba(5, 7, 15, 0.95) 35%, rgba(5, 7, 15, 0));
}
.sector-btn {
  @apply py-1.5 rounded-md text-sm font-bold bg-white/5 ring-1 ring-cyan-400/20 text-cyan-100
         hover:bg-cyan-400/10 transition-colors;
}
.sector-btn--active { @apply bg-cyan-400/25 ring-cyan-300 text-white; }
.sector-btn--locked { @apply opacity-40 cursor-not-allowed; }

.mp-btn {
  @apply px-4 py-1.5 text-sm rounded-md bg-white/5 ring-1 ring-cyan-400/20
         text-cyan-200/80 hover:bg-cyan-400/10 hover:text-white active:scale-95 transition-all;
}

/* CSS starfield via layered radial-gradient dots that drift slowly. */
.stars {
  position: absolute;
  inset: -50%;
  background-repeat: repeat;
  opacity: 0.7;
}
.stars--far {
  background-image: radial-gradient(1px 1px at 20px 30px, #fff, transparent),
    radial-gradient(1px 1px at 120px 80px, #cfe8ff, transparent),
    radial-gradient(1px 1px at 200px 160px, #fff, transparent),
    radial-gradient(1px 1px at 300px 50px, #9bd4ff, transparent);
  background-size: 320px 220px;
  animation: drift 90s linear infinite;
  opacity: 0.4;
}
.stars--near {
  background-image: radial-gradient(2px 2px at 80px 120px, #fff, transparent),
    radial-gradient(1.5px 1.5px at 240px 200px, #bfe3ff, transparent),
    radial-gradient(2px 2px at 360px 90px, #fff, transparent);
  background-size: 420px 300px;
  animation: drift 55s linear infinite;
}
@keyframes drift {
  from { transform: translate(0, 0); }
  to { transform: translate(-320px, 0); }
}
</style>
