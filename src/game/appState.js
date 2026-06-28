import { reactive } from 'vue'

/**
 * App-level UI state (which screen is showing, chosen difficulty).
 * Kept separate from gameState so restarting a run doesn't bounce to the lobby.
 */
export const appState = reactive({
  view: 'lobby', // 'lobby' | 'game'
  difficulty: 'normal', // 'normal' | 'hard'
  mode: 'campaign', // ver src/game/modes/index.js
  playerName: 'Comandante',
  mp: { role: 'solo', connected: false, code: null, ping: false, players: [] },
})

// Multipliers applied to enemy stats per difficulty.
export const DIFFICULTY = {
  easy:   { label: 'Fácil',   hpMult: 0.8, dmgMult: 0.8, countMult: 2.2, gapMult: 0.6, startMinerals: 400 },
  normal: { label: 'Normal',  hpMult: 1.0, dmgMult: 1.0, countMult: 3.5,  gapMult: 0.4,  startMinerals: 300 },
  hard:   { label: 'Difícil', hpMult: 1.5, dmgMult: 1.35, countMult: 5.5, gapMult: 0.25, startMinerals: 200 },
}

export function startGame(difficulty, mode = appState.mode) {
  appState.difficulty = difficulty
  appState.mode = mode
  appState.view = 'game'
}

export function goToLobby() {
  appState.view = 'lobby'
}
