import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { drawPolygon, darken } from './draw.js'
import { glowBlend } from '../render/blend.js'

let _seq = 0

// Adorno distintivo por mejora, dibujado sobre el Graphics de acento (centrado en 0,0; "arriba" = -y,
// igual que drawPolygon). Cada `decor` da una silueta propia a la torreta mejorada.
function drawUpgradeDecor(g, decor, R, color) {
  g.clear()
  switch (decor) {
    case 'fast': // doble cañón corto (cadencia)
      g.lineStyle(2, color, 0.95)
      g.lineBetween(-3, -R, -3, -R - 6)
      g.lineBetween(3, -R, 3, -R - 6)
      break
    case 'triple': // tres púas en abanico (ráfaga triple)
      g.lineStyle(2, color, 0.95)
      for (const a of [-0.5, 0, 0.5]) {
        g.lineBetween(Math.sin(a) * R, -Math.cos(a) * R, Math.sin(a) * (R + 8), -Math.cos(a) * (R + 8))
      }
      break
    case 'wide': // anillo amplio (radio)
      g.lineStyle(1.5, color, 0.5).strokeCircle(0, 0, R + 9)
      break
    case 'heavy': // doble anillo grueso + núcleo (rayo progresivo)
      g.lineStyle(3, color, 0.85).strokeCircle(0, 0, R + 4)
      g.lineStyle(1.5, color, 0.45).strokeCircle(0, 0, R + 9)
      g.fillStyle(color, 0.5).fillCircle(0, 0, R * 0.4)
      break
    case 'pods': // pods de misiles alrededor (enjambre)
      g.fillStyle(color, 0.95)
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        g.fillCircle(Math.cos(a) * (R + 5), Math.sin(a) * (R + 5), 2)
      }
      break
    case 'plasma': // anillo de plasma relleno (aura/área)
      g.fillStyle(color, 0.18).fillCircle(0, 0, R + 7)
      g.lineStyle(2, color, 0.9).strokeCircle(0, 0, R + 7)
      break
    case 'long': // antena larga (largo alcance)
      g.lineStyle(2, color, 0.95).lineBetween(0, -R, 0, -R - 12)
      g.fillStyle(color, 0.95).fillCircle(0, -R - 12, 2)
      break
    case 'pierce': // púa afilada (perforante)
      g.fillStyle(color, 0.95).fillTriangle(-3, -R, 3, -R, 0, -R - 13)
      break
    default:
      g.lineStyle(2, color, 0.85).strokeCircle(0, 0, R + 5)
  }
}

export class Structure {
  constructor(def, x, y, scene, isCore = false) {
    this.id = ++_seq
    this.scene = scene
    this.def = def
    this.key = def.key
    this.role = def.role
    this.x = x
    this.y = y
    this.range = def.range
    this.fxColor = def.color // color de láser/misil/explosión; cambia con la mejora
    this.radius = isCore ? 46 : def.size
    this.hp = def.hp
    this.maxHp = def.hp
    this.powered = isCore
    this.isCore = isCore
    this.dead = false
    this.ports = 0 // enlaces de red usados (lo recalcula recomputeNetwork)

    this.target = null
    this.acc = 0
    this.fireTimer = 0
    this.spawnTimer = def.healInterval || 0

    this.buildProgress = 0
    this.building = !isCore && (def.buildTime || 0) > 0
    this.buildTime = def.buildTime || 0

    this.container = scene.add.container(x, y).setDepth(isCore ? 12 : 10)

    const glow = scene.add.image(0, 0, 'glow').setTint(def.color).setName('glow')
    // Escalas ajustadas a la nueva textura glow de 512px con padding transparente.
    glow.setBlendMode(glowBlend()).setScale(isCore ? 0.61 : 0.31).setAlpha(isCore ? 0.5 : 0.35)
    this.glow = glow

    const shape = scene.add.graphics().setName('shape')
    const sides = isCore ? 6 : def.sides
    const size = isCore ? 46 : def.size
    drawPolygon(shape, 0, 0, size, sides, def.color, isCore ? 3 : 2, 1, darken(def.color))
    this.shape = shape

    const barY = -(size + 12)
    const hpBar = scene.add.graphics().setName('hpBar').setVisible(false)
    this.hpBar = hpBar
    this.barY = barY

    this.container.add([glow, shape, hpBar])

    this.buildBar = scene.add.graphics().setName('buildBar').setVisible(this.building)
    this.container.add(this.buildBar)
  }

