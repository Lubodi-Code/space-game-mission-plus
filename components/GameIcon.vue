<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number; title?: string }>(), { size: 16 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" role="img"
       :aria-label="title || name" class="inline-block shrink-0 align-middle">
    <title>{{ title || name }}</title>
    <g v-if="['damage', 'laser'].includes(name)"><path d="m4 20 5-5M7 17l-2-2m3-1 2 2M10 14 20 3l1 1-8 12-3-2Z"/><path d="m15 5 4 4" fill="currentColor" opacity=".18"/></g>
    <g v-else-if="['range', 'wave'].includes(name)"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/></g>
    <g v-else-if="['fireRate', 'speed'].includes(name)"><path d="M4 15a9 9 0 1 1 16 0M12 12l5-5M5 19h14"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></g>
    <g v-else-if="name === 'hp'"><path d="M12 21 4.5 13.7C-1 8.3 6 2 12 7c6-5 13 1.3 7.5 6.7L12 21Z" fill="currentColor" opacity=".16"/><path d="M12 21 4.5 13.7C-1 8.3 6 2 12 7c6-5 13 1.3 7.5 6.7L12 21Z"/><path d="M9 12h6m-3-3v6"/></g>
    <g v-else-if="['shield', 'shieldgen'].includes(name)"><path d="M12 2 20 5v6c0 5-3.2 8-8 11-4.8-3-8-6-8-11V5l8-3Z" fill="currentColor" opacity=".13"/><path d="M12 2 20 5v6c0 5-3.2 8-8 11-4.8-3-8-6-8-11V5l8-3Z"/><path d="M8 12h8"/></g>
    <g v-else-if="['splash', 'mortar'].includes(name)"><circle cx="12" cy="12" r="3" fill="currentColor" opacity=".24"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5M4 4l4 4m8 8 4 4M20 4l-4 4m-8 8-4 4"/></g>
    <g v-else-if="['slow', 'cryo'].includes(name)"><path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17M9 5l3 3 3-3m-6 14 3-3 3 3M4 11l4-1-1-4m13 7-4 1 1 4"/></g>
    <g v-else-if="['chain', 'tesla'].includes(name)"><path d="M4 17 9 7l3 5 3-7 5 2-6 12-3-5-3 5Z" fill="currentColor" opacity=".15"/><path d="M4 17 9 7l3 5 3-7 5 2-6 12-3-5-3 5Z"/></g>
    <g v-else-if="['pierce', 'railgun'].includes(name)"><path d="M3 12h17m-6-6 6 6-6 6M5 7v10m4-12v14"/><path d="m17 9 3 3-3 3" fill="currentColor" opacity=".2"/></g>
    <g v-else-if="['energy', 'energyDrain', 'battery'].includes(name)"><rect x="3" y="6" width="17" height="12" rx="2"/><path d="M20 10h2v4h-2M12 8l-3 5h3l-1 4 4-6h-3l1-3Z" fill="currentColor" opacity=".24"/></g>
    <g v-else-if="['mining', 'collector'].includes(name)"><path d="m4 20 9-9m-3-5 8 8M7 9c3-5 8-5 12-3-3-1-5 0-7 3"/><path d="m3 20 3-3 2 2-3 3Z" fill="currentColor" opacity=".2"/></g>
    <g v-else-if="['minerals', 'crystals'].includes(name)"><path d="m7 3 10 0 5 7-10 12L2 10l5-7Z" fill="currentColor" opacity=".15"/><path d="m7 3 10 0 5 7-10 12L2 10l5-7ZM2 10h20M7 3l5 7 5-7m-5 7v12"/></g>
    <g v-else-if="name === 'scrap'"><path d="M10 2h4l1 3 2 1 3-1 2 4-2 2v2l2 2-2 4-3-1-2 1-1 3h-4l-1-3-2-1-3 1-2-4 2-2v-2L2 9l2-4 3 1 2-1 1-3Z"/><path d="M9 10a4 4 0 0 1 6 0m-6 4a4 4 0 0 0 6 0"/></g>
    <g v-else-if="['heal', 'healer', 'swarm'].includes(name)"><circle cx="12" cy="12" r="8" fill="currentColor" opacity=".13"/><circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/><circle cx="20" cy="4" r="1" fill="currentColor"/><circle cx="4" cy="5" r="1" fill="currentColor"/></g>
    <g v-else-if="name === 'spheres'"><circle cx="12" cy="7" r="3"/><circle cx="7" cy="16" r="3"/><circle cx="17" cy="16" r="3"/><path d="m10 10-2 3m6-3 2 3M10 16h4"/></g>
    <g v-else-if="name === 'time'"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/><path d="M12 3v2"/></g>
    <g v-else-if="name === 'boss'"><path d="M5 15c-2-2-2-9 7-11 9 2 9 9 7 11l-2 1v4H7v-4l-2-1Z"/><path d="M7 12h3m4 0h3M10 17v3m4-3v3"/><circle cx="8.5" cy="12" r="1" fill="currentColor"/><circle cx="15.5" cy="12" r="1" fill="currentColor"/></g>
    <g v-else-if="name === 'xp'"><path d="m12 2 2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2Z" fill="currentColor" opacity=".18"/><path d="m12 2 2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2Z"/></g>
    <g v-else-if="name === 'node'"><path d="M12 3v18M3 12h18M5.5 5.5l13 13m0-13-13 13"/><circle cx="12" cy="12" r="4" fill="currentColor" opacity=".2"/><circle cx="12" cy="12" r="4"/></g>
    <g v-else-if="name === 'missile'"><path d="m8 15 8-11 4 4-11 8-1-1ZM8 15l-4 1 2 2 2-3Zm1 1-1 4 3-2-2-2Z" fill="currentColor" opacity=".15"/><path d="m8 15 8-11 4 4-11 8-1-1ZM8 15l-4 1 2 2 2-3Zm1 1-1 4 3-2-2-2Z"/><circle cx="16" cy="8" r="1"/></g>
    <g v-else-if="name === 'flak'"><path d="M12 19V8m-5 8 5-8 5 8M5 5l2 2m5-5v3m7 0-2 2M3 12h3m15 0h-3"/><circle cx="12" cy="7" r="2" fill="currentColor" opacity=".2"/></g>
    <g v-else-if="name === 'commander'"><circle cx="12" cy="7" r="3"/><path d="M6 21v-4a6 6 0 0 1 12 0v4H6ZM4 5l2 1m14-1-2 1M12 1v2" fill="currentColor" opacity=".12"/></g>
    <g v-else-if="name === 'lock'"><rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor" opacity=".12"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-8 0h8m-8 0H5v11h14V10h-3"/></g>
    <g v-else-if="name === 'research'"><path d="M9 2h6m-5 0v7l-5 8a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-8V2M8 15h8"/><path d="M8 15h8l2 3H6l2-3Z" fill="currentColor" opacity=".18"/></g>
    <g v-else-if="name === 'excluded'"><circle cx="12" cy="12" r="9"/><path d="m5.5 5.5 13 13"/></g>
    <g v-else><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" fill="currentColor" opacity=".12"/><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 6v8m-4-4h8"/></g>
  </svg>
</template>
