<script setup lang="ts">
const siteUrl = 'https://space-game-mission-plus.vercel.app/'
const ogImage = 'https://space-game-mission-plus.vercel.app/assets/art/og.jpg'
const description = 'Defendé el Núcleo en este juego gratis de estrategia espacial. Construí una red de energía, miná meteoritos y resistí 10 oleadas, solo o en cooperativo online desde PC o celular.'

const steps = [
  { title: 'Extendé la red', text: 'Partí del Núcleo y conectá Nodos para llevar energía a nuevas posiciones.' },
  { title: 'Conseguí recursos', text: 'Colocá Recolectores cerca de meteoritos y sumá Baterías para guardar energía.' },
  { title: 'Defendé el Núcleo', text: 'Construí torretas láser y de misiles. Elegí una de dos ramas de mejora para cada edificio.' },
  { title: 'Dirigí la batalla', text: 'Mové al comandante, recolectá y usá sus habilidades para superar 10 oleadas.' },
]
const features = [
  { title: 'Energía que conecta todo', text: 'Los Nodos extienden la red desde el Núcleo; Recolectores y Baterías mantienen las defensas activas.', tone: 'cyan' },
  { title: 'Defensas a tu manera', text: 'Torretas láser y de misiles, Enjambre sanador y un árbol de mejoras propio por edificio con dos ramas excluyentes.', tone: 'magenta' },
  { title: 'Un comandante en el campo', text: 'Movelo y recolectá mientras usás Mega Rayo apuntado a una nave, Pulso EMP, Reparación de emergencia y Bombardeo orbital.', tone: 'amber' },
  { title: 'Cada partida cuenta', text: 'Avanzá por 10 sectores, ganá XP y Chatarra para investigar entre partidas y elegí cosméticos para rayos, naves y estelas sin ventaja de juego.', tone: 'cyan' },
  { title: 'Cooperativo online', text: 'Creá una sala y compartí el código para defender el Núcleo con otra persona.', tone: 'magenta' },
  { title: 'En tu pantalla', text: 'Jugá desde PC o celular, en partidas Rápidas o Clásicas de 10 oleadas.', tone: 'amber' },
]
const modes = [
  { name: 'Rápido', duration: '5–10 min', image: '/assets/art/mode-quick.webp', text: 'Una defensa intensa para jugar en un rato. Las 10 oleadas llegan con menos espera.' },
  { name: 'Clásico', duration: '10–15 min', image: '/assets/art/mode-classic.webp', text: 'Más tiempo para expandir tu red, preparar defensas y enfrentar las 10 oleadas.' },
]
const enemies = [
  { name: 'Grunt', image: 'ship_grunt', text: 'La primera línea de la horda.' },
  { name: 'Runner', image: 'ship_runner', text: 'Avanza a gran velocidad.' },
  { name: 'Brute', image: 'ship_brute', text: 'Resiste el fuego de tus defensas.' },
  { name: 'Saboteador', image: 'ship_saboteur', text: 'Amenaza la infraestructura de tu red.' },
  { name: 'Artillería', image: 'ship_artillery', text: 'Ataca desde la distancia.' },
  { name: 'Kamikaze', image: 'ship_kamikaze', text: 'Se lanza contra tus estructuras.' },
  { name: 'Guardián', image: 'ship_warden', text: 'Repara a la horda mientras avanza.' },
  { name: 'Sanguijuela', image: 'ship_leech', text: 'Roba energía de tu defensa.' },
  { name: 'Bombardero', image: 'ship_bomber', text: 'Descarga ataques sobre tu posición.' },
  { name: 'Nave Madre', image: 'ship_mothership', text: 'Un jefe que pone a prueba toda la red.' },
]
const faqs = [
  { question: '¿Space Game Mission Plus es gratis?', answer: 'Sí. Podés jugar gratis. La tienda ofrece cosméticos para rayos, naves y estelas que no dan ventaja de juego.' },
  { question: '¿Se puede jugar en celular?', answer: 'Sí. Space Game Mission Plus funciona en PC y celular desde el navegador. En Windows también podés instalar la app de escritorio desde esta página.' },
  { question: '¿Puedo jugar con otra persona?', answer: 'Sí. El cooperativo online permite crear una sala y compartir su código para que otra persona se una.' },
  { question: '¿Cuánto dura una partida?', answer: 'Cada partida tiene 10 oleadas. El modo Rápido dura aproximadamente 5–10 minutos y el Clásico, 10–15 minutos.' },
  { question: '¿Qué se conserva entre partidas?', answer: 'Ganás XP y Chatarra para investigación entre partidas. También podés elegir cosméticos que no dan ventaja de juego.' },
]

