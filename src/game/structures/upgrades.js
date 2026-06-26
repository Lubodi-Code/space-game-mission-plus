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
  },

  // ---- Torreta Láser: Rama B (Radio amplio) ----
  {
    id: 'laser_b',
    label: 'Radio amplio',
    cost: 80,
    forRole: 'turret',
    atkRange: 1.6,
    cooldown: 1.4,
  },
  {
    id: 'laser_b2',
    label: 'Anti-grande (rayo progresivo)',
    cost: 140,
    forRole: 'turret',
    style: 'bigbeam',
    atkRange: 1.2,
    requires: 'laser_b',
  },

  // ---- Torreta de Misiles ----
  {
    id: 'missile_c',
    label: 'Enjambre (+4 misiles)',
    cost: 80,
    forRole: 'missile',
    volleySize: 4,
    atkRange: 0.5,
  },
  {
    id: 'missile_d',
    label: 'Largo alcance',
    cost: 70,
    forRole: 'missile',
    atkRange: 1.8,
    cooldown: 1.5,
  },
  {
    id: 'missile_e',
    label: 'Precisión',
    cost: 50,
    forRole: 'missile',
    spread: 8,
    projSpeed: 1.3,
  },
  {
    id: 'missile_f',
    label: 'Daño aumentado',
    cost: 90,
    forRole: 'missile',
    damage: 1.4,
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
