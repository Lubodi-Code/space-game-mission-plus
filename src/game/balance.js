import { DIFFICULTY } from './appState.js'
import { EnemyType } from './enemies/EnemyType.js'

export const BUILD = {
  overlapRadius: 18
}

export const COMBAT = {
  attackReachOffset: 12,
  laserTtlMs: 90,
  missileTurnRate: 1.2,
  missileMaxLifeMs: 5000,
  bigbeamCooldown: 150,   // ms: el rayo "anti-grande" dispara casi en continuo
  bigbeamRampStep: 0.12,  // incremento de daño por tick sobre el mismo blanco
  bigbeamRampMax: 3,      // tope de la rampa → daño máx = base × (1 + 3) = ×4
}

// Economía de energía. La energía es un pool global (gameState.energy / energyMax).
// La producen los recolectores al minar; la almacenan núcleo + baterías; la
// consumen las torretas al disparar. Sin energía, los consumidores se apagan.
export const ENERGY = {
  batteryPassiveRate: 2,      // energía/s que genera una batería siempre que esté encendida
  batterySelfChargeRate: 4, // energía/s que regenera una batería con auto-recarga (mejora)
}

export const STEERING = {
  shipBase: 24,
  wMove: 1.0,
  wSeparate: 1.3,
  wAvoid: 1.6,
  wWander: 0.4,
  wEvade: 3.0,
  separationRadius: 24,
  avoidLookahead: 60,
  wanderDistance: 35,
  wanderRadius: 14,
  wanderJitter: 3.5,
  threatHorizon: 2.5,
  evadeMargin: 12,
}

export const FX = {
  explosionMs: 360,
  coreExplosionRadius: 80,
  floatTextMs: 700,
  floatRise: 28
}

export const WORLD = { width: 7200, height: 4800 }

export const CAMERA = {
  minZoom: 0.25,
  maxZoom: 1.0,
  startZoom: 0.55,
  zoomStep: 0.05,
  keyPanSpeed: 1500,
  dragThreshold: 4,
}

export const METEOR = {
  count: 80,
  minDist: 400,
  maxDist: 3000,
  amountMin: 1500,
  amountMax: 3000
}

export const ENEMY = {
  spawnRadiusFactor: 0.9,
}

export const STARFIELD = {
  layers: [
    { count: 260, scale: [0.15, 0.35], alpha: 0.3, depth: -30 },
    { count: 180, scale: [0.25, 0.5], alpha: 0.5, depth: -20 },
    { count: 100, scale: [0.4, 0.8], alpha: 0.8, depth: -10 }
  ]
}

export const SPEED = {
  steps: [0, 0.5, 1, 2]
}

export const CORE = {
  key: 'core',
  range: 350,
  color: 0x8be9fd,
  role: 'core',
  hp: 250,
  maxPorts: 12, // el núcleo es el relay raíz
  energyCap: 100, // almacén base de energía del sistema
}

export const GENERAL = {
  hp: 120,
  speed: 280,
  radius: 16,
  contactDps: 25,
  respawnMs: 8000,
  color: 0x8be9fd,
  // Arma
  atkRange: 160,
  damage: 8,
  cooldown: 450, // ms
  // Recolección
  collectRange: 50,
  collectRate: 18, // minerales/s
  // Buff por proximidad a estructuras
  buffRadius: 220,
  buffMultiplier: 1.6, // × cadencia y recolección
}

export const STARTING_MINERALS = 300

