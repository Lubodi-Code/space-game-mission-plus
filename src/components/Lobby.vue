<script setup>
import { ref } from 'vue'
import { startGame, DIFFICULTY } from '../game/appState.js'
import { appState } from '../game/appState.js'
import { MODES } from '../game/modes/index.js'
import { net } from '../game/net.js'

const difficulty = ref('normal')
const mode = ref('campaign')
const joinCode = ref('')
const playerName = ref(localStorage.getItem('sgmp_name') || 'Comandante')

function play() {
  appState.playerName = playerName.value.slice(0, 16) || 'Comandante'
  localStorage.setItem('sgmp_name', appState.playerName)
  startGame(difficulty.value, mode.value)
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

    <div class="relative z-10 flex flex-col items-center text-center px-6">
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

      <!-- Modo -->
      <div class="mt-6">
        <p class="text-xs text-cyan-300/50 mb-2 tracking-widest">MODO</p>
        <div class="flex gap-2">
          <button
            v-for="(m, key) in MODES"
            :key="key"
            class="diff-btn"
            :class="{ 'diff-btn--active': mode === key }"
            :title="m.desc"
            @click="mode = key"
          >
            {{ m.label }}
          </button>
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
        </div>
      </div>

      <div class="mt-10 text-[11px] text-cyan-300/40 space-y-1">
        <p>Clic en una estructura del panel inferior y clic en el mapa para construir.</p>
        <p>Clic derecho o Esc para cancelar · usa Nodos para extender la red.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

.lobby {
  @apply absolute inset-0 flex items-center justify-center overflow-hidden;
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
