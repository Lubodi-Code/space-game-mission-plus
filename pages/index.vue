<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { appState, goToLobby } from '~/game/appState'
import { net } from '~/game/net'

const soloNotice = ref(false)
let noticeTimer = null

watch(() => appState.mp.role, (role) => {
  if (role !== 'host') return
  net.onSolo = () => {
    appState.mp.role = 'solo'
    appState.mp.connected = false
    appState.mp.players = []
    appState.mp.status = 'idle'
    appState.mp.code = null
    appState.mp.attempt = 0
    soloNotice.value = true
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { soloNotice.value = false }, 4000)
  }
}, { immediate: true })

onBeforeUnmount(() => clearTimeout(noticeTimer))

// Multijugador: el invitado ve si se está reconectando o si el anfitrión se fue (lo decide Lobby.vue
// vía net.onReconnecting / onHostLost, que siguen activos durante la partida).
function leaveLostGame() {
  appState.mp.status = 'idle'
  goToLobby()
}

// El juego es la página principal: quien entra desde redes cae directo en el menú (la portada de
// marketing se quitó el 2026-11-09: 85 % de rebote y casi nadie pasaba a jugar). Solo cliente
// (routeRules '/' y '/jugar' → ssr:false); mientras baja el juego se ve spa-loading-template.html.
// '/jugar' queda como alias para los enlaces ya compartidos (con ?join= incluido).
definePageMeta({ alias: ['/jugar'] })
useHead({
  title: 'Space Game Mission Plus — Defendé tu Núcleo',
  htmlAttrs: { class: 'game-lock' },
  link: [{ rel: 'canonical', href: 'https://space-game-mission-plus.vercel.app/' }],
})
</script>

<template>
  <div class="relative w-full h-full bg-[#05070f] select-none">
    <Lobby v-if="appState.view === 'lobby'" />
    <Research v-else-if="appState.view === 'research'" />
    <Shop v-else-if="appState.view === 'shop'" />
    <Profile v-else-if="appState.view === 'profile'" />

    <template v-else>
      <!-- Phaser game canvas (WebGL) -->
      <GameCanvas />
      <!-- Vue HUD overlay on top of the canvas -->
      <Hud />
      <RotateHint v-if="appState.view === 'game'" />
      <Tutorial v-if="appState.view === 'game' && appState.mp.status !== 'lost'" :solo="appState.mp.role === 'solo'" />
      <div v-if="appState.mp.status === 'reconnecting'" class="net-banner">
        Reconectando con el anfitrión… (intento {{ appState.mp.attempt }})
      </div>
      <div v-if="soloNotice" class="net-banner" role="status">
        Todos los aliados se fueron · seguís en solitario
      </div>
      <div v-if="appState.mp.status === 'lost'" class="net-lost">
        <div class="net-lost-card">
          <p class="text-lg font-bold text-[#ffcc55]">El anfitrión se desconectó</p>
          <p class="mt-1 text-sm text-cyan-100/70">La partida terminó. Podés crear una sala nueva desde el menú.</p>
          <button class="net-lost-btn" @click="leaveLostGame">Volver al menú</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.net-banner {
  position: absolute; left: 50%; top: calc(3.5rem + env(safe-area-inset-top)); transform: translateX(-50%);
  z-index: 60; padding: 0.35rem 0.9rem; border-radius: 999px; font-size: 0.8rem;
  background: rgba(10, 15, 28, 0.85); color: #8be9fd; box-shadow: 0 0 0 1px rgba(139, 233, 253, 0.35);
  pointer-events: none;
}
.net-lost {
  position: absolute; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center;
  background: rgba(2, 4, 10, 0.7); padding: 1rem;
}
.net-lost-card {
  max-width: 22rem; width: 100%; text-align: center; padding: 1.25rem; border-radius: 1rem;
  background: #0a0f1c; box-shadow: 0 0 0 1px rgba(255, 204, 85, 0.4);
}
.net-lost-btn {
  margin-top: 1rem; min-height: 2.75rem; width: 100%; border-radius: 0.75rem; font-weight: 700;
  background: #ffcc55; color: #05070f;
}
</style>
