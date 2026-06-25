import Phaser from 'phaser'
import { gameState, resetGameState } from '../gameState.js'
import { appState, DIFFICULTY } from '../appState.js'
import { bus } from '../bus.js'
import {
  CORE,
  structureByKey,
  ENEMY_TYPES,
  buildWaves,
  WAVE_TOTAL,
  INTERMISSION_MS,
  FIRST_WAVE_MS,
} from '../constants.js'

const MINERAL_GREEN = 0x49e07a
const LINK_ON = 0x6cc8ff
const LINK_OFF = 0x37506a
const LASER_TTL = 90 // ms a laser beam stays drawn

/**
 * GameScene: deep-space background, the player's Core, and the build/energy
 * systems. Structures must stay linked (directly or transitively) to the Core
 * to stay powered; collectors mine nearby meteorites to produce minerals.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
    this.placementKey = null
  }

  create() {
    const { width, height } = this.scale

    // Reset all per-run state here (not the constructor) so scene.restart works.
    resetGameState()
    this.starLayers = []
    this.structures = []
    this.meteorites = []
    this.links = []
    this.enemies = []
    this.projectiles = []
    this.healers = [] // autonomous healing spheres
    this.lasers = [] // transient laser-beam effects
    this.elapsedMs = 0
    this.placementKey = null

    this.createStarfield()

    // Draw order: links -> beams -> meteorites -> structures -> enemies -> fx -> ghost.
    this.linkGraphics = this.add.graphics().setDepth(4)
    this.beamGraphics = this.add.graphics().setDepth(6)
    this.fxGraphics = this.add.graphics().setDepth(30)
    this.ghost = this.add.graphics().setDepth(40).setVisible(false)

    this.createMeteorites()
    this.createCore(width / 2, height / 2)
    this.recomputeNetwork()

    this.setupInput()
    this.initWaves()
    this.setSpeed(1)

    gameState.status = 'playing'

    this.scale.on('resize', this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this)
      this.busOff?.forEach((off) => off())
    })
  }

  // ---------------------------------------------------------------- input
  setupInput() {
    this.input.mouse?.disableContextMenu()

    this.input.on('pointermove', (p) => this.updateGhost(p.x, p.y))
    this.input.on('pointerdown', (p) => {
      if (p.rightButtonDown()) {
        this.cancelPlacement()
        return
      }
      if (this.placementKey) this.tryPlace(p.x, p.y)
    })

    this.input.keyboard?.on('keydown-ESC', () => this.cancelPlacement())

    this.busOff = [
      bus.on('build', (key) => this.startPlacement(key)),
      bus.on('cancel', () => this.cancelPlacement()),
      bus.on('restart', () => this.scene.restart()),
      bus.on('speed', (v) => this.setSpeed(v)),
    ]
  }

  // Game-speed multiplier. 0 = paused. Also scales Phaser tweens & timers so
  // animations (spins, pulses, explosions) match the simulation speed.
  setSpeed(v) {
    this.speed = v
    gameState.speed = v
    this.tweens.timeScale = v
    this.time.timeScale = v
  }

  startPlacement(key) {
    this.placementKey = key
    gameState.activeBuild = key
    this.ghost.setVisible(true)
    this.updateGhost(this.input.activePointer.x, this.input.activePointer.y)
  }

  cancelPlacement() {
    this.placementKey = null
    gameState.activeBuild = null
    this.ghost.setVisible(false)
  }

  // ------------------------------------------------------------- placement
  // Can a structure of `def` placed at (x,y) link to a powered structure?
  canConnectAt(x, y, def) {
    return this.structures.some((s) => {
      if (!s.powered) return false
      const d = Phaser.Math.Distance.Between(x, y, s.x, s.y)
      return d <= Math.max(def.range, s.range)
    })
  }

  tryPlace(x, y) {
    const def = structureByKey(this.placementKey)
    if (!def) return
    if (gameState.minerals < def.cost) return
    if (!this.canConnectAt(x, y, def)) return
    if (this.overlapsExisting(x, y)) return

    gameState.minerals -= def.cost
    if (def.role === 'battery') gameState.mineralsCap += def.capBonus

    this.addStructure(def, x, y)
    this.recomputeNetwork()

    // Stay in placement mode for rapid building; exit if now unaffordable.
    if (gameState.minerals < def.cost) this.cancelPlacement()
    else this.updateGhost(x, y)
  }

  overlapsExisting(x, y) {
    return this.structures.some((s) => Phaser.Math.Distance.Between(x, y, s.x, s.y) < 34)
  }

  // ------------------------------------------------------------ structures
  createCore(x, y) {
    const entry = this.addStructure(CORE, x, y, true)
    this.core = entry

    // Core has a richer, animated look layered on top of the base shape.
    const glow = entry.container.getByName('glow')
    const inner = this.add.graphics()
    this.drawPolygon(inner, 0, 0, 22, 4, CORE.color, 2, 1, 0x0a2030)
    inner.setName('inner')
    entry.container.add(inner)

    this.tweens.add({ targets: entry.shape, angle: 360, duration: 18000, repeat: -1 })
    this.tweens.add({ targets: inner, scale: 1.18, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.tweens.add({ targets: glow, alpha: 0.6, scale: 2.6, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    return entry
  }

  addStructure(def, x, y, isCore = false) {
    const container = this.add.container(x, y).setDepth(isCore ? 12 : 10)

    const glow = this.add.image(0, 0, 'glow').setTint(def.color).setName('glow')
    glow.setBlendMode(Phaser.BlendModes.ADD).setScale(isCore ? 2.2 : 1.1).setAlpha(isCore ? 0.5 : 0.35)

    const shape = this.add.graphics().setName('shape')
    const sides = isCore ? 6 : def.sides
    const size = isCore ? 46 : def.size
    this.drawPolygon(shape, 0, 0, size, sides, def.color, isCore ? 3 : 2, 1, this.darken(def.color))

    // HP bar (hidden until damaged), drawn just above the structure.
    const barY = -(size + 12)
    const hpBar = this.add.graphics().setName('hpBar').setVisible(false)
    container.add([glow, shape, hpBar])

    const entry = {
      key: def.key,
      role: def.role,
      def,
      x,
      y,
      range: def.range,
      radius: size,
      container,
      shape,
      hpBar,
      barY,
      hp: def.hp,
      maxHp: def.hp,
      powered: isCore,
      isCore,
      target: null, // collector: current meteorite
      acc: 0, // collector: fractional mineral accumulator
      fireTimer: 0, // turret/missile cooldown
      spawnTimer: def.healInterval || 0, // healer sphere cadence
    }
    this.structures.push(entry)
    return entry
  }

  updateHpBar(s) {
    const bar = s.hpBar
    bar.clear()
    if (s.hp >= s.maxHp) {
      bar.setVisible(false)
      return
    }
    bar.setVisible(true)
    const w = Math.max(20, s.radius * 1.6)
    const frac = Phaser.Math.Clamp(s.hp / s.maxHp, 0, 1)
    bar.fillStyle(0x000000, 0.6).fillRect(-w / 2 - 1, s.barY - 1, w + 2, 5)
    const col = frac > 0.5 ? 0x49e07a : frac > 0.25 ? 0xffcc55 : 0xff5566
    bar.fillStyle(col, 1).fillRect(-w / 2, s.barY, w * frac, 3)
  }

  // ------------------------------------------------------------- meteorites
  createMeteorites() {
    const cx = this.scale.width / 2
    const cy = this.scale.height / 2
    const count = 12
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25)
      const dist = Phaser.Math.Between(150, 340)
      const x = cx + Math.cos(angle) * dist
      const y = cy + Math.sin(angle) * dist
      this.createMeteorite(x, y)
    }
  }

  createMeteorite(x, y) {
    const container = this.add.container(x, y).setDepth(8)
    const radius = Phaser.Math.Between(16, 26)
    const g = this.add.graphics()

    // Irregular rocky polygon.
    g.fillStyle(0x3a342c, 1)
    g.lineStyle(2, 0x5a5247, 1)
    const pts = []
    const segs = 9
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      const r = radius * Phaser.Math.FloatBetween(0.75, 1.15)
      pts.push(new Phaser.Geom.Point(Math.cos(a) * r, Math.sin(a) * r))
    }
    g.beginPath()
    g.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
    g.closePath()
    g.fillPath()
    g.strokePath()

    // Green mineral veins/specks.
    g.fillStyle(MINERAL_GREEN, 0.9)
    for (let i = 0; i < 5; i++) {
      g.fillCircle(
        Phaser.Math.Between(-radius * 0.5, radius * 0.5),
        Phaser.Math.Between(-radius * 0.5, radius * 0.5),
        Phaser.Math.FloatBetween(1.5, 3)
      )
    }
    container.add(g)

    const meteor = { x, y, container, amount: Phaser.Math.Between(450, 750), depleted: false }
    this.meteorites.push(meteor)
    return meteor
  }

  // -------------------------------------------------------------- network
  // Rebuild the link graph, flood-fill power from the Core, refresh visuals.
  recomputeNetwork() {
    const n = this.structures.length
    const adj = Array.from({ length: n }, () => [])
    this.links = []

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.structures[i]
        const b = this.structures[j]
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)
        if (d <= Math.max(a.range, b.range)) {
          adj[i].push(j)
          adj[j].push(i)
          this.links.push([a, b])
        }
      }
    }

    // BFS power flood from the Core.
    this.structures.forEach((s) => (s.powered = false))
    const coreIdx = this.structures.findIndex((s) => s.isCore)
    if (coreIdx >= 0) {
      const queue = [coreIdx]
      this.structures[coreIdx].powered = true
      while (queue.length) {
        const cur = queue.shift()
        for (const next of adj[cur]) {
          if (!this.structures[next].powered) {
            this.structures[next].powered = true
            queue.push(next)
          }
        }
      }
    }

    // Reflect power state in opacity and assign collector targets.
    for (const s of this.structures) {
      s.container.setAlpha(s.powered ? 1 : 0.35)
      if (s.role === 'collector') s.target = s.powered ? this.findMeteorFor(s) : null
    }

    this.drawLinks()
  }

  findMeteorFor(collector) {
    let best = null
    let bestD = collector.def.miningRange
    for (const m of this.meteorites) {
      if (m.depleted) continue
      const d = Phaser.Math.Distance.Between(collector.x, collector.y, m.x, m.y)
      if (d <= bestD) {
        bestD = d
        best = m
      }
    }
    return best
  }

  drawLinks() {
    const g = this.linkGraphics
    g.clear()
    for (const [a, b] of this.links) {
      const on = a.powered && b.powered
      g.lineStyle(on ? 2 : 1.5, on ? LINK_ON : LINK_OFF, on ? 0.5 : 0.18)
      g.beginPath()
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.strokePath()
    }
  }

  // ------------------------------------------------------------------ ghost
  updateGhost(x, y) {
    if (!this.placementKey) return
    const def = structureByKey(this.placementKey)
    const affordable = gameState.minerals >= def.cost
    const connectable = this.canConnectAt(x, y, def)
    const free = !this.overlapsExisting(x, y)
    const valid = affordable && connectable && free
    const color = valid ? 0x49e07a : 0xff5566

    const g = this.ghost
    g.clear()
    // Connection radius preview.
    g.lineStyle(1, color, 0.4)
    g.strokeCircle(x, y, def.range)
    // Structure shape preview.
    this.drawPolygon(g, x, y, def.size, def.sides, color, 2, 0.9, this.darken(color))
  }

  // ------------------------------------------------------------------ utils
  darken(color) {
    const c = Phaser.Display.Color.IntegerToColor(color)
    return Phaser.Display.Color.GetColor(c.red * 0.18, c.green * 0.18, c.blue * 0.22)
  }

  drawPolygon(g, cx, cy, radius, sides, color, lineWidth, alpha = 1, fillColor = null) {
    const points = []
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2
      points.push(new Phaser.Geom.Point(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius))
    }
    if (fillColor !== null) {
      g.fillStyle(fillColor, 0.85)
      g.beginPath()
      g.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y)
      g.closePath()
      g.fillPath()
    }
    g.lineStyle(lineWidth, color, alpha)
    g.beginPath()
    g.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y)
    g.closePath()
    g.strokePath()
  }

  handleResize(gameSize) {
    const core = this.structures.find((s) => s.isCore)
    if (core) {
      const dx = gameSize.width / 2 - core.x
      const dy = gameSize.height / 2 - core.y
      // Shift the whole base so the Core stays centered.
      for (const s of this.structures) {
        s.x += dx
        s.y += dy
        s.container.setPosition(s.x, s.y)
      }
      this.recomputeNetwork()
    }
  }

  // ------------------------------------------------------------------ loop
  update(time, delta) {
    const d = delta * (this.speed ?? 1) // simulation delta, scaled by game speed

    // Starfield drifts in game-time (freezes on pause / end screens).
    for (let i = 0; i < this.starLayers.length; i++) {
      this.starLayers[i].x -= (i + 1) * 0.004 * d
      if (this.starLayers[i].x < -this.scale.width) this.starLayers[i].x = 0
    }

    if (gameState.status !== 'playing' || d === 0) return

    this.elapsedMs += d
    gameState.timeElapsed = Math.floor(this.elapsedMs / 1000)

    this.updateMining(d, time)
    this.updateWaves(d)
    this.updateEnemies(d)
    this.updateCombat(d)
    this.updateProjectiles(d)
    this.updateHealers(d)
    this.drawFx(d)
  }

  updateMining(delta, time) {
    const g = this.beamGraphics
    g.clear()
    const dt = delta / 1000
    const pulse = 0.45 + 0.3 * Math.sin(time * 0.012)

    let dirty = false
    for (const s of this.structures) {
      if (s.role !== 'collector' || !s.powered) continue
      const m = s.target
      if (!m || m.depleted) continue

      // Mining tractor beam.
      g.lineStyle(3, MINERAL_GREEN, pulse)
      g.beginPath()
      g.moveTo(s.x, s.y)
      g.lineTo(m.x, m.y)
      g.strokePath()
      g.fillStyle(MINERAL_GREEN, pulse)
      g.fillCircle(m.x, m.y, 4)

      // Produce minerals (respecting storage cap and meteor reserves).
      s.acc += s.def.rate * dt
      const whole = Math.floor(s.acc)
      if (whole > 0) {
        s.acc -= whole
        const room = gameState.mineralsCap - gameState.minerals
        const mined = Math.min(whole, room, m.amount)
        if (mined > 0) {
          gameState.minerals += mined
          m.amount -= mined
        }
        if (m.amount <= 0 && !m.depleted) {
          m.depleted = true
          dirty = true
          this.tweens.add({
            targets: m.container,
            alpha: 0,
            scale: 0.6,
            duration: 500,
            onComplete: () => m.container.destroy(),
          })
        }
      }
    }
    if (dirty) this.recomputeNetwork()
  }

  // ----------------------------------------------------------------- waves
  initWaves() {
    this.waves = buildWaves()
    this.wave = { index: 0, queue: [], spawnTimer: 0, gap: 0, state: 'intermission', timer: FIRST_WAVE_MS }
    gameState.wave = 0
    gameState.waveTotal = WAVE_TOTAL
    gameState.nextWaveIn = Math.ceil(FIRST_WAVE_MS / 1000)
  }

  updateWaves(delta) {
    const w = this.wave
    if (w.state === 'intermission') {
      w.timer -= delta
      gameState.nextWaveIn = Math.max(0, Math.ceil(w.timer / 1000))
      if (w.timer <= 0) this.startNextWave()
    } else if (w.state === 'spawning') {
      gameState.nextWaveIn = 0
      w.spawnTimer -= delta
      if (w.spawnTimer <= 0 && w.queue.length) {
        this.spawnEnemy(w.queue.shift())
        w.spawnTimer = w.gap
      }
      if (w.queue.length === 0) w.state = 'clearing'
    } else if (w.state === 'clearing') {
      if (this.enemies.length === 0) {
        if (w.index >= WAVE_TOTAL) this.victory()
        else {
          w.state = 'intermission'
          w.timer = INTERMISSION_MS
        }
      }
    }
  }

  startNextWave() {
    const w = this.wave
    w.index++
    gameState.wave = w.index
    const def = this.waves[w.index - 1]
    w.queue = [...def.list]
    w.gap = def.gap
    w.spawnTimer = 0
    w.state = 'spawning'
  }

  spawnEnemy(type) {
    const def = ENEMY_TYPES[type]
    const cx = this.core.x
    const cy = this.core.y
    const R = Math.max(this.scale.width, this.scale.height) * 0.75
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
    const x = cx + Math.cos(angle) * R
    const y = cy + Math.sin(angle) * R

    const mult = DIFFICULTY[appState.difficulty] || DIFFICULTY.normal
    const hp = Math.round(def.hp * mult.hp)
    const damage = def.damage * mult.damage

    const sprite = this.add.image(x, y, `enemy_${type}`).setScale(def.scale).setDepth(15)
    const bar = this.add.graphics().setDepth(16)
    this.enemies.push({ def, damage, hp, maxHp: hp, x, y, sprite, bar, target: null, atkTimer: 0, flash: 0, dead: false })
  }

  // --------------------------------------------------------------- enemies
  updateEnemies(delta) {
    const dt = delta / 1000
    gameState.enemiesAlive = this.enemies.length

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]

      if (!e.target || e.target.dead) e.target = this.nearestStructure(e.x, e.y)
      const t = e.target
      if (t) {
        const d = Phaser.Math.Distance.Between(e.x, e.y, t.x, t.y)
        const reach = t.radius + 14
        if (d > reach) {
          const inv = d > 0 ? 1 / d : 0
          e.x += (t.x - e.x) * inv * e.def.speed * dt
          e.y += (t.y - e.y) * inv * e.def.speed * dt
        } else {
          e.atkTimer -= delta
          if (e.atkTimer <= 0) {
            this.damageStructure(t, e.damage)
            e.atkTimer = e.def.atkCooldown
          }
        }
      }

      e.sprite.setPosition(e.x, e.y)

      // Hit flash.
      if (e.flash > 0) {
        e.flash -= delta
        if (e.flash <= 0) e.sprite.clearTint()
      }

      // HP bar when damaged.
      const bar = e.bar
      bar.clear()
      if (e.hp < e.maxHp) {
        const w = 14 * e.def.scale
        const frac = Phaser.Math.Clamp(e.hp / e.maxHp, 0, 1)
        const by = e.y - 12 * e.def.scale
        bar.fillStyle(0x000000, 0.6).fillRect(e.x - w / 2 - 1, by - 1, w + 2, 4)
        bar.fillStyle(0xff5566, 1).fillRect(e.x - w / 2, by, w * frac, 2)
      }
    }
  }

  nearestStructure(x, y) {
    let best = null
    let bestD = Infinity
    for (const s of this.structures) {
      if (s.dead) continue
      const d = Phaser.Math.Distance.Between(x, y, s.x, s.y)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  damageStructure(s, dmg) {
    if (s.dead) return
    s.hp -= dmg
    if (s.isCore) {
      gameState.coreHp = Math.max(0, Math.ceil(s.hp))
      this.updateHpBar(s)
      if (s.hp <= 0) this.gameOver()
      return
    }
    this.updateHpBar(s)
    if (s.hp <= 0) this.destroyStructure(s)
  }

  destroyStructure(s) {
    s.dead = true
    this.explosion(s.x, s.y, s.def.color, s.radius)
    const idx = this.structures.indexOf(s)
    if (idx >= 0) this.structures.splice(idx, 1)
    s.container.destroy()
    for (const e of this.enemies) if (e.target === s) e.target = null
    this.recomputeNetwork()
  }

  // ---------------------------------------------------------------- combat
  updateCombat(delta) {
    for (const s of this.structures) {
      if (!s.powered) continue
      if (s.role !== 'turret' && s.role !== 'missile') continue
      s.fireTimer -= delta
      if (s.fireTimer > 0) continue
      const target = this.nearestEnemyInRange(s.x, s.y, s.def.atkRange)
      if (!target) continue
      if (s.role === 'turret') this.fireLaser(s, target)
      else this.fireMissile(s, target)
      s.fireTimer = s.def.cooldown
    }
  }

  nearestEnemyInRange(x, y, range) {
    let best = null
    let bestD = range
    for (const e of this.enemies) {
      if (e.dead) continue
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y)
      if (d <= bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  fireLaser(s, e) {
    this.damageEnemy(e, s.def.damage)
    this.lasers.push({ x1: s.x, y1: s.y, x2: e.x, y2: e.y, ttl: LASER_TTL, color: s.def.color })
  }

  fireMissile(s, e) {
    const sprite = this.add.image(s.x, s.y, 'star').setTint(s.def.color).setScale(2).setBlendMode(Phaser.BlendModes.ADD).setDepth(20)
    this.projectiles.push({
      x: s.x, y: s.y, tx: e.x, ty: e.y, target: e,
      speed: s.def.projSpeed, damage: s.def.damage, splash: s.def.splash, color: s.def.color, sprite,
    })
  }

  updateProjectiles(delta) {
    const dt = delta / 1000
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      if (p.target && !p.target.dead) {
        p.tx = p.target.x
        p.ty = p.target.y
      }
      const d = Phaser.Math.Distance.Between(p.x, p.y, p.tx, p.ty)
      const step = p.speed * dt
      if (d <= step + 6) {
        // Detonate: area damage around the impact point.
        this.explosion(p.tx, p.ty, p.color, p.splash)
        for (const e of [...this.enemies]) {
          if (Phaser.Math.Distance.Between(p.tx, p.ty, e.x, e.y) <= p.splash) {
            this.damageEnemy(e, p.damage)
          }
        }
        p.sprite.destroy()
        this.projectiles.splice(i, 1)
      } else {
        const inv = 1 / d
        p.x += (p.tx - p.x) * inv * step
        p.y += (p.ty - p.y) * inv * step
        p.sprite.setPosition(p.x, p.y)
      }
    }
  }

  damageEnemy(e, dmg) {
    if (e.dead) return
    e.hp -= dmg
    e.flash = 70
    e.sprite.setTintFill(0xffffff)
    if (e.hp <= 0) this.killEnemy(e)
  }

  killEnemy(e) {
    e.dead = true
    gameState.minerals = Math.min(gameState.mineralsCap, gameState.minerals + e.def.reward)
    this.explosion(e.x, e.y, e.def.color, 14 * e.def.scale)
    e.sprite.destroy()
    e.bar.destroy()
    const idx = this.enemies.indexOf(e)
    if (idx >= 0) this.enemies.splice(idx, 1)
  }

  // ---------------------------------------------------------------- healers
  updateHealers(delta) {
    const dt = delta / 1000

    // Spawn spheres from powered healer structures.
    for (const s of this.structures) {
      if (s.role !== 'healer' || !s.powered) continue
      s.spawnTimer -= delta
      const owned = this.healers.reduce((n, h) => n + (h.owner === s ? 1 : 0), 0)
      if (s.spawnTimer <= 0 && owned < s.def.maxSpheres) {
        this.spawnHealerSphere(s)
        s.spawnTimer = s.def.healInterval
      }
    }

    // Drive existing spheres: seek the most-damaged structure and heal it.
    for (let i = this.healers.length - 1; i >= 0; i--) {
      const h = this.healers[i]
      if (h.owner.dead) {
        h.sprite.destroy()
        this.healers.splice(i, 1)
        continue
      }
      if (!h.target || h.target.dead || h.target.hp >= h.target.maxHp) {
        h.target = this.mostDamagedStructure()
      }
      const speed = h.owner.def.sphereSpeed
      if (h.target) {
        const t = h.target
        const d = Phaser.Math.Distance.Between(h.x, h.y, t.x, t.y)
        if (d > 22) {
          const inv = d > 0 ? 1 / d : 0
          h.x += (t.x - h.x) * inv * speed * dt
          h.y += (t.y - h.y) * inv * speed * dt
        } else {
          t.hp = Math.min(t.maxHp, t.hp + h.owner.def.healRate * dt)
          if (t.isCore) gameState.coreHp = Math.min(t.maxHp, Math.ceil(t.hp))
          this.updateHpBar(t)
        }
      } else {
        // No one to heal: orbit the owner.
        const a = (this.time.now * 0.002 + i) % (Math.PI * 2)
        h.x += (h.owner.x + Math.cos(a) * 34 - h.x) * 0.05
        h.y += (h.owner.y + Math.sin(a) * 34 - h.y) * 0.05
      }
      h.sprite.setPosition(h.x, h.y)
    }
  }

  spawnHealerSphere(s) {
    const sprite = this.add.image(s.x, s.y, 'glow').setTint(0xff7ad9).setScale(0.45)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(18)
    this.healers.push({ owner: s, x: s.x, y: s.y, target: null, sprite })
  }

  mostDamagedStructure() {
    let best = null
    let worst = 1
    for (const s of this.structures) {
      if (s.dead) continue
      const frac = s.hp / s.maxHp
      if (frac < worst) {
        worst = frac
        best = s
      }
    }
    return worst < 1 ? best : null
  }

  // -------------------------------------------------------------------- fx
  explosion(x, y, color, radius) {
    const g = this.add.graphics().setDepth(28)
    g.fillStyle(color, 0.5)
    g.fillCircle(x, y, radius * 0.6)
    g.lineStyle(2, color, 0.9)
    g.strokeCircle(x, y, radius * 0.6)
    this.tweens.add({
      targets: g,
      scale: 2.2,
      alpha: 0,
      duration: 360,
      ease: 'Quad.out',
      onComplete: () => g.destroy(),
    })
  }

  drawFx(delta) {
    const g = this.fxGraphics
    g.clear()
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i]
      l.ttl -= delta
      if (l.ttl <= 0) {
        this.lasers.splice(i, 1)
        continue
      }
      const a = l.ttl / LASER_TTL
      g.lineStyle(2.5, l.color, a)
      g.beginPath()
      g.moveTo(l.x1, l.y1)
      g.lineTo(l.x2, l.y2)
      g.strokePath()
    }
  }

  // ----------------------------------------------------------------- states
  gameOver() {
    if (gameState.status !== 'playing') return
    gameState.status = 'gameover'
    if (this.core) this.explosion(this.core.x, this.core.y, 0xff5566, 120)
    this.cancelPlacement()
  }

  victory() {
    if (gameState.status !== 'playing') return
    gameState.status = 'victory'
    this.cancelPlacement()
  }

  // --------------------------------------------------------------- starfield
  createStarfield() {
    const layerSpecs = [
      { count: 110, scale: [0.25, 0.5], alpha: 0.35, depth: -30 },
      { count: 80, scale: [0.4, 0.8], alpha: 0.6, depth: -20 },
      { count: 40, scale: [0.7, 1.3], alpha: 0.9, depth: -10 },
    ]
    const w = this.scale.width
    const h = this.scale.height

    for (const spec of layerSpecs) {
      const layer = this.add.container(0, 0).setDepth(spec.depth)
      for (let i = 0; i < spec.count; i++) {
        const star = this.add.image(Phaser.Math.Between(0, w * 2), Phaser.Math.Between(0, h), 'star')
        star.setScale(Phaser.Math.FloatBetween(spec.scale[0], spec.scale[1])).setAlpha(spec.alpha)
        this.tweens.add({
          targets: star,
          alpha: spec.alpha * 0.35,
          duration: Phaser.Math.Between(1200, 3200),
          yoyo: true,
          repeat: -1,
          delay: Phaser.Math.Between(0, 2000),
        })
        layer.add(star)
      }
      this.starLayers.push(layer)
    }
  }
}
