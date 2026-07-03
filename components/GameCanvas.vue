<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGame } from '~/game/createGame'

const host = ref(null)
let game = null

onMounted(() => {
  // Ensure DOM is ready before creating Phaser game
  setTimeout(() => {
    if (host.value) {
      game = createGame(host.value)
    }
  }, 100)
})

onBeforeUnmount(() => {
  if (game) {
    game.destroy(true)
    game = null
  }
})
</script>

<template>
  <div ref="host" class="absolute inset-0 w-full h-full"></div>
</template>
