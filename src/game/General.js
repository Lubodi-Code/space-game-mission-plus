import Phaser from 'phaser'
import { GENERAL } from './balance.js'
import { gameState } from './gameState.js'
import { spawnFloatingText } from './render/fx.js'

const { hp, speed, radius, contactDps, respawnMs, color, atkRange, damage, cooldown, collectRange, collectRate, buffRadius, buffMultiplier } = GENERAL

export class General {
  constructor(scene, x, y, tint = 0x8be9fd) {
    this.scene = scene
    this.x = x; this.y = y
    this.tx = x; this.ty = y
    this.hp = hp; this.maxHp = hp
    this.radius = radius
    this.alive = true
    this.respawn = 0
    this.tint = tint
    this.sprite = scene.add.image(x, y, 'enemy_skirmisher')
      .setTint(tint).setScale(1.3).setDepth(17)
    this.bar = scene.add.graphics().setDepth(18)
    this.selected = false
    this.mineTarget = null
    this.minedAccum = 0
    this.atkTimer = 0
    this.buffActive = false
    this.gmining = null // [gx, gy, mx, my] para sincronizar haz de minería
  }

  moveTo(x, y) {
    if (this.alive) {
      this.tx = x; this.ty = y
      this.mineTarget = null
      this.minedAccum = 0
    }
  }

  // Clic con el General seleccionado: si hay un meteorito cerca del punto, minarlo;
  // si no, simplemente moverse allí.
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

  update(dt, world) {
    if (!this.alive) {
      this.respawn -= dt * 1000
      if (this.respawn <= 0) this.revive(world.core)
      return
    }

    // Buff por proximidad a estructuras vivas.
    let nearStructure = false
    if (world.structures) {
      for (const s of world.structures) {
        if (s.dead) continue
        if (Math.hypot(s.x - this.x, s.y - this.y) <= buffRadius + s.radius) {
          nearStructure = true
          break
        }
      }
    }
    this.buffActive = nearStructure
    const mult = this.buffActive ? buffMultiplier : 1

    // Movimiento hacia el objetivo.
    const dx = this.tx - this.x, dy = this.ty - this.y
    const d = Math.hypot(dx, dy)
    if (d > 4) {
      const step = Math.min(speed * dt, d)
      this.x += (dx / d) * step; this.y += (dy / d) * step
      this.sprite.setRotation(Math.atan2(dy, dx))
    }
    this.sprite.setPosition(this.x, this.y)

    // Daño por contacto con enemigos.
    const grid = world.enemyGrid
    if (grid) {
      let touching = false
      grid.forEachNear(this.x, this.y, this.radius + 24, (e) => {
        if (e.dead) return
        if (Math.hypot(e.x - this.x, e.y - this.y) < this.radius + e.radius) touching = true
      })
      if (touching) this.hp -= contactDps * dt
    }

    // Recolección de meteoritos.
    this.gmining = null
    if (this.mineTarget) {
      const m = this.mineTarget
      if (m.depleted || !m.container || m.container.scene == null) {
        this.mineTarget = null
      } else {
        const mdx = m.x - this.x, mdy = m.y - this.y
        const md = Math.hypot(mdx, mdy)
        if (md <= collectRange + m.radius) {
          const amt = collectRate * mult * dt
          const taken = Math.min(amt, m.amount)
          m.amount -= taken
          gameState.minerals = Math.min(gameState.minerals + taken, gameState.mineralsCap)
          this.minedAccum += taken
          if (this.minedAccum >= 1) {
            spawnFloatingText(this.scene, this.x, this.y - 22, `+${Math.round(this.minedAccum)}`, '#49e07a')
            this.minedAccum = 0
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

    // Disparo automático al enemigo más cercano.
    this.atkTimer -= dt * 1000
    if (this.atkTimer <= 0) {
      let best = null, bestD = atkRange
      for (const e of world.enemies) {
        if (e.dead) continue
        const ed = Math.hypot(e.x - this.x, e.y - this.y) - e.radius
        if (ed < bestD) { bestD = ed; best = e }
      }
      if (best) {
        best.hp -= damage
        if (best.hp <= 0) world.killEnemy(best)
        this.atkTimer = cooldown / mult
        this.scene.beamGraphics.lineStyle(2, this.tint, 0.95)
        this.scene.beamGraphics.lineBetween(this.x, this.y, best.x, best.y)
        this.scene.beamGraphics.fillStyle(this.tint, 0.8)
        this.scene.beamGraphics.fillCircle(best.x, best.y, 3)
        // Sincronizar rayo con clientes.
        if (this.scene.netHost && this.scene._beamQueue) {
          this.scene._beamQueue.push([Math.round(this.x), Math.round(this.y), Math.round(best.x), Math.round(best.y), this.tint, 2, 90, 90])
        }
      }
    }

    if (this.hp <= 0) this.die()

    // Dibujar barra de HP y anillo de selección.
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
    this.respawn = respawnMs
    this.sprite.setVisible(false)
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
