// Detección de gráficos bajos para móvil/tablet (pointer táctil = GPU modesta casi siempre).
// ponytail: heurística binaria; si algún día hace falta, cambiar a selector de calidad en el lobby.
export const LOW_GFX =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent))
