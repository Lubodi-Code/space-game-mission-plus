import { DIFFICULTY } from './appState.js'
import { EnemyType } from './enemies/EnemyType.js'
import { RENDER_SCALE as R } from './quality.js'

export const BUILD = {
  overlapRadius: 18
}

export const COMBAT = {
  attackReachOffset: 12,
  laserTtlMs: 90,
  missileTurnRate: 1.2,
  missileMaxLifeMs: 5000,
  bigbeamCooldown: 150,   // ms: el rayo "anti-grande" dispara casi en continuo
  bigbeamRampStep: 0.16,  // incremento por tick para el exponente
  bigbeamRampMax: 3,      // tope del exponente → daño máx = base × 1.08^(ramp*10)
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

export const WORLD = { width: 10800, height: 7200 }

// El canvas de Phaser se renderiza a RENDER_SCALE píxeles por píxel CSS (nitidez en pantallas
// de alta densidad), así que zoom y umbrales en píxeles se escalan por R: la vista queda igual.
export const CAMERA = {
  minZoom: 0.25 * R,
  maxZoom: 1.0 * R,
  startZoom: 0.55 * R,
  zoomStep: 0.05 * R,
  keyPanSpeed: 1500,
  dragThreshold: 4 * R,
}

export const METEOR = {
  count: 140,
  minDist: 400,
  maxDist: 4500,
  amountMin: 1500,
  amountMax: 3000
}

export const ENEMY = {
  spawnRadiusFactor: 0.9,
}

export const STARFIELD = {
  layers: [
    { count: 416, scale: [0.15, 0.35], alpha: 0.3, depth: -30 },
    { count: 288, scale: [0.25, 0.5], alpha: 0.5, depth: -20 },
    { count: 160, scale: [0.4, 0.8], alpha: 0.8, depth: -10 }
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
  cooldown: 380, // ms
  // Recolección
  collectRange: 50,
  collectRate: 22, // minerales/s
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
    desc: 'Genera energía sin parar mientras está conectada y amplía el almacén de energía y de minerales.'
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
    healRate: 8,
    healDamageCooldown: 1500, // ms tras recibir daño en los que la estructura no se cura
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
    atkRange: 150,
    damage: 14,
    cooldown: 1100,
    energyDrain: 1,
    buildTime: 5000,
    desc: 'Torreta láser de disparo rápido. Mejorable: Rama A (ráfaga múltiple) o Rama B (rayo de largo alcance).'
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
    atkRange: 1800,
    damage: 9,
    cooldown: 15000,
    splash: 15,
    projSpeed: 200,
    energyDrain: 6,
    buildTime: 5000,
    desc: 'Dispara una tanda de misiles guiados de largo alcance.'
  },
  // ================= Arsenal (se desbloquean en la tienda: arsenal.scrap + arsenal.level) =================
  {
    key: 'cryo', label: 'Criogénica', glyph: '❄', cost: 110, color: 0x9ae8ff, css: '#9ae8ff',
    range: 110, sides: 8, size: 11, role: 'cryo', hp: 70, buildTime: 5000,
    atkRange: 140, damage: 4, cooldown: 700, slowMs: 1400, slowFactor: 0.5, splash: 0, energyDrain: 2,
    arsenal: { scrap: 200, level: 1 },
    desc: 'Rayo helado que ralentiza a la horda. Ideal junto a torretas de daño.',
  },
  {
    key: 'tesla', label: 'Bobina Tesla', glyph: 'ϟ', cost: 130, color: 0x7a9bff, css: '#7a9bff',
    range: 110, sides: 4, size: 11, role: 'tesla', hp: 65, buildTime: 5000,
    atkRange: 170, damage: 12, cooldown: 1300, chains: 2, chainRange: 110, slowMs: 0, energyDrain: 3,
    arsenal: { scrap: 250, level: 2 },
    desc: 'Descarga eléctrica que salta entre varios enemigos cercanos.',
  },
  {
    key: 'flak', label: 'Flak', glyph: '✱', cost: 140, color: 0xff9a3d, css: '#ff9a3d',
    range: 110, sides: 6, size: 11, role: 'flak', hp: 90, buildTime: 5000,
    atkRange: 115, damage: 9, cooldown: 850, coneDeg: 60, pellets: 5, energyDrain: 2,
    arsenal: { scrap: 300, level: 3 },
    desc: 'Metralla en cono a corta distancia. Destroza enjambres que se acercan.',
  },
  {
    key: 'shield', label: 'Escudo', glyph: '◌', cost: 160, color: 0x6cffe0, css: '#6cffe0',
    range: 110, sides: 8, size: 11, role: 'shield', hp: 120, buildTime: 5000,
    shieldRange: 180, shieldReduce: 0.3, energyDrain: 2,
    arsenal: { scrap: 350, level: 3 },
    desc: 'Domo que reduce el daño que reciben las estructuras cercanas.',
  },
  {
    key: 'railgun', label: 'Cañón de riel', glyph: '═', cost: 200, color: 0xffe066, css: '#ffe066',
    range: 110, sides: 3, size: 12, role: 'railgun', hp: 55, buildTime: 5000,
    atkRange: 520, damage: 90, cooldown: 3200, pierce: 2, energyDrain: 6,
    arsenal: { scrap: 400, level: 4 },
    desc: 'Francotirador de muy largo alcance: su disparo atraviesa varias naves en línea.',
  },
  {
    key: 'mortar', label: 'Mortero', glyph: '⬤', cost: 220, color: 0xff5e3d, css: '#ff5e3d',
    range: 110, sides: 5, size: 12, role: 'mortar', hp: 70, buildTime: 5000,
    atkRange: 900, damage: 40, splash: 70, cooldown: 4200, projSpeed: 170, shells: 1, energyDrain: 5,
    arsenal: { scrap: 450, level: 5 },
    desc: 'Proyectiles lentos de gran área a larga distancia. Castiga a los grupos.',
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

// opts.countScale: multiplicador del modo (Rápido/Clásico); opts.sector: meta/sectors.js
// (multiplica la cantidad y decide qué tipos nuevos entran).
export function buildWaves(difficultyKey = 'normal', waveCount = WAVE_TOTAL, opts = {}) {
  const diff = DIFFICULTY[difficultyKey] || DIFFICULTY.normal
  const sector = opts.sector
  const countMult = (diff.countMult ?? 1) * (opts.countScale ?? 1) * (sector?.countMult ?? 1)
  const gapMult = diff.gapMult ?? 1
  const allowed = (type) => !sector || sector.roster.includes(type)

  const waves = []
  for (let i = 1; i <= waveCount; i++) {
    const list = []
    // Crecimiento lineal por tipo (sin el `factor` multiplicativo de antes, que disparaba los
    // grunts a cientos y tapaba la variedad). Cada tipo crece a su ritmo y mantiene una cuota
    // sana en oleadas altas → variedad real (~30% grunt, 23% runner, 18% skirmisher, etc.).
    const push = (type, n) => {
      if (!allowed(type)) return
      const count = Math.max(1, Math.round(n * countMult))
      for (let k = 0; k < count; k++) list.push(type)
    }

    // COMMANDSHIP: la nave nodriza aparece UNA sola vez por partida (oleada 6).
    // push() directo para que countMult de dificultad no la duplique.
    if (i === 6) list.push(EnemyType.COMMANDSHIP)

    // Orden secuencial: artillería y brutes primero después de la nodriza
    if (i >= 3) push(EnemyType.BRUTE, 2 + (i - 3) * 2)
    if (i >= 5) push(EnemyType.ARTILLERY, 2 + (i - 4) * 2)

    // Luego el resto de naves en orden normal
    push(EnemyType.GRUNT, 12 + i * 4)
    if (i >= 2) push(EnemyType.RUNNER, 4 + (i - 1) * 4)
    // Saboteadores desde la oleada 1 para presionar temprano.
    push(EnemyType.SABOTEUR, 2 + i * 2)
    if (i >= 3) {
      // Skirmishers menos cantidad, foco en infraestructura.
      push(EnemyType.SKIRMISHER, 2 + (i - 2) * 2)
    }
    // MOTHERSHIP: naves madre (portanaves) en oleadas muy altas
    if (i >= 7) push(EnemyType.MOTHERSHIP, 1 + Math.floor((i - 7) / 2))
    // Tipos de sector (solo si el sector los habilita).
    if (i >= 2) push(EnemyType.KAMIKAZE, 1 + (i - 1) * 1.2)
    if (i >= 3) push(EnemyType.LEECH, 1 + (i - 2))
    if (i >= 4) push(EnemyType.WARDEN, 0.4 + (i - 4) * 0.25)
    if (i >= 5) push(EnemyType.BOMBER, 0.5 + (i - 5) * 0.4)

    shuffle(list)

    const hasBoss = (i >= 6)
    // Direcciones aleatorias: oleadas 4+ tienen 2 sectores, oleadas 8+ tienen 3 sectores
    const numDirs = i >= 8 ? 3 : (i >= 4 ? 2 : 1)
    const dirs = []
    for (let d = 0; d < numDirs; d++) {
      dirs.push(Math.random() * Math.PI * 2)
    }
    waves.push({ list, gap: Math.max(50, 300 - i * 25) * gapMult, hasBoss, dirs })
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
