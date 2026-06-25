<script setup>
import { ref } from 'vue'
import { startGame, DIFFICULTY } from '../game/appState.js'

const difficulty = ref('normal')

function play() {
  startGame(difficulty.value)
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
        defensas y sobrevive a <b class="text-cyan-200">10 oleadas</b> de la horda.
      </p>

      <!-- Difficulty -->
      <div class="mt-8 flex gap-2">
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

      <button class="play-btn mt-8" @click="play">JUGAR</button>

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