export const STRUCTURES = [
  { 
    key: 'node', 
    label: 'Nodo', 
    glyph: '✛', 
    cost: 20, 
    color: 0x6cc8ff, 
    css: '#6cc8ff', 
    range: 200,
    sides: 6,
    size: 9,
    role: 'relay',
    hp: 40,
    maxPorts: 8,
    buildTime: 1500,
    desc: 'Conecta estructuras a la red. Nexo de conexión (8 puertos).'
  },
  { 
    key: 'collector', 
    label: 'Recolector', 
    glyph: '⛏', 
    cost: 45, 
    color: 0x49e07a, 
    css: '#49e07a', 
    range: 120, 
    sides: 5, 
    size: 10, 
    role: 'collector',
    hp: 50,
    miningRange: 150,
    rate: 9,
    energyRate: 7,
    buildTime: 2500,
    desc: 'Mina minerales de meteoritos cercanos y genera energía.'
  },
  { 
    key: 'battery', 
    label: 'Batería', 
    glyph: '▮', 
    cost: 60, 
    color: 0xffcc55, 
    css: '#ffcc55', 
    range: 110, 
    sides: 4, 
    size: 9, 
    role: 'battery',
    hp: 60,
    capBonus: 800,
    energyCap: 120,
    buildTime: 3000,
    desc: 'Amplía el almacén de energía y de minerales del sistema.'
  },
  { 
    key: 'healer', 
    label: 'Enjambre', 
    glyph: '✺', 
    cost: 120, 
    color: 0xff7ad9, 
    css: '#ff7ad9', 
    range: 110, 
    sides: 8, 
    size: 9, 
    role: 'healer',
    hp: 70,
    healInterval: 1600,
    maxSpheres: 4,
    healRate: 14,
    sphereSpeed: 135,
    energyDrain: 2,
    buildTime: 4000,
    desc: 'Genera esferas de reparación autónomas para curar estructuras dañadas.' 
  },
  { 
    key: 'laser', 
    label: 'Torreta Láser', 
    glyph: '▲', 
    cost: 80, 
    color: 0xff5566, 
    css: '#ff5566', 
    range: 110, 
    sides: 3, 
    size: 11, 
    role: 'turret', 
    hp: 60, 
    atkRange: 140,
    damage: 28,
    cooldown: 20000,
    energyDrain: 1,
    buildTime: 5000,
    desc: 'Dispara ráfagas rápidas de láser de un solo objetivo.'
  },
  { 
    key: 'missile', 
    label: 'Torreta de Misiles', 
    glyph: '⬡', 
    cost: 150, 
    color: 0xc08bff, 
    css: '#c08bff', 
    range: 110, 
    sides: 6, 
    size: 11, 
    role: 'missile', 
    hp: 55, 
    atkRange: 2250, 
    damage: 9, 
    cooldown: 15000,
    splash: 15,
    projSpeed: 200,
    energyDrain: 6,
    buildTime: 5000,
    desc: 'Dispara una tanda de misiles guiados de largo alcance.'
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

const DIRECTIONS = [-Math.PI, Math.PI / 2, 0, -Math.PI / 2, Math.PI * 0.75, Math.PI * 0.25, -Math.PI * 0.25, -Math.PI * 0.75, Math.PI, Math.PI / 2]

export function buildWaves(difficultyKey = 'normal', waveCount = WAVE_TOTAL) {
  const diff = DIFFICULTY[difficultyKey] || DIFFICULTY.normal
  const countMult = diff.countMult ?? 1
  const gapMult = diff.gapMult ?? 1

  const waves = []
  for (let i = 1; i <= waveCount; i++) {
    const list = []
    // Crecimiento lineal por tipo (sin el `factor` multiplicativo de antes, que disparaba los
    // grunts a cientos y tapaba la variedad). Cada tipo crece a su ritmo y mantiene una cuota
    // sana en oleadas altas → variedad real (~30% grunt, 23% runner, 18% skirmisher, etc.).
    const push = (type, n) => {
      const count = Math.round(n * countMult)
      for (let k = 0; k < count; k++) list.push(type)
    }

    push(EnemyType.GRUNT, 12 + i * 4)
    if (i >= 2) push(EnemyType.RUNNER, 4 + (i - 1) * 4)
    // Saboteadores desde la oleada 1 para presionar temprano.
    push(EnemyType.SABOTEUR, 2 + i * 2)
    if (i >= 3) {
      // Skirmishers más numerosos y desde la oleada 3.
      push(EnemyType.SKIRMISHER, 4 + (i - 2) * 6)
      push(EnemyType.BRUTE, 2 + (i - 3) * 2)
    }
    if (i >= 5) push(EnemyType.ARTILLERY, 2 + (i - 4) * 2)
    if (i >= 7) push(EnemyType.MOTHERSHIP, 1 + (i - 6))

    shuffle(list)

    const hasBoss = (i >= 7)
    const dir = DIRECTIONS[(i - 1) % DIRECTIONS.length]
    waves.push({ list, gap: Math.max(50, 300 - i * 25) * gapMult, hasBoss, dir })
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
