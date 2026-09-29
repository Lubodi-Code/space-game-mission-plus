<script setup lang="ts">
import { computed } from 'vue'
import { gameState } from '~/game/gameState'
import { appState } from '~/game/appState'
import { bus } from '~/game/bus'
import { ABILITIES, ABILITY_ORDER } from '~/game/systems/abilities'

// Botonera de habilidades del comandante. Grande y táctil: en móvil es el control principal.
// El estado (cooldown/desbloqueo) lo publica systems/abilities.js en gameState.abilities.
const list = computed(() =>
  ABILITY_ORDER.map((id) => ({ ...ABILITIES[id], st: gameState.abilities[id] || { unlocked: id === 'megalaser', ready: true, cdLeft: 0, frac: 0 } }))
    .filter((a) => a.st.unlocked)
)

// El invitado también usa sus habilidades (cooldowns propios que llegan en el snapshot).
const hidden = computed(() => false)

function use(id: string) {
  bus.emit('ability', id)
}

// Anillo de cooldown: conic-gradient según la fracción restante.
function ring(frac: number) {
  const deg = Math.round(frac * 360)
  return { background: `conic-gradient(rgba(5,7,15,0.78) ${deg}deg, transparent ${deg}deg)` }
}
</script>

<template>
  <div v-if="!hidden" class="ability-bar pointer-events-auto">
    <button
      v-for="a in list"
      :key="a.id"
      class="ability-btn"
      :class="{
        'ability-btn--ready': a.st.ready && gameState.general.alive,
        'ability-btn--aim': gameState.abilityTargeting === a.id,
      }"
      :title="`${a.label} (${a.key}) — ${a.desc}`"
      @click="use(a.id)"
    >
      <span class="ability-icon">{{ a.icon }}</span>
      <span class="ability-label">{{ a.label }}</span>
      <span class="ability-key">{{ a.key }}</span>
      <span v-if="!a.st.ready" class="ability-cd" :style="ring(a.st.frac)">
        <span class="tabular-nums">{{ a.st.cdLeft }}</span>
      </span>
    </button>
    <div v-if="gameState.abilityTargeting" class="ability-hint">
      {{ ABILITIES[gameState.abilityTargeting].target === 'enemy' ? 'Tocá una nave enemiga' : 'Tocá la zona objetivo' }}
      · clic derecho / Esc cancela
    </div>
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

.ability-bar {
  @apply absolute right-3 bottom-24 flex flex-col items-end gap-2;
}
.ability-btn {
  @apply relative flex flex-col items-center justify-center w-16 h-16 rounded-2xl overflow-hidden
         bg-[#0a0f1c]/80 ring-1 ring-white/10 text-cyan-100/60 transition-all active:scale-90;
  backdrop-filter: blur(4px);
}
.ability-btn--ready {
  @apply ring-amber-300/60 text-amber-100;
  box-shadow: 0 0 16px rgba(255, 210, 74, 0.35), inset 0 0 12px rgba(255, 210, 74, 0.15);
}
.ability-btn--aim {
  @apply ring-2 ring-amber-200 scale-105;
  animation: aim 0.8s ease-in-out infinite;
}
.ability-icon { @apply text-2xl leading-none; }
.ability-label { @apply text-[9px] mt-0.5 font-semibold tracking-wide; }
.ability-key { @apply absolute top-1 left-1.5 text-[9px] font-mono opacity-50; }
.ability-cd {
  @apply absolute inset-0 flex items-center justify-center text-sm font-bold text-white;
}
.ability-hint {
  @apply px-2 py-1 rounded-md bg-amber-400/15 ring-1 ring-amber-300/40 text-[10px] text-amber-100;
}
@keyframes aim {
  0%, 100% { box-shadow: 0 0 10px rgba(255, 224, 102, 0.4); }
  50% { box-shadow: 0 0 26px rgba(255, 224, 102, 0.9); }
}
@media (max-height: 520px) {
  .ability-bar { bottom: 4.5rem; gap: 0.35rem; }
  .ability-btn { width: 3.25rem; height: 3.25rem; }
}
@media (max-width: 700px), (pointer: coarse) and (max-height: 520px) {
  .ability-bar { right: calc(0.4rem + env(safe-area-inset-right)); bottom: calc(3.5rem + env(safe-area-inset-bottom)); gap: 0.3rem; }
  .ability-btn { width: 3rem; height: 3rem; border-radius: 0.8rem; }
  .ability-icon { font-size: 1.5rem; }
  .ability-label, .ability-key { display: none; }
  .ability-hint { max-width: 9rem; text-align: right; }
}
</style>
