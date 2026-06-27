import { reactive } from 'vue'
import { appState, DIFFICULTY } from './appState.js'

/**
 * Shared reactive state bridge between Phaser and the Vue HUD.
 * Phaser scenes mutate these fields; Vue components read them reactively.
 */
export const gameState = reactive({
  minerals: 200,
  mineralsCap: 700,
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
  speed: 1,
  bossWave: false,
  general: { alive: true, hp: 120, hpMax: 120, respawnIn: 0, damage: 8, atkRange: 160, collectRate: 18 },
  generalMode: null, // null | 'selected'
  generalUpgrades: [], // ids de mejoras compradas para el General
})

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__GAMESTATE__ = gameState
}

export function resetGameState() {
  const diffKey = appState.difficulty || 'normal'
  const diff = DIFFICULTY[diffKey] || DIFFICULTY.normal
  const startMinerals = diff.startMinerals ?? 200

  Object.assign(gameState, {
    minerals: startMinerals,
    mineralsCap: 700,
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
    bossWave: false,
    general: { alive: true, hp: 120, hpMax: 120, respawnIn: 0, damage: 8, atkRange: 160, collectRate: 18 },
    generalMode: null,
    generalUpgrades: [],
  })
}
