// Calidad gráfica. Antes, "táctil" = gama baja (render a 1x, sin antialias): en celulares con
// pantalla 3x todo se veía borroso. Ahora se separan dos cosas:
// - RENDER_SCALE: píxeles reales por píxel CSS (nitidez). Hasta 2x; 1.5x en equipos modestos.
// - LOW_GFX: solo recorta cantidades (partículas, estrellas, capas), no la resolución.

const hasWindow = typeof window !== 'undefined'

export const IS_TOUCH = hasWindow &&
  (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent))

const cores = hasWindow ? navigator.hardwareConcurrency || 4 : 4
const memGb = hasWindow ? navigator.deviceMemory || 4 : 4
export const WEAK_DEVICE = IS_TOUCH && (cores <= 4 || memGb <= 3)

export const LOW_GFX = IS_TOUCH

export const RENDER_SCALE = hasWindow
  ? Math.max(1, Math.min(window.devicePixelRatio || 1, WEAK_DEVICE ? 1.5 : 2))
  : 1
