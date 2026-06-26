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
import { SpatialGrid } from '../enemies/SpatialGrid.js'
import { General } from '../General.js'
import { net } from '../net.js'
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
    this.epSystem = new EnemyProjectileSystem(this)

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

    this.remote = !net.isHost && !!net.conn
    if (this.remote) { createRemote(this); return }

    populateMeteorites(this)
    const core = createStructure('core', WORLD.width / 2, WORLD.height / 2, this)
    this.core = core
    this.structures.push(core)
    this.recomputeNetwork()

    this.cam.centerOn(this.core.x, this.core.y)

    // Capa de render 3D (fondo + meteoritos + estructuras + naves + explosiones).
    this.three = new ThreeLayer(this.game.canvas.parentElement, this.game.canvas)
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this)

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

    this.general = new General(this, this.core.x + 60, this.core.y)

    this.selectedStructure = null
    this._pendingFocusId = null

    this.setupInput()
    initWaves(this)
    this.setSpeed(1)

    gameState.status = 'playing'

    if (net.isHost) {
      net.onData = (d) => onIntent(this, d)
      this.clientGeneral = new General(this, this.core.x - 60, this.core.y)
      this.cgActive = false
      this.clientGeneral.sprite.setVisible(false)
      const activate = () => { this.cgActive = true; this.clientGeneral.sprite.setVisible(true) }
      net.onOpen = activate
      if (net.conn && net.conn.open) activate()
    }

    this.scale.on('resize', this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this)
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this)
      if (this.three) { this.three.dispose(); this.three = null }
      this.busOff?.forEach((off) => off())
      if (this.epSystem) this.epSystem.clear()
      if (this.general) { this.general.sprite.destroy(); this.general.bar.destroy() }
      if (this.clientGeneral) { this.clientGeneral.sprite.destroy(); this.clientGeneral.bar.destroy() }
    })
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
          this.general.moveTo(wx, wy)
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

    this.input.keyboard?.on('keydown-ESC', () => cancelPlacement(this))
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.core) this.cam.pan(this.core.x, this.core.y, 300, 'Sine.inOut')
    })

    this.busOff = [
      bus.on('build', (key) => startPlacement(this, key)),
      bus.on('cancel', () => cancelPlacement(this)),
      bus.on('restart', () => this.scene.restart()),
      bus.on('speed', (v) => this.setSpeed(v)),
      bus.on('upgrade', ({ structureId, upgradeId }) => applyUpgrade(this, structureId, upgradeId)),
      bus.on('fireMode', ({ structureId, mode }) => setFireMode(this, structureId, mode)),
    ]
  }

  setSpeed(v) {
    this.speed = v
    gameState.speed = v
    this.tweens.timeScale = v
    this.time.timeScale = v
  }

  // -------------------------------------------------------------- network
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
    this.general.update(d / 1000, this.world)
    if (this.cgActive) this.clientGeneral.update(d / 1000, this.world)
    gameState.general.alive = this.general.alive
    gameState.general.hp = Math.ceil(this.general.hp)
    gameState.general.respawnIn = Math.ceil(Math.max(0, this.general.respawn) / 1000)
    updateProjectiles(this, d)
    this.epSystem.update(d / 1000) // espera segundos (rayos y misiles enemigos)
    updateHealers(this, d)
    drawFx(this, d)
  }

  damageStructure(s, dmg) {
    s.damage(dmg)
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
    this.cameras.main.shake(400, 0.012)
    cancelPlacement(this)
  }

  victory() {
    if (gameState.status !== 'playing') return
    gameState.status = 'victory'
    cancelPlacement(this)
  }

  // -------------------------------------------------------------- nebulae
}
