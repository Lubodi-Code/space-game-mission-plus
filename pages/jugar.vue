<script setup>
import { appState, goToLobby } from '~/game/appState'

// Multijugador: el invitado ve si se está reconectando o si el anfitrión se fue (lo decide Lobby.vue
// vía net.onReconnecting / onHostLost, que siguen activos durante la partida).
function leaveLostGame() {
  appState.mp.status = 'idle'
  goToLobby()
}

// El juego: solo cliente (routeRules '/jugar' → ssr:false). Bloquea el scroll de la página.
useHead({
  title: 'Jugar — Space Game Mission Plus',
  htmlAttrs: { class: 'game-lock' },
  meta: [{ name: 'robots', content: 'noindex' }],
  link: [{ rel: 'canonical', href: 'https://space-game-mission-plus.vercel.app/jugar' }],
})
</script>

<template>
  <div class="relative w-full h-full bg-[#05070f] select-none">
    <Lobby v-if="appState.view === 'lobby'" />
    <Research v-else-if="appState.view === 'research'" />
    <Shop v-else-if="appState.view === 'shop'" />

    <template v-else>
      <!-- Phaser game canvas (WebGL) -->
      <GameCanvas />
      <!-- Vue HUD overlay on top of the canvas -->
      <Hud />
      <Tutorial v-if="appState.view === 'game' && appState.mp.status !== 'lost'" :solo="appState.mp.role === 'solo'" />
      <div v-if="appState.mp.status === 'reconnecting'" class="net-banner">
        Reconectando con el anfitrión… (intento {{ appState.mp.attempt }})
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
