<script setup>
import { appState } from '~/game/appState'

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
      <Tutorial v-if="appState.view === 'game'" :solo="appState.mp.role === 'solo'" />
    </template>
  </div>
</template>
