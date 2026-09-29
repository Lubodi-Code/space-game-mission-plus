<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { startGame, DIFFICULTY, appState } from '~/game/appState'
import { MODES, DEFAULT_MODE } from '~/game/modes/index'
import { SECTORS } from '~/game/meta/sectors'
import { profile, levelFromXp } from '~/game/meta/profile'
import { net } from '~/game/net'
import { playerColor } from '~/game/net/protocol'
import { initUiSound, sfxUi } from '~/game/sound'
import Settings from './Settings.vue'
import AccountPanel from './AccountPanel.vue'
import { friends, dismissInvite } from '~/game/meta/friends'
import { account, displayName, initAccount } from '~/game/meta/account'

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
onMounted(() => initAccount())
watch(() => account.user, (user) => {
  if (user && (!playerName.value.trim() || playerName.value === 'Comandante')) {
    playerName.value = displayName(user) || 'Comandante'
  }
}, { immediate: true })
const linkCopied = ref(false)
const roomError = ref('')
const forceStart = ref(false)
const waitingCount = computed(() => appState.mp.players.filter((p) => !p.host && !p.ready).length)
const ownReady = computed(() => appState.mp.players.find((p) => p.pid === net.myPid)?.ready || false)
const playerHex = (pid) => `#${playerColor(pid).toString(16).padStart(6, '0')}`

function copyInviteLink() {
  const url = `${location.origin}${location.pathname}?join=${appState.mp.code}`
  navigator.clipboard.writeText(url)
  linkCopied.value = true
  setTimeout(() => { linkCopied.value = false }, 1500)
}

function saveName() {
  appState.playerName = playerName.value.slice(0, 16) || 'Comandante'
  localStorage.setItem('sgmp_name', appState.playerName)
}

function play() {
  if (appState.mp.role === 'client' || appState.mp.status === 'connecting' || appState.mp.status === 'reconnecting') return
  if (appState.mp.role === 'host') {
    if (waitingCount.value && !forceStart.value) { forceStart.value = true; return }
    const seed = Math.floor(Math.random() * 0x80000000)
    net.send({ t: 'start', difficulty: difficulty.value, mode: mode.value, sector: sector.value, seed })
    startGame(difficulty.value, mode.value, sector.value, seed)
    return
  }
  saveName()
  initUiSound()
  startGame(difficulty.value, mode.value, sector.value)
}

function leaveRoom(status = 'idle') {
  appState.mp.role = 'solo'
  appState.mp.connected = false
  appState.mp.code = null
  appState.mp.players = []
  appState.mp.status = status
  appState.mp.attempt = 0
  forceStart.value = false
  net.leave()
}

function publishRoster() {
  forceStart.value = false
  net.send({ t: 'roster', players: appState.mp.players })
}

function connectionError(err) {
  roomError.value = `Error de conexión: ${err?.message || String(err)}`
  if (appState.mp.status === 'connecting') leaveRoom()
}

function setConnectionHandlers(role) {
  net.onOpen = () => {
    if (appState.mp.role !== role) return
    appState.mp.connected = true
    appState.mp.status = 'connected'
    appState.mp.attempt = 0
    roomError.value = ''
  }
  net.onReconnecting = (attempt) => {
    if (appState.mp.role !== role) return
    appState.mp.connected = false
    appState.mp.status = 'reconnecting'
    appState.mp.attempt = attempt
  }
  net.onReconnected = () => {
    if (appState.mp.role !== role) return
    appState.mp.connected = true
    appState.mp.status = 'connected'
    appState.mp.attempt = 0
    roomError.value = ''
  }
  net.onError = (err) => {
    if (appState.mp.role === role) connectionError(err)
  }
  net.onHostLost = () => {
    if (appState.mp.role !== 'client') return
    leaveRoom('lost')
    roomError.value = ''
  }
}