  update(dt, world, time) {
    if (this.building) {
      this.buildProgress += dt
      if (this.buildProgress >= this.buildTime) {
        this.buildProgress = this.buildTime
        this.building = false
        this.buildBar.setVisible(false)
        this.onBuilt(world)
        if (this.scene.recomputeNetwork) this.scene.recomputeNetwork()
      }
      this.drawBuildBar()
    }
  }

  onBuilt(world) {}

  // Cambia el aspecto al mejorar: recolorea la torreta hacia el color de la rama y dibuja un
  // adorno DISTINTIVO según la mejora (upgrade.decor). Llamado desde systems/selection.js.
  applyUpgradeVisual(upgrade) {
    const color = upgrade.tint || this.def.color
    if (!this._accent) {
      this._accent = this.scene.add.graphics().setName('accent')
      this.container.addAt(this._accent, 2) // sobre la forma, bajo las barras
    }
    if (upgrade.style || upgrade.tint) {
      this.shape.clear()
      drawPolygon(this.shape, 0, 0, this.def.size, this.def.sides, color, 2, 1, darken(color))
      this.glow.setTint(color)
      this.fxColor = color // láser/misil/explosión adoptan el color de la mejora
    }
    // El adorno de la última mejora define el aspecto (las ramas son escalonadas A→A2).
    drawUpgradeDecor(this._accent, upgrade.decor, this.radius, color)
  }

  drawBuildBar() {
    const g = this.buildBar
    g.clear()
    if (!this.building) return
    const w = Math.max(20, this.radius * 1.6)
    const frac = Phaser.Math.Clamp(this.buildProgress / this.buildTime, 0, 1)
    g.fillStyle(0x000000, 0.6).fillRect(-w / 2 - 1, this.barY - 8, w + 2, 5)
    g.fillStyle(0x4fc3ff, 1).fillRect(-w / 2, this.barY - 7, w * frac, 3)
  }

  drawHpBar() {
    const bar = this.hpBar
    bar.clear()
    if (this.hp >= this.maxHp) {
      bar.setVisible(false)
      return
    }
    bar.setVisible(true)
    const w = Math.max(20, this.radius * 1.6)
    const frac = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1)
    bar.fillStyle(0x000000, 0.6).fillRect(-w / 2 - 1, this.barY - 1, w + 2, 5)
    const col = frac > 0.5 ? 0x49e07a : frac > 0.25 ? 0xffcc55 : 0xff5566
    bar.fillStyle(col, 1).fillRect(-w / 2, this.barY, w * frac, 3)
  }

  setPowered(on) {
    this.powered = on
    this.container.setAlpha(on ? 1 : 0.35)
  }

  damage(dmg) {
    if (this.dead) return
    this.hp -= dmg

    const fl = this.scene.add.image(this.x, this.y, 'glow')
      .setTint(0xffffff).setBlendMode(glowBlend())
      .setScale(0.08).setDepth(20)
    this.scene.tweens.add({
      targets: fl, alpha: 0, scale: 0.16, duration: 160,
      onComplete: () => fl.destroy(),
    })
    if (this.isCore) {
      gameState.coreHp = Math.max(0, Math.ceil(this.hp))
      this.drawHpBar()
      this.scene.cameras.main.shake(100, 0.0015)
      if (this.hp <= 0) this.scene.gameOver()
      return
    }
    this.drawHpBar()
    if (this.hp <= 0) this.destroy()
  }

  destroy() {
    this.dead = true
    this.scene.explosion(this.x, this.y, this.def.color, this.radius)
    const idx = this.scene.structures.indexOf(this)
    if (idx >= 0) this.scene.structures.splice(idx, 1)
    this.container.destroy()
    for (const e of this.scene.enemies) if (e.target === this) e.target = null
    if (this.scene.recomputeNetwork) this.scene.recomputeNetwork()
  }
}
