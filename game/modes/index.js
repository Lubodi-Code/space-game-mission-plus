import { appState } from '../appState.js'

// Modos de juego como datos. Un modo describe las reglas que varían entre partidas
// (ritmo, economía, cantidad de enemigos). El selector del lobby elige `appState.mode`;
// systems/waves.js lo lee en initWaves/updateWaves. Añadir un modo = una entrada aquí.
//
// - waveBudgetMs: tiempo máximo de una oleada. Si no se limpió a tiempo, la siguiente entra
//   igual y los enemigos se acumulan. Es lo que acota la duración total de la partida.
// - countScale: multiplica la cantidad de enemigos por oleada (encima de la dificultad).
// - economyMult: minería (recolectores + General) y minerales iniciales.
// - buildTimeMult: tiempo de construcción de estructuras.

export const MODES = {
  quick: {
    id: 'quick',
    label: 'Rápido',
    desc: '10 oleadas en 5–10 minutos. Economía acelerada, sin respiro.',
    minutes: '5–10 min',
    art: '/assets/art/mode-quick.webp',
    waveCount: 10,
    firstWaveMs: 8000,
    intermissionMs: 3000,
    waveBudgetMs: 38000,
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
    firstWaveMs: 15000,
    intermissionMs: 6000,
    waveBudgetMs: 75000,
    countScale: 0.8,
    economyMult: 1.15,
    buildTimeMult: 0.85,
  },
}

export const DEFAULT_MODE = 'classic'

export function currentMode() {
  return MODES[appState.mode] || MODES[DEFAULT_MODE]
}
