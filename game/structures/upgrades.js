/**
 * Árbol de mejoras data-driven para torretas.
 * Cada upgrade: { id, label, cost, forRole, apply(structure) }
 */

export const UPGRADES = [
  // ---- Torreta Láser: Rama A (Ráfaga múltiple / saturación) ----
  {
    id: 'laser_a',
    branch: 'A',
    label: 'Ráfaga rápida',
    cost: 60,
    forRole: 'turret',
    excludes: 'laser_b',
    atkRange: 0.7,
    cooldown: 0.25,  // ponytail: más rápido (antes 0.38)
    damage: 0.6,
    tint: 0xffae5b,
    decor: 'fast',
  },
  {
    id: 'laser_a2',
    branch: 'A',
    label: 'Ráfaga triple (3 objetivos)',
    cost: 100,
    forRole: 'turret',
    style: 'spread',
    requires: 'laser_a',
    excludes: 'laser_b',
    atkRange: 1.6,
    damage: 0.40,  // ponytail: menos daño (antes 0.55)
    cooldown: 0.25,  // ponytail: más lento (antes 0.1)
    tint: 0xffd24a,
    decor: 'triple',
  },

  // ---- Torreta Láser: Rama B (Rayo pesado / largo alcance) ----
  {
    id: 'laser_b',
    branch: 'B',
    label: 'Cañón de largo alcance',
    cost: 80,
    forRole: 'turret',
    excludes: 'laser_a',
    atkRange: 3.0,  // ponytail: más radio (antes 2.0, luego 2.4)
    cooldown: 1.5,  // ponytail: más rápido (antes 2.2)
    damage: 2.2,
    tint: 0x5bd0ff,
    decor: 'wide',
  },
  {
    id: 'laser_b2',
    branch: 'B',
    label: 'Rayo progresivo anti-blindaje',
    cost: 140,
    forRole: 'turret',
    style: 'bigbeam',
    atkRange: 1.5,
    damage: 0.04,
    requires: 'laser_b',
    excludes: 'laser_a',
    tint: 0x3a8bff,
    decor: 'heavy',
  },

  // ---- Torreta Láser: nivel 3 de cada rama ----
  {
    id: 'laser_a3',
    branch: 'A',
    label: 'Sobrecarga de ráfaga',
    cost: 160,
    forRole: 'turret',
    requires: 'laser_a2',
    research: 'r_laser3',
    excludes: 'laser_b',
    cooldown: 0.7,
    damage: 1.5,
    tint: 0xffe066,
    decor: 'heavy',
  },
  {
    id: 'laser_b3',
    branch: 'B',
    label: 'Foco prismático',
    cost: 200,
    forRole: 'turret',
    requires: 'laser_b2',
    research: 'r_laser3',
    excludes: 'laser_a',
    atkRange: 1.25,
    damage: 1.5,
    tint: 0x2a6bff,
    decor: 'pierce',
  },

  // ---- Torreta de Misiles: Rama A (Saturación → Plasma) ----
  {
    id: 'missile_a',
    branch: 'A',
    label: 'Enjambre (+4 misiles)',
    cost: 80,
    forRole: 'missile',
    volleySize: 4,
    atkRange: 0.7,
    tint: 0xb06bff,
    decor: 'pods',
  },
  {
    id: 'missile_a2',
    branch: 'A',
    label: 'Ojiva de plasma (aura/área)',
    cost: 150,
    forRole: 'missile',
    requires: 'missile_a',
    aura: true,        // los misiles detonan en aura y dañan a todos en el radio de salpicadura
    splash: 45,
    damage: 1.5,
    cooldown: 1.8,
    style: 'plasma',
    tint: 0xff8a3d,
    decor: 'plasma',
  },

  // ---- Torreta de Misiles: Rama B (Precisión → Perforante) ----
  {
    id: 'missile_b',
    branch: 'B',
    label: 'Largo alcance',
    cost: 80,
    forRole: 'missile',
    atkRange: 1.6,
    cooldown: 1.4,
    projSpeed: 1.3,
    tint: 0x8a9bff,
    decor: 'long',
  },
  {
    id: 'missile_b2',
    branch: 'B',
    label: 'Perforante',
    cost: 140,
    forRole: 'missile',
    requires: 'missile_b',
    damage: 1.7,
    spread: 6,
    style: 'pierce',
    tint: 0x6cf0ff,
    decor: 'pierce',
  },

  // ---- General: Rama A (Asalto) ----
  {
    id: 'gen_a',
    branch: 'A',
    label: 'Cañón pesado',
    cost: 80,
    forRole: 'general',
    damage: 1.4,
    tint: 0xff8a3d,
    decor: 'heavy',
  },
  {
    id: 'gen_a2',
    branch: 'A',
    label: 'Alcance extendido',
    cost: 120,
    forRole: 'general',
    requires: 'gen_a',
    atkRange: 1.3,
    damage: 1.2,
    tint: 0xff5e3d,
    decor: 'long',
  },

  // ---- General: Rama B (Comandante) ----
  {
    id: 'gen_b',
    branch: 'B',
    label: 'Motores mejorados',
    cost: 80,
    forRole: 'general',
    speed: 1.25,
    collectRate: 1.3,
    tint: 0x5bd0ff,
    decor: 'fast',
  },
  {
    id: 'gen_b2',
    branch: 'B',
    label: 'Inspiración de mando',
    cost: 120,
    forRole: 'general',
    requires: 'gen_b',
    buffMultiplier: 1.25,
    buffRadius: 1.2,
    tint: 0x3a8bff,
    decor: 'wide',
  },
  {
    id: 'gen_a3',
    branch: 'A',
    label: 'Andanada',
    cost: 180,
    forRole: 'general',
    requires: 'gen_a2',
    damage: 1.3,
    volley: 2,
    tint: 0xff3d1d,
    decor: 'triple',
  },
  {
    id: 'gen_b3',
    branch: 'B',
    label: 'Logística',
    cost: 180,
    forRole: 'general',
    requires: 'gen_b2',
    collectRate: 1.4,
    speed: 1.15,
    tint: 0x2a8be8,
    decor: 'heavy',
  },

  // ---- Enjambre sanador: Rama A (Más esferas) ----
  {
    id: 'heal_a',
    branch: 'A',
    label: 'Criptored',
    cost: 80,
    forRole: 'healer',
    healInterval: 0.7,
    tint: 0xff9ad9,
    decor: 'pods',
  },
  {
    id: 'heal_a2',
    branch: 'A',
    label: 'Doble enjambre',
    cost: 120,
    forRole: 'healer',
    requires: 'heal_a',
    maxSpheres: 2,
    healRate: 1.3,
    tint: 0xff4db8,
    decor: 'triple',
  },

  // ---- Enjambre sanador: Rama B (Esferas rápidas) ----
  {
    id: 'heal_b',
    branch: 'B',
    label: 'Esferas rápidas',
    cost: 80,
    forRole: 'healer',
    sphereSpeed: 1.5,
    tint: 0x7ad9ff,
    decor: 'fast',
  },
  {
    id: 'heal_b2',
    branch: 'B',
    label: 'Nano-reparación',
    cost: 120,
    forRole: 'healer',
    requires: 'heal_b',
    healRate: 1.4,
    tint: 0x9ae8ff,
    decor: 'wide',
  },

  // ---- Batería: Rama A (Capacidad) ----
  {
    id: 'bat_a',
    branch: 'A',
    label: 'Capacitores',
    cost: 70,
    forRole: 'battery',
    energyCap: 1.5,
    tint: 0xffe07a,
    decor: 'wide',
  },
  {
    id: 'bat_a2',
    branch: 'A',
    label: 'Banco de minerales',
    cost: 110,
    forRole: 'battery',
    requires: 'bat_a',
    capBonus: 1.5,
    tint: 0xffb347,
    decor: 'heavy',
  },

  // ---- Batería: Rama B (Generación pasiva) ----
  {
    id: 'bat_b',
    branch: 'B',
    label: 'Celdas solares',
    cost: 80,
    forRole: 'battery',
    energyRate: 3,
    tint: 0x7aff9a,
    decor: 'long',
  },
  {
    id: 'bat_b2',
    branch: 'B',
    label: 'Reactor',
    cost: 120,
    forRole: 'battery',
    requires: 'bat_b',
    energyRate: 3,
    energyCap: 1.2,
    tint: 0x4dff9a,
    decor: 'plasma',
  },

  // ---- Nivel 3 (desbloqueo por investigación) ----
  { id: 'missile_a3', branch: 'A', label: 'Tormenta de misiles', cost: 220, forRole: 'missile', requires: 'missile_a2', research: 'r_missile3', volleySize: 3, cooldown: 0.8, tint: 0xff5a1f, decor: 'pods' },
  { id: 'missile_b3', branch: 'B', label: 'Riel orbital', cost: 240, forRole: 'missile', requires: 'missile_b2', research: 'r_missile3', damage: 1.8, atkRange: 1.2, projSpeed: 1.4, tint: 0x3dfcff, decor: 'long' },
  { id: 'heal_a3', branch: 'A', label: 'Colmena', cost: 180, forRole: 'healer', requires: 'heal_a2', research: 'r_heal3', maxSpheres: 2, healInterval: 0.7, tint: 0xff2da0, decor: 'pods' },
  { id: 'heal_b3', branch: 'B', label: 'Regeneración cuántica', cost: 180, forRole: 'healer', requires: 'heal_b2', research: 'r_heal3', healRate: 1.5, sphereSpeed: 1.3, tint: 0xbff4ff, decor: 'heavy' },
  { id: 'bat_a3', branch: 'A', label: 'Supercondensador', cost: 170, forRole: 'battery', requires: 'bat_a2', research: 'r_bat3', energyCap: 1.6, capBonus: 1.3, tint: 0xfff09a, decor: 'plasma' },
  { id: 'bat_b3', branch: 'B', label: 'Fusión fría', cost: 180, forRole: 'battery', requires: 'bat_b2', research: 'r_bat3', energyRate: 5, tint: 0x2dffb0, decor: 'heavy' },

  // ---- Recolector: Rama A (Extracción) / Rama B (Alcance) ----
  { id: 'col_a', branch: 'A', label: 'Taladro de plasma', cost: 60, forRole: 'collector', mineRate: 1.5, tint: 0x7dff9a, decor: 'fast' },
  { id: 'col_a2', branch: 'A', label: 'Refinería', cost: 110, forRole: 'collector', requires: 'col_a', mineRate: 1.4, energyMult: 1.3, tint: 0x3dff7a, decor: 'heavy' },
  { id: 'col_a3', branch: 'A', label: 'Extractor cuántico', cost: 170, forRole: 'collector', requires: 'col_a2', research: 'r_collector3', mineRate: 1.6, tint: 0xb4ffc8, decor: 'plasma' },
  { id: 'col_b', branch: 'B', label: 'Brazo extendido', cost: 60, forRole: 'collector', miningRange: 1.5, tint: 0x49e0c0, decor: 'long' },
  { id: 'col_b2', branch: 'B', label: 'Imán gravitatorio', cost: 110, forRole: 'collector', requires: 'col_b', miningRange: 1.3, mineRate: 1.2, tint: 0x2de0e0, decor: 'wide' },
  { id: 'col_b3', branch: 'B', label: 'Red de minado', cost: 170, forRole: 'collector', requires: 'col_b2', research: 'r_collector3', miningRange: 1.4, energyMult: 1.5, tint: 0x8affff, decor: 'pods' },

  // ---- Nodo: Rama A (Alcance) / Rama B (Capacidad) ----
  { id: 'node_a', branch: 'A', label: 'Amplificador', cost: 40, forRole: 'relay', range: 1.35, tint: 0x9ad8ff, decor: 'wide' },
  { id: 'node_a2', branch: 'A', label: 'Relé de largo alcance', cost: 80, forRole: 'relay', requires: 'node_a', range: 1.3, tint: 0x5ab8ff, decor: 'long' },
  { id: 'node_b', branch: 'B', label: 'Hub', cost: 40, forRole: 'relay', ports: 4, tint: 0x6cffe0, decor: 'pods' },
  { id: 'node_b2', branch: 'B', label: 'Blindaje reactivo', cost: 80, forRole: 'relay', requires: 'node_b', hpMult: 2.5, tint: 0xaef0ff, decor: 'heavy' },
  // ================= Arsenal: árbol propio por torreta (A/B excluyentes, 3 niveles) =================
  // ---- Criogénica
  { id: 'cryo_a', branch: 'A', label: 'Ventisca', cost: 70, forRole: 'cryo', splashAdd: 60, tint: 0xbff6ff, decor: 'wide' },
  { id: 'cryo_a2', branch: 'A', label: 'Frente frío', cost: 120, forRole: 'cryo', requires: 'cryo_a', splashMult: 1.4, slowMs: 1.3, tint: 0x9ae8ff, decor: 'plasma' },
  { id: 'cryo_a3', branch: 'A', label: 'Cero absoluto', cost: 190, forRole: 'cryo', requires: 'cryo_a2', freeze: true, tint: 0xe8fbff, decor: 'heavy' },
  { id: 'cryo_b', branch: 'B', label: 'Aguja de hielo', cost: 70, forRole: 'cryo', damage: 2.5, tint: 0x6cc8ff, decor: 'pierce' },
  { id: 'cryo_b2', branch: 'B', label: 'Fragilidad', cost: 120, forRole: 'cryo', requires: 'cryo_b', slowFactor: 0.7, damage: 1.5, tint: 0x4fa8ff, decor: 'triple' },
  { id: 'cryo_b3', branch: 'B', label: 'Lanza glacial', cost: 190, forRole: 'cryo', requires: 'cryo_b2', atkRange: 1.4, damage: 2, tint: 0x3a8bff, decor: 'long' },

  // ---- Bobina Tesla
  { id: 'tesla_a', branch: 'A', label: 'Arco extendido', cost: 80, forRole: 'tesla', chains: 1, chainRange: 1.2, tint: 0x9ab4ff, decor: 'wide' },
  { id: 'tesla_a2', branch: 'A', label: 'Tormenta', cost: 130, forRole: 'tesla', requires: 'tesla_a', chains: 2, chainRange: 1.25, tint: 0xb89aff, decor: 'triple' },
  { id: 'tesla_a3', branch: 'A', label: 'Jaula de Faraday', cost: 200, forRole: 'tesla', requires: 'tesla_a2', chains: 3, damage: 1.3, tint: 0xd49bff, decor: 'plasma' },
  { id: 'tesla_b', branch: 'B', label: 'Sobrecarga', cost: 80, forRole: 'tesla', damage: 1.5, tint: 0x5b7bff, decor: 'heavy' },
  { id: 'tesla_b2', branch: 'B', label: 'Descarga paralizante', cost: 130, forRole: 'tesla', requires: 'tesla_b', slowAdd: 900, tint: 0x6cc8ff, decor: 'pods' },
  { id: 'tesla_b3', branch: 'B', label: 'Relámpago', cost: 200, forRole: 'tesla', requires: 'tesla_b2', damage: 1.6, cooldown: 0.8, tint: 0xffffff, decor: 'pierce' },

  // ---- Flak
  { id: 'flak_a', branch: 'A', label: 'Doble cañón', cost: 80, forRole: 'flak', pellets: 1, damage: 1.2, tint: 0xffb05e, decor: 'triple' },
  { id: 'flak_a2', branch: 'A', label: 'Abanico', cost: 130, forRole: 'flak', requires: 'flak_a', coneDeg: 1.5, tint: 0xffc47a, decor: 'wide' },
  { id: 'flak_a3', branch: 'A', label: 'Muro de metralla', cost: 200, forRole: 'flak', requires: 'flak_a2', coneDeg: 1.4, damage: 1.4, tint: 0xffd8a0, decor: 'pods' },
  { id: 'flak_b', branch: 'B', label: 'Cargador tambor', cost: 80, forRole: 'flak', cooldown: 0.7, tint: 0xff7a3d, decor: 'fast' },
  { id: 'flak_b2', branch: 'B', label: 'Cañones largos', cost: 130, forRole: 'flak', requires: 'flak_b', atkRange: 1.4, tint: 0xff5e3d, decor: 'long' },
  { id: 'flak_b3', branch: 'B', label: 'Flak pesado', cost: 200, forRole: 'flak', requires: 'flak_b2', damage: 1.8, atkRange: 1.15, tint: 0xff3d1d, decor: 'heavy' },

  // ---- Escudo
  { id: 'shield_a', branch: 'A', label: 'Domo amplio', cost: 80, forRole: 'shield', shieldRange: 1.3, tint: 0x9affef, decor: 'wide' },
  { id: 'shield_a2', branch: 'A', label: 'Cobertura total', cost: 130, forRole: 'shield', requires: 'shield_a', shieldRange: 1.35, tint: 0x6cffe0, decor: 'plasma' },
  { id: 'shield_a3', branch: 'A', label: 'Fortaleza', cost: 200, forRole: 'shield', requires: 'shield_a2', shieldRange: 1.3, shieldReduce: 0.1, tint: 0x3dffd0, decor: 'heavy' },
  { id: 'shield_b', branch: 'B', label: 'Placas reactivas', cost: 80, forRole: 'shield', shieldReduce: 0.1, tint: 0x49e0c0, decor: 'pods' },
  { id: 'shield_b2', branch: 'B', label: 'Nanorreparación', cost: 130, forRole: 'shield', requires: 'shield_b', regen: 3, tint: 0x7dffd0, decor: 'triple' },
  { id: 'shield_b3', branch: 'B', label: 'Bastión', cost: 200, forRole: 'shield', requires: 'shield_b2', shieldReduce: 0.15, hpMult: 2, tint: 0xb4ffe8, decor: 'long' },

  // ---- Cañón de riel
  { id: 'rail_a', branch: 'A', label: 'Perforador', cost: 100, forRole: 'railgun', pierce: 2, tint: 0xfff09a, decor: 'pierce' },
  { id: 'rail_a2', branch: 'A', label: 'Sobrepenetración', cost: 160, forRole: 'railgun', requires: 'rail_a', pierce: 3, damage: 1.2, tint: 0xffe066, decor: 'long' },
  { id: 'rail_a3', branch: 'A', label: 'Acelerador de masa', cost: 240, forRole: 'railgun', requires: 'rail_a2', damage: 1.8, tint: 0xffffff, decor: 'heavy' },
  { id: 'rail_b', branch: 'B', label: 'Carga rápida', cost: 100, forRole: 'railgun', cooldown: 0.7, tint: 0xffcc55, decor: 'fast' },
  { id: 'rail_b2', branch: 'B', label: 'Condensadores', cost: 160, forRole: 'railgun', requires: 'rail_b', cooldown: 0.75, atkRange: 1.2, tint: 0xffb02e, decor: 'pods' },
  { id: 'rail_b3', branch: 'B', label: 'Mira orbital', cost: 240, forRole: 'railgun', requires: 'rail_b2', atkRange: 1.4, damage: 1.3, tint: 0xff8a3d, decor: 'wide' },

  // ---- Mortero
  { id: 'mortar_a', branch: 'A', label: 'Carga doble', cost: 100, forRole: 'mortar', shells: 1, tint: 0xff7a5e, decor: 'pods' },
  { id: 'mortar_a2', branch: 'A', label: 'Salva', cost: 160, forRole: 'mortar', requires: 'mortar_a', shells: 2, tint: 0xff5e3d, decor: 'triple' },
  { id: 'mortar_a3', branch: 'A', label: 'Bombardeo', cost: 240, forRole: 'mortar', requires: 'mortar_a2', shells: 2, cooldown: 0.85, tint: 0xff3d1d, decor: 'heavy' },
  { id: 'mortar_b', branch: 'B', label: 'Ojiva grande', cost: 100, forRole: 'mortar', splashMult: 1.4, tint: 0xffa05e, decor: 'wide' },
  { id: 'mortar_b2', branch: 'B', label: 'Alto explosivo', cost: 160, forRole: 'mortar', requires: 'mortar_b', damage: 1.6, tint: 0xffc05e, decor: 'plasma' },
  { id: 'mortar_b3', branch: 'B', label: 'Cráter', cost: 240, forRole: 'mortar', requires: 'mortar_b2', splashMult: 1.3, damage: 1.5, tint: 0xffe066, decor: 'long' },
]

