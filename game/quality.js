// Calidad gráfica: Phaser conserva más nitidez que el fondo 3D en celulares con calidad auto.
// LOW_GFX recorta cantidades; RENDER_SCALE y THREE_SCALE controlan los píxeles por píxel CSS.

const hasWindow = typeof window !== 'undefined'

export const IS_TOUCH = hasWindow &&
  (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent))

const cores = hasWindow ? navigator.hardwareConcurrency || 4 : 4
const memGb = hasWindow ? navigator.deviceMemory || 4 : 4
export const WEAK_DEVICE = IS_TOUCH && (cores <= 4 || memGb <= 3)

// Preferencia del panel de Ajustes ('auto' | 'high' | 'medium' | 'low'). Se lee al cargar el módulo.
let pref = 'auto'
try { pref = (hasWindow && localStorage.getItem('sgmp_quality')) || 'auto' } catch { /* modo privado */ }
export const QUALITY_PREF = pref

export const LOW_GFX = pref === 'low' || pref === 'medium' || (pref === 'auto' && IS_TOUCH)

const maxScale = { high: 2, medium: 1.5, low: 1 }[pref] ??
  (pref === 'auto' && IS_TOUCH ? (WEAK_DEVICE ? 1 : 1.25) : (WEAK_DEVICE ? 1.5 : 2))
export const RENDER_SCALE = hasWindow
  ? Math.max(1, Math.min(window.devicePixelRatio || 1, maxScale))
  : 1
export const THREE_SCALE = pref === 'auto' && IS_TOUCH ? (WEAK_DEVICE ? 0.85 : 1) : RENDER_SCALE
