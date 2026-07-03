import { ROLE_GROUPS } from '../EnemyType.js'
import Phaser from 'phaser'

function nearestInGroup(enemy, world, groupFn) {
  let best = null
  let bestD = Infinity
  for (const s of world.structures) {
    if (s.dead) continue
    if (!groupFn(s)) continue
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, s.x, s.y)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

function nearestInGroupName(enemy, world, groupName) {
  if (groupName === 'CORE') return world.core
  const fn = ROLE_GROUPS[groupName]
  if (!fn) return null
  return nearestInGroup(enemy, world, fn)
}

// Prioritario → secundario → núcleo.
export function resolveTarget(enemy, world) {
  const def = enemy.def
  return nearestInGroupName(enemy, world, def.targetPriority)
      || nearestInGroupName(enemy, world, def.targetSecondary)
      || world.core
}

export const TARGETING = {
  CORE: (enemy, world) => world.core,

  NEAREST: (enemy, world) => {
    let best = null
    let bestD = Infinity
    for (const s of world.structures) {
      if (s.dead) continue
      const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, s.x, s.y)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  },

  INFRA: (enemy, world) => nearestInGroup(enemy, world, ROLE_GROUPS.INFRA),

  DEFENSE: (enemy, world) => nearestInGroup(enemy, world, ROLE_GROUPS.DEFENSE),

  GENERATOR: (enemy, world) => nearestInGroup(enemy, world, ROLE_GROUPS.GENERATOR),
}
