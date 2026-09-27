import Phaser from 'phaser'
import { gameState, resetGameState } from '~/game/gameState.js'
import { bus } from '~/game/bus.js'
import {
  FX,
  WORLD,
  CAMERA,
} from '~/game/balance.js'
// (la mayoría de los subsistemas viven en systems/ · render/ · net/)
import { ROLE_GROUPS } from '~/game/enemies/EnemyType.js'
import { Enemy } from '~/game/enemies/Enemy.js'
import { EnemyProjectileSystem } from '~/game/enemies/EnemyProjectiles.js'
import { createStructure } from '~/game/structures/StructureRegistry.js'
import { UPGRADES } from '~/game/structures/upgrades.js'
import { SpatialGrid } from '~/game/enemies/SpatialGrid.js'
import { General, GEN_TINTS } from '~/game/General.js'
import { net } from '~/game/net.js'
import { appState, DIFFICULTY } from '~/game/appState.js'
import { populateMeteorites } from '~/game/systems/worldgen.js'
import { initWaves, updateWaves, enemyStatMult, callWaveEarly } from '~/game/systems/waves.js'
import { recomputeNetwork as recomputeNetworkSys } from '~/game/systems/energyNet.js'
import { ThreeLayer } from '~/game/three/ThreeLayer.js'
import { IS_TOUCH } from '~/game/quality.js'
import { installTiltInput } from '~/game/input/tiltInput.js'
import { explosion as explosionFx, drawFx, drawPlayerCursor, upgradeBurst } from '~/game/render/fx.js'
import { updateProjectiles } from '~/game/systems/projectiles.js'
import { updateHealers } from '~/game/systems/healers.js'
import { updateEnemies, nearestStructure, killEnemy } from '~/game/systems/enemies.js'
import { startPlacement, cancelPlacement, tryPlace, updateGhost, updateRangePreview } from '~/game/systems/placement.js'
import { selectStructure, deselectStructure, applyUpgrade, setFireMode } from '~/game/systems/selection.js'
import { onIntent, createRemote, renderRemote, sendSnapshot } from '~/game/net/sync.js'
import { initSound, updateSound, setMusicState, updateShipBeds, sfxSpeed } from '~/game/sound.js'
import { initAbilities, updateAbilities, requestAbility, handleTargetClick, cancelTargeting } from '~/game/systems/abilities.js'
import { runBonuses } from '~/game/meta/research.js'
import { WEAPON_ROLES } from '~/game/meta/arsenal.js'
import { initSpecialMeteors, updateSpecialMeteors, goToGiant } from '~/game/systems/specialMeteors.js'
import { grantRunRewards } from '~/game/meta/profile.js'
import { equipped, claimUnlocks } from '~/game/meta/cosmetics.js'
import { currentMode } from '~/game/modes/index.js'
import { sfxLevelUp, sfxUpgrade } from '~/game/sound.js'
import { saveSoloSnapshot, loadSoloSnapshot, restoreSoloSnapshot, clearSoloSnapshot } from '~/game/systems/persist.js'


