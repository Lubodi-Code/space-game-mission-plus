/**
 * Tiny event bus to bridge Vue (HUD) -> Phaser (GameScene) intents.
 * The HUD emits build/cancel intents; the scene subscribes.
 */
const listeners = new Map()

export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(fn)
    return () => listeners.get(event)?.delete(fn)
  },
  off(event, fn) {
    listeners.get(event)?.delete(fn)
  },
  emit(event, payload) {
    // Un oyente que falla no debe dejar sin el aviso a los demás (p. ej. una escena ya destruida).
    listeners.get(event)?.forEach((fn) => {
      try { fn(payload) } catch (err) { console.error(`[bus] ${event}:`, err) }
    })
  },
}
