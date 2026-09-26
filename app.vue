<script setup>
// Components are auto-imported in Nuxt 3
import { appState } from '~/game/appState'
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
    </template>
  </div>
</template>