// Nombre de cada rama por rol (lo muestra el árbol del HUD).
export const BRANCH_NAMES = {
  turret: { A: 'Ráfaga', B: 'Rayo pesado' },
  missile: { A: 'Saturación', B: 'Precisión' },
  healer: { A: 'Enjambre', B: 'Nanotecnia' },
  battery: { A: 'Capacidad', B: 'Generación' },
  collector: { A: 'Extracción', B: 'Alcance' },
  relay: { A: 'Alcance', B: 'Capacidad' },
  general: { A: 'Asalto', B: 'Comandante' },
  cryo: { A: 'Tormenta de hielo', B: 'Punta helada' },
  tesla: { A: 'Cadena', B: 'Potencia' },
  flak: { A: 'Dispersión', B: 'Cadencia' },
  shield: { A: 'Cobertura', B: 'Resistencia' },
  railgun: { A: 'Perforación', B: 'Precisión' },
  mortar: { A: 'Salva', B: 'Potencia' },
}

// En los edificios las ramas son excluyentes: al comprar la primera mejora de una rama, la
// otra queda bloqueada para ESE edificio. El General (comandante) puede combinar ambas.
const COMBINABLE_ROLES = new Set(['general'])

// Hook de investigación: lo registra meta/research.js para no acoplar este módulo al perfil.
let researchCheck = () => false
export function setResearchCheck(fn) { researchCheck = fn }

