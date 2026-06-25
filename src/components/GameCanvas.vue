<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGame } from '../game/createGame.js'

const host = ref(null)
let game = null

onMounted(() => {
  game = createGame(host.value)
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
