<script setup>
import GameCanvas from './components/GameCanvas.vue'
import Hud from './components/Hud.vue'
import Lobby from './components/Lobby.vue'
import { appState } from './game/appState.js'
</script>

<template>
  <div class="relative w-full h-full bg-[#05070f] select-none">
    <Lobby v-if="appState.view === 'lobby'" />

    <template v-else>
      <!-- Phaser game canvas (WebGL) -->
      <GameCanvas />
      <!-- Vue HUD overlay on top of the canvas -->
      <Hud />
    </template>
  </div>
</template>