export const UPGRADES_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]))

function blockedByBranch(u, have) {
  if (COMBINABLE_ROLES.has(u.forRole)) return false
  for (const id of have) {
    const o = UPGRADES_BY_ID[id]
    if (o && o.forRole === u.forRole && o.branch !== u.branch) return true
  }
  return false
}

export function getUpgradesFor(role, currentUpgrades) {
  const have = new Set(currentUpgrades)
  return UPGRADES.filter((u) => {
    if (u.forRole !== role) return false
    if (have.has(u.id)) return false
    if (u.requires && !have.has(u.requires)) return false
    if (u.research && !researchCheck(u.research)) return false
    if (blockedByBranch(u, have)) return false
    return true
  })
}

// Árbol completo de un rol para el HUD: ramas → nodos con su estado.
// state: 'owned' | 'available' | 'locked' (falta el anterior) | 'research' | 'excluded'
export function buildUpgradeTree(role, currentUpgrades) {
  const have = new Set(currentUpgrades)
  const names = BRANCH_NAMES[role] || { A: 'Rama A', B: 'Rama B' }
  return ['A', 'B'].map((b) => {
    const nodes = UPGRADES.filter((u) => u.forRole === role && u.branch === b)
    nodes.sort((x, y) => depth(x) - depth(y)) // raíz primero
    return {
      branch: b,
      name: names[b],
      nodes: nodes.map((u) => {
        let state = 'available'
        if (have.has(u.id)) state = 'owned'
        else if (blockedByBranch(u, have)) state = 'excluded'
        else if (u.research && !researchCheck(u.research)) state = 'research'
        else if (u.requires && !have.has(u.requires)) state = 'locked'
        return { ...u, state, effects: describeUpgrade(u) }
      }),
    }
  }).filter((br) => br.nodes.length)
}

