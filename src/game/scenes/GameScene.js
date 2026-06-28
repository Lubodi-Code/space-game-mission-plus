import Phaser from 'phaser'
import { gameState, resetGameState } from '../gameState.js'
import { bus } from '../bus.js'
import {
  FX,
  WORLD,
  CAMERA,
} from '../balance.js'
// (la mayoría de los subsistemas viven en systems/ · render/ · net/)
import { ROLE_GROUPS } from '../enemies/EnemyType.js'
import { EnemyProjectileSystem } from '../enemies/EnemyProjectiles.js'
import { createStructure } from '../structures/StructureRegistry.js'
import { UPGRADES } from '../structures/upgrades.js'
import { SpatialGrid } from '../enemies/SpatialGrid.js'
import { General, GEN_TINTS } from '../General.js'
import { net } from '../net.js'
import { appState } from '../appState.js'
import { populateMeteorites } from '../systems/worldgen.js'
import { initWaves, updateWaves } from '../systems/waves.js'
import { recomputeNetwork as recomputeNetworkSys } from '../systems/energyNet.js'
import { ThreeLayer } from '../three/ThreeLayer.js'
import { explosion as explosionFx, drawFx } from '../render/fx.js'
import { updateProjectiles } from '../systems/projectiles.js'
import { updateHealers } from '../systems/healers.js'
import { updateEnemies, nearestStructure, killEnemy } from '../systems/enemies.js'
import { startPlacement, cancelPlacement, tryPlace, updateGhost, updateRangePreview } from '../systems/placement.js'
import { selectStructure, deselectStructure, applyUpgrade, setFireMode } from '../systems/selection.js'
import { onIntent, createRemote, renderRemote, sendSnapshot } from '../net/sync.js'
import { initSound, updateSound, setMusicState, updateShipBeds, sfxSpeed } from '../sound.js'


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
    this.netHost = net.isHost

    this.cam = this.cameras.main
    this.cam.setBounds(0, 0, WORLD.width, WORLD.height)
    this.cam.setZoom(CAMERA.startZoom)

    this.nebulae = [] // (el fondo lo dibuja ThreeLayer; ref vacía para minimap.ignore)

    this.linkGraphics = this.add.graphics().setDepth(4)
    this.beamGraphics = this.add.graphics().setDepth(6)
    this.fxGraphics = this.add.graphics().setDepth(30).setBlendMode(Phaser.BlendModes.ADD)
    this.ghost = this.add.graphics().setDepth(40).setVisible(false)
    this.enemyBars = this.add.graphics().setDepth(16)
    this.enemyGrid = new SpatialGrid(48)

    this.remote = !net.isHost && net.conns.length > 0

    // Capa de render 3D (fondo + meteoritos + explosiones) — compartida entre host y cliente.
    this.three = new ThreeLayer(this.game.canvas.parentElement, this.game.canvas)
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
      enemyGrid: this.enemyGrid,
    }

    this.general = new General(this, this.core.x + 60, this.core.y, GEN_TINTS[0])
    this.general.pid = 0
    this.general.setLabel(appState.playerName || 'Comandante')
    this.generals.set(0, this.general)

    this.selectedStructure = null
    this._pendingFocusId = null

    this.setupInput()
    initWaves(this)
    this.setSpeed(1)

    gameState.status = 'playing'

    if (net.isHost) {
      net.onData = (d, nc) => onIntent(this, d, nc)
      net.onOpen = (nc) => this.addClientGeneral(nc)
      for (const nc of net.conns) if (nc.open) this.addClientGeneral(nc)
    }
  }

  // Un general por cliente conectado (host-authoritative). Idempotente por pid.
  addClientGeneral(nc) {
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
  setupInput() {
    this.input.mouse?.disableContextMenu()

    this.rangePreview = this.add.graphics().setDepth(5).setVisible(false)

    this.cursors = this.input.keyboard?.createCursorKeys()
    this.wasdKeys = this.input.keyboard?.addKeys('W,A,S,D')

    this.input.on('pointermove', (p) => {
      updateGhost(this, p.worldX, p.worldY)
      updateRangePreview(this, p.worldX, p.worldY)

      if (p.isDown && !this._pinching) {
        const dx = p.x - p.prevPosition.x
        const dy = p.y - p.prevPosition.y
        const dist = Math.hypot(p.x - this._downX, p.y - this._downY)
        if (dist > CAMERA.dragThreshold) {
          this._dragging = true
          this.cam.scrollX -= dx / this.cam.zoom
          this.cam.scrollY -= dy / this.cam.zoom
        }
      }
    })

    this.input.on('pointerdown', (p) => {
      this._downX = p.x
      this._downY = p.y
      this._dragging = false
      if (p.rightButtonDown()) {
        this._rightDown = true
        cancelPlacement(this)
        return
      }
      this._rightDown = false
    })

    this.input.on('pointerup', (p) => {
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
          selectStructure(this, hit)
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

    this.input.on('pointerdown', (p) => {
      if (this.input.pointer1?.isDown && this.input.pointer2?.isDown) {
        this._pinching = true
        this._lastPinchDist = Phaser.Math.Distance.Between(
          this.input.pointer1.x, this.input.pointer1.y,
          this.input.pointer2.x, this.input.pointer2.y,
        )
      }
    })

    this.input.on('pointermove', () => {
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
      if (!this.input.pointer1?.isDown || !this.input.pointer2?.isDown) {
        this._pinching = false
      }
    })

    this.input.keyboard?.on('keydown-ESC', () => {
      if (gameState.generalMode === 'selected') this.deselectGeneral()
      else cancelPlacement(this)
    })
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.core) this.cam.pan(this.core.x, this.core.y, 300, 'Sine.inOut')
    })

    this.busOff = [
      bus.on('build', (key) => { this.deselectGeneral(); startPlacement(this, key) }),
      bus.on('cancel', () => {
        if (gameState.generalMode === 'selected') this.deselectGeneral()
        else cancelPlacement(this)
      }),
      bus.on('selectGeneral', () => this.selectGeneral()),
      bus.on('restart', () => this.scene.restart()),
      bus.on('speed', (v) => { this.setSpeed(v); sfxSpeed() }),
      bus.on('demolish', ({ structureId }) => this.demolishStructure(structureId)),
      bus.on('upgrade', ({ structureId, upgradeId }) => applyUpgrade(this, structureId, upgradeId)),
      bus.on('upgradeGeneral', (upgradeId) => this.applyGeneralUpgrade(upgradeId)),
      bus.on('fireMode', ({ structureId, mode }) => setFireMode(this, structureId, mode)),
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
  }

  // Lógica en systems/energyNet.js. Wrapper conservado porque Structure.js llama
  // this.scene.recomputeNetwork() al construir/destruir (con guard).
  recomputeNetwork() { recomputeNetworkSys(this) }

  // --------------------------------------------------------- host intents (7b-2)
  // ------------------------------------------------------------------ utils
  // Sincroniza y dibuja la capa Three.js tras cada update (corre aun en pausa/game over).
  render3D(time) {
    if (!this.three) return
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

    if (gameState.status !== 'playing' || d === 0) return

    this.elapsedMs += d
    gameState.timeElapsed = Math.floor(this.elapsedMs / 1000)

    // Clear beam graphics before structures draw on them
    this.beamGraphics.clear()

    // Update all structures (building progress, mining, combat, healing spheres)
    for (const s of this.structures) {
      if (!s.dead) s.update(d, this.world, time)
    }

    updateWaves(this, d)
    updateEnemies(this, d)
    for (const g of this.generals.values()) g.update(d / 1000, this.world)
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
  explosion(x, y, color, radius) { explosionFx(this, x, y, color, radius) }

  // ----------------------------------------------------------------- states
  gameOver() {
    if (gameState.status !== 'playing') return
    gameState.status = 'gameover'
    if (this.core) this.explosion(this.core.x, this.core.y, 0xff5566, FX.coreExplosionRadius)
    this.cameras.main.shake(300, 0.004)
    cancelPlacement(this)
  }

  victory() {
    if (gameState.status !== 'playing') return
    gameState.status = 'victory'
    cancelPlacement(this)
  }

  // -------------------------------------------------------------- nebulae
}
