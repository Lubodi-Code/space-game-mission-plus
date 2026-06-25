import { DIFFICULTY } from './appState.js'

export const BUILD = {
  overlapRadius: 34
}

export const COMBAT = {
  attackReachOffset: 14,
  laserTtlMs: 90
}

export const FX = {
  explosionMs: 360,
  coreExplosionRadius: 120,
  floatTextMs: 700,
  floatRise: 28
}

export const WORLD = { width: 2400, height: 1600 }

export const CAMERA = {
  minZoom: 0.5,
  maxZoom: 1.4,
  startZoom: 1,
  zoomStep: 0.1,
  keyPanSpeed: 700,
  dragThreshold: 6,
}

export const METEOR = {
  count: 34,
  minDist: 220,
  maxDist: 1000,
  amountMin: 450,
  amountMax: 750
}

export const ENEMY = {
  spawnRadiusFactor: 0.75,
}

export const STARFIELD = {
  layers: [
    { count: 110, scale: [0.25, 0.5], alpha: 0.35, depth: -30 },
    { count: 80, scale: [0.4, 0.8], alpha: 0.6, depth: -20 },
    { count: 40, scale: [0.7, 1.3], alpha: 0.9, depth: -10 }
  ]
}

export const SPEED = {
  steps: [0, 0.5, 1, 2]
}

export const CORE = {
  key: 'core',
  range: 190,
  color: 0x8be9fd,
  role: 'core',
  hp: 100,
}

export const STARTING_MINERALS = 200

export const STRUCTURES = [
  { 
    key: 'node', 
    label: 'Nodo', 
    glyph: '✛', 
    cost: 20, 
    color: 0x6cc8ff, 
    css: '#6cc8ff', 
    range: 235, 
    sides: 6, 
    size: 13, 
    role: 'relay', 
    hp: 40,
    desc: 'Extiende el rango de energía de la red.' 
  },
  { 
    key: 'collector', 
    label: 'Recolector', 
    glyph: '⛏', 
    cost: 45, 
    color: 0x49e07a, 
    css: '#49e07a', 
    range: 135, 
    sides: 5, 
    size: 15, 
    role: 'collector', 
    hp: 50, 
    miningRange: 175, 
    rate: 9,
    desc: 'Mina minerales de meteoritos cercanos automáticamente.' 
  },
  { 
    key: 'battery', 
    label: 'Batería', 
    glyph: '▮', 
    cost: 60, 
    color: 0xffcc55, 
    css: '#ffcc55', 
    range: 130, 
    sides: 4, 
    size: 14, 
    role: 'battery', 
    hp: 60, 
    capBonus: 600,
    desc: 'Incrementa la capacidad máxima de almacenamiento de minerales.' 
  },
  { 
    key: 'healer', 
    label: 'Enjambre', 
    glyph: '✺', 
    cost: 120, 
    color: 0xff7ad9, 
    css: '#ff7ad9', 
    range: 130, 
    sides: 8, 
    size: 14, 
    role: 'healer', 
    hp: 70, 
    healInterval: 2600, 
    maxSpheres: 3, 
    healRate: 22, 
    sphereSpeed: 135,
    desc: 'Genera esferas de reparación autónomas para curar estructuras dañadas.' 
  },
  { 
    key: 'laser', 
    label: 'Torreta', 
    glyph: '▲', 
    cost: 80, 
    color: 0xff5566, 
    css: '#ff5566', 
    range: 130, 
    sides: 3, 
    size: 17, 
    role: 'turret', 
    hp: 60, 
    atkRange: 165, 
    damage: 7, 
    cooldown: 130,
    desc: 'Dispara ráfagas rápidas de láser de un solo objetivo.' 
  },
  { 
    key: 'missile', 
    label: 'Misiles', 
    glyph: '⬡', 
    cost: 150, 
    color: 0xc08bff, 
    css: '#c08bff', 
    range: 130, 
    sides: 6, 
    size: 17, 
    role: 'missile', 
    hp: 55, 
    atkRange: 255, 
    damage: 26, 
    cooldown: 1500, 
    splash: 58, 
    projSpeed: 210,
    desc: 'Dispara misiles de largo alcance que infligen daño de área.' 
  },
]

const BY_KEY = Object.fromEntries(STRUCTURES.map((s) => [s.key, s]))
export function structureByKey(key) {
  return BY_KEY[key]
}

export const ENEMY_TYPES = {
  green: { key: 'green', hp: 18, speed: 40, damage: 5, atkCooldown: 600, color: 0x49e07a, scale: 1, reward: 6 },
  yellow: { key: 'yellow', hp: 12, speed: 78, damage: 4, atkCooldown: 500, color: 0xffd24a, scale: 0.9, reward: 5 },
  red: { key: 'red', hp: 80, speed: 24, damage: 13, atkCooldown: 800, color: 0xff5566, scale: 1.6, reward: 22 },
  purple: { key: 'purple', hp: 440, speed: 18, damage: 30, atkCooldown: 900, color: 0xc08bff, scale: 2.7, reward: 160, boss: true },
}

export function buildWaves(difficultyKey = 'normal') {
  const diff = DIFFICULTY[difficultyKey] || DIFFICULTY.normal
  const countMult = diff.countMult ?? 1
  const gapMult = diff.gapMult ?? 1

  const waves = []
  for (let i = 1; i <= 10; i++) {
    const list = []
    const push = (type, n) => {
      const count = Math.max(1, Math.round(n * countMult))
      for (let k = 0; k < count; k++) {
        list.push(type)
      }
    }

    push('green', 4 + i * 2)
    if (i >= 3) {
      push('yellow', (i - 2) * 2)
    }
    if (i >= 5) {
      push('red', i - 4)
    }
    if (i === 8) {
      push('purple', 1)
      push('red', 3) // 2-3 red escort enemies
    }
    if (i === 10) {
      push('purple', 2)
      push('red', 3) // 2-3 red escort enemies
    }

    // Interleave so types arrive mixed, not in blocks.
    shuffle(list)

    const hasBoss = (i === 8 || i === 10)
    waves.push({ list, gap: Math.max(260, 920 - i * 60) * gapMult, hasBoss })
  }
  return waves
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

export const WAVE_TOTAL = 10
export const INTERMISSION_MS = 4000
export const FIRST_WAVE_MS = 3500
