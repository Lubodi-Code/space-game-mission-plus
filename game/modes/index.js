// Modos de juego como datos. Un modo describe las reglas que varían entre partidas
// (cuántas oleadas, ritmo del intermedio). El selector del lobby elige `appState.mode`;
// systems/waves.js lo lee en initWaves/updateWaves. Añadir un modo = una entrada aquí.
//
// ponytail: hoy los modos solo difieren en waveCount + intermissionMs (knobs que antes
// eran constantes). Cuando un modo necesite reglas propias (objetivo distinto, worldgen,
// estado inicial), agrégale un campo aquí y léelo donde toque — no hace falta más maquinaria.

export const MODES = {
  campaign: {
    id: 'campaign',
    label: 'Campaña',
    desc: '10 oleadas. El modo clásico.',
    waveCount: 10,
    intermissionMs: 4000,
  },
  blitz: {
    id: 'blitz',
    label: 'Blitz',
    desc: '6 oleadas, sin respiro.',
    waveCount: 6,
    intermissionMs: 1800,
  },
}

export const DEFAULT_MODE = 'campaign'