useSeoMeta({
  title: 'Space Game Mission Plus | Tower defense espacial gratis',
  description,
  ogTitle: 'Space Game Mission Plus | Defendé tu Núcleo',
  ogDescription: description,
  ogImage,
  twitterCard: 'summary_large_image',
})
useHead({
  htmlAttrs: { lang: 'es' },
  link: [{ rel: 'canonical', href: siteUrl }],
  script: [
    { type: 'application/ld+json', innerHTML: JSON.stringify({
      '@context': 'https://schema.org', '@type': 'VideoGame', name: 'Space Game Mission Plus',
      description, genre: ['Tower defense', 'Estrategia en tiempo real'], gamePlatform: 'Web browser',
      applicationCategory: 'Game', operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      inLanguage: 'es', image: ogImage, url: siteUrl,
    }) },
    { type: 'application/ld+json', innerHTML: JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faqs.map(({ question, answer }) => ({
        '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    }) },
  ],
})

// Descarga de escritorio. El instalador sale de GitHub Releases (workflow release.yml) con un
// nombre fijo, así el enlace /releases/latest/download/ nunca cambia entre versiones.
const DESKTOP_URL = 'https://github.com/Lubodi-Code/space-game-mission-plus/releases/latest/download/SpaceGameMissionPlus-Setup.exe'
// null = aún no detectado (SSR/hidratación: no se muestra nada), 'windows' = botón de descarga,
// 'other' = PC mac/linux (aviso, todavía sin instalador), 'hide' = móvil/tablet o ya es la app.
const desktopOs = ref<null | 'windows' | 'other' | 'hide'>(null)

// El botón solo aparece si ya hay un release publicado con el instalador: sin release (o sin red,
// o con la API de GitHub limitada) no se ofrece una descarga que daría 404.
async function checkDesktopRelease() {
  try {
    const res = await fetch('https://api.github.com/repos/Lubodi-Code/space-game-mission-plus/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    const data = res.ok ? await res.json() : null
    desktopOs.value = data?.assets?.some((a: { name: string }) => a.name === 'SpaceGameMissionPlus-Setup.exe') ? 'windows' : 'hide'
  } catch {
    desktopOs.value = 'hide'
  }
}

// Portada (SSR + prerender). Links viejos de invitación (/?join=XXXX) siguen funcionando.
onMounted(() => {
  const join = new URLSearchParams(location.search).get('join')
  if (join) navigateTo({ path: '/jugar', query: { join } }, { replace: true })

  const ua = navigator.userAgent
  // iPadOS se presenta como Macintosh pero con pantalla táctil; un Mac real no tiene multitouch.
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|CrOS/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (isMobile || /Electron\//.test(ua)) desktopOs.value = 'hide'
  else if (/Windows NT/.test(ua)) checkDesktopRelease()
  else desktopOs.value = 'other'
})
</script>

<template>
  <div class="landing">
    <header class="site-header">
      <NuxtLink class="wordmark" to="/" aria-label="Space Game Mission Plus, inicio"><span class="brand-mark" aria-hidden="true">✦</span><span>SPACE GAME <small>MISSION PLUS</small></span></NuxtLink>
      <NuxtLink class="header-play" to="/jugar">Jugar gratis</NuxtLink>
    </header>
    <main>
      <section class="hero" aria-labelledby="hero-title">
        <img class="hero-art" src="/assets/art/hero.webp" alt="" fetchpriority="high" width="1672" height="941">
        <div class="hero-shade" aria-hidden="true"></div>
        <div class="hero-content wrap">
          <p class="hero-kicker">ESTRATEGIA ESPACIAL · TOWER DEFENSE</p>
          <h1 id="hero-title">Defendé el Núcleo.<br>Dominá la horda.</h1>
          <p class="hero-copy">Construí una red de energía, miná meteoritos y dirigí tus defensas a través de 10 oleadas. Jugá solo o en cooperativo online.</p>
          <div class="hero-actions">
            <NuxtLink class="button button-primary" to="/jugar">Jugar gratis <span aria-hidden="true">↗</span></NuxtLink>
            <a v-if="desktopOs === 'windows'" class="button button-secondary" :href="DESKTOP_URL" download rel="noopener">Descargar para Windows <span aria-hidden="true">⬇</span></a>
            <a class="button button-secondary" href="#como-se-juega">Cómo se juega</a>
          </div>
          <p class="hero-note">En tu navegador · PC y celular<template v-if="desktopOs === 'windows'"> · App de escritorio para Windows</template><template v-else-if="desktopOs === 'other'"> · App de escritorio: por ahora solo Windows</template></p>
        </div>
        <div class="hero-edge" aria-hidden="true"></div>
      </section>

      <section id="como-se-juega" class="section wrap" aria-labelledby="how-title">
        <div class="section-heading"><p class="section-index">01 / LA MISIÓN</p><h2 id="how-title">Una red. Diez oleadas. Muchas decisiones.</h2><p>Cada estructura depende de tu plan. Expandí, abastecé y defendé antes de que la horda alcance el Núcleo.</p></div>
        <ol class="steps-grid"><li v-for="(step, index) in steps" :key="step.title" class="step"><span class="step-number">{{ String(index + 1).padStart(2, '0') }}</span><h3>{{ step.title }}</h3><p>{{ step.text }}</p></li></ol>
      </section>

      <section class="section section-panel" aria-labelledby="features-title"><div class="wrap">
        <div class="section-heading"><p class="section-index">02 / TU ARSENAL</p><h2 id="features-title">Prepará tu propia defensa</h2><p>Construcción, habilidades y progreso que cambian cómo enfrentás cada sector.</p></div>
        <div class="features-grid"><article v-for="feature in features" :key="feature.title" class="feature" :class="`feature-${feature.tone}`"><span class="feature-signal" aria-hidden="true"></span><h3>{{ feature.title }}</h3><p>{{ feature.text }}</p></article></div>
      </div></section>

      <section class="section wrap" aria-labelledby="modes-title">
        <div class="section-heading"><p class="section-index">03 / ELEGÍ TU RITMO</p><h2 id="modes-title">Dos modos, una misión</h2><p>Ambos modos tienen 10 oleadas. Elegí cuánto tiempo querés dedicarle a la defensa.</p></div>
        <div class="modes-grid"><article v-for="mode in modes" :key="mode.name" class="mode-card"><img :src="mode.image" :alt="`Arte del modo ${mode.name}`" loading="lazy" width="640" height="640"><div class="mode-info"><div class="mode-title"><h3>{{ mode.name }}</h3><span>{{ mode.duration }}</span></div><p>{{ mode.text }}</p></div></article></div>
      </section>

      <section class="section section-panel" aria-labelledby="enemies-title"><div class="wrap">
        <div class="section-heading"><p class="section-index">04 / IDENTIFICÁ LA AMENAZA</p><h2 id="enemies-title">La horda cambia en cada sector</h2><p>Diez sectores traen enemigos nuevos. Adaptá tu red para sobrevivir hasta los jefes Nave Madre y Nave Nodriza.</p></div>
        <div class="enemies-grid"><article v-for="enemy in enemies" :key="enemy.name" class="enemy-card"><div class="enemy-image"><img :src="`/assets/ships/${enemy.image}.svg`" :alt="`Nave ${enemy.name}`" loading="lazy" width="96" height="96"></div><h3>{{ enemy.name }}</h3><p>{{ enemy.text }}</p></article></div>
      </div></section>

      <section class="section wrap faq-section" aria-labelledby="faq-title"><div class="section-heading"><p class="section-index">05 / PREGUNTAS FRECUENTES</p><h2 id="faq-title">Antes de despegar</h2></div><div class="faq-list"><details v-for="faq in faqs" :key="faq.question"><summary>{{ faq.question }}<span aria-hidden="true">+</span></summary><p>{{ faq.answer }}</p></details></div></section>

      <section class="final-cta" aria-labelledby="final-title"><div class="wrap final-content"><p class="section-index">TU NÚCLEO TE NECESITA</p><h2 id="final-title">La próxima oleada ya viene.</h2><p>Tomá el mando, trazá la red y defendé tu sector.</p><NuxtLink class="button button-primary" to="/jugar">Jugar gratis <span aria-hidden="true">↗</span></NuxtLink></div></section>
    </main>
    <footer class="site-footer wrap"><span>Space Game Mission Plus</span><NuxtLink to="/jugar">Entrar al juego</NuxtLink></footer>
  </div>
</template>

<style scoped>
.landing { --cyan: #8be9fd; --magenta: #ff7ad9; --amber: #ffcc55; color: #eaf7ff; background: #05070f; overflow-x: clip; }
.wrap { width: min(100% - 32px, 1160px); margin-inline: auto; }
.site-header { position: absolute; z-index: 3; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 16px; }
.wordmark { display: flex; align-items: center; gap: 9px; color: #fff; font-size: 12px; font-weight: 900; line-height: 1; letter-spacing: .11em; text-decoration: none; text-shadow: 0 0 20px #8be9fd80; }
.wordmark small { display: block; margin-top: 5px; color: var(--cyan); font-size: 9px; letter-spacing: .24em; }
.brand-mark { display: grid; place-items: center; width: 33px; height: 33px; flex: none; border: 1px solid var(--cyan); color: var(--cyan); transform: rotate(45deg); font-size: 22px; line-height: 1; box-shadow: 0 0 17px #8be9fd55; }
.header-play { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0 16px; border: 1px solid #8be9fd99; border-radius: 8px; color: var(--cyan); background: #071523cc; font-size: 13px; font-weight: 800; text-decoration: none; white-space: nowrap; }
.hero { position: relative; display: flex; align-items: center; min-height: 100svh; min-height: max(680px, 100svh); isolation: isolate; }
.hero-art, .hero-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
.hero-art { z-index: -2; object-fit: cover; object-position: 60% center; }
.hero-shade { z-index: -1; background: linear-gradient(90deg, #05070ff2 0%, #05070fbd 48%, #05070f66 100%), linear-gradient(0deg, #05070f 0%, transparent 35%, #05070f55 100%); }
.hero-content { padding-block: 130px 92px; }
.hero-kicker, .section-index { margin: 0 0 20px; color: var(--amber); font-size: 11px; font-weight: 800; letter-spacing: .2em; }
.hero h1 { max-width: 800px; margin: 0; color: #fff; font-size: clamp(3.1rem, 9vw, 6.4rem); font-weight: 900; line-height: .99; letter-spacing: -.055em; text-shadow: 0 0 32px #8be9fd3d; }
.hero-copy { max-width: 530px; margin: 28px 0 0; color: #d5e9f4; font-size: clamp(1rem, 2.6vw, 1.23rem); line-height: 1.65; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
.button { display: inline-flex; align-items: center; justify-content: center; gap: 18px; min-height: 54px; padding: 13px 23px; border-radius: 10px; font-size: 16px; font-weight: 800; text-align: center; text-decoration: none; transition: background-color .2s ease, border-color .2s ease, transform .2s ease, box-shadow .2s ease; }
.button-primary { color: #04101b; background: var(--cyan); box-shadow: 0 0 30px #8be9fd70; }
.button-primary:hover { background: #c5f6ff; box-shadow: 0 0 40px #8be9fd99; transform: translateY(-2px); }
.button-secondary { border: 1px solid #b8eafa99; color: #f0fbff; background: #081625b8; }
.button-secondary:hover, .header-play:hover { background: #173349; border-color: var(--cyan); }
.hero-note { margin: 18px 0 0; color: #c7d9e3; font-size: 12px; letter-spacing: .04em; }
.hero-edge { position: absolute; right: 0; bottom: 0; left: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--cyan), transparent); box-shadow: 0 0 22px var(--cyan); }
.section { padding-block: 82px; }
.section-panel { background: radial-gradient(ellipse at 50% 0%, #10213b 0%, #080e1b 56%, #070b15 100%); border-block: 1px solid #8be9fd21; }
.section-heading { max-width: 740px; margin-bottom: 36px; }
.section-heading h2, .final-cta h2 { margin: 0; color: #fff; font-size: clamp(2.05rem, 5vw, 3.7rem); font-weight: 850; line-height: 1.08; letter-spacing: -.045em; }
.section-heading > p:last-child { max-width: 640px; margin: 16px 0 0; color: #b8cfdd; font-size: 16px; line-height: 1.65; }
.steps-grid, .features-grid, .modes-grid, .enemies-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
.steps-grid { margin: 0; padding: 0; list-style: none; }
.step { min-width: 0; padding: 22px; border-top: 2px solid #8be9fd8a; background: #0a1423; }
.step-number { color: var(--cyan); font-size: 13px; font-weight: 900; letter-spacing: .1em; }
.step h3, .feature h3 { margin: 22px 0 10px; color: #fff; font-size: 20px; line-height: 1.2; }
.step p, .feature p, .mode-info p, .enemy-card p { margin: 0; color: #b9cfdb; font-size: 14px; line-height: 1.65; }
.feature { min-width: 0; padding: 24px; border: 1px solid #8be9fd33; border-radius: 12px; background: #0a1525d9; }
.feature-signal { display: block; width: 28px; height: 7px; border-radius: 999px; background: var(--cyan); box-shadow: 0 0 17px var(--cyan); }
.feature-magenta { border-color: #ff7ad944; }
.feature-magenta .feature-signal { background: var(--magenta); box-shadow: 0 0 17px var(--magenta); }
.feature-amber { border-color: #ffcc5544; }
.feature-amber .feature-signal { background: var(--amber); box-shadow: 0 0 17px var(--amber); }
.feature h3 { margin-top: 24px; }
.mode-card { overflow: hidden; min-width: 0; border: 1px solid #8be9fd4a; border-radius: 14px; background: #0a1423; }
.mode-card img { display: block; width: 100%; height: 210px; object-fit: cover; }
.mode-info { padding: 22px; }
.mode-title { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.mode-title h3 { margin: 0; color: #fff; font-size: 26px; }
.mode-title span { color: var(--amber); font-size: 15px; font-weight: 800; }
.enemies-grid { grid-template-columns: 1fr; gap: 10px; }
.enemy-card { min-width: 0; padding: 14px; border: 1px solid #8be9fd2b; border-radius: 10px; background: #0b1627b8; }
.enemy-image { display: grid; place-items: center; height: 90px; margin-bottom: 9px; background: radial-gradient(circle, #274266 0%, transparent 70%); }
.enemy-image img { width: 76px; height: 76px; object-fit: contain; filter: drop-shadow(0 0 10px #8be9fd66); }
.enemy-card h3 { margin: 0 0 5px; color: #fff; font-size: 15px; }
.enemy-card p { font-size: 12px; }
.faq-section { max-width: 900px; }
.faq-list { border-top: 1px solid #8be9fd42; }
.faq-list details { border-bottom: 1px solid #8be9fd42; }
.faq-list summary { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 66px; padding: 14px 4px; color: #f1fbff; font-size: 16px; font-weight: 750; cursor: pointer; list-style: none; }
.faq-list summary::-webkit-details-marker { display: none; }
.faq-list summary span { color: var(--cyan); font-size: 25px; font-weight: 400; transition: transform .2s ease; }
.faq-list details[open] summary span { transform: rotate(45deg); }
.faq-list details p { max-width: 680px; margin: 0; padding: 0 30px 22px 4px; color: #b9cfdb; line-height: 1.65; }
.final-cta { padding-block: 80px; text-align: center; background: radial-gradient(ellipse at 50% 50%, #153153 0%, #080e1b 60%, #05070f 100%); border-top: 1px solid #8be9fd33; }
.final-content { display: flex; flex-direction: column; align-items: center; }
.final-cta h2 { max-width: 750px; }
.final-cta p:not(.section-index) { margin: 18px 0 28px; color: #c9dce7; }
.site-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 14px; padding-block: 27px; color: #9bb4c2; font-size: 13px; }
.site-footer a { color: var(--cyan); }
a:focus-visible, summary:focus-visible { outline: 3px solid var(--amber); outline-offset: 4px; }
@media (min-width: 640px) { .site-header { padding-inline: 32px; } .wordmark { font-size: 15px; } .wordmark small { font-size: 10px; } .steps-grid, .features-grid, .modes-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .enemies-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .mode-card img { height: 280px; } }
@media (min-width: 900px) { .site-header { padding-inline: max(32px, calc((100vw - 1160px) / 2)); } .hero-art { object-position: center; } .section { padding-block: 110px; } .steps-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .features-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .enemies-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
@media (max-width: 389px) { .hero-actions .button { width: 100%; } .hero h1 { font-size: 2.75rem; } .header-play { padding-inline: 10px; } }
@media (prefers-reduced-motion: reduce) { .button, .faq-list summary span { transition: none; } .button-primary:hover { transform: none; } }
</style>