function depth(u) {
  let d = 0
  let cur = u
  while (cur?.requires) { d++; cur = UPGRADES_BY_ID[cur.requires] }
  return d
}

// Texto legible de los efectos de una mejora (multiplicadores → porcentajes).
const pct = (m) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`
const faster = (m) => `${m <= 1 ? '+' : '−'}${Math.round(Math.abs(1 / m - 1) * 100)}%`

export function describeUpgrade(u) {
  const out = []
  if (u.style === 'spread') out.push('Dispara a 3 objetivos')
  if (u.style === 'bigbeam') out.push('Rayo continuo que crece contra el mismo blanco')
  if (u.style === 'pierce') out.push('Misiles perforantes')
  if (u.damage) out.push(`Daño ${pct(u.damage)}`)
  if (u.cooldown) out.push(`Cadencia ${faster(u.cooldown)}`)
  if (u.atkRange) out.push(`Alcance ${pct(u.atkRange)}`)
  if (u.volleySize) out.push(`+${u.volleySize} misiles por tanda`)
  if (u.aura) out.push('Detonación en área')
  if (u.splash) out.push(`Radio de explosión ${u.splash}`)
  if (u.projSpeed) out.push(`Vel. de misil ${pct(u.projSpeed)}`)
  if (u.volley) out.push(`Disparo x${u.volley}`)
  if (u.speed) out.push(`Velocidad ${pct(u.speed)}`)
  if (u.collectRate) out.push(`Recolección ${pct(u.collectRate)}`)
  if (u.buffMultiplier) out.push(`Aura de mando ${pct(u.buffMultiplier)}`)
  if (u.buffRadius) out.push(`Radio del aura ${pct(u.buffRadius)}`)
  if (u.healInterval) out.push(`Esferas ${faster(u.healInterval)} más seguido`)
  if (u.maxSpheres) out.push(`+${u.maxSpheres} esferas`)
  if (u.healRate) out.push(`Curación ${pct(u.healRate)}`)
  if (u.sphereSpeed) out.push(`Vel. esferas ${pct(u.sphereSpeed)}`)
  if (u.energyCap) out.push(`Almacén de energía ${pct(u.energyCap)}`)
  if (u.capBonus) out.push(`Almacén de minerales ${pct(u.capBonus)}`)
  if (u.energyRate) out.push(`+${u.energyRate} energía/s`)
  if (u.mineRate) out.push(`Minería ${pct(u.mineRate)}`)
  if (u.miningRange) out.push(`Radio de minado ${pct(u.miningRange)}`)
  if (u.energyMult) out.push(`Energía generada ${pct(u.energyMult)}`)
  if (u.range) out.push(`Alcance de red ${pct(u.range)}`)
  if (u.ports) out.push(`+${u.ports} conexiones`)
  if (u.hpMult) out.push(`Vida ${pct(u.hpMult)}`)
  if (u.chains) out.push(`+${u.chains} saltos de rayo`)
  if (u.chainRange) out.push(`Alcance del salto ${pct(u.chainRange)}`)
  if (u.slowAdd) out.push(`Ralentiza ${(u.slowAdd / 1000).toFixed(1)} s`)
  if (u.slowMs) out.push(`Duración del frío ${pct(u.slowMs)}`)
  if (u.slowFactor) out.push(`Ralentización más fuerte`)
  if (u.freeze) out.push('Cada 4º disparo congela')
  if (u.splashAdd) out.push(`Área helada ${u.splashAdd}`)
  if (u.splashMult) out.push(`Área ${pct(u.splashMult)}`)
  if (u.pierce) out.push(`Atraviesa +${u.pierce} naves`)
  if (u.pellets) out.push(`+${u.pellets} perdigones`)
  if (u.coneDeg) out.push(`Cono ${pct(u.coneDeg)}`)
  if (u.shells) out.push(`+${u.shells} proyectiles por salva`)
  if (u.shieldRange) out.push(`Radio del domo ${pct(u.shieldRange)}`)
  if (u.shieldReduce) out.push(`Reducción de daño +${Math.round(u.shieldReduce * 100)}%`)
  if (u.regen) out.push(`Repara ${u.regen} HP/s en el domo`)
  return out
}
