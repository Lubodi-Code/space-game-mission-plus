import { reactive } from 'vue'

/**
 * App-level UI state (which screen is showing, chosen difficulty).
 * Kept separate from gameState so restarting a run doesn't bounce to the lobby.
 */
export const appState = reactive({
  view: 'lobby', // 'lobby' | 'game'
  difficulty: 'normal', // 'normal' | 'hard'
  mode: 'campaign', // ver src/game/modes/index.js
  mp: { role: 'solo', connected: false, code: null, ping: false },
})

// Multipliers applied to enemy stats per difficulty.
export const DIFFICULTY = {
  easy:   { label: 'Fácil',   hpMult: 0.8, dmgMult: 0.8, countMult: 0.85, gapMult: 1.15, startMinerals: 250 },
  normal: { label: 'Normal',  hpMult: 1.0, dmgMult: 1.0, countMult: 1.0,  gapMult: 1.0,  startMinerals: 200 },
  hard:   { label: 'Difícil', hpMult: 1.5, dmgMult: 1.35, countMult: 1.25, gapMult: 0.85, startMinerals: 150 },
}

export function startGame(difficulty, mode = appState.mode) {
  appState.difficulty = difficulty
  appState.mode = mode
  appState.view = 'game'
}

export function goToLobby() {
  appState.view = 'lobby'
}
