import Phaser from 'phaser'
import { gameState } from '~/game/gameState.js'
import { Structure } from './Structure.js'
import { glowBlend } from '~/game/render/blend.js'
import { sfxLock, sfxMissile, sfxTesla, sfxCryo, sfxRail, sfxFlak } from '~/game/sound.js'

// Torretas del Arsenal (se desbloquean en la tienda). Base común WeaponTurret: objetivo
// (auto / fijado), energía, cooldown y mejoras multiplicativas. Cada subclase implementa fire().
// dt de estructuras en MS (ver CLAUDE.md, dt-unit).
//
// OJO: `this.damage` es el MÉTODO de Structure que recibe daño; el daño que HACE la torreta
// vive en `this.dmg`.

// Campos que las mejoras multiplican (×) o suman (+). Ver UPGRADES en upgrades.js.
const MULT = ['dmg', 'cooldown', 'atkRange', 'chainRange', 'slowMs', 'shieldRange', 'coneDeg', 'projSpeed']
const ADD = ['chains', 'pierce', 'shieldReduce', 'pellets', 'shells']

export class WeaponTurret extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.atkRange = def.atkRange
    this.cooldown = def.cooldown
    this.dmg = def.damage
    this.energyDrain = def.energyDrain || 0
    this.fireMode = 'auto'
    this.focusTarget = null
    this.upgrades = []
    for (const k of [...MULT, ...ADD, 'slowFactor', 'freeze', 'splash']) if (def[k] !== undefined) this[k] = def[k]
  }

  applyUpgrade(upg) {
    // La mejora trae `damage` (así la describe upgrades.js); aquí se aplica a `dmg`.
    if (upg.damage) this.dmg = Math.round(this.dmg * upg.damage)
    for (const k of MULT) if (k !== 'dmg' && upg[k] && this[k] !== undefined) this[k] = this[k] * upg[k]
    for (const k of ADD) if (upg[k]) this[k] = (this[k] || 0) + upg[k]
    if (upg.slowFactor) this.slowFactor = Math.max(0.1, this.slowFactor * upg.slowFactor)
    if (upg.freeze) this.freeze = true
    if (upg.slowAdd) this.slowMs = (this.slowMs || 0) + upg.slowAdd
    if (upg.splashAdd) this.splash = (this.splash || 0) + upg.splashAdd
    if (upg.splashMult) this.splash = (this.splash || 0) * upg.splashMult
    if (upg.style) this.style = upg.style
    this.upgrades.push(upg.id)
  }

  pickTarget(world) {
    if (this.fireMode === 'focus' && this.focusTarget && !this.focusTarget.dead) {
      if (Phaser.Math.Distance.Between(this.x, this.y, this.focusTarget.x, this.focusTarget.y) <= this.atkRange) return this.focusTarget
    } else if (this.fireMode === 'focus') {
      this.focusTarget = null
    }
    let best = null; let bestD = this.atkRange
    for (const e of world.enemies) {
      if (e.dead) continue
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y)
      if (d <= bestD) { bestD = d; best = e }
    }
    return best
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.building || !this.powered) return
    this.fireTimer -= dt
    if (this.fireTimer > 0) return
    const target = this.pickTarget(world)
    if (!target) { this._engaged = false; return }
    if (this.energyDrain > 0) {
      if (gameState.energy < this.energyDrain) return
      gameState.energy = Math.max(0, gameState.energy - this.energyDrain)
    }
    if (!this._engaged) { sfxLock(this.x, this.y); this._engaged = true }
    this.aimAngle = Math.atan2(target.y - this.y, target.x - this.x)
    this.fire(target, world)
    this.fireTimer = this.cooldown
  }

  beam(x1, y1, x2, y2, color, width, extra = {}) {
    this.scene.lasers.push({ x1, y1, x2, y2, ttl: extra.ttl || 110, color, width, ...extra })
    if (this.scene.netHost) this.scene._beamQueue.push([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), color, width, extra.ttl || 110, 110])
  }

  fire() {}
}

