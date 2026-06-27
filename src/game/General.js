import Phaser from 'phaser'
import { GENERAL } from './balance.js'
import { gameState } from './gameState.js'
import { spawnFloatingText } from './render/fx.js'

// Tinte por jugador (pid): 0 = host, 1..3 = clientes. Mismo orden en host y cliente
// para que cada general se vea igual en ambas pantallas.
export const GEN_TINTS = [0xffaa44, 0x8be9fd, 0x9bff8b, 0xd49bff]

export class General {
  constructor(scene, x, y, tint = 0x8be9fd) {
    this.scene = scene
    this.x = x; this.y = y
    this.tx = x; this.ty = y
    this.alive = true
    this.respawn = 0
    this.tint = tint
    this.sprite = scene.add.image(x, y, 'general_ship')
      .setTint(tint).setScale(0.85).setDepth(17)
    this.bar = scene.add.graphics().setDepth(18)
    this.selected = false
    this.mineTarget = null
    this.minedAccum = 0
    this.atkTimer = 0
    this.buffActive = false
    this.gmining = null
    this.upgrades = []
    this.pid = 0
    this.labelName = ''
    this.nameText = null

    // Stats iniciales desde GENERAL; applyUpgrade las modifica.
    this.maxHp = GENERAL.hp
    this.hp = this.maxHp
    this.radius = GENERAL.radius
    this.speed = GENERAL.speed
    this.contactDps = GENERAL.contactDps
    this.respawnMs = GENERAL.respawnMs
    this.atkRange = GENERAL.atkRange
    this.damage = GENERAL.damage
    this.cooldown = GENERAL.cooldown
    this.collectRange = GENERAL.collectRange
    this.collectRate = GENERAL.collectRate
    this.buffRadius = GENERAL.buffRadius
    this.buffMultiplier = GENERAL.buffMultiplier
  }

  moveTo(x, y) {
    if (this.alive) {
      this.tx = x; this.ty = y
      this.mineTarget = null
      this.minedAccum = 0
    }
  }

  setTarget(x, y, scene) {
    if (!this.alive) return
    this.tx = x; this.ty = y
    const meteor = scene.meteorites.find((m) => {
      if (m.depleted || !m.container || m.container.scene == null) return false
      return Math.hypot(m.x - x, m.y - y) < m.radius + 24
    })
    if (meteor !== this.mineTarget) this.minedAccum = 0
    this.mineTarget = meteor || null
  }

  select() { this.selected = true }
  deselect() { this.selected = false }