async function hostGame() {
  saveName()
  const code = Math.random().toString(36).slice(2, 6).toUpperCase()
  roomError.value = ''
  net.myEquipped = { ...profile.cosmetics.equipped }
  appState.mp.role = 'host'
  appState.mp.code = code
  appState.mp.players = [{ pid: 0, name: appState.playerName, ready: true, host: true, equipped: net.myEquipped }]
  appState.mp.status = 'connecting'
  appState.mp.connected = false
  appState.mp.attempt = 0
  setConnectionHandlers('host')
  net.onData = (d, conn) => {
    if (appState.mp.role !== 'host') return
    if (d.t === 'hello') {
      conn.name = d.name
      const previous = appState.mp.players.find((p) => p.pid === conn.pid)
      const player = { pid: conn.pid, name: d.name || 'Comandante', ready: previous?.ready || false, host: false, equipped: d.equipped }
      appState.mp.players = [...appState.mp.players.filter((p) => p.pid !== conn.pid), player].sort((a, b) => a.pid - b.pid)
      publishRoster()
    } else if (d.t === 'ready') {
      const player = appState.mp.players.find((p) => p.pid === conn.pid)
      if (player) { player.ready = d.ready; publishRoster() }
    }
  }
  net.onDisconnect = (conn) => {
    if (appState.mp.role !== 'host') return
    appState.mp.players = appState.mp.players.filter((p) => p.pid !== conn.pid)
    publishRoster()
  }
  try {
    await net.host(code, appState.playerName)
    if (appState.mp.role === 'host' && appState.mp.code === code) {
      appState.mp.connected = true
      appState.mp.status = 'connected'
    }
  } catch (err) {
    if (appState.mp.role === 'host' && appState.mp.code === code) connectionError(err)
  }
}

// Invitación de un amigo (Realtime): unirse usa el mismo flujo que escribir el código a mano.
function acceptInvite() {
  const inv = friends.invite
  if (!inv) return
  joinCode.value = inv.roomCode
  dismissInvite()
  void joinGame()
}

async function joinGame() {
  saveName()
  const code = joinCode.value.trim().toUpperCase()
  if (!code) return
  roomError.value = ''
  net.myEquipped = { ...profile.cosmetics.equipped }
  appState.mp.role = 'client'
  appState.mp.code = code
  appState.mp.players = []
  appState.mp.status = 'connecting'
  appState.mp.connected = false
  appState.mp.attempt = 0
  setConnectionHandlers('client')
  net.onData = (d) => {
    if (appState.mp.role !== 'client') return
    if (d.t === 'welcome') {
      net.myPid = d.pid
    } else if (d.t === 'roster') {
      appState.mp.players = d.players
    } else if (d.t === 'start') {
      startGame(d.difficulty, d.mode, d.sector, d.seed)
    } else if (d.t === 'snap') {
      appState.mp.connected = true
      appState.mp.status = 'connected'
      appState.view = 'game'
    }
  }
  net.onDisconnect = () => {
    if (appState.mp.role === 'client') appState.mp.connected = false
  }
  try {
    await net.join(code, appState.playerName)
  } catch (err) {
    if (appState.mp.role === 'client' && appState.mp.code === code) connectionError(err)
  }
}

