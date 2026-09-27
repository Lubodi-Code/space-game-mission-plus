<script setup lang="ts">
import { computed } from 'vue'
import { gameState } from '~/game/gameState'
import { buildUpgradeTree } from '~/game/structures/upgrades'
import GameIcon from './GameIcon.vue'
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

const EFFECT_ICONS: [RegExp, string][] = [
  [/daño|blanco|objetivo|perdigones|misiles|proyectiles|disparo|cono/i, 'damage'],
  [/cadencia|más seguido/i, 'fireRate'],
  [/alcance|radio|red|aura/i, 'range'],
  [/explosión|área|detonación/i, 'splash'],
  [/velocidad|vel\./i, 'speed'],
  [/recolección|minería|minado/i, 'mining'],
  [/energía/i, 'energy'],
  [/esferas/i, 'spheres'],
  [/cura|curación|repara/i, 'heal'],
  [/vida|HP/i, 'hp'],
  [/frío|congela|ralentiza/i, 'cryo'],
  [/salto|rayo/i, 'chain'],
  [/perfor|atraviesa/i, 'pierce'],
  [/domo|reducción/i, 'shield'],
  [/mineral/i, 'minerals'],
]
function effectChip(fx: string) {
  const icon = EFFECT_ICONS.find(([pattern]) => pattern.test(fx))?.[1] || 'xp'
  const value = fx.match(/[+−-]?\d+(?:[.,]\d+)?\s*%|[+−-]?\d+(?:[.,]\d+)?\s*(?:HP\/s|\/s|s)?|x\d+/i)?.[0]
    || (fx.includes('perforantes') ? 'perfora' : fx.includes('congela') ? 'congela' : fx.includes('más fuerte') ? 'más fuerte' : 'activo')
  return { icon, value, title: fx }
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
                <GameIcon v-else-if="n.state === 'research'" name="research" :size="11" title="Investigación" />
                <GameIcon v-else-if="n.state === 'excluded'" name="excluded" :size="11" title="Rama excluida" />
                <GameIcon v-else-if="n.state === 'locked'" name="lock" :size="11" title="Bloqueado" />
                {{ n.label }}
              </span>
              <span v-if="n.state !== 'owned'" class="text-[9px] tabular-nums text-amber-300/80 shrink-0 inline-flex items-center gap-0.5" title="Costo en minerales"><GameIcon name="minerals" :size="10" title="Minerales" />{{ n.cost }}</span>
            </div>
            <div class="mt-1 flex flex-wrap gap-0.5">
              <span v-for="fx in n.effects" :key="fx" class="effect-chip" :title="fx">
                <GameIcon :name="effectChip(fx).icon" :size="11" :title="fx" />{{ effectChip(fx).value }}
              </span>
            </div>
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
.effect-chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 3px; border-radius: 4px; background: rgba(139,233,253,.09); font-size: 9px; line-height: 1.1; white-space: nowrap; text-decoration: none; }
</style>
