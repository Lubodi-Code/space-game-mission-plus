<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { account, loginEmail, loginGoogle } from '~/game/meta/account'

// Hoja de inicio de sesión (Google o enlace por email). La abren el chip del Lobby y el perfil.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const emailOpen = ref(false)
const email = ref('')
const emailSent = ref(false)

watch(() => account.user, (u) => { if (u) emit('close') })

async function google() {
  account.error = ''
  try { await loginGoogle() } catch (e) { account.error = e instanceof Error ? e.message : 'No se pudo iniciar sesión' }
}

async function sendLink() {
  const v = email.value.trim()
  if (!v) return
  try { emailSent.value = await loginEmail(v) } catch (e) {
    account.error = e instanceof Error ? e.message : 'No se pudo enviar el enlace'
    account.busy = false
  }
}

function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
watch(() => props.open, (open) => {
  if (open) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="login-backdrop" @click.self="emit('close')">
        <section class="login" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <div class="login-stars" aria-hidden="true" />
          <button type="button" class="login-close" aria-label="Cerrar" @click="emit('close')">✕</button>

          <svg viewBox="0 0 64 64" class="login-emblem" aria-hidden="true">
            <polygon points="32,6 53,18 53,42 32,54 11,42 11,18" fill="none" stroke="#6cc8ff" stroke-width="2.5" />
            <polygon points="32,18 43,32 32,46 21,32" fill="#8be9fd" />
          </svg>
          <h2 id="login-title" class="login-title">Guardá tu progreso</h2>
          <p class="login-sub">
            Como invitado todo queda en este dispositivo. Con una cuenta, tu nivel, tu Chatarra y tu colección
            te siguen a cualquier lado, y podés sumar amigos.
          </p>

          <template v-if="account.configured">
            <button type="button" class="btn-google" :disabled="account.busy" @click="google">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12Z"/></svg>
              Continuar con Google
            </button>

            <button v-if="!emailOpen" type="button" class="btn-ghost" @click="emailOpen = true">Entrar con email</button>
            <form v-else class="login-email" @submit.prevent="sendLink">
              <label class="sr-only" for="login-email-input">Correo electrónico</label>
              <input id="login-email-input" v-model="email" type="email" autocomplete="email" required placeholder="tu@correo.com" @input="emailSent = false" />
              <button type="submit" :disabled="account.busy">{{ account.busy ? 'Enviando…' : 'Enviar enlace' }}</button>
            </form>
            <p v-if="emailSent" class="login-ok" role="status">Listo: revisá tu correo y tocá el enlace para entrar.</p>
          </template>
          <p v-else class="login-off">Las cuentas no están disponibles en este servidor. Podés seguir jugando como invitado.</p>

          <p v-if="account.error" class="login-err" role="alert">{{ account.error }}</p>
          <button type="button" class="login-guest" @click="emit('close')">Seguir como invitado</button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.login-backdrop {
  position: fixed; inset: 0; z-index: 100; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(2,4,10,0.72); backdrop-filter: blur(3px); padding: 0 0 env(safe-area-inset-bottom);
}
@media (min-width: 640px) { .login-backdrop { align-items: center; } }
.login {
  position: relative; overflow: hidden; width: 100%; max-width: 26rem; padding: 2rem 1.5rem 1.25rem; text-align: center;
  border-radius: 1.5rem 1.5rem 0 0; background: radial-gradient(120% 80% at 50% 0%, #132447 0%, #0a0f1c 60%);
  box-shadow: 0 0 0 1px rgba(139,233,253,0.25), 0 -20px 60px rgba(0,0,0,0.5);
}
@media (min-width: 640px) { .login { border-radius: 1.5rem; } }
.login-stars {
  position: absolute; inset: -50%; pointer-events: none; opacity: 0.55;
  background-image: radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #cfe8ff, transparent),
    radial-gradient(1.5px 1.5px at 40% 80%, #8be9fd, transparent), radial-gradient(1px 1px at 85% 20%, #fff, transparent),
    radial-gradient(1px 1px at 10% 70%, #ffcc55, transparent);
  background-size: 180px 180px; animation: drift 40s linear infinite;
}
@keyframes drift { to { transform: translate(90px, 60px); } }
@media (prefers-reduced-motion: reduce) { .login-stars { animation: none; } }
.login > *:not(.login-stars) { position: relative; }
.login-close { position: absolute; top: 0.75rem; right: 0.75rem; width: 2.25rem; height: 2.25rem; border-radius: 999px; color: #8be9fd; background: rgba(255,255,255,0.06); }
.login-emblem { width: 3.5rem; height: 3.5rem; margin: 0 auto 0.75rem; filter: drop-shadow(0 0 14px rgba(108,200,255,0.6)); }
.login-title { font-size: 1.35rem; font-weight: 800; color: #fff; letter-spacing: 0.02em; }
.login-sub { margin: 0.5rem auto 1.25rem; max-width: 21rem; font-size: 0.85rem; line-height: 1.45; color: rgba(207,232,255,0.72); }
.btn-google {
  display: flex; align-items: center; justify-content: center; gap: 0.6rem; width: 100%; min-height: 3rem; border-radius: 0.9rem;
  background: #fff; color: #1f1f1f; font-weight: 700; box-shadow: 0 6px 20px rgba(139,233,253,0.18);
}
.btn-google svg { width: 1.25rem; height: 1.25rem; }
.btn-google:disabled { opacity: 0.6; }
.btn-ghost { width: 100%; min-height: 2.75rem; margin-top: 0.6rem; border-radius: 0.9rem; color: #8be9fd; box-shadow: inset 0 0 0 1px rgba(139,233,253,0.35); font-weight: 600; }
.login-email { display: flex; gap: 0.5rem; margin-top: 0.6rem; }
.login-email input { flex: 1; min-width: 0; min-height: 2.75rem; padding: 0 0.8rem; border-radius: 0.75rem; background: rgba(255,255,255,0.06); color: #fff; box-shadow: inset 0 0 0 1px rgba(139,233,253,0.3); }
.login-email input:focus { outline: none; box-shadow: inset 0 0 0 1.5px #8be9fd; }
.login-email button { min-height: 2.75rem; padding: 0 0.9rem; border-radius: 0.75rem; background: #ffcc55; color: #05070f; font-weight: 700; }
.login-email button:disabled { opacity: 0.6; }
.login-ok { margin-top: 0.6rem; font-size: 0.8rem; color: #50fa7b; }
.login-off { font-size: 0.85rem; color: #ffcc55; }
.login-err { margin-top: 0.6rem; font-size: 0.8rem; color: #ff8a95; }
.login-guest { margin-top: 1rem; font-size: 0.8rem; color: rgba(139,233,253,0.65); text-decoration: underline; text-underline-offset: 3px; }
.btn-google:focus-visible, .btn-ghost:focus-visible, .login-close:focus-visible, .login-guest:focus-visible, .login-email button:focus-visible { outline: 2px solid #ffcc55; outline-offset: 3px; }

.sheet-enter-active, .sheet-leave-active { transition: opacity 0.2s; }
.sheet-enter-active .login, .sheet-leave-active .login { transition: transform 0.25s cubic-bezier(.2,.8,.2,1); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .login, .sheet-leave-to .login { transform: translateY(40px); }
</style>
