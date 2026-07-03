// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',

  // Nuxt 4 usa app/ como srcDir por defecto; este proyecto mantiene la estructura de Nuxt 3 (app.vue y components/ en la raíz)
  srcDir: '.',
  dir: { app: '.' },
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss'],

  ssr: false, // SPA mode for Phaser game (canvas renders client-side)

  css: ['~/style.css'],

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
        { name: 'twitter:image', content: 'https://space-game-mission-plus.vercel.app/assets/icon/Gemini_Generated_Image_wh42b6wh42b6wh42.png' },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: 'Space Game Mission Plus' },
        { property: 'og:description', content: 'Tower defense espacial: red de energía, torretas láser/misiles y oleadas. Solo o cooperativo.' },
        { property: 'og:url', content: 'https://space-game-mission-plus.vercel.app/' },
        { property: 'og:image', content: 'https://space-game-mission-plus.vercel.app/assets/icon/Gemini_Generated_Image_wh42b6wh42b6wh42.png' },
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
