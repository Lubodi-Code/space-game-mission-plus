import Phaser from 'phaser'
import { gameState } from '~/game/gameState.js'
import { explosion } from '~/game/render/fx.js'

export const ATTACK = {
  LIGHT_LASER: (enemy, world, dt) => {
    const t = enemy.target
    if (!t) return
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
    if (d > (enemy.def.attackRange || 120)) return
    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return
    const color = enemy.def.beamColor || enemy.def.color
    const width = enemy.def.beamWidth || 2.5
    if (enemy.def.beamTwin) {
      // Cañones gemelos: dos rayos finos desde los costados de la nave, mismo daño total.
      const a = Math.atan2(t.y - enemy.y, t.x - enemy.x) + Math.PI / 2
      const off = (enemy.radius || 8) * 0.7
      for (const side of [-1, 1]) {
        const from = { x: enemy.x + Math.cos(a) * off * side, y: enemy.y + Math.sin(a) * off * side }
        world.fireEnemyBeam({ from, to: t, damage: enemy.damage / 2, color, width })
      }
    } else {
      world.fireEnemyBeam({ from: enemy, to: t, damage: enemy.damage, color, width })
    }
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
      color: enemy.def.projColor || enemy.def.color || 0xffd24a,
      style: enemy.def.projStyle,
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

  // Jefe nodriza: varios láseres, cada uno dispara por independiente a la estructura
  // más cercana (sin repetir objetivo), + misil EMP periódico que paraliza en área.
  BOSS_MULTI_LASER: (enemy, world, dt) => {
    enemy.empTimer = (enemy.empTimer ?? enemy.def.empInterval) - dt * 1000
    if (enemy.empTimer <= 0) {
      enemy.empTimer = enemy.def.empInterval
      world.spawnEnemyMissile({
        x: enemy.x, y: enemy.y, target: world.core,
        speed: enemy.def.empSpeed || 120, damage: 0,
        splash: enemy.def.empRadius || 300,
        stunMs: enemy.def.empStunMs || 8000,
        color: 0x66e0ff,
      })
    }

    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return
    const range = enemy.def.attackRange || 400
    const inRange = []
    for (const s of world.structures) {
      if (s.dead) continue
      const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, s.x, s.y)
      if (d <= range) inRange.push({ s, d })
    }
    if (!inRange.length) return
    inRange.sort((a, b) => a.d - b.d)
    for (const { s } of inRange.slice(0, enemy.def.laserCount || 3)) {
      world.fireEnemyBeam({
        from: enemy, to: s,
        damage: enemy.damage,
        color: enemy.def.beamColor || enemy.def.color,
        width: enemy.def.beamWidth || 4,
      })
      world.damageStructure(s, enemy.damage)
    }
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

  // Kamikaze: al llegar al blanco detona, daña en área a las estructuras y muere.
  KAMIKAZE: (enemy, world) => {
    const t = enemy.target
    if (!t) return
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
    if (d > t.radius + 14) return
    const r = enemy.def.splash || 60
    for (const s of world.structures) {
      if (s.dead) continue
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, s.x, s.y) <= r + s.radius) world.damageStructure(s, enemy.damage)
    }
    world.killEnemy(enemy)
  },

  // Warden: láser ligero + cada `auraInterval` repara a los aliados cercanos.
  SHIELD_AURA: (enemy, world, dt) => {
    enemy.auraTimer = (enemy.auraTimer ?? 0) - dt * 1000
    if (enemy.auraTimer <= 0 && world.enemyGrid) {
      const r = enemy.def.auraRadius || 140
      const frac = enemy.def.auraHeal || 0.04
      world.enemyGrid.forEachNear(enemy.x, enemy.y, r, (e) => {
        if (e.dead || e === enemy || e.hp >= e.maxHp) return
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * frac)
      })
      enemy.auraTimer = enemy.def.auraInterval || 1000
    }
    ATTACK.LIGHT_LASER(enemy, world, dt)
  },

  // Leech: cuerpo a cuerpo que además roba energía de la red.
  DRAIN: (enemy, world, dt) => {
    const t = enemy.target
    if (!t) return
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
    if (d > t.radius + 16) return
    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return
    world.damageStructure(t, enemy.damage)
    gameState.energy = Math.max(0, gameState.energy - (enemy.def.drain || 6))
    enemy.atkTimer = enemy.def.atkCooldown
  },

  // Cazador: láser corto. Contra un General daña su hp directo (General.update lo mata/respawnea);
  // si cayó a un objetivo de estructura, daña como el láser ligero. Nunca dispara a un General muerto.
  HUNT_LASER: (enemy, world, dt) => {
    const t = enemy.target
    if (!t) return
    const isGeneral = typeof t.alive === 'boolean' && typeof t.respawn === 'number'
    if (isGeneral && !t.alive) return
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
    if (d > (enemy.def.attackRange || 100)) return
    enemy.atkTimer -= dt * 1000
    if (enemy.atkTimer > 0) return
    world.fireEnemyBeam({
      from: enemy, to: t, damage: enemy.damage,
      color: enemy.def.beamColor || enemy.def.color, width: enemy.def.beamWidth || 2,
    })
    if (isGeneral) t.hp -= enemy.damage
    else world.damageStructure(t, enemy.damage)
    enemy.atkTimer = enemy.def.atkCooldown
  },

  // Égida: cada pulseInterval da escudo a hasta pulseMax aliados cercanos (no égidas ni jefes)
  // y entre pulsos dispara un láser débil.
  SHIELD_PULSE: (enemy, world, dt) => {
    enemy.pulseTimer = (enemy.pulseTimer ?? enemy.def.pulseInterval * 0.5) - dt * 1000
    if (enemy.pulseTimer <= 0 && world.enemyGrid) {
      const found = []
      world.enemyGrid.forEachNear(enemy.x, enemy.y, enemy.def.pulseRadius || 180, (e) => {
        if (e.dead || e === enemy || e.type === enemy.type || e.def.boss) return
        const cap = e.maxHp * (enemy.def.shieldCap || 0.4)
        if (e.shield >= cap) return
        found.push({ e, d: Phaser.Math.Distance.Between(enemy.x, enemy.y, e.x, e.y) })
      })
      found.sort((a, b) => a.d - b.d)
      for (const { e } of found.slice(0, enemy.def.pulseMax || 5)) {
        e.maxShield = e.maxHp * (enemy.def.shieldCap || 0.4)
        e.shield = Math.min(e.maxShield, e.shield + e.maxHp * (enemy.def.shieldGive || 0.25))
      }
      if (found.length && enemy.scene) explosion(enemy.scene, enemy.x, enemy.y, enemy.def.color, 30, 'emp')
      enemy.pulseTimer = enemy.def.pulseInterval || 4000
    }
    ATTACK.LIGHT_LASER(enemy, world, dt)
  },

  // Gravitón: cada pulseInterval paraliza (s.stunMs, que GameScene.update respeta) las estructuras
  // en radio, salvo el núcleo. Entre pulsos dispara un láser ligero.
  GRAVITY_PULSE: (enemy, world, dt) => {
    enemy.pulseTimer = (enemy.pulseTimer ?? enemy.def.pulseInterval * 0.5) - dt * 1000
    if (enemy.pulseTimer <= 0) {
      const r = enemy.def.pulseRadius || 200
      let hit = 0
      for (const s of world.structures) {
        if (s.dead || s.isCore) continue
        if (Phaser.Math.Distance.Between(enemy.x, enemy.y, s.x, s.y) > r + s.radius) continue
        s.stunMs = Math.max(s.stunMs || 0, enemy.def.pulseStunMs || 2500)
        hit++
      }
      if (hit) {
        if (enemy.scene) explosion(enemy.scene, enemy.x, enemy.y, enemy.def.color, r * 0.6, 'emp')
        enemy.pulseTimer = enemy.def.pulseInterval || 6000
      } else {
        enemy.pulseTimer = 500 // sin estructuras a tiro: reintenta pronto
      }
    }
    ATTACK.LIGHT_LASER(enemy, world, dt)
  },
}
