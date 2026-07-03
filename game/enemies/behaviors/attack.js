import Phaser from 'phaser'

export const ATTACK = {
  LIGHT_LASER: (enemy, world, dt) => {
    const t = enemy.target
    if (!t) return
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
    if (d > (enemy.def.attackRange || 120)) return
    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return
    world.fireEnemyBeam({
      from: enemy, to: t,
      damage: enemy.damage,
      color: enemy.def.beamColor || enemy.def.color,
      width: 2.5,
    })
    world.damageStructure(t, enemy.damage)
    enemy.atkTimer = enemy.def.atkCooldown
  },

  MELEE: (enemy, world, dt) => {
    const t = enemy.target
    if (!t) return
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
    const reach = t.radius + 14
    if (d > reach) return
    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return
    world.damageStructure(t, enemy.damage)
    enemy.atkTimer = enemy.def.atkCooldown
  },

  BEAM: (enemy, world, dt) => {
    const t = enemy.target
    if (!t) return
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
    if (d > (enemy.def.attackRange || 130)) return
    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return
    world.fireEnemyBeam({
      from: enemy,
      to: t,
      damage: enemy.damage,
      color: enemy.def.beamColor || 0xff5566,
      width: enemy.def.beamWidth || 3,
    })
    world.damageStructure(t, enemy.damage)
    enemy.atkTimer = enemy.def.atkCooldown
  },

  MISSILE: (enemy, world, dt) => {
    const t = enemy.target
    if (!t) return
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
    if (d > (enemy.def.attackRange || 200)) return
    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return
    world.spawnEnemyMissile({
      x: enemy.x,
      y: enemy.y,
      target: t,
      speed: enemy.def.projSpeed || 160,
      damage: enemy.damage,
      splash: enemy.def.splash || 0,
      color: enemy.def.color || 0xffd24a,
    })
    enemy.atkTimer = enemy.def.atkCooldown
  },

  BIG_BEAM: (enemy, world, dt) => {
    const t = enemy.target
    if (!t) return
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
    if (d > (enemy.def.attackRange || 220)) return
    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return
    world.fireEnemyBeam({
      from: enemy,
      to: t,
      damage: enemy.damage,
      color: enemy.def.beamColor || 0xc08bff,
      width: enemy.def.beamWidth || 8,
    })
    world.damageStructure(t, enemy.damage)
    enemy.atkTimer = enemy.def.atkCooldown
  },

  SPAWN_SMALL_SHIPS: (enemy, world, dt) => {
    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return

    const spawnCount = enemy.def.spawnCount || 3
    const spawnTypes = enemy.def.spawnTypes || ['grunt']
    const spreadAngle = 0.3 // radianes de dispersión

    for (let i = 0; i < spawnCount; i++) {
      const typeKey = spawnTypes[Math.floor(Math.random() * spawnTypes.length)]
      const angle = enemy.heading + (Math.random() - 0.5) * spreadAngle
      const distance = 60 + Math.random() * 30
      const spawnX = enemy.x + Math.cos(angle) * distance
      const spawnY = enemy.y + Math.sin(angle) * distance

      world.spawnSmallShip?.(typeKey, spawnX, spawnY)
    }

    enemy.atkTimer = enemy.def.spawnInterval || 8000
  },
}
