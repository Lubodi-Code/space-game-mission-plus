import Phaser from 'phaser'
import { gameState } from '~/game/gameState.js'
import { Structure } from './Structure.js'
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

// ------------------------------------------- Flak: minigun de balas con mala puntería
// Cadencia muy alta; cada bala sale con un desvío aleatorio dentro de coneDeg, vuela en línea
// recta y se disuelve al final de su alcance si no pega. pellets = balas por disparo.
const FLAK_MAX_BULLETS = 90

export class FlakTurret extends WeaponTurret {
  constructor(def, x, y, scene) {
    super(def, x, y, scene)
    this.bullets = []
  }

  fire(target) {
    const base = Math.atan2(target.y - this.y, target.x - this.x)
    const spread = Phaser.Math.DegToRad(this.coneDeg || 26)
    for (let i = 0; i < (this.pellets || 1) && this.bullets.length < FLAK_MAX_BULLETS; i++) {
      const a = base + (Math.random() - 0.5) * spread
      const speed = 620 + Math.random() * 140
      this.bullets.push({
        x: this.x + Math.cos(a) * this.radius, y: this.y + Math.sin(a) * this.radius,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0,
        maxLife: (this.atkRange * 1.15 / speed) * 1000,
      })
      // Clientes remotos: no simulan balas; ven una estela corta cada tantas.
      if (this.scene.netHost && (this._net = (this._net || 0) + 1) % 3 === 0) {
        this.beam(this.x, this.y, this.x + Math.cos(a) * this.atkRange * 0.7, this.y + Math.sin(a) * this.atkRange * 0.7, this.fxColor, 1.2, { ttl: 70 })
      }
    }
    if ((this._snd = (this._snd || 0) + 1) % 3 === 1) sfxFlak(this.x, this.y)
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.bullets.length) this.updateBullets(dt, world)
  }

  // dt en MS. Las balas siguen volando aunque la torreta se apague.
  updateBullets(dt, world) {
    const g = this.scene.beamGraphics
    const s = dt / 1000
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]
      b.life += dt
      // Choque en subpasos de ≤12 px: a velocidad 3× una bala avanza 40+ px por frame y si solo
      // se mirara el punto final atravesaría naves pequeñas.
      const px = b.x, py = b.y
      b.x += b.vx * s; b.y += b.vy * s
      const k = b.life / b.maxLife
      let hit = null
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - px, b.y - py) / 12))
      for (let j = 1; j <= steps && !hit; j++) {
        const qx = px + (b.x - px) * j / steps, qy = py + (b.y - py) * j / steps
        // Radio de búsqueda que cubre a los jefes (radio ~30-50): la colisión usa e.radius.
        world.enemyGrid?.forEachNear(qx, qy, 64, (e) => {
          if (!hit && !e.dead && Math.hypot(e.x - qx, e.y - qy) <= e.radius + 3) hit = e
        })
      }
      if (hit) {
        hit.hit(this.dmg, world)
        g.fillStyle(0xfff0c0, 0.9).fillCircle(b.x, b.y, 2.5)
        this.bullets.splice(i, 1)
        continue
      }
      if (k >= 1) { this.bullets.splice(i, 1); continue }
      // Trazadora que se desvanece y se encoge al final del recorrido (la bala "se diluye").
      const alpha = 1 - k * k
      g.lineStyle(2.2 - k * 1.2, this.fxColor, alpha)
        .lineBetween(b.x - b.vx * 0.022, b.y - b.vy * 0.022, b.x, b.y)
    }
  }
}

// ---------------------------------------- Mortero: bombas lentas con mecha
// Lanza una bomba en arco muy lento; al caer queda en el suelo con una mecha (anillo que se
// cierra) y luego explota en área. Con la rama A (más proyectiles) lanza un racimo de bombitas
// dispersas de mecha corta y menos daño cada una.
const MORTAR_FUSE_MS = 1000
const CLUSTER_FUSE_MS = 650

export class MortarTurret extends WeaponTurret {
  constructor(def, x, y, scene) {
    super(def, x, y, scene)
    this.shellsInAir = []
  }

