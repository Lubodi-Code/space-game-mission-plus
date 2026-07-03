import { reactive, watch } from 'vue'

// ponytail: solo-run resume across page reload. Multiplayer never restores (the
// PeerJS connection dies on reload), so it's excluded from the persisted snapshot.
const SAVE_KEY = 'sgmp_resume'
const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null')

/**
 * App-level UI state (which screen is showing, chosen difficulty).
 * Kept separate from gameState so restarting a run doesn't bounce to the lobby.
 */
export const appState = reactive({
  view: saved?.view || 'lobby', // 'lobby' | 'game'
  difficulty: saved?.difficulty || 'normal', // 'normal' | 'hard'
  mode: saved?.mode || 'campaign', // ver src/game/modes/index.js
  playerName: 'Comandante',
  mp: { role: 'solo', connected: false, code: null, ping: false, players: [] },
})

watch(
  () => [appState.view, appState.difficulty, appState.mode],
  ([view, difficulty, mode]) => {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({ view, difficulty, mode }))
  }
)

// Multipliers applied to enemy stats per difficulty.
export const DIFFICULTY = {
  easy:   { label: 'Fácil',   hpMult: 0.8, dmgMult: 0.8, countMult: 2.2, gapMult: 0.6, startMinerals: 400 },
  normal: { label: 'Normal',  hpMult: 1.0, dmgMult: 1.0, countMult: 3.5,  gapMult: 0.4,  startMinerals: 300 },
  hard:   { label: 'Difícil', hpMult: 1.5, dmgMult: 1.35, countMult: 5.5, gapMult: 0.25, startMinerals: 200 },
}

export function startGame(difficulty, mode = appState.mode) {
  sessionStorage.removeItem('sgmp_solo_run') // JUGAR siempre empieza partida nueva, no reanuda una vieja
  appState.difficulty = difficulty
  appState.mode = mode
  appState.view = 'game'
}

export function goToLobby() {
  appState.view = 'lobby'
  sessionStorage.removeItem('sgmp_solo_run')
}