function toggleReady() {
  if (appState.mp.status !== 'connected') return
  net.send({ t: 'ready', ready: !ownReady.value })
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

      <AccountPanel class="mt-6 w-full max-w-md" />
      <div v-if="friends.invite && appState.mp.role === 'solo'" class="invite mt-3 w-full max-w-md" role="status">
        <img v-if="friends.invite.fromAvatar" :src="friends.invite.fromAvatar" alt="" referrerpolicy="no-referrer" class="invite-avatar" />
        <span class="invite-text"><b>{{ friends.invite.fromName }}</b> te invita a su sala</span>
        <button type="button" class="invite-go" @click="acceptInvite">Unirse</button>
        <button type="button" class="invite-x" aria-label="Descartar invitación" @click="dismissInvite">✕</button>
      </div>

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

      <button
        v-if="appState.mp.role !== 'client'"
        class="play-btn mt-8"
        :disabled="appState.mp.status === 'connecting' || appState.mp.status === 'reconnecting'"
        @click="play"
      >JUGAR</button>
      <p v-if="appState.mp.role === 'host' && forceStart && waitingCount" class="mt-3 max-w-xs text-sm text-amber-200">
        Esperando a {{ waitingCount }} jugador(es) · tocá de nuevo para empezar igual
      </p>

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

        <div v-else class="flex flex-col items-center gap-3 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-cyan-300/60">Código:</span>
            <span class="text-cyan-200 font-mono tracking-widest">{{ appState.mp.code }}</span>
          </div>
          <div v-if="appState.mp.status === 'connecting'" class="text-xs text-amber-200 animate-pulse">Conectando…</div>
          <div v-else-if="appState.mp.status === 'reconnecting'" class="text-xs text-amber-200 animate-pulse">
            Reconectando (intento {{ appState.mp.attempt }})…
          </div>
          <div v-else-if="appState.mp.status === 'connected'" class="text-xs text-green-400/80">Conectado</div>
          <ul v-if="appState.mp.players.length" class="w-full space-y-1.5 text-left" aria-label="Jugadores en la sala">
            <li v-for="player in appState.mp.players" :key="player.pid" class="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 ring-1 ring-cyan-400/10">
              <span class="h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: playerHex(player.pid) }" aria-hidden="true"></span>
              <span class="min-w-0 flex-1 truncate text-cyan-100">{{ player.name }}</span>
              <span v-if="player.host" class="text-amber-200" title="Anfitrión" aria-label="Anfitrión">♛</span>
              <span v-if="player.ready" class="text-green-300" title="Listo" aria-label="Listo">✓</span>
              <span v-else class="text-cyan-300/50 text-xs">No listo</span>
            </li>
          </ul>
          <button v-if="appState.mp.role === 'client'" class="ready-btn w-full" :disabled="appState.mp.status !== 'connected'" @click="toggleReady">
            {{ ownReady ? 'No listo' : 'Estoy listo' }}
          </button>
          <button v-if="appState.mp.role === 'host'" class="mp-btn mt-1" @click="copyInviteLink">
            {{ linkCopied ? 'Enlace copiado ✓' : 'Copiar enlace de invitación' }}
          </button>
          <button class="text-xs text-cyan-200/60 underline underline-offset-4 hover:text-cyan-100" @click="leaveRoom()">Salir de la sala</button>
        </div>
        <p v-if="appState.mp.status === 'lost'" class="mt-3 text-sm text-amber-200">El anfitrión se desconectó. Volviste al modo solo.</p>
        <p v-if="roomError" class="mt-3 text-sm text-red-300" role="alert">{{ roomError }}</p>
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
.invite {
  display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.6rem 0.55rem 0.75rem; border-radius: 0.9rem; text-align: left;
  background: linear-gradient(135deg, rgba(80,250,123,0.14), rgba(10,15,28,0.9) 60%); box-shadow: inset 0 0 0 1px rgba(80,250,123,0.45);
  animation: invite-in 0.3s ease-out;
}
.invite-avatar { width: 2rem; height: 2rem; border-radius: 999px; object-fit: cover; flex: none; }
.invite-text { flex: 1; min-width: 0; font-size: 0.85rem; color: #cfe8ff; }
.invite-text b { color: #fff; }
.invite-go { min-height: 2.25rem; padding: 0 0.9rem; border-radius: 0.7rem; background: #50fa7b; color: #05070f; font-weight: 800; font-size: 0.8rem; }
.invite-x { width: 2rem; height: 2rem; border-radius: 999px; color: rgba(207,232,255,0.6); }
@keyframes invite-in { from { opacity: 0; transform: translateY(-6px); } }
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
.play-btn:disabled { @apply opacity-50 cursor-not-allowed; }

.ready-btn {
  @apply rounded-xl bg-green-300 px-5 py-3 text-base font-bold text-[#05070f]
         hover:bg-green-200 active:scale-95 transition-all;
}
.ready-btn:disabled { @apply opacity-50 cursor-not-allowed; }

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
