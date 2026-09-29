<script setup lang="ts">
import { computed, ref } from 'vue'
import { account, displayName, isGuest } from '~/game/meta/account'
import { cloud } from '~/game/meta/cloudSave'
import { profile, levelFromXp } from '~/game/meta/profile'
import { appState } from '~/game/appState'
import LoginSheet from './LoginSheet.vue'

// Chip de cuenta del Lobby: quién sos, tu nivel y si tu progreso está en la nube.
// Tocarlo abre el perfil (también como invitado); "Iniciar sesión" abre la hoja de login.
const sheet = ref(false)
const name = computed(() => (account.user ? displayName(account.user) : '') || 'Invitado')
const avatar = computed(() => account.user?.user_metadata?.avatar_url || '')
const lvl = computed(() => levelFromXp(profile.xp))
// Anillo de XP alrededor del avatar (circunferencia de r=21 ≈ 131.9).
const ring = computed(() => 131.9 * (1 - lvl.value.into / lvl.value.need))
const syncLabel = computed(() => {
  if (isGuest.value) return 'Guardado en este dispositivo'
  if (cloud.status === 'syncing') return 'Sincronizando…'
  if (cloud.status === 'error') return 'Sin conexión · se reintenta solo'
  if (cloud.status === 'saved') return 'Guardado en la nube'
  return 'Conectando con la nube…'
})
</script>

<template>
  <div class="chip" :class="{ 'chip--guest': isGuest }">
  <button type="button" class="chip-main" aria-label="Abrir perfil" @click="appState.view = 'profile'">
    <span class="chip-avatar">
      <svg viewBox="0 0 48 48" class="chip-ring" aria-hidden="true">
        <circle cx="24" cy="24" r="21" class="chip-ring-bg" />
        <circle cx="24" cy="24" r="21" class="chip-ring-fg" :style="{ strokeDashoffset: ring }" />
      </svg>
      <img v-if="avatar" :src="avatar" alt="" referrerpolicy="no-referrer" />
      <span v-else class="chip-initial">{{ isGuest ? '?' : name.charAt(0).toUpperCase() }}</span>
      <span class="chip-level">{{ lvl.level }}</span>
    </span>
    <span class="chip-text">
      <span class="chip-name">{{ name }}</span>
      <span class="chip-sync" :data-state="isGuest ? 'guest' : cloud.status">
        <i aria-hidden="true" />{{ syncLabel }}
      </span>
    </span>
  </button>
  <button v-if="isGuest && account.configured" type="button" class="chip-cta chip-cta--login" @click="sheet = true">Iniciar sesión</button>
  <button v-else type="button" class="chip-cta" @click="appState.view = 'profile'">Perfil ›</button>
  </div>
  <LoginSheet :open="sheet" @close="sheet = false" />

</template>

<style scoped>
.chip-main { display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0; text-align: left; }
.chip-main:focus-visible, .chip-cta:focus-visible { outline: 2px solid #ffcc55; outline-offset: 3px; border-radius: 0.6rem; }
.chip-cta--login { padding: 0.45rem 0.75rem; border-radius: 999px; background: #ffcc55; color: #05070f !important; }
.chip {
  display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.55rem 0.8rem 0.55rem 0.55rem;
  border-radius: 1rem; text-align: left; background: linear-gradient(135deg, rgba(139,233,253,0.10), rgba(10,15,28,0.85) 55%);
  box-shadow: inset 0 0 0 1px rgba(139,233,253,0.22), 0 8px 28px rgba(0,0,0,0.35); transition: transform 0.15s, box-shadow 0.15s;
}
.chip:hover { box-shadow: inset 0 0 0 1px rgba(139,233,253,0.45), 0 8px 28px rgba(0,0,0,0.35); }
.chip:active { transform: scale(0.985); }
.chip:focus-visible { outline: 2px solid #ffcc55; outline-offset: 3px; }
.chip--guest { background: linear-gradient(135deg, rgba(255,204,85,0.10), rgba(10,15,28,0.85) 55%); }

.chip-avatar { position: relative; flex: none; width: 3rem; height: 3rem; display: grid; place-items: center; }
.chip-avatar img, .chip-initial {
  width: 2.35rem; height: 2.35rem; border-radius: 999px; object-fit: cover; display: grid; place-items: center;
  background: #111a2e; color: #ffcc55; font-weight: 800; font-size: 1.05rem;
}
.chip-ring { position: absolute; inset: 0; transform: rotate(-90deg); }
.chip-ring-bg { fill: none; stroke: rgba(139,233,253,0.15); stroke-width: 3; }
.chip-ring-fg { fill: none; stroke: #8be9fd; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 131.9; transition: stroke-dashoffset 0.6s; filter: drop-shadow(0 0 4px rgba(139,233,253,0.6)); }
.chip-level {
  position: absolute; right: -0.15rem; bottom: -0.1rem; min-width: 1.2rem; height: 1.2rem; padding: 0 0.25rem;
  border-radius: 999px; background: #ffcc55; color: #05070f; font-size: 0.68rem; font-weight: 800; display: grid; place-items: center;
  box-shadow: 0 0 0 2px #0a0f1c;
}
.chip-text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
.chip-name { color: #fff; font-weight: 700; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip-sync { display: flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; color: rgba(139,233,253,0.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip-sync i { width: 0.45rem; height: 0.45rem; border-radius: 999px; background: #50fa7b; flex: none; }
.chip-sync[data-state='guest'] i { background: #ffcc55; }
.chip-sync[data-state='syncing'] i, .chip-sync[data-state='off'] i { background: #8be9fd; animation: pulse 1s infinite; }
.chip-sync[data-state='error'] i { background: #ff5566; }
.chip-cta { flex: none; font-size: 0.75rem; font-weight: 700; color: #8be9fd; }
.chip--guest .chip-cta { color: #ffcc55; }
@keyframes pulse { 50% { opacity: 0.3; } }

</style>