export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
    this.placementKey = null
  }

  create() {
    resetGameState()
    this.starLayers = []
    this.structures = []
    this.meteorites = []
    this.links = []
    this.enemies = []
    this.projectiles = []
    this.healers = []
    this.lasers = []
    this.generals = new Map() // pid -> General (0 = host, 1..3 = clientes). Vacío en cliente.
    this.elapsedMs = 0
    this.placementKey = null
    this._downX = 0
    this._downY = 0
    this._dragging = false
    this._rightDown = false
    this._pinching = false
    this._lastPinchDist = 0
    this._enemySeq = 0
    this._explQueue = [] // explosiones de este intervalo, para enviar a clientes
    this._beamQueue = [] // rayos disparados en este intervalo, para enviar a clientes
    this._auraQueue = [] // auras de plasma para enviar a clientes
    this.netHost = net.isHost
    this.bonuses = runBonuses()
    this.buildTimeMult = this.bonuses.buildTimeMult // lo lee Structure al calcular buildTime

    this.cam = this.cameras.main
    this.cam.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cam.setZoom(IS_TOUCH ? Phaser.Math.Clamp(CAMERA.startZoom * 1.35, CAMERA.minZoom, CAMERA.maxZoom) : CAMERA.startZoom)

    this.nebulae = [] // (el fondo lo dibuja ThreeLayer; ref vacía para minimap.ignore)

    this.linkGraphics = this.add.graphics().setDepth(4)
    this.beamGraphics = this.add.graphics().setDepth(6)
    this.fxGraphics = this.add.graphics().setDepth(30).setBlendMode(Phaser.BlendModes.ADD)
    this.ghost = this.add.graphics().setDepth(40).setVisible(false)
    this.enemyBars = this.add.graphics().setDepth(16)
    this.cursorGfx = this.add.graphics().setDepth(45) // cursores de otros jugadores
    this.remoteCursors = new Map() // host: pid -> {x,y} (última posición recibida)
    this.enemyGrid = new SpatialGrid(48)

    this.remote = !net.isHost && net.conns.length > 0

    // Capa de render 3D (fondo + meteoritos + explosiones) — compartida entre host y cliente.
    this.three = new ThreeLayer(this.game.canvas.parentElement, this.game.canvas, this.game)
    if (!this.game._tiltInputInstalled) {
      installTiltInput(this.game, () => this.three)
      this.game._tiltInputInstalled = true
    }
    initSound(this)
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this)

    this.scale.on('resize', this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this)
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this)
      if (this.three) { this.three.dispose(); this.three = null }
      this.busOff?.forEach((off) => off())
      if (this.epSystem) this.epSystem.clear()
      for (const g of this.generals.values()) g.destroy()
    })

    if (this.remote) { createRemote(this); return }

    this.epSystem = new EnemyProjectileSystem(this)

    populateMeteorites(this)
    const core = createStructure('core', WORLD.width / 2, WORLD.height / 2, this)
    this.core = core
    this.structures.push(core)
    this.recomputeNetwork()

    // Modo (economía) + investigación (bonos iniciales). Un resume de sesión los sobrescribe.
    gameState.minerals = Math.round(gameState.minerals * currentMode().economyMult) + this.bonuses.minerals
    if (this.bonuses.coreHpMult !== 1) {
      core.maxHp = Math.round(core.maxHp * this.bonuses.coreHpMult)
      core.hp = core.maxHp
      gameState.coreHp = core.hp
      gameState.coreHpMax = core.maxHp
    }

    const resumeSnapshot = appState.mp.role === 'solo' ? loadSoloSnapshot() : null

    this.cam.centerOn(this.core.x, this.core.y)

    this.world = {
      core: this.core,
      structures: this.structures,
      enemies: this.enemies,
      meteorites: this.meteorites,
      playerProjectiles: this.projectiles,
      bounds: WORLD,
      nearestStructure: (x, y, roleGroup) => {
        if (roleGroup) {
          const fn = ROLE_GROUPS[roleGroup]
          if (fn) {
            let best = null; let bestD = Infinity
            for (const s of this.structures) {
              if (s.dead || !fn(s)) continue
              const d = Phaser.Math.Distance.Between(x, y, s.x, s.y)
              if (d < bestD) { bestD = d; best = s }
            }
            return best || this.core
          }
        }
        return nearestStructure(this, x, y)
      },
      damageStructure: (s, dmg) => this.damageStructure(s, dmg),
      spawnEnemyMissile: (opts) => this.epSystem.spawnMissile(opts),
      fireEnemyBeam: (opts) => this.epSystem.fireBeam(opts),
      killEnemy: (enemy) => killEnemy(this, enemy),
      spawnSmallShip: (typeKey, x, y) => {
        const mult = enemyStatMult()
        const enemy = new Enemy(typeKey, x, y, this)
        enemy.id = ++this._enemySeq
        enemy.hp = Math.round(enemy.def.hp * mult.hp)
        enemy.maxHp = enemy.hp
        enemy.damage = enemy.def.damage * mult.dmg
        this.enemies.push(enemy)
      },
      enemyGrid: this.enemyGrid,
    }

    this.general = new General(this, this.core.x + 60, this.core.y, equipped('hull').tint ?? GEN_TINTS[0])
    this.general.beamSkin = true // el rayo del comandante local usa el cosmético equipado
    this.general.pid = 0
    this.general.setLabel(appState.playerName || 'Comandante')
    this.generals.set(0, this.general)

    this.selectedStructure = null
    this._pendingFocusId = null
    this.multiSel = new Set() // torretas multi-seleccionadas (shift+clic)
    this.multiSelGfx = this.add.graphics().setDepth(44)

    this.setupInput()
    initAbilities(this)
    initSpecialMeteors(this)
    initWaves(this)
    if (resumeSnapshot) restoreSoloSnapshot(this, resumeSnapshot)
    this.setSpeed(1)

    gameState.status = 'playing'

    if (net.isHost) {
      net.onData = (d, nc) => onIntent(this, d, nc)
      net.onOpen = (nc) => this.addClientGeneral(nc)
      net.onDisconnect = (nc) => this.remoteCursors.delete(nc.pid)
      for (const nc of net.conns) if (nc.open) this.addClientGeneral(nc)
    }
  }

  // Un general por cliente conectado (host-authoritative). Idempotente por pid.
  addClientGeneral(nc) {
    net.sendTo(nc.pid, { t: 'welcome', pid: nc.pid }) // el cliente filtra su propio cursor
    if (this.generals.has(nc.pid)) return
    const g = new General(this, this.core.x - 60, this.core.y, GEN_TINTS[nc.pid % GEN_TINTS.length])
    g.pid = nc.pid
    g.setLabel(nc.name || ('Aliado ' + nc.pid))
    // Mejoras ya compradas, para que un jugador que entra tarde no quede atrás.
    for (const id of gameState.generalUpgrades) {
      const u = UPGRADES.find((x) => x.id === id)
      if (u) g.applyUpgrade(u)
    }
    this.generals.set(nc.pid, g)
  }

  // ---------------------------------------------------------------- input
  touchScreenPoint(p) {
    const event = p.event
    const touch = [...(event?.changedTouches || []), ...(event?.touches || [])]
      .find((item) => item.identifier === p.identifier)
    if (!touch) return null
    const canvas = this.game.canvas
    const rect = canvas.getBoundingClientRect()
    return {
      x: (touch.clientX - rect.left) * canvas.width / rect.width,
      y: (touch.clientY - rect.top) * canvas.height / rect.height,
    }
  }

  touchWorldPoint(point) {
    const cam = this.cam
    return {
      x: cam.scrollX + cam.width / 2 + (point.x - cam.width / 2) / cam.zoom,
      y: cam.scrollY + cam.height / 2 + (point.y - cam.height / 2) / cam.zoom,
    }
  }

  // Arrastre con mouse anclado en mundo. No usa p.x - p.prevPosition.x: con el tablero inclinado
  // tiltInput calcula p.x con la cámara actual, así que al mover la cámara el delta se realimentaba
  // y la vista temblaba. El punto de pantalla se lee del evento DOM, que no depende de la cámara.
  mouseScreenPoint(p) {
    const e = p.event
    if (!e || e.clientX == null) return null
    const canvas = this.game.canvas
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * canvas.width / rect.width,
      y: (e.clientY - rect.top) * canvas.height / rect.height,
    }
  }

  beginMouseDrag(p) {
    const point = this.mouseScreenPoint(p)
    this._mouseDrag = point ? { start: point, world: this.touchWorldPoint(point) } : null
    this._dragging = false
  }

  moveMouseDrag(p) {
    if (!p.isDown || !this._mouseDrag) return
    const point = this.mouseScreenPoint(p)
    if (!point) return
    const start = this._mouseDrag.start
    if (!this._dragging && Math.hypot(point.x - start.x, point.y - start.y) <= CAMERA.dragThreshold) return
    this._dragging = true
    this.anchorTouchCamera(this._mouseDrag.world, point)
  }

  anchorTouchCamera(world, point) {
    const cam = this.cam
    cam.scrollX = world.x - cam.width / 2 - (point.x - cam.width / 2) / cam.zoom
    cam.scrollY = world.y - cam.height / 2 - (point.y - cam.height / 2) / cam.zoom
  }

  setupInput() {
    this.input.mouse?.disableContextMenu()
    this.game.canvas.style.touchAction = 'none'
    this._touchPoints = new Map()
    this._touchPinchUsed = false
    this._touchAnchor = null
    this._touchMotion = []
    this._touchInertia = null

    this.rangePreview = this.add.graphics().setDepth(5).setVisible(false)

    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasdKeys = this.input.keyboard?.addKeys('W,A,S,D')

    this.input.on('pointermove', (p) => {
      updateGhost(this, p.worldX, p.worldY)
      updateRangePreview(this, p.worldX, p.worldY)

      if (p.wasTouch) {
        const point = this.touchScreenPoint(p)
        if (!point || !this._touchPoints.has(p.id)) return
        this._touchPoints.set(p.id, point)
        if (this._touchPoints.size >= 2) {
          const [a, b] = [...this._touchPoints.values()]
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          if (this._touchPinch && this._touchPinch.dist > 0 && dist > 0) {
            const anchor = this.touchWorldPoint(this._touchPinch.midpoint)
            this.cam.setZoom(Phaser.Math.Clamp(this.cam.zoom * dist / this._touchPinch.dist, CAMERA.minZoom, CAMERA.maxZoom))
            this.anchorTouchCamera(anchor, midpoint)
          }
          this._touchPinch = { dist, midpoint }
        } else if (this._touchAnchor) {
          const start = this._touchAnchor.start
          if (this._dragging || Math.hypot(point.x - start.x, point.y - start.y) > CAMERA.dragThreshold) {
            this._dragging = true
            const oldX = this.cam.scrollX; const oldY = this.cam.scrollY
            this.anchorTouchCamera(this._touchAnchor.world, point)
            const now = performance.now()
            this._touchMotion.push({ time: now, dx: this.cam.scrollX - oldX, dy: this.cam.scrollY - oldY })
            this._touchMotion = this._touchMotion.filter((sample) => now - sample.time <= 80)
          }
        }
        return
      }

      if (!this._pinching) this.moveMouseDrag(p)
    })

    this.input.on('pointerdown', (p) => {
      if (p.wasTouch) {
        const point = this.touchScreenPoint(p)
        if (!point) return
        this._touchInertia = null
        this._touchMotion = []
        // Un dedo levantado sobre el HUD (o touchcancel) no emite pointerup: purgar los que ya no están abajo.
        const down = new Set(this.input.manager.pointers.filter((q) => q.isDown).map((q) => q.id))
        for (const id of this._touchPoints.keys()) if (!down.has(id)) this._touchPoints.delete(id)
        if (!this._touchPoints.size) this._touchPinchUsed = false
        this._touchPoints.set(p.id, point)
        if (this._touchPoints.size >= 2) {
          const [a, b] = [...this._touchPoints.values()]
          this._touchPinch = {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          }
          this._touchPinchUsed = true
          this._dragging = true
          this._touchAnchor = null
        } else {
          this._touchAnchor = { start: point, world: this.touchWorldPoint(point) }
          this._dragging = false
        }
        return
      }
      this.beginMouseDrag(p)
      if (p.rightButtonDown()) {
        this._rightDown = true
        cancelPlacement(this)
        return
      }
      this._rightDown = false
    })

    this.input.on('pointerup', (p) => {
      if (p.wasTouch) {
        this._touchPoints.delete(p.id)
        if (this._touchPinchUsed) {
          this._touchPinch = null
          this._touchMotion = []
          const remaining = this._touchPoints.values().next().value
          this._touchAnchor = remaining ? { start: remaining, world: this.touchWorldPoint(remaining) } : null
          if (!remaining) { this._touchPinchUsed = false; this._dragging = false }
          return
        }
        if (this._dragging && this._touchMotion.length > 1 && performance.now() - this._touchMotion.at(-1).time <= 80) {
          const samples = this._touchMotion
          const elapsed = samples.at(-1).time - samples[0].time
          if (elapsed > 0) {
            const dx = samples.slice(1).reduce((sum, sample) => sum + sample.dx, 0)
            const dy = samples.slice(1).reduce((sum, sample) => sum + sample.dy, 0)
            this._touchInertia = { x: dx / elapsed, y: dy / elapsed }
          }
        }
        this._touchAnchor = null
        this._touchMotion = []
      }
      // Habilidad apuntando: el clic elige el objetivo; clic derecho la cancela.
      if (gameState.abilityTargeting) {
        if (this._rightDown) cancelTargeting()
        else if (!this._dragging) handleTargetClick(this, p.worldX, p.worldY)
        this._dragging = false
        this._rightDown = false
        return
      }
      // Modo General seleccionado: clic izquierdo mueve/recolecta, derecho cancela.
      if (gameState.generalMode === 'selected') {
        if (!this._dragging && !this._rightDown) {
          const wx = p.worldX; const wy = p.worldY
          const hit = this.structures.find((s) => {
            if (s.dead) return false
            return Phaser.Math.Distance.Between(wx, wy, s.x, s.y) <= Math.max(s.radius, 12)
          })
          if (hit) {
            this.deselectGeneral()
            selectStructure(this, hit)
          } else {
            this.general.setTarget(wx, wy, this)
          }
        } else if (this._rightDown) {
          this.deselectGeneral()
        }
        this._dragging = false
        this._rightDown = false
        return
      }

      if (!this._dragging && !this._rightDown && this.placementKey) {
        tryPlace(this, p.worldX, p.worldY)
        this._dragging = false
        this._rightDown = false
        return
      }
      if (!this._dragging && !this._rightDown && !this.placementKey) {
        const wx = p.worldX; const wy = p.worldY
        // Hit-test structures
        const hit = this.structures.find((s) => {
          if (s.dead) return false
          return Phaser.Math.Distance.Between(wx, wy, s.x, s.y) <= Math.max(s.radius, 12)
        })
        if (hit) {
          // Shift+clic sobre una torreta: alterna en la multi-selección.
          if (p.event?.shiftKey && WEAPON_ROLES.includes(hit.role)) {
            if (this.multiSel.has(hit)) this.multiSel.delete(hit)
            else this.multiSel.add(hit)
            gameState.multiSelCount = this.multiSel.size
          } else {
            selectStructure(this, hit)
          }
        } else if (this._pendingFocusId) {
          // Focus-target mode: click on enemy
          const enemy = this.enemies.find((e) => {
            if (e.dead) return false
            return Phaser.Math.Distance.Between(wx, wy, e.x, e.y) <= (e.radius || 14)
          })
          if (enemy && this.selectedStructure && !this.selectedStructure.dead) {
            this.selectedStructure.focusTarget = enemy
            this.selectedStructure.fireMode = 'focus'
            selectStructure(this, this.selectedStructure)
          }
          this._pendingFocusId = null
        } else if (this.multiSel.size) {
          // Multi-selección activa: clic en un enemigo fija objetivo común a todas;
          // clic en vacío suelta la selección.
          const enemy = this.enemies.find((e) => {
            if (e.dead) return false
            return Phaser.Math.Distance.Between(wx, wy, e.x, e.y) <= (e.radius || 14)
          })
          if (enemy) {
            for (const t of this.multiSel) {
              if (t.dead) continue
              t.focusTarget = enemy
              t.fireMode = 'focus'
            }
          } else {
            this.multiSel.clear()
            gameState.multiSelCount = 0
          }
        } else {
          deselectStructure(this)
        }
      }
      this._dragging = false
      this._rightDown = false
    })

    this.input.on('wheel', (_pointer, _over, _dx, dy) => {
      const step = dy > 0 ? -CAMERA.zoomStep : CAMERA.zoomStep
      const newZoom = Phaser.Math.Clamp(this.cam.zoom + step, CAMERA.minZoom, CAMERA.maxZoom)
      const pointer = this.input.activePointer
      const wx = (pointer.x + this.cam.scrollX * this.cam.zoom) / this.cam.zoom
      const wy = (pointer.y + this.cam.scrollY * this.cam.zoom) / this.cam.zoom
      this.cam.setZoom(newZoom)
      const newWx = (pointer.x + this.cam.scrollX * newZoom) / newZoom
      const newWy = (pointer.y + this.cam.scrollY * newZoom) / newZoom
      this.cam.scrollX += (wx - newWx) * newZoom
      this.cam.scrollY += (wy - newWy) * newZoom
    })

    this.input.on('pointerupoutside', (p) => {
      if (!p.wasTouch) return
      this._touchPoints.delete(p.id)
      this._touchPinch = null
      this._touchMotion = []
      const remaining = this._touchPoints.values().next().value
      this._touchAnchor = remaining ? { start: remaining, world: this.touchWorldPoint(remaining) } : null
      if (!remaining) { this._touchPinchUsed = false; this._dragging = false }
    })

    this.input.on('pointerdown', (p) => {
      if (p.wasTouch) return
      if (this.input.pointer1?.isDown && this.input.pointer2?.isDown) {
        this._pinching = true
        this._lastPinchDist = Phaser.Math.Distance.Between(
          this.input.pointer1.x, this.input.pointer1.y,
          this.input.pointer2.x, this.input.pointer2.y,
        )
      }
    })

    this.input.on('pointermove', () => {
      if (this._touchPoints.size) return
      if (this._pinching && this.input.pointer1?.isDown && this.input.pointer2?.isDown) {
        const dist = Phaser.Math.Distance.Between(
          this.input.pointer1.x, this.input.pointer1.y,
          this.input.pointer2.x, this.input.pointer2.y,
        )
        const delta = dist - this._lastPinchDist
        const step = delta * 0.005
        this._lastPinchDist = dist
        const newZoom = Phaser.Math.Clamp(this.cam.zoom + step, CAMERA.minZoom, CAMERA.maxZoom)
        this.cam.setZoom(newZoom)
      }
    })

    this.input.on('pointerup', () => {
      if (this._touchPoints.size) return
      if (!this.input.pointer1?.isDown || !this.input.pointer2?.isDown) {
        this._pinching = false
      }
    })

    this.input.keyboard?.on('keydown-ESC', () => {
      if (gameState.abilityTargeting) cancelTargeting()
      else if (gameState.generalMode === 'selected') this.deselectGeneral()
      else cancelPlacement(this)
    })
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.core) this.cam.pan(this.core.x, this.core.y, 300, 'Sine.easeInOut')
    })

    this.busOff = [
      bus.on('build', (key) => { this.deselectGeneral(); startPlacement(this, key) }),
      bus.on('cancel', () => {
        if (gameState.abilityTargeting) cancelTargeting()
        else if (gameState.generalMode === 'selected') this.deselectGeneral()
        else cancelPlacement(this)
      }),
      bus.on('deselect', () => deselectStructure(this)),
      bus.on('selectGeneral', () => this.selectGeneral()),
      bus.on('restart', () => { clearSoloSnapshot(); this.scene.restart() }),
      bus.on('speed', (v) => { this.setSpeed(v); sfxSpeed() }),
      bus.on('demolish', ({ structureId }) => this.demolishStructure(structureId)),
      bus.on('upgrade', ({ structureId, upgradeId }) => applyUpgrade(this, structureId, upgradeId)),
      bus.on('upgradeGeneral', (upgradeId) => this.applyGeneralUpgrade(upgradeId)),
      bus.on('fireMode', ({ structureId, mode }) => setFireMode(this, structureId, mode)),
      bus.on('ability', (id) => { if (!this.remote) requestAbility(this, id) }),
      bus.on('callWave', () => { if (!this.remote) callWaveEarly(this) }),
      bus.on('gotoEvent', () => { if (!this.remote) goToGiant(this) }),
    ]
  }


  setSpeed(v) {
    this.speed = v
    gameState.speed = v
    this.tweens.timeScale = v
    this.time.timeScale = v
  }

  selectGeneral() {
    cancelPlacement(this)
    deselectStructure(this)
    gameState.generalMode = 'selected'
    if (this.general) this.general.select()
  }

  deselectGeneral() {
    gameState.generalMode = null
    if (this.general) this.general.deselect()
  }

  applyGeneralUpgrade(upgradeId) {
    const upg = UPGRADES.find((u) => u.id === upgradeId)
    if (!upg || upg.forRole !== 'general') return
    if (gameState.generalUpgrades.includes(upgradeId)) return
    if (gameState.minerals < upg.cost) return
    gameState.minerals -= upg.cost
    gameState.generalUpgrades.push(upgradeId)
    for (const g of this.generals.values()) g.applyUpgrade(upg)
    if (this.general?.alive) {
      upgradeBurst(this, this.general.x, this.general.y, upg.tint || 0x8be9fd, this.general.radius, upg.label)
      sfxUpgrade(this.general.x, this.general.y)
    }
  }

  // Lógica en systems/energyNet.js. Wrapper conservado porque Structure.js llama
  // this.scene.recomputeNetwork() al construir/destruir (con guard).
  recomputeNetwork() { recomputeNetworkSys(this) }

  // --------------------------------------------------------- host intents (7b-2)
  // ------------------------------------------------------------------ utils
  // Sincroniza y dibuja la capa Three.js tras cada update (corre aun en pausa/game over).
  render3D(time) {
    if (!this.three) return
    // worldView solo se recalcula en cam.preRender (al dibujar). Sin esto Three leía la vista del
    // frame anterior y, al desplazarse, el 3D iba un frame detrás del 2D: la imagen vibraba.
    // preRender es idempotente aquí (no hay startFollow): Phaser lo repite al dibujar con igual resultado.
    this.cam.preRender()
    this.three.syncCamera(this.cam)
    this.three.sync(this)
    this.three.render(time)
  }

  handleResize() {
    if (this.three) this.three.resize(this.scale.width, this.scale.height)
    if (this.core) {
      const vp = this.cam.getWorldPoint(0, 0)
      if (vp.x < 0 || vp.y < 0 || vp.x > WORLD.width || vp.y > WORLD.height) {
        this.cam.centerOn(this.core.x, this.core.y)
      }
    }
  }

  // ------------------------------------------------------------------ loop
  update(time, delta) {
    const d = delta * (this.speed ?? 1)

    if (this._touchInertia) {
      const step = Math.min(delta, 50)
      this.cam.scrollX += this._touchInertia.x * step
      this.cam.scrollY += this._touchInertia.y * step
      const friction = Math.exp(-step / 220)
      this._touchInertia.x *= friction
      this._touchInertia.y *= friction
      if (Math.hypot(this._touchInertia.x, this._touchInertia.y) < 0.005) this._touchInertia = null
    }

    // keyboard pan
    if (this.cursors && this.wasdKeys) {
      let kx = 0; let ky = 0
      const cursors = this.cursors
      const wasd = this.wasdKeys
      if (cursors.left.isDown || wasd.A.isDown) kx = -1
      if (cursors.right.isDown || wasd.D.isDown) kx = 1
      if (cursors.up.isDown || wasd.W.isDown) ky = -1
      if (cursors.down.isDown || wasd.S.isDown) ky = 1
      if (kx !== 0 || ky !== 0) {
        const norm = Math.hypot(kx, ky)
        this.cam.scrollX += (kx / norm) * CAMERA.keyPanSpeed * (delta / 1000)
        this.cam.scrollY += (ky / norm) * CAMERA.keyPanSpeed * (delta / 1000)
      }
    }

    // Audio: centro de cámara para espacializar SFX + música según estado de oleada
    // (intermission = transición → Transition.mp3; combate → inGame.mp3).
    const wv = this.cam.worldView
    updateSound(wv.centerX, wv.centerY, wv.width)
    setMusicState(this.wave?.state === 'intermission' ? 'transition' : 'ingame')
    // Camas de movimiento de naves: vol según nº de enemigos (pesados = radio grande).
    let lightN = 0, heavyN = 0
    for (const e of this.enemies) { if (e.dead) continue; e.radius >= 16 ? heavyN++ : lightN++ }
    updateShipBeds(lightN, heavyN)

    if (this.remote) {
      renderRemote(this, time, delta)
      return
    }

    // Host: emite snapshot ~12 Hz (incluso en game over para propagar el status al cliente).
    sendSnapshot(this, d)

    // Cursores de los clientes en la pantalla del host (mismo estilo que en cliente).
    this.cursorGfx.clear()
    for (const [pid, c] of this.remoteCursors) {
      drawPlayerCursor(this.cursorGfx, c.x, c.y, GEN_TINTS[pid % GEN_TINTS.length], time)
    }

    // Anillos de la multi-selección de torretas + línea al objetivo común.
    this.multiSelGfx.clear()
    if (this.multiSel.size) {
      for (const t of this.multiSel) {
        if (t.dead) { this.multiSel.delete(t); continue }
        this.multiSelGfx.lineStyle(2, 0x8be9fd, 0.9).strokeCircle(t.x, t.y, t.radius + 8)
        if (t.focusTarget && !t.focusTarget.dead) {
          this.multiSelGfx.lineStyle(1, 0xff5566, 0.35).lineBetween(t.x, t.y, t.focusTarget.x, t.focusTarget.y)
        }
      }
      gameState.multiSelCount = this.multiSel.size
    }

    if (gameState.status !== 'playing' || d === 0) return

    this.elapsedMs += d
    gameState.timeElapsed = Math.floor(this.elapsedMs / 1000)

    // Clear beam graphics before structures draw on them
    this.beamGraphics.clear()

    // Update all structures (building progress, mining, combat, healing spheres)
    for (const s of this.structures) {
      if (s.dead) continue
      // Parálisis EMP: la estructura no hace nada mientras dure el aturdimiento.
      if (s.stunMs > 0) {
        s.stunMs -= d
        s.container.setAlpha(s.stunMs > 0 ? 0.45 : (s.powered ? 1 : 0.35))
        if (s.stunMs > 0) continue
      }
      s.update(d, this.world, time)
    }

    updateWaves(this, d)
    updateEnemies(this, d)
    for (const g of this.generals.values()) g.update(d / 1000, this.world)
    updateAbilities(this, d)
    updateSpecialMeteors(this, d)
    gameState.general.alive = this.general.alive
    gameState.general.hp = Math.ceil(this.general.hp)
    gameState.general.respawnIn = Math.ceil(Math.max(0, this.general.respawn) / 1000)
    gameState.general.damage = this.general.damage
    gameState.general.atkRange = this.general.atkRange
    gameState.general.collectRate = Math.round(this.general.collectRate * 10) / 10
    updateProjectiles(this, d)
    this.epSystem.update(d / 1000) // espera segundos (rayos y misiles enemigos)
    updateHealers(this, d)
    drawFx(this, d)

    this._saveAccum = (this._saveAccum || 0) + d
    if (this._saveAccum >= 3000) {
      this._saveAccum = 0
      saveSoloSnapshot(this)
    }
  }

  damageStructure(s, dmg) {
    s.damage(dmg)
  }

  // Demoler una estructura: reembolsa el 50% del coste y la elimina (s.destroy hace splice +
  // recomputeNetwork + limpia targets). El núcleo no se puede demoler. Solo host/single-player.
  demolishStructure(id) {
    if (this.remote) return
    const s = this.structures.find((x) => x.id === id)
    if (!s || s.dead || s.isCore) return
    const refund = Math.round((s.def.cost || 0) * 0.5)
    gameState.minerals = Math.min(gameState.mineralsCap, gameState.minerals + refund)
    deselectStructure(this)
    s.destroy()
  }

  destroyStructure(s) {
    // handled by s.destroy() called from s.damage()
  }

  // -------------------------------------------------------------------- fx
  // Lógica en render/fx.js. Wrapper conservado porque Structure.js / General.js /
  // EnemyProjectiles.js llaman this.scene.explosion().
  explosion(x, y, color, radius, kind) { explosionFx(this, x, y, color, radius, kind) }

  // ----------------------------------------------------------------- states
  gameOver() {
    if (gameState.status !== 'playing') return
    gameState.status = 'gameover'
    clearSoloSnapshot()
    this.grantRewards(false)
    if (this.core) this.explosion(this.core.x, this.core.y, 0xff5566, FX.coreExplosionRadius)
    this.cameras.main.shake(300, 0.002)
    cancelPlacement(this)
  }

  victory() {
    if (gameState.status !== 'playing') return
    gameState.status = 'victory'
    clearSoloSnapshot()
    this.grantRewards(true)
    cancelPlacement(this)
  }

  // XP / Chatarra al terminar (perfil local). El cliente remoto no llega aquí.
  grantRewards(victory) {
    gameState.abilityTargeting = null
    gameState.runRewards = grantRunRewards({
      mode: appState.mode,
      sector: this.sector?.n || 1,
      wave: gameState.wave,
      waveTotal: gameState.waveTotal,
      victory,
      kills: gameState.kills,
      sectorReward: this.sector?.reward || 0,
    })
    gameState.runRewards.newCosmetics = claimUnlocks().map((c) => c.name)
    if (gameState.runRewards.levelUp || gameState.runRewards.newCosmetics.length) sfxLevelUp()
  }

  // -------------------------------------------------------------- nebulae
}
