<script setup>
// Aviso sobre la partida: en celular vertical el mapa queda diminuto. Desaparece solo al girar el
// teléfono (isPortrait cambia) o al elegir «Seguir en vertical» (preferLandscape = false).
const { canFullscreen, isPortrait, isTouch, preferLandscape, toggleFullscreen } = useScreenMode()

function stayPortrait() {
  preferLandscape.value = false
}
</script>

<template>
  <div
    v-if="isTouch && isPortrait && preferLandscape"
    class="rotate-hint"
    role="dialog"
    aria-label="Girá el teléfono para jugar en horizontal"
  >
    <div class="rotate-card">
      <svg class="rotate-phone" viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
        <rect x="14" y="4" width="20" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="2.5" />
        <line x1="21" y1="39" x2="27" y2="39" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </svg>
      <p class="rotate-title">Girá el teléfono para jugar en horizontal</p>
      <p class="rotate-sub">Así ves mucho más mapa y los botones quedan a mano.</p>
      <div class="rotate-actions">
        <button v-if="canFullscreen" type="button" class="rotate-btn rotate-btn--primary" @click="toggleFullscreen">
          Pantalla completa
        </button>
        <button type="button" class="rotate-btn" @click="stayPortrait">Seguir en vertical</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rotate-hint {
  position: absolute; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  background: rgba(2, 4, 10, 0.82);
}
.rotate-card {
  width: 100%; max-width: 20rem; text-align: center; padding: 1.25rem; border-radius: 1rem;
  background: #0a0f1c; color: #cffafe; box-shadow: 0 0 0 1px rgba(139, 233, 253, 0.35);
}
.rotate-phone { display: block; margin: 0 auto 0.75rem; color: #8be9fd; animation: rotatePhone 2.4s ease-in-out infinite; }
.rotate-title { font-size: 1.05rem; font-weight: 700; color: #fff; }
.rotate-sub { margin-top: 0.25rem; font-size: 0.8rem; color: rgba(207, 250, 254, 0.7); }
.rotate-actions { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; }
.rotate-btn {
  min-height: 2.75rem; width: 100%; border-radius: 0.75rem; font-size: 0.9rem; font-weight: 600;
  background: rgba(255, 255, 255, 0.06); color: #cffafe; box-shadow: 0 0 0 1px rgba(139, 233, 253, 0.3);
}
.rotate-btn--primary { background: #8be9fd; color: #05070f; box-shadow: none; }
@keyframes rotatePhone {
  0%, 20% { transform: rotate(0deg); }
  60%, 80% { transform: rotate(-90deg); }
  100% { transform: rotate(0deg); }
}
@media (prefers-reduced-motion: reduce) {
  .rotate-phone { animation: none; transform: rotate(-45deg); }
}
</style>