// ---------------------------------------------------------------- Tesla: rayo en cadena
export class TeslaTurret extends WeaponTurret {
  fire(target, world) {
    const hit = new Set([target])
    let from = { x: this.x, y: this.y }
    let cur = target
    let dmg = this.dmg
    for (let i = 0; i <= (this.chains || 0) && cur; i++) {
      cur.hit(Math.round(dmg), world)
      if (this.slowMs) { cur.slowMs = Math.max(cur.slowMs || 0, this.slowMs); cur.slowFactor = 0.6 }
      this.beam(from.x, from.y, cur.x, cur.y, this.fxColor, 2.2, { jag: true })
      from = cur
      dmg *= 0.8
      let next = null; let nd = this.chainRange
      for (const e of world.enemies) {
        if (e.dead || hit.has(e)) continue
        const d = Math.hypot(e.x - cur.x, e.y - cur.y)
        if (d < nd) { nd = d; next = e }
      }
      if (next) hit.add(next)
      cur = next
    }
    sfxTesla(this.x, this.y)
  }
}

// ------------------------------------------------------- Criogénica: ralentiza (y congela)
export class CryoTurret extends WeaponTurret {
  fire(target, world) {
    const apply = (e) => {
      e.slowMs = Math.max(e.slowMs || 0, this.slowMs)
      e.slowFactor = Math.min(e.slowFactor || 1, this.slowFactor)
      e.hit(this.dmg, world)
    }
    apply(target)
    this.beam(this.x, this.y, target.x, target.y, this.fxColor, 3, { ttl: 160 })
    if (this.splash) {
      for (const e of world.enemies) if (!e.dead && e !== target && Math.hypot(e.x - target.x, e.y - target.y) <= this.splash) apply(e)
    }
    // Congelamiento: cada 4º disparo congela del todo por un instante.
    this._shots = (this._shots || 0) + 1
    if (this.freeze && this._shots % 4 === 0) { target.stunMs = Math.max(target.stunMs || 0, 1200); this.scene.explosion(target.x, target.y, 0xbff6ff, 26, 'emp') }
    sfxCryo(this.x, this.y)
  }
}

// ------------------------------------------------------ Riel: francotirador que perfora
export class RailTurret extends WeaponTurret {
  fire(target, world) {
    const ang = Math.atan2(target.y - this.y, target.x - this.x)
    const x2 = this.x + Math.cos(ang) * this.atkRange
    const y2 = this.y + Math.sin(ang) * this.atkRange
    const hits = []
    const dx = x2 - this.x; const dy = y2 - this.y; const len2 = dx * dx + dy * dy
    for (const e of world.enemies) {
      if (e.dead) continue
      const t = Phaser.Math.Clamp(((e.x - this.x) * dx + (e.y - this.y) * dy) / len2, 0, 1)
      if (Math.hypot(e.x - (this.x + dx * t), e.y - (this.y + dy * t)) <= e.radius + 6) hits.push({ e, t })
    }
    hits.sort((a, b) => a.t - b.t)
    const max = 1 + (this.pierce || 0)
    let dmg = this.dmg
    for (const h of hits.slice(0, max)) { h.e.hit(Math.round(dmg), world); dmg *= 0.85 }
    const last = hits[Math.min(hits.length, max) - 1]
    const ex = last ? last.e.x : x2; const ey = last ? last.e.y : y2
    this.beam(this.x, this.y, ex, ey, this.fxColor, 5, { ttl: 260 })
    this.scene.explosion(ex, ey, this.fxColor, 18)
    sfxRail(this.x, this.y)
  }
}

// ---------------------------------------------------------- Flak: cono de metralla
export class FlakTurret extends WeaponTurret {
  fire(target, world) {
    const ang = Math.atan2(target.y - this.y, target.x - this.x)
    const half = Phaser.Math.DegToRad((this.coneDeg || 50) / 2)
    for (const e of world.enemies) {
      if (e.dead) continue
      const d = Math.hypot(e.x - this.x, e.y - this.y)
      if (d > this.atkRange + e.radius) continue
      const da = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - this.y, e.x - this.x) - ang))
      if (da <= half) e.hit(Math.round(this.dmg * (this.pellets || 5) / 5), world)
    }
    const n = this.pellets || 5
    for (let i = 0; i < n; i++) {
      const a = ang + (i / (n - 1) - 0.5) * half * 2
      this.beam(this.x, this.y, this.x + Math.cos(a) * this.atkRange, this.y + Math.sin(a) * this.atkRange, this.fxColor, 1.4, { ttl: 90 })
    }
    sfxFlak(this.x, this.y)
  }
}

