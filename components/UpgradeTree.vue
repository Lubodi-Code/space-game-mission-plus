<script setup lang="ts">
import { computed } from 'vue'
import { gameState } from '~/game/gameState'
import { buildUpgradeTree } from '~/game/structures/upgrades'
import '~/game/meta/research' // registra el hook de investigación antes de evaluar el árbol

// Árbol de mejoras propio de un edificio (o del General). Dos ramas lado a lado; cada nodo
// muestra sus efectos. En edificios las ramas son excluyentes (ver upgrades.js).
const props = defineProps<{
  role: string
  owned: string[]
  hotkeys?: boolean
}>()
const emit = defineEmits<{ (e: 'buy', id: string): void }>()

const tree = computed(() => buildUpgradeTree(props.role, props.owned))

// Q/E/R siguen el orden de "disponibles" que usa Hud.vue (getUpgradesFor); aquí solo se pintan.
const KEYS = ['Q', 'E', 'R']
const availableOrder = computed(() =>
  tree.value.flatMap((b) => b.nodes).filter((n) => n.state === 'available').map((n) => n.id)
)

const STATE_HINT: Record<string, string> = {
  locked: 'Requiere la mejora anterior',
  research: 'Desbloquéala en Investigación (menú principal)',
  excluded: 'Rama bloqueada: ya elegiste la otra',
}

function hex(n: number) {
  return '#' + (n >>> 0).toString(16).padStart(6, '0')
}
</script>

<template>
  <div class="grid grid-cols-2 gap-1.5">
    <div v-for="br in tree" :key="br.branch" class="min-w-0">
      <div class="text-[10px] font-semibold tracking-wide mb-1 truncate"
           :class="br.nodes.some((n) => n.state === 'excluded') ? 'text-cyan-400/30' : 'text-cyan-300/80'">
        {{ br.branch }} · {{ br.name }}
      </div>
      <div class="space-y-1">
        <div v-for="(n, i) in br.nodes" :key="n.id" class="relative">
          <span v-if="i > 0" class="absolute left-2 -top-1 h-1 w-px"
                :class="n.state === 'owned' || n.state === 'available' ? 'bg-cyan-300/60' : 'bg-cyan-400/15'" />
          <div
            class="upg-node"
            :class="['upg-node--' + n.state]"
            :style="n.state === 'owned' ? { borderColor: hex(n.tint || 0x49e07a) } : {}"
            :title="STATE_HINT[n.state] || ''"
          >
            <div class="flex items-start justify-between gap-1">
              <span class="text-[10px] leading-tight font-semibold">
                <span v-if="n.state === 'owned'">✓ </span>
                <span v-else-if="n.state === 'research'">🔬 </span>
                <span v-else-if="n.state !== 'available'">🔒 </span>{{ n.label }}
              </span>
              <span v-if="n.state !== 'owned'" class="text-[9px] tabular-nums text-amber-300/80 shrink-0">{{ n.cost }}</span>
            </div>
            <ul class="mt-0.5 space-y-px">
              <li v-for="fx in n.effects" :key="fx" class="text-[9px] leading-tight opacity-75">{{ fx }}</li>
            </ul>
            <button
              v-if="n.state === 'available'"
              class="upg-buy"
              :disabled="gameState.minerals < n.cost"
              @click="emit('buy', n.id)"
            >
              Mejorar
              <span v-if="hotkeys && availableOrder.indexOf(n.id) > -1 && availableOrder.indexOf(n.id) < 3" class="opacity-50">
                {{ KEYS[availableOrder.indexOf(n.id)] }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

.upg-node {
  @apply px-1.5 py-1 rounded-md ring-1 border border-transparent;
}
.upg-node--owned { @apply bg-emerald-400/10 ring-emerald-400/30 text-emerald-100; }
.upg-node--available { @apply bg-white/5 ring-cyan-400/25 text-cyan-50; }
.upg-node--locked { @apply bg-white/[0.02] ring-cyan-400/10 text-cyan-100/50; }
.upg-node--research { @apply bg-fuchsia-500/5 ring-fuchsia-400/20 text-fuchsia-100/60; }
.upg-node--excluded { @apply bg-black/20 ring-white/5 text-cyan-100/25 line-through; }
.upg-buy {
  @apply mt-1 w-full px-1 py-1 rounded text-[10px] font-semibold bg-emerald-400/15 text-emerald-200
         hover:bg-emerald-400/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed;
}
</style>
