import { reactive } from 'vue'
import { STARTING_MINERALS } from './constants.js'

/**
 * Shared reactive state bridge between Phaser and the Vue HUD.
 * Phaser scenes mutate these fields; Vue components read them reactively.
 */
export const gameState = reactive({
  minerals: STARTING_MINERALS,
  mineralsCap: 1000,
  energy: 100,
  energyMax: 100,
  wave: 0,
  waveTotal: 10,
  timeElapsed: 0, // seconds
  coreHp: 100,
  coreHpMax: 100,
  status: 'idle', // idle | playing | paused | gameover | victory
  activeBuild: null, // key of the structure currently being placed, or null
  nextWaveIn: 0, // seconds until the next wave (0 = wave in progress)
  enemiesAlive: 0,
  speed: 1, // game-speed multiplier: 0 paused, 0.5 slow, 1 normal, 2 fast
})

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__GAMESTATE__ = gameState
}

export function resetGameState() {
  Object.assign(gameState, {
    minerals: STARTING_MINERALS,
    mineralsCap: 1000,
    energy: 100,
    energyMax: 100,
    wave: 0,
    waveTotal: 10,
    timeElapsed: 0,
    coreHp: 100,
    coreHpMax: 100,
    status: 'idle',
    activeBuild: null,
    nextWaveIn: 0,
    enemiesAlive: 0,
    speed: 1,
  })
}
