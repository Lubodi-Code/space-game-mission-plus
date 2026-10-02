import { appState } from '../appState.js'

// Modos de juego como datos. Un modo describe las reglas que varían entre partidas
// (ritmo, economía, cantidad de enemigos). El selector del lobby elige `appState.mode`;
// systems/waves.js lo lee en initWaves/updateWaves. Añadir un modo = una entrada aquí.
//
// Una oleada no termina hasta que muere la última nave; después viene un respiro (intermissionMs).
// La duración de cada oleada la domina el viaje de la horda desde el borde del mapa (~60-100 s a
// distancia completa), así que es lo que separa los modos:
// - spawnDistMult: distancia de aparición respecto del borde (1 = borde del mapa).
// - spawnGapMult: separación entre naves al aparecer (menor = la oleada entra más compacta).
// - countScale: multiplica la cantidad de enemigos por oleada (encima de la dificultad).
// - economyMult: minería (recolectores + General) y minerales iniciales.
// - buildTimeMult: tiempo de construcción de estructuras.

export const MODES = {
  quick: {
    id: 'quick',
    label: 'Rápido',
    desc: '10 oleadas en 5–10 minutos. Economía acelerada y hordas que llegan antes.',
    minutes: '5–10 min',
    art: '/assets/art/mode-quick.webp',
    waveCount: 10,
    firstWaveMs: 10000,
    intermissionMs: 7000,
    spawnDistMult: 0.42,
    spawnGapMult: 0.6,
    countScale: 0.45,
    economyMult: 1.8,
    buildTimeMult: 0.5,
  },
  classic: {
    id: 'classic',
    label: 'Clásico',
    desc: '10 oleadas en 10–15 minutos. El modo estratégico de siempre.',
    minutes: '10–15 min',
    art: '/assets/art/mode-classic.webp',
    waveCount: 10,
    firstWaveMs: 20000,
    intermissionMs: 14000,
    spawnDistMult: 0.75,
    spawnGapMult: 1,
    countScale: 0.8,
    economyMult: 1.15,
    buildTimeMult: 0.85,
  },
}

export const DEFAULT_MODE = 'classic'

export function currentMode() {
  return MODES[appState.mode] || MODES[DEFAULT_MODE]
}
