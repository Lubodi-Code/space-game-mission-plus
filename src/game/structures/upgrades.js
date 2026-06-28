/**
 * Árbol de mejoras data-driven para torretas.
 * Cada upgrade: { id, label, cost, forRole, apply(structure) }
 */

export const UPGRADES = [
  // ---- Torreta Láser: Rama A (Rápida/corta) ----
  {
    id: 'laser_a',
    label: 'Rápida/corta',
    cost: 60,
    forRole: 'turret',
    atkRange: 0.6,
    cooldown: 0.15,
    damage: 0.6,
    tint: 0xffae5b,
    decor: 'fast',
  },
  {
    id: 'laser_a2',
    label: 'Ráfaga triple',
    cost: 100,
    forRole: 'turret',
    style: 'spread',
    requires: 'laser_a',
    damage: 0.4,
    cooldown: 0.1,
    tint: 0xffd24a,
    decor: 'triple',
  },

  // ---- Torreta Láser: Rama B (Radio amplio) ----
  {
    id: 'laser_b',
    label: 'Radio amplio',
    cost: 80,
    forRole: 'turret',
    atkRange: 1.6,
    cooldown: 1.4,
    tint: 0x5bd0ff,
    decor: 'wide',
  },
  {
    id: 'laser_b2',
    label: 'Anti-grande (rayo progresivo)',
    cost: 140,
    forRole: 'turret',
    style: 'bigbeam',
    atkRange: 1.2,
    requires: 'laser_b',
    tint: 0x3a8bff,
    decor: 'heavy',
  },

  // ---- Torreta de Misiles: Rama A (Saturación → Plasma) ----
  {
    id: 'missile_a',
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
    label: 'Cañón pesado',
    cost: 80,
    forRole: 'general',
    damage: 1.4,
    tint: 0xff8a3d,
    decor: 'heavy',
  },
  {
    id: 'gen_a2',
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
    label: 'Inspiración de mando',
    cost: 120,
    forRole: 'general',
    requires: 'gen_b',
    buffMultiplier: 1.25,
    buffRadius: 1.2,
    tint: 0x3a8bff,
    decor: 'wide',
  },

  // ---- Enjambre sanador: Rama A (Más esferas) ----
  {
    id: 'heal_a',
    label: 'Criptored',
    cost: 80,
    forRole: 'healer',
    healInterval: 0.7,
    tint: 0xff9ad9,
    decor: 'pods',
  },
  {
    id: 'heal_a2',
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
    label: 'Esferas rápidas',
    cost: 80,
    forRole: 'healer',
    sphereSpeed: 1.5,
    tint: 0x7ad9ff,
    decor: 'fast',
  },

  // ---- Batería: Rama A (Capacidad) ----
  {
    id: 'bat_a',
    label: 'Capacitores',
    cost: 70,
    forRole: 'battery',
    energyCap: 1.5,
    tint: 0xffe07a,
    decor: 'wide',
  },
  {
    id: 'bat_a2',
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
    label: 'Celdas solares',
    cost: 80,
    forRole: 'battery',
    energyRate: 3,
    tint: 0x7aff9a,
    decor: 'long',
  },
]

export function getUpgradesFor(role, currentUpgrades) {
  const have = new Set(currentUpgrades)
  return UPGRADES.filter((u) => {
    if (u.forRole !== role) return false
    if (have.has(u.id)) return false
    if (u.requires && !have.has(u.requires)) return false
    return true
  })
}
