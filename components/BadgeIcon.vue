<script setup>
import { computed } from 'vue'
import { BADGE_TIERS, badgeShapeFor } from '~/game/meta/badges'

// Insignia de sector en SVG inline. tier 0 = bloqueada (silueta tenue con candado).
const props = defineProps({
  sector: { type: Number, default: 1 },
  tier: { type: Number, default: 0 },
  size: { type: Number, default: 64 },
})

// id único por instancia para que los degradados no choquen entre insignias
let uidCounter = (globalThis.__badgeUid = (globalThis.__badgeUid || 0) + 1)
const uid = `bd${uidCounter}`

const shape = computed(() => badgeShapeFor(props.sector))
const t = computed(() => Math.max(0, Math.min(3, props.tier)))
const metal = computed(() => BADGE_TIERS[t.value])
const locked = computed(() => t.value === 0)
const fill = computed(() => (locked.value ? `url(#${uid}-lock)` : `url(#${uid}-m)`))
const stroke = computed(() => (locked.value ? '#64748b' : metal.value.glow))
const label = computed(() => `Sector ${props.sector}: ${locked.value ? 'bloqueada' : metal.value.name}`)

// Estrella de 5 puntas centrada en (50,44)
const star = computed(() => {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 9 : 21
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(44 + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
})
</script>

<template>
  <span class="badge" :class="{ 'badge--gold': t === 3, 'badge--locked': locked }" :style="{ width: size + 'px', height: size + 'px' }" role="img" :aria-label="label" :title="label">
    <svg viewBox="0 0 100 100" :width="size" :height="size" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient :id="uid + '-m'" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="metal?.light" />
          <stop offset="0.5" :stop-color="metal?.mid" />
          <stop offset="1" :stop-color="metal?.dark" />
        </linearGradient>
        <linearGradient :id="uid + '-lock'" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#475569" />
          <stop offset="1" stop-color="#1e293b" />
        </linearGradient>
      </defs>

      <g class="badge-body" :class="{ 'badge-shine': t === 3 }" :opacity="locked ? 0.35 : 1" :stroke="stroke" stroke-width="2" stroke-linejoin="round" :fill="fill">
        <!-- Galones: 1 a 3 chevrones sobre una placa -->
        <template v-if="shape.kind === 'chevrons'">
          <circle cx="50" cy="46" r="34" fill-opacity="0.18" />
          <path v-for="i in shape.chevrons" :key="i" :d="`M22 ${58 - (i - 1) * 14 - 8} L50 ${58 - (i - 1) * 14 - 26} L78 ${58 - (i - 1) * 14 - 8} L78 ${58 - (i - 1) * 14 - 1} L50 ${58 - (i - 1) * 14 - 19} L22 ${58 - (i - 1) * 14 - 1} Z`" />
        </template>

        <!-- Escudo con alas -->
        <template v-else-if="shape.kind === 'winged-shield'">
          <path d="M44 38 C30 30 14 30 4 40 C14 40 22 44 26 50 C16 50 10 54 6 60 C20 58 32 56 44 54 Z" />
          <path d="M56 38 C70 30 86 30 96 40 C86 40 78 44 74 50 C84 50 90 54 94 60 C80 58 68 56 56 54 Z" />
          <path d="M30 24 L50 18 L70 24 L70 52 C70 66 60 74 50 80 C40 74 30 66 30 52 Z" />
          <path d="M38 30 L50 26 L62 30 L62 52 C62 61 56 66 50 70 C44 66 38 61 38 52 Z" fill-opacity="0.35" />
        </template>

        <!-- Estrella de 5 puntas con alas -->
        <template v-else-if="shape.kind === 'winged-star'">
          <path d="M30 40 C20 30 8 30 2 38 C10 38 16 42 18 48 C10 48 6 52 4 58 C14 56 24 54 32 52 Z" />
          <path d="M70 40 C80 30 92 30 98 38 C90 38 84 42 82 48 C90 48 94 52 96 58 C86 56 76 54 68 52 Z" />
          <circle cx="50" cy="46" r="27" fill-opacity="0.22" />
          <polygon :points="star" />
        </template>

        <!-- Corona con laureles -->
        <template v-else>
          <path d="M24 78 C8 70 4 48 12 28 C14 40 20 48 28 52 C20 52 16 56 16 62 C22 60 26 62 30 66 C22 68 20 72 24 78 Z" />
          <path d="M76 78 C92 70 96 48 88 28 C86 40 80 48 72 52 C80 52 84 56 84 62 C78 60 74 62 70 66 C78 68 80 72 76 78 Z" />
          <path d="M30 62 L26 32 L40 46 L50 26 L60 46 L74 32 L70 62 Z" />
          <rect x="30" y="62" width="40" height="8" rx="2" />
          <circle cx="26" cy="31" r="3" /><circle cx="50" cy="25" r="3.5" /><circle cx="74" cy="31" r="3" />
        </template>
      </g>

      <!-- Número de sector -->
      <g v-if="!locked">
        <circle cx="50" cy="84" r="12" fill="#0a0f1c" :stroke="stroke" stroke-width="2" />
        <text x="50" y="84" text-anchor="middle" dominant-baseline="central" :fill="metal.light" font-size="14" font-weight="800" font-family="system-ui, sans-serif">{{ sector }}</text>
      </g>

      <!-- Candado -->
      <g v-else transform="translate(50 52)">
        <rect x="-11" y="-2" width="22" height="17" rx="3" fill="#94a3b8" />
        <path d="M-6 -2 V-8 a6 6 0 0 1 12 0 V-2" fill="none" stroke="#94a3b8" stroke-width="3" />
        <circle cx="0" cy="6" r="2.2" fill="#1e293b" />
      </g>
    </svg>
  </span>
</template>

<style scoped>
.badge { display: inline-block; line-height: 0; flex: none; filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.35)); }
.badge--locked { filter: none; }
.badge--gold { filter: drop-shadow(0 0 6px rgba(255, 210, 74, 0.55)); }
/* Brillo sutil del oro: pulso de luminosidad del metal */
.badge-shine { animation: badge-shine 2.8s ease-in-out infinite; }
@keyframes badge-shine {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.35) saturate(1.15); }
}
@media (prefers-reduced-motion: reduce) { .badge-shine { animation: none; } }
</style>