  fire(target) {
    const n = this.shells || 1
    const cluster = n > 1
    // Adelanta la posición del blanco, pero no más de 2.5 s: el vuelo es largo y pierde sentido.
    const d0 = Math.hypot(target.x - this.x, target.y - this.y)
    const lead = Math.min(2.5, d0 / this.projSpeed)
    const ax = target.x + (target.vx || 0) * lead
    const ay = target.y + (target.vy || 0) * lead
    for (let i = 0; i < n; i++) {
      const scatter = cluster ? 30 + Math.random() * 70 : Math.random() * 20
      const a = Math.random() * Math.PI * 2
      const tx = ax + Math.cos(a) * scatter
      const ty = ay + Math.sin(a) * scatter
      const dist = Math.hypot(tx - this.x, ty - this.y)
      this.shellsInAir.push({
        sx: this.x, sy: this.y, tx, ty, x: this.x, y: this.y, t: -i * 140, // salida escalonada
        dur: (dist / this.projSpeed) * 1000, peak: Math.min(260, dist * 0.35),
        fuse: cluster ? CLUSTER_FUSE_MS + Math.random() * 350 : MORTAR_FUSE_MS, landedAt: null,
        dmg: cluster ? this.dmg * 0.55 : this.dmg, splash: cluster ? this.splash * 0.65 : this.splash,
        r: cluster ? 3.2 : 5, launched: false,
      })
    }
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.shellsInAir.length) this.updateShells(dt, world)
  }

  updateShells(dt, world) {
    const g = this.scene.beamGraphics
    for (let i = this.shellsInAir.length - 1; i >= 0; i--) {
      const sh = this.shellsInAir[i]
      sh.t += dt
      if (sh.t < 0) continue
      if (!sh.launched) { sh.launched = true; sfxMissile(this.x, this.y) }
      if (sh.landedAt == null) {
        const k = Math.min(1, sh.t / sh.dur)
        sh.x = sh.sx + (sh.tx - sh.sx) * k
        sh.y = sh.sy + (sh.ty - sh.sy) * k
        const h = Math.sin(k * Math.PI) * sh.peak
        // Sombra en el suelo + bomba "en el aire" (desplazada hacia arriba por la altura).
        g.fillStyle(0x000000, 0.35).fillEllipse(sh.x, sh.y, sh.r * 2.4, sh.r * 1.4)
        g.fillStyle(this.fxColor, 1).fillCircle(sh.x, sh.y - h * 0.6, sh.r + h * 0.012)
        g.fillStyle(0xffffff, 0.7).fillCircle(sh.x - 1, sh.y - h * 0.6 - 1, (sh.r + h * 0.012) * 0.35)
        if (k >= 1) sh.landedAt = sh.t
        continue
      }
      const waited = sh.t - sh.landedAt
      const left = 1 - waited / sh.fuse
      if (left <= 0) {
        for (const e of world.enemies) {
          if (!e.dead && Math.hypot(e.x - sh.x, e.y - sh.y) <= sh.splash + e.radius) e.hit(Math.round(sh.dmg), world)
        }
        this.scene.explosion(sh.x, sh.y, this.fxColor, sh.splash, sh.r > 4 ? 'big' : 'small')
        this.shellsInAir.splice(i, 1)
        continue
      }
      // Bomba en el suelo: parpadea cada vez más rápido y un anillo marca la mecha restante.
      const blink = Math.sin(waited * (0.012 + (1 - left) * 0.05)) > 0
      g.fillStyle(blink ? 0xffffff : this.fxColor, 1).fillCircle(sh.x, sh.y, sh.r)
      g.lineStyle(1.6, this.fxColor, 0.9).beginPath()
        .arc(sh.x, sh.y, sh.r + 5, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2).strokePath()
      g.lineStyle(1, this.fxColor, 0.25 + (1 - left) * 0.35).strokeCircle(sh.x, sh.y, sh.splash * (1 - left * 0.5))
    }
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