  setLabel(name) {
    this.labelName = name || ''
    if (!this.nameText) {
      this.nameText = this.scene.add.text(this.x, this.y - 30, this.labelName, {
        fontSize: '11px', color: '#cfe8ff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(19)
    } else {
      this.nameText.setText(this.labelName)
    }
  }

  destroy() {
    this.sprite.destroy()
    this.bar.destroy()
    this.nameText?.destroy()
  }

  applyUpgrade(upg) {
    if (upg.damage) this.damage = Math.round(this.damage * upg.damage)
    if (upg.atkRange) this.atkRange = Math.round(this.atkRange * upg.atkRange)
    if (upg.cooldown) this.cooldown = Math.round(this.cooldown * upg.cooldown)
    if (upg.speed) this.speed = Math.round(this.speed * upg.speed)
    if (upg.collectRate) this.collectRate = this.collectRate * upg.collectRate
    if (upg.buffMultiplier) this.buffMultiplier = this.buffMultiplier * upg.buffMultiplier
    if (upg.buffRadius) this.buffRadius = Math.round(this.buffRadius * upg.buffRadius)
    this.upgrades.push(upg.id)
  }

  update(dt, world) {
    if (!this.alive) {
      this.respawn -= dt * 1000
      if (this.respawn <= 0) this.revive(world.core)
      return
    }

    let nearStructure = false
    if (world.structures) {
      for (const s of world.structures) {
        if (s.dead) continue
        if (Math.hypot(s.x - this.x, s.y - this.y) <= this.buffRadius + s.radius) {
          nearStructure = true
          break
        }
      }
    }
    this.buffActive = nearStructure
    const mult = this.buffActive ? this.buffMultiplier : 1

    const dx = this.tx - this.x, dy = this.ty - this.y
    const d = Math.hypot(dx, dy)
    if (d > 4) {
      const step = Math.min(this.speed * dt, d)
      this.x += (dx / d) * step; this.y += (dy / d) * step
      this.sprite.setRotation(Math.atan2(dy, dx))
    }
    this.sprite.setPosition(this.x, this.y)
    if (this.nameText) this.nameText.setPosition(this.x, this.y - 30).setVisible(true)

    const grid = world.enemyGrid
    if (grid) {
      let touching = false
      grid.forEachNear(this.x, this.y, this.radius + 24, (e) => {
        if (e.dead) return
        if (Math.hypot(e.x - this.x, e.y - this.y) < this.radius + e.radius) touching = true
      })
      if (touching) this.hp -= this.contactDps * dt
    }

    this.gmining = null
    if (this.mineTarget) {
      const m = this.mineTarget
      if (m.depleted || !m.container || m.container.scene == null) {
        this.mineTarget = null
      } else {
        const mdx = m.x - this.x, mdy = m.y - this.y
        const md = Math.hypot(mdx, mdy)
        if (md <= this.collectRange + m.radius) {
          this.minedAccum += this.collectRate * mult * dt
          const whole = Math.min(Math.floor(this.minedAccum), m.amount, gameState.mineralsCap - gameState.minerals)
          if (whole > 0) {
            this.minedAccum -= whole
            m.amount -= whole
            gameState.minerals += whole
            spawnFloatingText(this.scene, this.x, this.y - 22, `+${whole}`, '#49e07a')
          }
          if (m.amount <= 0) {
            m.depleted = true
            m.container.destroy()
            this.mineTarget = null
            this.minedAccum = 0
          } else {
            this.gmining = [Math.round(this.x), Math.round(this.y), Math.round(m.x), Math.round(m.y)]
            const pulse = 0.5 + 0.3 * Math.sin((performance.now() % 628) * 0.01)
            this.scene.beamGraphics.lineStyle(3, 0x49e07a, pulse)
            this.scene.beamGraphics.lineBetween(this.x, this.y, m.x, m.y)
            this.scene.beamGraphics.fillStyle(0x49e07a, pulse)
            this.scene.beamGraphics.fillCircle(m.x, m.y, 4)
          }
        }
      }
    }

    this.atkTimer -= dt * 1000
    if (this.atkTimer <= 0) {
      let best = null, bestD = this.atkRange
      for (const e of world.enemies) {
        if (e.dead) continue
        const ed = Math.hypot(e.x - this.x, e.y - this.y) - e.radius
        if (ed < bestD) { bestD = ed; best = e }
      }
      if (best) {
        best.hp -= this.damage
        if (best.hp <= 0) world.killEnemy(best)
        this.atkTimer = this.cooldown / mult
        this.scene.beamGraphics.lineStyle(2, this.tint, 0.95)
        this.scene.beamGraphics.lineBetween(this.x, this.y, best.x, best.y)
        this.scene.beamGraphics.fillStyle(this.tint, 0.8)
        this.scene.beamGraphics.fillCircle(best.x, best.y, 3)
        if (this.scene.netHost && this.scene._beamQueue) {
          this.scene._beamQueue.push([Math.round(this.x), Math.round(this.y), Math.round(best.x), Math.round(best.y), this.tint, 2, 90, 90])
        }
      }
    }

    if (this.hp <= 0) this.die()

    const g = this.bar; g.clear()
    if (this.selected) {
      g.lineStyle(2, 0xffffff, 0.9)
      g.strokeCircle(this.x, this.y, this.radius + 7)
      g.lineStyle(2, this.tint, 0.35)
      g.strokeCircle(this.x, this.y, this.radius + 11)
    }
    if (this.hp < this.maxHp) {
      const w = 24, frac = Math.max(0, this.hp / this.maxHp), by = this.y - 22
      g.fillStyle(0x000000, 0.6).fillRect(this.x - w / 2 - 1, by - 1, w + 2, 5)
      g.fillStyle(this.buffActive ? 0xffd24a : 0x8be9fd, 1).fillRect(this.x - w / 2, by, w * frac, 3)
    }
  }

  die() {
    this.alive = false
    this.respawn = this.respawnMs
    this.sprite.setVisible(false)
    this.nameText?.setVisible(false)
    this.bar.clear()
    this.mineTarget = null
    this.minedAccum = 0
    this.selected = false
    this.scene.explosion(this.x, this.y, this.tint, 40)
  }

  revive(core) {
    this.x = this.tx = core.x; this.y = this.ty = core.y
    this.hp = this.maxHp
    this.alive = true
    this.sprite.setVisible(true).setPosition(this.x, this.y)
    this.mineTarget = null
    this.minedAccum = 0
  }
}
