import { inject } from '@vercel/analytics'

// Web Analytics de Vercel: solo en la web. La versión de escritorio carga desde app://
// y no tiene el endpoint /_vercel/insights.
export default defineNuxtPlugin(() => {
  if (!location.protocol.startsWith('http')) return
  inject({ mode: import.meta.dev ? 'development' : 'production' })
})
