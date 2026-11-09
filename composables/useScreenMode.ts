// Pantalla completa y orientación horizontal para jugar en el celular.
//
// Interfaz fija (la usan Lobby.vue, Hud.vue y RotateHint.vue):
//   const sm = useScreenMode()
//   sm.canFullscreen     → boolean: el navegador deja pedir pantalla completa (Android/PC sí; iPhone no)
//   sm.isFullscreen      → Ref<boolean>
//   sm.isPortrait        → Ref<boolean>: la ventana es más alta que ancha
//   sm.isTouch           → boolean: teléfono o tablet
//   sm.preferLandscape   → Ref<boolean>: opción «Jugar en horizontal» (se guarda en localStorage)
//   sm.toggleFullscreen()→ Promise<void>: entra o sale de pantalla completa
//   sm.enterGameScreen() → Promise<void>: llamarlo DENTRO del clic de JUGAR / Crear / Unirse. En táctil
//                          pide pantalla completa y, si preferLandscape, bloquea en horizontal. Nunca lanza.
//
// iPhone (Safari) no permite pantalla completa ni bloquear la orientación desde una web: ahí solo queda
// «Agregar a pantalla de inicio» (manifiesto) y el aviso de girar el teléfono (RotateHint.vue).

const PREF_KEY = 'sgmp_landscape'
let listenersReady = false

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> }
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> }

function fsElement(): Element | null {
  const d = document as FsDoc
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

export function useScreenMode() {
  const isFullscreen = useState('sm-fullscreen', () => false)
  const isPortrait = useState('sm-portrait', () => false)
  const preferLandscape = useState('sm-landscape', () => true)

  const hasWindow = typeof window !== 'undefined'
  const root = hasWindow ? (document.documentElement as FsEl) : null
  const canFullscreen = !!root && (typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function')
  const isTouch = hasWindow &&
    (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent))

  if (hasWindow && !listenersReady) {
    listenersReady = true
    try { const v = localStorage.getItem(PREF_KEY); if (v !== null) preferLandscape.value = v === '1' } catch { /* modo privado */ }
    const sync = () => {
      isFullscreen.value = !!fsElement()
      isPortrait.value = window.innerHeight > window.innerWidth
    }
    sync()
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    // Scope propio (detached): si el watch quedara en el componente que llamó primero (Lobby), moriría
    // al desmontarlo y listenersReady impediría recrearlo.
    effectScope(true).run(() => {
      watch(preferLandscape, (v) => {
        try { localStorage.setItem(PREF_KEY, v ? '1' : '0') } catch { /* modo privado */ }
        if (isFullscreen.value) void applyOrientation(v)
      })
    })
  }

  async function applyOrientation(landscape: boolean) {
    const o = (screen as Screen & { orientation?: LockableOrientation }).orientation
    try {
      if (landscape) await o?.lock?.('landscape')
      else o?.unlock?.()
    } catch { /* sin soporte o fuera de pantalla completa: el aviso de girar cubre el caso */ }
  }

  async function requestFs() {
    if (!root || fsElement()) return
    try {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' })
      else await root.webkitRequestFullscreen?.()
    } catch { /* bloqueado (navegador de Instagram, sin gesto del usuario…) */ }
  }

  async function toggleFullscreen() {
    if (!hasWindow) return
    if (fsElement()) {
      const d = document as FsDoc
      try { await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.()) } catch { /* ya salió */ }
      return
    }
    await requestFs()
    if (preferLandscape.value && isTouch) await applyOrientation(true)
  }

  async function enterGameScreen() {
    if (!hasWindow || !isTouch) return
    await requestFs()
    if (preferLandscape.value) await applyOrientation(true)
  }

  return { canFullscreen, isFullscreen, isPortrait, isTouch, preferLandscape, toggleFullscreen, enterGameScreen }
}
