import { reactive } from 'vue'

/**
 * App-level UI state (which screen is showing, chosen difficulty).
 * Kept separate from gameState so restarting a run doesn't bounce to the lobby.
 */
export const appState = reactive({
  view: 'lobby', // 'lobby' | 'game'
  difficulty: 'normal', // 'normal' | 'hard'
})

// Multipliers applied to enemy stats per difficulty.
export const DIFFICULTY = {
  normal: { hp: 1, damage: 1, label: 'Normal' },
  hard: { hp: 1.6, damage: 1.4, label: 'Difícil' },
}

export function startGame(difficulty) {
  appState.difficulty = difficulty
  appState.view = 'game'
}

export function goToLobby() {
  appState.view = 'lobby'
}
