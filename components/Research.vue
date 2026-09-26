<script setup lang="ts">
import { computed } from 'vue'
import { appState } from '~/game/appState'
import { profile, levelFromXp } from '~/game/meta/profile'
import { RESEARCH, researchState, buyResearch } from '~/game/meta/research'
import { sfxUi, sfxPurchase } from '~/game/sound'

// Árbol de progreso entre partidas: tres columnas, cada nodo con requisito, nivel y precio.
const COLS = ['Ingeniería', 'Mando', 'Logística']
const COL_ICON: Record<string, string> = { 'Ingeniería': '⚙', 'Mando': '⚡', 'Logística': '▣' }
const lvl = computed(() => levelFromXp(profile.xp))

const columns = computed(() =>
  COLS.map((c) => ({
    name: c,
    nodes: RESEARCH.filter((r) => r.col === c).map((r) => ({ ...r, state: researchState(r) })),
  }))
)
const done = computed(() => profile.research.length)

const LABEL: Record<string, string> = {
  owned: 'Investigado',
  locked: 'Requiere la anterior',
  level: 'Nivel insuficiente',
  poor: 'Falta Chatarra',
  available: 'Investigar',
}

function buy(id: string) {
  if (buyResearch(id)) sfxPurchase()
  else sfxUi('error')
}

function back() {
  sfxUi('click')
  appState.view = 'lobby'
}
</script>

<template>
  <div class="research">
    <header class="flex items-center gap-3 flex-wrap">
      <button class="back-btn" @click="back">← Volver</button>
      <h1 class="text-2xl sm:text-3xl font-extrabold tracking-widest text-white">INVESTIGACIÓN</h1>
      <div class="ml-auto flex items-center gap-3 text-sm">
        <span class="text-cyan-200">Nivel <b>{{ lvl.level }}</b></span>
        <span class="text-amber-200 tabular-nums">⚙ {{ profile.scrap }} Chatarra</span>
      </div>
    </header>
    <p class="mt-1 text-xs text-cyan-300/60">
      Progreso entre partidas: {{ done }}/{{ RESEARCH.length }} proyectos. La Chatarra se gana jugando (más en sectores altos y en victorias).
    </p>

    <div class="mt-5 grid gap-4 md:grid-cols-3">
      <section v-for="col in columns" :key="col.name" class="col">
        <h2 class="text-sm font-bold tracking-widest text-cyan-200 mb-3">{{ COL_ICON[col.name] }} {{ col.name.toUpperCase() }}</h2>
        <div class="space-y-2.5">
          <div v-for="(n, i) in col.nodes" :key="n.id" class="relative">
            <span v-if="i > 0 && n.requires" class="link" :class="{ 'link--on': n.state !== 'locked' }" />
            <div class="node" :class="'node--' + n.state">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="text-sm font-bold">{{ n.state === 'owned' ? '✓ ' : '' }}{{ n.label }}</div>
                  <div class="text-[11px] opacity-75 leading-snug mt-0.5">{{ n.desc }}</div>
                </div>
                <div class="text-right shrink-0 text-[11px] leading-tight">
                  <div class="text-amber-200 tabular-nums">⚙ {{ n.cost }}</div>
                  <div :class="lvl.level >= (n.level || 1) ? 'text-cyan-300/70' : 'text-red-300'">Nv {{ n.level || 1 }}</div>
                </div>
              </div>
              <button
                v-if="n.state !== 'owned'"
                class="buy"
                :disabled="n.state !== 'available'"
                @click="buy(n.id)"
              >
                {{ LABEL[n.state] }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

.research {
  @apply absolute inset-0 overflow-y-auto px-4 sm:px-8 py-5 text-cyan-100;
  background: radial-gradient(ellipse at 50% 0%, #13213d 0%, #05070f 70%);
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
}
.back-btn {
  @apply px-3 py-1.5 rounded-lg text-sm bg-white/5 ring-1 ring-cyan-400/25 hover:bg-cyan-400/15;
}
.col {
  @apply p-3 rounded-2xl bg-white/[0.03] ring-1 ring-cyan-400/10;
}
.node {
  @apply p-3 rounded-xl ring-1 transition-colors;
}
.node--owned { @apply bg-emerald-400/10 ring-emerald-300/40 text-emerald-50; }
.node--available { @apply bg-cyan-400/10 ring-cyan-300/50 text-white; box-shadow: 0 0 14px rgba(108, 200, 255, 0.2); }
.node--poor { @apply bg-white/5 ring-amber-300/20 text-cyan-50/80; }
.node--level, .node--locked { @apply bg-black/20 ring-white/5 text-cyan-100/40; }
.buy {
  @apply mt-2 w-full py-1.5 rounded-lg text-xs font-bold bg-cyan-300 text-[#05070f]
         disabled:bg-white/5 disabled:text-cyan-100/40 disabled:cursor-not-allowed active:scale-95 transition-all;
}
.link {
  @apply absolute left-6 -top-2.5 h-2.5 w-0.5 bg-white/10;
}
.link--on { @apply bg-cyan-300/60; }
</style>
