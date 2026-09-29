// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',

  // Nuxt 4 usa app/ como srcDir por defecto; este proyecto mantiene la estructura de Nuxt 3 (app.vue y components/ en la raíz)
  srcDir: '.',
  dir: { app: '.' },
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss'],

  // Portada con SSR + prerender (SEO); el juego es solo cliente (Phaser/Three usan window).
  ssr: true,
  routeRules: {
    '/': { prerender: true },
    '/jugar': { ssr: false },
  },

  css: ['~/style.css'],

  // Secretos: solo servidor. Se cargan de .env / variables de Vercel (NUXT_*).
  runtimeConfig: {
    onvoSecretKey: '',        // NUXT_ONVO_SECRET_KEY
    onvoWebhookSecret: '',    // NUXT_ONVO_WEBHOOK_SECRET
    supabaseServiceKey: '',   // NUXT_SUPABASE_SERVICE_KEY
    public: {
      onvoPublishableKey: '', // NUXT_PUBLIC_ONVO_PUBLISHABLE_KEY
      supabaseUrl: '',        // NUXT_PUBLIC_SUPABASE_URL
      supabaseAnonKey: '',    // NUXT_PUBLIC_SUPABASE_ANON_KEY
    },
  },

  vite: {
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'peerjs',
        'phaser', // CJS
        'three',
        'three/examples/jsm/loaders/OBJLoader.js',
      ]
    }
  },

  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
      title: 'Space Game Mission Plus — Defiende tu núcleo',
      meta: [
        { name: 'theme-color', content: '#05070f' },
        { name: 'description', content: 'Tower defense espacial: construye colectores, baterías y torretas láser/misiles, gestiona tu red de energía y sobrevive las oleadas. Juega solo o en cooperativo.' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Space Game Mission Plus' },
        { name: 'twitter:description', content: 'Tower defense espacial: red de energía, torretas láser/misiles y oleadas. Solo o cooperativo.' },
        { name: 'twitter:image', content: 'https://space-game-mission-plus.vercel.app/assets/art/og.jpg' },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: 'Space Game Mission Plus' },
        { property: 'og:description', content: 'Tower defense espacial: red de energía, torretas láser/misiles y oleadas. Solo o cooperativo.' },
        { property: 'og:url', content: 'https://space-game-mission-plus.vercel.app/' },
        { property: 'og:image', content: 'https://space-game-mission-plus.vercel.app/assets/art/og.jpg' },
        { property: 'og:locale', content: 'es_ES' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/assets/icon/Gemini_Generated_Image_wh42b6wh42b6wh42.png' },
        { rel: 'apple-touch-icon', href: '/assets/icon/Gemini_Generated_Image_wh42b6wh42b6wh42.png' },
        { rel: 'canonical', href: 'https://space-game-mission-plus.vercel.app/' },
      ],
    },
  },
})
