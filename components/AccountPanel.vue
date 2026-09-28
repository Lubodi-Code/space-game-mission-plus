<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { account, displayName, isGuest, loginEmail, loginGoogle, logout } from '~/game/meta/account'

const collapsed = ref(false)
const emailOpen = ref(false)
const email = ref('')
const emailSent = ref(false)
const name = computed(() => displayName(account.user) || 'Comandante')
const avatar = computed(() => account.user?.user_metadata?.avatar_url || '')

onMounted(() => {
  try { collapsed.value = localStorage.getItem('sgmp_guest_ok') === '1' } catch { /* Storage can be unavailable. */ }
})

watch(() => account.user, (user) => {
  if (user) collapsed.value = false
})

function continueAsGuest() {
  collapsed.value = true
  try { localStorage.setItem('sgmp_guest_ok', '1') } catch { /* Guest play still works. */ }
}

async function sendLink() {
  if (!email.value.trim()) return
  try {
    emailSent.value = await loginEmail(email.value.trim())
  } catch (error) {
    account.error = error instanceof Error ? error.message : 'No se pudo enviar el enlace'
    account.busy = false
  }
}

async function signInGoogle() {
  account.error = ''
  try { await loginGoogle() } catch (error) {
    account.error = error instanceof Error ? error.message : 'No se pudo iniciar sesión'
  }
}

async function signOut() {
  account.error = ''
  try { await logout() } catch (error) {
    account.error = error instanceof Error ? error.message : 'No se pudo cerrar sesión'
  }
}
</script>

<template>
  <section class="rounded-xl border border-[#8be9fd]/20 bg-[#0a0f1c]/90 p-3 text-left text-[#8be9fd] shadow-[0_0_20px_rgba(139,233,253,0.07)]" aria-label="Cuenta de jugador">
    <template v-if="account.ready && !isGuest">
      <div class="flex items-center gap-3">
        <img v-if="avatar" :src="avatar" alt="" class="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-[#8be9fd]/40" referrerpolicy="no-referrer" />
        <span v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#8be9fd]/15 text-lg font-bold text-[#ffcc55]" aria-hidden="true">{{ name.charAt(0).toUpperCase() }}</span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-bold text-white">{{ name }}</div>
          <div class="truncate text-xs text-[#8be9fd]/65">{{ account.user.email }}</div>
        </div>
        <button type="button" class="rounded-lg border border-[#8be9fd]/25 px-3 py-2 text-xs text-[#8be9fd] hover:bg-[#8be9fd]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffcc55]" @click="signOut">Cerrar sesión</button>
      </div>
    </template>
    <template v-else-if="!account.ready">
      <p class="text-sm text-[#8be9fd]/70" role="status">Cargando cuenta…</p>
    </template>
    <template v-else-if="!account.configured">
      <p class="text-sm font-semibold text-[#ffcc55]">Jugando como invitado</p>
      <p class="mt-1 text-xs text-[#8be9fd]/70">Tu progreso se guarda en este dispositivo. Las cuentas no están configuradas en este servidor.</p>
    </template>
    <template v-else-if="collapsed">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-[#ffcc55]">Jugando como invitado</p>
        <button type="button" class="rounded-lg border border-[#8be9fd]/25 px-3 py-2 text-xs hover:bg-[#8be9fd]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffcc55]" @click="collapsed = false">Opciones de cuenta</button>
      </div>
    </template>
    <template v-else>
      <p class="text-sm font-semibold text-[#ffcc55]">Jugando como invitado · tu progreso se guarda en este dispositivo</p>
      <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" class="min-h-10 rounded-lg bg-[#8be9fd] px-3 py-2 text-sm font-semibold text-[#0a0f1c] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffcc55]" @click="signInGoogle">Continuar con Google</button>
        <button type="button" class="min-h-10 rounded-lg border border-[#8be9fd]/35 px-3 py-2 text-sm hover:bg-[#8be9fd]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffcc55]" :aria-expanded="emailOpen" aria-controls="account-email-form" @click="emailOpen = !emailOpen">Entrar con email</button>
        <button type="button" class="min-h-10 rounded-lg px-3 py-2 text-sm text-[#8be9fd]/75 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffcc55]" @click="continueAsGuest">Seguir como invitado</button>
      </div>
      <form v-if="emailOpen" id="account-email-form" class="mt-3 flex flex-col gap-2 sm:flex-row" @submit.prevent="sendLink">
        <label class="sr-only" for="account-email">Correo electrónico</label>
        <input id="account-email" v-model="email" type="email" autocomplete="email" required placeholder="tu@correo.com" class="min-h-10 min-w-0 flex-1 rounded-lg border border-[#8be9fd]/30 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-[#8be9fd]/40 focus:border-[#8be9fd] focus:outline-none" @input="emailSent = false" />
        <button type="submit" :disabled="account.busy" class="min-h-10 rounded-lg bg-[#ffcc55] px-3 py-2 text-sm font-semibold text-[#0a0f1c] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Enviar enlace</button>
      </form>
      <p v-if="emailSent" class="mt-2 text-xs text-[#ffcc55]" role="status">Revisá tu correo</p>
    </template>
    <p v-if="account.error" class="mt-2 text-xs text-red-300" role="alert">{{ account.error }}</p>
  </section>
</template>