// --------------------------------------------------- Mortero: proyectil lento de área
export class MortarTurret extends WeaponTurret {
  fire(target) {
    const n = this.shells || 1
    for (let i = 0; i < n; i++) {
      this.scene.time.delayedCall(i * 180, () => this.shell(target))
    }
  }

  shell(target) {
    const scene = this.scene
    const tx = target.x + (target.vx || 0) * 0.8 + (Math.random() - 0.5) * 40
    const ty = target.y + (target.vy || 0) * 0.8 + (Math.random() - 0.5) * 40
    const dx = tx - this.x; const dy = ty - this.y; const d = Math.hypot(dx, dy) || 1
    const sprite = scene.add.image(this.x, this.y, 'missile_rod').setTint(this.fxColor).setScale(1.3).setDepth(20)
    const glow = scene.add.image(this.x, this.y, 'glow').setTint(this.fxColor).setBlendMode(glowBlend()).setScale(0.09).setAlpha(0.8).setDepth(19)
    scene.projectiles.push({
      x: this.x, y: this.y, tx, ty, target: null, // sin guía: cae donde apuntó
      speed: this.projSpeed, damage: this.dmg, splash: this.splash, aura: true, color: this.fxColor, sprite, glow,
      _dir: { x: dx / d, y: dy / d }, vx: (dx / d) * this.projSpeed, vy: (dy / d) * this.projSpeed,
      id: (scene._missileSeq = (scene._missileSeq || 0) + 1),
      maxLife: (d / this.projSpeed) * 1000 + 600,
    })
    sfxMissile(this.x, this.y)
  }
}

// ---------------------------------------- Escudo: reduce el daño a estructuras cercanas
export class ShieldGenerator extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.shieldRange = def.shieldRange
    this.shieldReduce = def.shieldReduce
    this.energyDrain = def.energyDrain || 0 // por segundo
    this.upgrades = []
  }

  applyUpgrade(upg) {
    if (upg.shieldRange) this.shieldRange *= upg.shieldRange
    if (upg.shieldReduce) this.shieldReduce = Math.min(0.75, this.shieldReduce + upg.shieldReduce)
    if (upg.hpMult) { this.maxHp = Math.round(this.maxHp * upg.hpMult); this.hp = Math.round(this.hp * upg.hpMult) }
    if (upg.regen) this.regen = (this.regen || 0) + upg.regen
    this.upgrades.push(upg.id)
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.building || !this.powered) return
    const cost = this.energyDrain * (dt / 1000)
    if (gameState.energy < cost) return
    gameState.energy -= cost
    const now = this.scene.time.now
    for (const s of this.scene.structures) {
      if (s.dead || s === this) continue
      if (Math.hypot(s.x - this.x, s.y - this.y) > this.shieldRange) continue
      if (!(s.shieldUntil > now) || (s.shieldReduce || 0) < this.shieldReduce) s.shieldReduce = this.shieldReduce
      s.shieldUntil = now + 300
      if (this.regen && s.hp < s.maxHp) {
        s.hp = Math.min(s.maxHp, s.hp + this.regen * (dt / 1000))
        if (s.isCore) gameState.coreHp = Math.ceil(s.hp)
        s.drawHpBar?.()
      }
    }
    // Domo visible (sutil) en Phaser; el modelo 3D pone el suyo.
    const g = this.scene.beamGraphics
    const a = 0.08 + 0.04 * Math.sin(time * 0.004)
    g.lineStyle(1.5, this.fxColor, a * 3).strokeCircle(this.x, this.y, this.shieldRange)
    g.fillStyle(this.fxColor, a).fillCircle(this.x, this.y, this.shieldRange)
  }
}

