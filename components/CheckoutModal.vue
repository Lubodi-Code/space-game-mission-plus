<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { api, syncAccount } from '~/game/meta/account'
import { packById } from '~/shared/catalog'
import { sfxPurchase, sfxUi } from '~/game/sound'

// Checkout de un paquete de Cristales con el SDK de ONVO. El éxito del SDK NO acredita nada:
// se sondea la orden hasta que el webhook del servidor la marque 'paid'.
const props = defineProps<{ packId: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const pack = packById(props.packId)
const phase = ref<'loading' | 'form' | 'confirming' | 'done' | 'error'>('loading')
const message = ref('')
let orderId = ''
let poll: ReturnType<typeof setInterval> | null = null

function loadSdk(): Promise<any> {
  const w = window as any
  if (w.onvo) return Promise.resolve(w.onvo)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://sdk.onvopay.com/sdk.js'
    s.onload = () => resolve(w.onvo)
    s.onerror = () => reject(new Error('No se pudo cargar ONVO'))
    document.head.appendChild(s)
  })
}

function waitForCredit() {
  phase.value = 'confirming'
  let tries = 0
  poll = setInterval(async () => {
    tries++
    try {
      const o: any = await api(`/api/pay/order/${orderId}`)
      if (o.status === 'paid') {
        clearInterval(poll!)
        await syncAccount()
        sfxPurchase()
        phase.value = 'done'
      } else if (o.status === 'failed') {
        clearInterval(poll!)
        phase.value = 'error'; message.value = 'El pago fue rechazado.'
      }
    } catch { /* reintenta */ }
    if (tries > 40 && poll) {
      clearInterval(poll)
      phase.value = 'error'
      message.value = 'El pago se está procesando. Tus Cristales aparecerán en unos minutos.'
    }
  }, 1500)
}

onMounted(async () => {
  try {
    const [onvo, r]: [any, any] = await Promise.all([
      loadSdk(),
      api('/api/pay/intent', { method: 'POST', body: { packId: props.packId } }),
    ])
    orderId = r.orderId
    phase.value = 'form'
    onvo.pay({
      publicKey: useRuntimeConfig().public.onvoPublishableKey,
      paymentIntentId: r.paymentIntentId,
      paymentType: 'one_time',
      onSuccess: () => waitForCredit(),
      onError: (d: any) => { sfxUi('error'); message.value = d?.message || 'No se pudo procesar el pago' },
    }).render('#onvo-pay')
  } catch (e: any) {
    phase.value = 'error'
    message.value = e.message
  }
})

onBeforeUnmount(() => { if (poll) clearInterval(poll) })
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3" @click.self="emit('close')">
    <div class="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-[#0a0f1c] ring-1 ring-fuchsia-300/30 p-4 text-cyan-50">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs tracking-widest text-fuchsia-300">CRISTALES</div>
          <div class="text-lg font-extrabold">{{ pack?.label }} · ◆ {{ (pack?.crystals || 0) + (pack?.bonus || 0) }}</div>
          <div class="text-sm text-amber-200">₡{{ pack?.priceCRC.toLocaleString('es-CR') }}</div>
        </div>
        <button class="px-2 py-1 rounded bg-white/10 hover:bg-white/20" @click="emit('close')">✕</button>
      </div>

      <div v-if="phase === 'loading'" class="py-10 text-center text-sm opacity-70 animate-pulse">Preparando el pago…</div>
      <div id="onvo-pay" class="mt-3" :class="{ hidden: phase !== 'form' }" />
      <div v-if="phase === 'form' && message" class="mt-2 text-sm text-red-300">{{ message }}</div>
      <div v-if="phase === 'confirming'" class="py-10 text-center text-sm animate-pulse">Confirmando con el banco…</div>
      <div v-if="phase === 'done'" class="py-8 text-center">
        <div class="text-3xl">◆</div>
        <div class="font-bold text-fuchsia-200">¡Cristales acreditados!</div>
        <button class="mt-4 px-5 py-2 rounded-xl bg-fuchsia-300 text-[#05070f] font-bold" @click="emit('close')">Seguir comprando</button>
      </div>
      <div v-if="phase === 'error'" class="py-8 text-center text-sm text-red-200">{{ message }}</div>
      <p class="mt-3 text-[10px] opacity-50">Pago procesado por ONVO Pay. No guardamos datos de tu tarjeta.</p>
    </div>
  </div>
</template>
