<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGame } from '~/game/createGame'

const host = ref(null)
let game = null
let ro = null
let unmounted = false

// Phaser no puede arrancar con un contenedor de 0×0 (WebGL: "Framebuffer incomplete"). Pasa si la
// partida empieza con la pestaña en segundo plano o la ventana minimizada (p. ej. un invitado recibe
// el 'start' del anfitrión con el celular bloqueado): se espera a que el contenedor tenga tamaño.
function start() {
  const el = host.value
  if (unmounted || game || !el) return
  if (el.clientWidth > 0 && el.clientHeight > 0) {
    ro?.disconnect()
    ro = null
    game = createGame(el)
  } else if (!ro) {
    ro = new ResizeObserver(start)
    ro.observe(el)
  }
}

onMounted(() => {
  // Ensure DOM is ready before creating Phaser game
  setTimeout(start, 100)
})

onBeforeUnmount(() => {
  unmounted = true
  ro?.disconnect()
  if (game) {
    game.destroy(true)
    game = null
  }
})
</script>

<template>
  <div ref="host" class="absolute inset-0 w-full h-full"></div>
</template>
