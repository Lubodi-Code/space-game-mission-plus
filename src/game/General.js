import Phaser from 'phaser'

const HP = 120, SPEED = 280, RADIUS = 16, CONTACT_DPS = 25, RESPAWN_MS = 8000

export class General {
  constructor(scene, x, y) {
    this.scene = scene
    this.x = x; this.y = y
    this.tx = x; this.ty = y
    this.hp = HP; this.maxHp = HP
    this.radius = RADIUS
    this.alive = true
    this.respawn = 0
    this.sprite = scene.add.image(x, y, 'enemy_skirmisher')
      .setTint(0x8be9fd).setScale(1.3).setDepth(17)
    this.bar = scene.add.graphics().setDepth(18)
  }

  moveTo(x, y) { if (this.alive) { this.tx = x; this.ty = y } }

  update(dt, world) {
    if (!this.alive) {
      this.respawn -= dt * 1000
      if (this.respawn <= 0) this.revive(world.core)
      return
    }
    const dx = this.tx - this.x, dy = this.ty - this.y
    const d = Math.hypot(dx, dy)
    if (d > 4) {
      const step = Math.min(SPEED * dt, d)
      this.x += (dx / d) * step; this.y += (dy / d) * step
      this.sprite.setRotation(Math.atan2(dy, dx))
    }
    this.sprite.setPosition(this.x, this.y)

    const grid = world.enemyGrid
    if (grid) {
      let touching = false
      grid.forEachNear(this.x, this.y, this.radius + 24, (e) => {
        if (e.dead) return
        if (Math.hypot(e.x - this.x, e.y - this.y) < this.radius + e.radius) touching = true
      })
      if (touching) this.hp -= CONTACT_DPS * dt
    }
    if (this.hp <= 0) this.die()

    const g = this.bar; g.clear()
    if (this.hp < this.maxHp) {
      const w = 24, frac = Math.max(0, this.hp / this.maxHp), by = this.y - 22
      g.fillStyle(0x000000, 0.6).fillRect(this.x - w / 2 - 1, by - 1, w + 2, 5)
      g.fillStyle(0x8be9fd, 1).fillRect(this.x - w / 2, by, w * frac, 3)
    }
  }

  die() {
    this.alive = false
    this.respawn = RESPAWN_MS
    this.sprite.setVisible(false)
    this.bar.clear()
    this.scene.explosion(this.x, this.y, 0x8be9fd, 40)
  }

  revive(core) {
    this.x = this.tx = core.x; this.y = this.ty = core.y
    this.hp = this.maxHp
    this.alive = true
    this.sprite.setVisible(true).setPosition(this.x, this.y)
  }
}
