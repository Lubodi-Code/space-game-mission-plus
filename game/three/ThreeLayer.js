import * as THREE from 'three'
import { createCommanderShip } from './shipModel.js'
import { createEnemyInstances } from './enemyInstances.js'
import { createSectorBackdrop } from './sectorBackdrop.js'
import { createStructureModel } from './structureModels.js'
import { createExplosion, createMissileModel } from './fxModels.js'
import { createMeteorModel, updateMeteorMaterials, disposeMeteorModels } from './meteorModels.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { UPGRADES_BY_ID } from '~/game/structures/upgrades.js'
import { nexusColor, equipped } from '~/game/meta/cosmetics.js'
import { appState } from '~/game/appState.js'
import { WORLD } from '~/game/balance.js'
import { IS_TOUCH, LOW_GFX, RENDER_SCALE } from '~/game/quality.js'
import { REGISTRY } from '~/game/enemies/EnemyType.js'
import { updateTiltCamera } from './tilt.js'

// Capa de render 3D (Three.js) que vive detrás del canvas invisible de Phaser.
// Modo actual: FONDO 3D + METEORITOS 3D + explosiones. Dibuja el fondo espacial (estrellas con
// twinkle + nebulosas con parallax), los meteoritos (OBJ original y variantes en meteorModels.js/
// sync) y las explosiones. El resto del gameplay (estructuras/enemigos), el selector, los enlaces,
// las barras y el HUD los dibuja Phaser en 2D encima. _makeStructure/_makeEnemy quedan disponibles
// para reactivar el 3D completo paso a paso cuando se resuelva el compositing 2D/3D.

const ASSET = {
  meteor3D: {
    obj: 'assets/3D/Meteorito/base.obj',
    diffuse: 'assets/3D/Meteorito/texture_diffuse.png',
    normal: 'assets/3D/Meteorito/texture_normal.png',
    roughness: 'assets/3D/Meteorito/texture_roughness.png',
  },
  ships: {
    enemy_grunt: 'assets/ships/ship_grunt.svg',
    enemy_runner: 'assets/ships/ship_runner.svg',
    enemy_brute: 'assets/ships/ship_brute.svg',
    enemy_saboteur: 'assets/ships/ship_saboteur.svg',
    enemy_skirmisher: 'assets/ships/ship_skirmisher.svg',
    enemy_artillery: 'assets/ships/ship_artillery.svg',
    enemy_mothership: 'assets/ships/ship_mothership.svg',
    enemy_kamikaze: 'assets/ships/ship_kamikaze.svg',
    enemy_warden: 'assets/ships/ship_warden.svg',
    enemy_leech: 'assets/ships/ship_leech.svg',
    enemy_bomber: 'assets/ships/ship_bomber.svg',
  },
}

// --- texturas procedurales (glow radial suave para halos neón) ---
function radialTexture(stops) {
  const s = 128
  const c = document.createElement('canvas'); c.width = c.height = s
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  for (const [off, col] of stops) g.addColorStop(off, col)
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Máscara radial en escala de grises: blanco en el centro, negro en los bordes.
// Se usa como alphaMap para que los planos de nebulosa nunca muestren sus esquinas cuadradas.
function radialAlphaTexture() {
  const s = 256
  const c = document.createElement('canvas'); c.width = c.height = s
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.85, 'rgba(255,255,255,0.2)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

// Nube de nebulosa 100% procedural (blobs radiales superpuestos, escala de grises usada
// como .map + alphaMap y tintada por el material) — reemplaza las texturas PNG externas.
function nebulaCloudTexture() {
  const s = 512
  const c = document.createElement('canvas'); c.width = c.height = s
  const ctx = c.getContext('2d')
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, s, s)
  const blobs = 10
  for (let i = 0; i < blobs; i++) {
    const cx = s * (0.2 + Math.random() * 0.6)
    const cy = s * (0.2 + Math.random() * 0.6)
    const r = s * (0.14 + Math.random() * 0.22)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    const a = 0.12 + Math.random() * 0.12
    g.addColorStop(0, `rgba(255,255,255,${a})`)
    g.addColorStop(0.6, `rgba(255,255,255,${a * 0.4})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

function darken(hex, f = 0.22) {
  const c = new THREE.Color(hex)
  return new THREE.Color(c.r * f, c.g * f, c.b * f + 0.02)
}

export class ThreeLayer {
  constructor(parent, phaserCanvas, game) {
    this.parent = parent
    // GameScene debe pasar `this.game` como tercer argumento para dibujar tras Phaser.
    this.game = game
    this.pendingRender = false
    this.tickPrev = performance.now()
    this.viewCenter = { x: WORLD.width / 2, y: WORLD.height / 2 }

    const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH && RENDER_SCALE < 2, alpha: false, powerPreference: 'high-performance' })
    // En móvil renderizar a 1x: el DPR 2-3x de los celulares multiplica los píxeles x4-9 y hunde los FPS.
    // resize() usa el ancho físico de Phaser y el alto físico visible del contenedor.
    renderer.setPixelRatio(1)
    renderer.autoClear = false
    renderer.setClearColor(0x010104, 1)
    const cv = renderer.domElement
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none'
    parent.insertBefore(cv, parent.firstChild)
    // Canvas de Phaser (transparente) ENCIMA de Three: dibuja la capa 2D del tablero y recibe el
    // input. Antes se subía cada frame como textura a un quad inclinado; con cámara ortográfica ese
    // quad coincidía con el canvas comprimido por CSS, así que la copia (cara en GPUs móviles) sobraba.
    // El HUD de Vue debe tener un z-index mayor para seguir recibiendo clics por encima del juego.
    if (phaserCanvas) {
      phaserCanvas.style.position = 'absolute'
      phaserCanvas.style.zIndex = '1'
      phaserCanvas.style.background = 'transparent'
      phaserCanvas.style.width = '100%'
      phaserCanvas.style.height = '100%'
    }
    this.renderer = renderer

    // glow compartido (blanco para tintar) y partícula de explosión
    this.glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']])
    this.sparkTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']])

    this._textures = {}
    this._loader = new THREE.TextureLoader()

    this._buildGameScene()
    this._buildBackground()

    this.meshes = new Map()   // objeto de juego -> { root, ... }
    this.meteors = new Map()  // meteorito de juego -> { root, model, spin, axis, dying, dieT }
    this.explosions = []
    this.nexus = null         // núcleo 3D (se crea en sync cuando existe el core)
    this._loadMeteor()

    this.resize(phaserCanvas?.width || Math.round((parent.clientWidth || window.innerWidth) * RENDER_SCALE))
    if (game) game.events.on('postrender', this._onPostRender, this)
  }

  tex(url) {
    if (!this._textures[url]) {
      const t = this._loader.load(url)
      t.colorSpace = THREE.SRGBColorSpace
      this._textures[url] = t
    }
    return this._textures[url]
  }

  // ----------------------------------------------------------- escena de juego
  _buildGameScene() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, -2000, 2000)
    this.camera.position.set(0, 0, 600)

    // Iluminación más suave para evitar siluetas duras y planos sobre-iluminados.
    // Ambient bajo + hemisférico como relleno difuso, luz direccional moderada y un rim sutil.
    this.scene.add(new THREE.AmbientLight(0x30384a, 0.22))
    const hemi = new THREE.HemisphereLight(0x4a5a80, 0x080a12, 0.3)
    this.scene.add(hemi)
    const key = new THREE.DirectionalLight(0xdfe9ff, 1.0)
    key.position.set(-0.5, -0.8, 1)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x66aaff, 0.45)
    rim.position.set(0.6, 0.5, 0.4)
    this.scene.add(rim)
    // Resplandor suave del núcleo sobre los meteoritos cercanos.
    const coreGlow = new THREE.PointLight(0x4488ff, 0.7, 700)
    coreGlow.position.set(0, 0, 100)
    this.scene.add(coreGlow)
  }

  // ------------------------------------------------------------- fondo parallax
  _buildBackground() {
    this.bgScene = new THREE.Scene()
    this.bgCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000)
    this.bgCamera.position.set(0, 0, 600)

    this.bgGroups = []

    // Fondo animado propio del sector (shader). Va detrás de todo lo demás.
    this.backdrop = createSectorBackdrop(appState.sector || 1, LOW_GFX)
    this.bgScene.add(this.backdrop.mesh)

    // Fondo: nube procedural (canvas, sin PNG externo), oscura y muy tenue — solo textura,
    // el negro real lo aporta el clearColor del renderer.
    this.nebulaAlpha = radialAlphaTexture()
    const cloudTex = nebulaCloudTexture()
    const z = -1400
    const w = Math.abs(z) * 6 // suficiente para cubrir el frustum incluso al paneo
    const mat = new THREE.MeshBasicMaterial({
      map: cloudTex, alphaMap: this.nebulaAlpha, transparent: true, opacity: 0.16, color: 0x2a3550,
      blending: THREE.NormalBlending, depthWrite: false, depthTest: false,
    })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.62), mat)
    plane.position.set(0, 0, z)
    plane.userData.factor = 0.04
    plane.userData.drift = 0 // No rota
    this.bgScene.add(plane)
    this.bgGroups.push(plane)

    // Banda galáctica tenue, diagonal, procedural
    const galZ = -900
    const galW = Math.abs(galZ) * 8
    const galMat = new THREE.MeshBasicMaterial({
      map: cloudTex, alphaMap: this.nebulaAlpha, transparent: true, opacity: 0.11, color: 0x384870,
      blending: THREE.NormalBlending, depthWrite: false, depthTest: false,
    })
    const galaxy = new THREE.Mesh(new THREE.PlaneGeometry(galW * 4, galW), galMat)
    galaxy.position.set(0, 0, galZ)
    galaxy.rotation.z = -0.5 // Diagonal
    galaxy.userData.factor = 0.02
    galaxy.userData.drift = 0.00008 // Rotación muy lenta
    this.bgScene.add(galaxy)
    this.bgGroups.push(galaxy)

    // Nebulosas de color a distintas profundidades — mucho más oscuras/tenues que antes.
    // En móvil una sola nebulosa de color: cada plano es un fullscreen quad con blending (caro en fill-rate).
    // Más capas a distintas profundidades con factores de parallax escalonados (sensación 3D)
    // + capas de niebla cercanas (factor alto = se mueven más rápido que el fondo).
    const nebulaConfigs = LOW_GFX ? [
      { z: -1200, color: 0x342050, opacity: 0.10, factor: 0.07, scale: 1.2, drift: 0.00012 },
      { z: -520, color: 0x223652, opacity: 0.07, factor: 0.20, scale: 2.2, drift: -0.00003 },
    ] : [
      { z: -1200, color: 0x342050, opacity: 0.10, factor: 0.07, scale: 1.2, drift: 0.00012 },
      { z: -1500, color: 0x102838, opacity: 0.09, factor: 0.09, scale: 1.5, drift: 0.00006 },
      { z: -1350, color: 0x3a2018, opacity: 0.05, factor: 0.06, scale: 0.9, drift: -0.00009 },
      { z: -1800, color: 0x241a3a, opacity: 0.08, factor: 0.03, scale: 1.6, drift: 0.00005 },  // capa profunda
      { z: -700, color: 0x1a2a4a, opacity: 0.10, factor: 0.14, scale: 1.8, drift: 0.00004 },   // niebla media
      { z: -520, color: 0x223652, opacity: 0.08, factor: 0.20, scale: 2.2, drift: -0.00003 },  // niebla frontal
    ]
    for (const cfg of nebulaConfigs) {
      const nMat = new THREE.MeshBasicMaterial({
        map: cloudTex, alphaMap: this.nebulaAlpha, transparent: true, opacity: cfg.opacity, color: cfg.color,
        blending: THREE.NormalBlending, depthWrite: false, depthTest: false,
      })
      const nPlane = new THREE.Mesh(new THREE.PlaneGeometry(w * cfg.scale, w * cfg.scale * 0.62), nMat)
      const nx = (Math.random() - 0.5) * 800
      const ny = (Math.random() - 0.5) * 600
      nPlane.position.set(nx, ny, cfg.z)
      nPlane.userData.factor = cfg.factor
      nPlane.userData.drift = cfg.drift
      nPlane.userData.bx = nx; nPlane.userData.by = ny
      this.bgScene.add(nPlane)
      this.bgGroups.push(nPlane)
    }

    // Estrellas titilantes (Points con shader de twinkle).
    const N = LOW_GFX ? 1500 : 2400
    const pos = new Float32Array(N * 3)
    const phase = new Float32Array(N)
    const size = new Float32Array(N)
    const col = new Float32Array(N * 3)
    const tint = new THREE.Color()
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 5760
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3840
      pos[i * 3 + 2] = -200 - Math.random() * 2560
      phase[i] = Math.random() * Math.PI * 2
      size[i] = 2 + Math.random() * Math.random() * 7
      // 80% frías (azules), 20% cálidas (ámbar/rojizas) para un cielo más natural, algo más tenue
      const h = Math.random() < 0.8 ? 0.55 + Math.random() * 0.12 : 0.02 + Math.random() * 0.08
      tint.setHSL(h, 0.5 + Math.random() * 0.3, 0.55 + Math.random() * 0.25)
      col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    this.starUniforms = { uTime: { value: 0 } }
    const starMat = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aPhase; attribute float aSize; attribute vec3 aColor;
        uniform float uTime; varying float vTw; varying vec3 vCol;
        void main(){
          vCol = aColor;
          vTw = 0.35 + 0.65 * pow(0.5 + 0.5*sin(uTime*1.8 + aPhase), 2.0);
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * ${RENDER_SCALE.toFixed(2)} * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vTw; varying vec3 vCol;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float d = length(c);
          if(d>0.5) discard;
          float core = smoothstep(0.5,0.0,d);
          float a = core * vTw;
          gl_FragColor = vec4(vCol * (0.6 + 0.8*vTw), a);
        }`,
    })
    this.stars = new THREE.Points(geo, starMat)
    this.stars.userData.factor = 0.12
    this.bgScene.add(this.stars)

    // Galaxias lejanas (sprites pequeños eliptales)
    this.galaxies = []
    const galCount = LOW_GFX ? 3 : 6
    for (let i = 0; i < galCount; i++) {
      const gMat = new THREE.SpriteMaterial({
        map: this.glowTex, color: 0x6a7690, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
      const sprite = new THREE.Sprite(gMat)
      sprite.position.set(
        (Math.random() - 0.5) * 7000,
        (Math.random() - 0.5) * 5000,
        -1800 - Math.random() * 400
      )
      sprite.scale.set(60 + Math.random() * 30, 22 + Math.random() * 12, 1)
      sprite.rotation.z = Math.random() * Math.PI * 2
      this.bgScene.add(sprite)
      this.galaxies.push(sprite)
    }

    // Polvo cercano (puntos grandes tenues para sensación de velocidad)
    const dustN = LOW_GFX ? 180 : 300
    const dustPos = new Float32Array(dustN * 3)
    const dustSize = new Float32Array(dustN)
    for (let i = 0; i < dustN; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 7000
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 5000
      dustPos[i * 3 + 2] = -100 - Math.random() * 300
      dustSize[i] = 12 + Math.random() * 8
    }
    const dustGeo = new THREE.BufferGeometry()
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
    dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustSize, 1))
    const dustMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * ${RENDER_SCALE.toFixed(2)} * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if(d>0.5) discard; float a = smoothstep(0.5,0.2,d) * 0.04; gl_FragColor = vec4(1,1,1,a); }`,
    })
    this.dust = new THREE.Points(dustGeo, dustMat)
    this.dust.userData.factor = 0.25
    this.bgScene.add(this.dust)
    this.bgGroups.push(this.dust)

    // Planeta procedural lejano: esfera pintada en canvas (bandas + terminador) + halo atmosférico.
    const planetTex = (() => {
      const s = 512
      const c = document.createElement('canvas'); c.width = c.height = s
      const ctx = c.getContext('2d')
      // base esférica iluminada desde arriba-izquierda
      const g1 = ctx.createRadialGradient(s * 0.38, s * 0.36, s * 0.05, s * 0.5, s * 0.5, s * 0.5)
      g1.addColorStop(0, '#3d4c78')
      g1.addColorStop(0.45, '#22304f')
      g1.addColorStop(0.8, '#0f1428')
      g1.addColorStop(1, '#050712')
      ctx.fillStyle = g1
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); ctx.fill()
      // bandas horizontales sutiles
      ctx.save()
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); ctx.clip()
      ctx.globalAlpha = 0.14
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i % 2 ? '#8ea8e0' : '#26355e'
        const y0 = s * (0.12 + i * 0.12) + Math.sin(i * 2.7) * 10
        ctx.fillRect(0, y0, s, s * 0.05 + Math.sin(i * 1.3) * 8)
      }
      ctx.restore()
      // terminador: sombra dura del lado derecho
      const g2 = ctx.createRadialGradient(s * 0.85, s * 0.6, s * 0.1, s * 0.6, s * 0.55, s * 0.75)
      g2.addColorStop(0, 'rgba(0,0,4,0.75)')
      g2.addColorStop(0.5, 'rgba(0,0,4,0.25)')
      g2.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save()
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); ctx.clip()
      ctx.fillStyle = g2; ctx.fillRect(0, 0, s, s)
      ctx.restore()
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const planet = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      new THREE.MeshBasicMaterial({ map: planetTex, transparent: true, depthWrite: false, depthTest: false }),
    )
    planet.position.set(-900, 520, -1000)
    planet.userData.factor = 0.05
    planet.userData.drift = 0.00002
    planet.userData.bx = -900; planet.userData.by = 520
    this.bgScene.add(planet)
    this.bgGroups.push(planet)
    // halo atmosférico
    const atmo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0x3a4f88, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    atmo.scale.set(760, 760, 1)
    atmo.position.copy(planet.position); atmo.position.z -= 1
    atmo.userData.factor = 0.05
    atmo.userData.drift = 0
    atmo.userData.bx = -900; atmo.userData.by = 520
    this.bgScene.add(atmo)
    this.bgGroups.push(atmo)
    // El planeta azul es del sector 1; los demás traen su propio elemento en el backdrop.
    planet.visible = atmo.visible = false // cada sector trae su pintura (sectorBackdrop.js)

    // Sistema de estrellas fugaces (timer en render)
    this.shootingStars = []
    this.shootingStarTimer = 0
    this.shootingStarNext = 6000 + Math.random() * 8000 // 6-14s

    // Viñeta oscura (mantiene el centro de juego claro y bordes oscuros).
    // Comienza antes y termina en negro sólido para ocultar cualquier borde cuadrado residual.
    const vig = radialTexture([
      [0.0, 'rgba(0,0,0,0)'],
      [0.35, 'rgba(2,4,10,0.0)'],
      [0.75, 'rgba(1,2,6,0.75)'],
      [1.0, 'rgba(0,0,0,1.0)'],
    ])
    const vmat = new THREE.MeshBasicMaterial({ map: vig, transparent: true, depthWrite: false, depthTest: false })
    // El plano se hace mucho mayor que el frustum para cubrir siempre los bordes,
    // ya que con la cámara en perspectiva un 2x2 quedaba como un pequeño cuadrado central.
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), vmat)
    this.vignette.position.z = -50
    this.bgScene.add(this.vignette)
  }

  // --------------------------------------------------------------- sincronizar
  syncCamera(cam) {
    const wv = cam.worldView
    // El shake de Phaser solo desplaza su propia matriz (no worldView), así que la capa Three
    // se quedaba quieta y las estructuras 2D parecían vibrar sobre un fondo fijo. Aplicamos el
    // mismo offset (_offsetX/Y ya incluye *zoom) para que ambas capas tiemblen juntas.
    const sk = cam.shakeEffect
    const ox = sk && sk.isRunning ? sk._offsetX : 0
    const oy = sk && sk.isRunning ? sk._offsetY : 0
    const view = { x: wv.x - ox, y: wv.y - oy, width: wv.width, height: wv.height }
    const canvas = this.renderer.domElement
    updateTiltCamera(this.camera, view, { w: canvas.width, h: canvas.height })
    this.viewCenter.x = wv.x + wv.width / 2
    this.viewCenter.y = wv.y + wv.height / 2
  }

  // Modo "fondo 3D + meteoritos 3D + explosiones": Three solo sincroniza meteoritos (estructuras/
  // enemigos los dibuja Phaser en 2D encima). Reconcilia mallas con scene.meteorites: crea una malla
  // por meteorito vivo y la encoge/elimina cuando se agota (depleted) o su container muere.
  sync(scene) {
    this._syncNexus(scene)
    this._syncGenerals(scene)
    this._syncStructures(scene)
    this._syncEnemies(scene)
    this._syncMissiles(scene)
    if (!this.meteorGeo || !scene?.meteorites) return
    for (const m of scene.meteorites) {
      let e = this.meteors.get(m)
      // El container muere al agotarse (tween de Collector) o al quitarlo el cliente remoto.
      const dead = m.depleted || !m.container || m.container.scene == null
      // El snapshot remoto no incluye variant; sus meteoritos normales usan rock.
      const variant = m.special === 'giant' ? 'giant' : m.special === 'explosive' ? 'explosive' : scene.remote ? 'rock' : m.variant || 'rock'
      if (e && !dead && (e.variant !== variant || e.radius !== m.radius)) {
        this.scene.remove(e.root)
        e.model.userData.dispose()
        e.halo.material.dispose()
        this.meteors.delete(m)
        e = null
      }
      if (!e) {
        if (dead) continue
        const root = new THREE.Group()
        root.position.set(m.x, m.y, 0)
        const model = createMeteorModel(variant, m.radius, LOW_GFX, this.meteorBase)
        model.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28)
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTex, color: 0x49e07a, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, alphaTest: 0.01,
        }))
        halo.scale.set(m.radius * 5.5, m.radius * 5.5, 1)
        halo.position.z = -2
        root.add(halo, model)
        this.scene.add(root)
        e = {
          root, model, halo, variant, radius: m.radius, dying: false, dieT: 0,
          spin: (Math.random() - 0.5) * 0.6,
          axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        }
        this.meteors.set(m, e)
      }
      if (dead) e.dying = true
    }
  }

  // ----------------------------------------------------------- estructuras 3D
  // Modelos de structureModels.js (Codex): inclinados para que se vea el volumen, con la pieza de
  // la última mejora en 3D y animación al mejorar. El núcleo sigue con _syncNexus. Las formas 2D
  // de Phaser se ocultan de la cámara principal; barras de vida/construcción siguen en 2D.
  _syncStructures(scene) {
    const structures = scene?.remote ? [...(scene.sById?.values() || [])] : scene?.structures
    if (!structures) return
    this.structs ||= new Map()
    const now = performance.now()
    const dt = Math.min(0.05, (now - (this._structPrev || now)) / 1000)
    this._structPrev = now
    for (const [s, e] of this.structs) {
      if (s.dead || !structures.includes(s)) {
        this.scene.remove(e.root); e.root.userData.dispose(); this.structs.delete(s)
      }
    }
    for (const s of structures) {
      if (s.isCore || s.dead) continue
      let e = this.structs.get(s)
      if (!e) {
        const root = createStructureModel({ role: s.role, sides: s.def.sides, size: s.radius, color: s.fxColor || s.def.color, isCore: false })
        root.position.set(s.x, s.y, 4)
        this.scene.add(root)
        scene.cam?.ignore([s.glow, s.shape])
        e = { root, color: null, decorN: 0, powered: null }
        this.structs.set(s, e)
      }
      e.root.position.set(s.x, s.y, 4)
      const u = e.root.userData
      if (s._accent && !e.accentHidden) { scene.cam?.ignore(s._accent); e.accentHidden = true }
      const col = s.fxColor || s.def.color
      if (col !== e.color) { u.setColor(col); e.color = col }
      const ups = s.upgrades || []
      if (ups.length !== e.decorN) {
        const last = UPGRADES_BY_ID[ups[ups.length - 1]]
        if (last) u.setDecor(last.decor, last.tint || col)
        e.decorN = ups.length
      }
      if (s.upgradePulse) { u.pulseUpgrade(s.upgradePulse.color); s.upgradePulse = null }
      const on = s.powered && !(s.stunMs > 0)
      if (on !== e.powered) { u.setPowered(on); e.powered = on }
      u.setBuilding(s.building ? s.buildProgress / (s.buildTime || 1) : 1)
      if (s.aimAngle != null) u.setAim(s.aimAngle)
      u.update(dt, now)
    }
  }

  // Naves enemigas 3D: el simulador sigue siendo Phaser, pero el cuerpo visible vive aquí.
  // El mismo reconciliador sirve para host y cliente remoto (que expone sprites interpolados).
  // Instanciado (enemyInstances.js): una tanda de draw calls por tipo de nave, no por nave. El
  // estado por nave (radio, alabeo) vive en enemy._r3 y muere con el objeto.
  _syncEnemies(scene) {
    const remote = !!scene?.remote
    const enemies = remote ? scene.eById?.values() : scene?.enemies
    if (!enemies) return
    const I = this.enemyInst ||= createEnemyInstances(this.scene, this.glowTex, { haloScale: LOW_GFX ? 3.6 : 4.4 })
    const now = performance.now()
    I.begin()
    for (const enemy of enemies) {
      if (!enemy || enemy.dead || (remote && enemy.visible === false)) continue
      const def = remote ? REGISTRY[enemy.type] : enemy.def
      if (!def) continue
      let st = enemy._r3
      if (!st) {
        const radius = remote ? 12 * 0.5 * (enemy.escala || def.scale || 1) : enemy.radius
        const type = enemy.type || 'grunt'
        st = enemy._r3 = { radius, type, key: `${type}|${radius.toFixed(1)}`, last: null, bank: 0 }
        scene.cam?.ignore((remote ? [enemy, enemy.glow] : [enemy.sprite, enemy.glow]).filter(Boolean))
      }
      const heading = Number.isFinite(enemy.heading) ? enemy.heading : 0
      const turn = st.last == null ? 0 : Math.atan2(Math.sin(heading - st.last), Math.cos(heading - st.last))
      st.last = heading
      st.bank = st.bank * 0.88 + Math.max(-0.36, Math.min(0.36, turn * 5))
      const stun = !remote && enemy.stunMs > 0
      I.push(st, st.type, def.color, enemy.x, enemy.y, heading, st.bank, stun, 0.24 + Math.sin(now * 0.008 + heading) * 0.08)
    }
    I.end()
  }

  // Misiles del jugador en 3D con estela (fxModels.js). El sprite 2D se oculta.
  _syncMissiles(scene) {
    if (!scene?.projectiles || scene.remote) return
    this.missiles ||= new Map()
    const now = performance.now()
    const dt = Math.min(0.05, (now - (this._misPrev || now)) / 1000)
    this._misPrev = now
    const stamp = this._missileStamp = (this._missileStamp || 0) + 1
    for (const p of scene.projectiles) p._threeStamp = stamp
    for (const [p, m] of this.missiles) {
      if (p._threeStamp !== stamp) { this.scene.remove(m); m.userData.dispose(); this.missiles.delete(p) }
    }
    for (const p of scene.projectiles) {
      let m = this.missiles.get(p)
      if (!m) {
        m = createMissileModel(p.color || 0xc08bff)
        this.scene.add(m)
        scene.cam?.ignore([p.sprite, p.glow].filter(Boolean))
        this.missiles.set(p, m)
      }
      m.userData.update(p.x, p.y, Math.atan2(p.vy || 0, p.vx || 1), dt)
    }
  }

  // ------------------------------------------------------------- generales 3D
  // Misma nave que la vitrina de la tienda (shipModel.js). El sprite 2D se oculta de la
  // cámara principal pero sigue en el minimapa. Solo host/solo (scene.generals).
  _syncGenerals(scene) {
    const generals = scene?.remote ? [...(scene.genSprites?.values() || [])] : [...(scene.generals?.values() || [])]
    if (!generals.length) return
    this.gens ||= new Map()
    for (const [g, e] of this.gens) {
      if (!generals.includes(g)) { this.scene.remove(e.root); e.root.userData.dispose(); this.gens.delete(g) }
    }
    for (const g of generals) {
      let e = this.gens.get(g)
      if (!e) {
        const tint = scene.remote ? (g.tintTopLeft || 0x8be9fd) : g.tint
        const root = createCommanderShip(tint, !scene.remote && g.beamSkin ? equipped('design')?.design : 'falcon')
        root.scale.setScalar(0.62)
        this.scene.add(root)
        scene.cam?.ignore(scene.remote ? [g, g.label].filter(Boolean) : g.sprite)
        e = { root, tint: g.tint }
        this.gens.set(g, e)
      }
      const tint = scene.remote ? (g.tintTopLeft || 0x8be9fd) : g.tint
      if (e.tint !== tint) { e.root.userData.setTint(tint); e.tint = tint }
      const alive = scene.remote ? g.visible !== false : g.alive
      e.root.visible = alive
      e.root.position.set(g.x, g.y, 20)
      const rot = scene.remote ? (g.rotation || 0) : g.sprite.rotation
      e.root.rotation.set(-0.16, 0, rot)
      // Alabeo al girar: se nota el volumen 3D.
      const turn = rot - (e.lastRot ?? rot)
      e.lastRot = rot
      e.bank = (e.bank || 0) * 0.9 + Math.max(-0.5, Math.min(0.5, turn * 8))
      e.root.rotation.x = -0.16 + e.bank
      const pulse = 0.8 + 0.25 * Math.sin(performance.now() * 0.02)
      e.root.userData.engine.scale.setScalar(pulse)
      if (!scene.remote && g.beamSkin) this._updateTrail(e, g, rot)
    }
  }

  // Estela del comandante local (cosmético 'trail'): partículas que salen del motor.
  _updateTrail(e, g, rot) {
    const td = equipped('trail')
    if (!td?.style) { if (e.trail) e.trail.visible = false; return }
    const N = LOW_GFX ? 36 : 60
    if (!e.trail) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3).fill(-9999), 3))
      const mat = new THREE.PointsMaterial({ size: 5 * RENDER_SCALE, map: this.sparkTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, alphaTest: 0.01 })
      e.trail = new THREE.Points(geo, mat)
      e.trail.frustumCulled = false
      e.trailParts = Array.from({ length: N }, () => ({ x: 0, y: 0, life: 0 }))
      e.trailI = 0
      this.scene.add(e.trail)
    }
    e.trail.visible = g.alive
    const mat = e.trail.material
    mat.color.setHex(td.color || 0xffffff)
    mat.size = (td.style === 'pixel' ? 7 : td.style === 'comet' ? 6 : 4) * RENDER_SCALE
    const moving = Math.hypot(g.tx - g.x, g.ty - g.y) > 6
    if (moving) {
      const p = e.trailParts[e.trailI++ % N]
      p.x = g.x - Math.cos(rot) * 10 + (Math.random() - 0.5) * 3
      p.y = g.y - Math.sin(rot) * 10 + (Math.random() - 0.5) * 3
      p.life = 1
    }
    const arr = e.trail.geometry.attributes.position.array
    for (let i = 0; i < N; i++) {
      const q = e.trailParts[i]
      q.life -= td.style === 'comet' ? 0.012 : 0.022
      if (td.style === 'spark') { q.x += (Math.random() - 0.5) * 1.2; q.y += (Math.random() - 0.5) * 1.2 }
      const alive = q.life > 0
      arr[i * 3] = alive ? (td.style === 'pixel' ? Math.round(q.x / 4) * 4 : q.x) : -9999
      arr[i * 3 + 1] = alive ? (td.style === 'pixel' ? Math.round(q.y / 4) * 4 : q.y) : -9999
      arr[i * 3 + 2] = 18
    }
    e.trail.geometry.attributes.position.needsUpdate = true
    mat.opacity = 0.85
  }


  // ------------------------------------------------------------------ nexo 3D
  // Núcleo en 3D real (prisma hex + anillo orbital + octaedro pulsante). Al crearlo se ocultan
  // las formas 2D del core (glow/shape/inner) de la cámara principal para que no se solapen;
  // las barras de HP siguen en 2D. Funciona en host (scene.core) y cliente (sById).
  _syncNexus(scene) {
    if (this.nexus) {
      const c = this.nexusCore
      if (!c || c.dead || !c.container || c.container.scene == null) {
        this._dispose(this.nexus)
        this.nexus = null; this.nexusCore = null
      }
      return
    }
    const core = scene?.core || (scene?.sById && [...scene.sById.values()].find((s) => s.isCore))
    if (!core) return

    const color = scene.remote ? core.def.color : nexusColor(core.def.color) // cosmético 'nexus'
    const root = new THREE.Group()
    root.position.set(core.x, core.y, 0)

    // Prisma hexagonal principal
    const R = core.radius * 0.82
    const shape = new THREE.Shape()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2
      const px = Math.cos(a) * R, py = Math.sin(a) * R
      i ? shape.lineTo(px, py) : shape.moveTo(px, py)
    }
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: R * 0.9, bevelEnabled: true, bevelThickness: R * 0.14,
      bevelSize: R * 0.12, bevelSegments: 2, steps: 1,
    })
    geo.translate(0, 0, -R * 0.45)
    const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: darken(color), emissive: new THREE.Color(color), emissiveIntensity: 0.55,
      metalness: 0.6, roughness: 0.3,
    }))
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    )

    // Octaedro interior blanco-azulado, pulsa y gira
    const inner = new THREE.Mesh(
      new THREE.OctahedronGeometry(R * 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x9fd8ff, emissive: 0x9fd8ff, emissiveIntensity: 1.6,
        metalness: 0.2, roughness: 0.15,
      }),
    )
    inner.position.z = R * 0.55

    // Anillo orbital inclinado
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(core.radius * 1.25, 1.6, 8, 64),
      new THREE.MeshStandardMaterial({
        color: darken(color, 0.4), emissive: new THREE.Color(color), emissiveIntensity: 0.9,
        metalness: 0.5, roughness: 0.35, transparent: true, opacity: 0.9,
      }),
    )
    ring.rotation.x = 0.9

    // Glow de fondo
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, alphaTest: 0.01,
    }))
    glow.scale.set(core.radius * 6, core.radius * 6, 1)
    glow.position.z = -3

    root.add(glow, body, edges, ring, inner)
    this.scene.add(root)
    this.nexus = { root, body, ring, inner, glow, hue: !scene.remote && equipped('nexus')?.anim === 'hue' }
    this.nexusCore = core

    // Ocultar el core 2D de la cámara principal (sigue vivo para lógica/minimapa)
    const ig = [core.glow, core.shape, core.innerShape].filter(Boolean)
    scene.cameras?.main.ignore(ig)
  }

  _updateNexus(dt) {
    const n = this.nexus
    if (!n) return
    const t = performance.now() * 0.001
    n.body.rotation.z += dt * 0.25
    n.ring.rotation.z -= dt * 0.5
    const k = 1 + 0.12 * Math.sin(t * 2.4)
    n.inner.scale.setScalar(k)
    n.inner.rotation.z += dt * 1.2
    n.inner.rotation.x += dt * 0.7
    n.glow.material.opacity = 0.45 + 0.15 * Math.sin(t * 1.8)
    if (n.hue) {
      const c = (this._hueColor ||= new THREE.Color()).setHSL((t / 2.4) % 1, 0.8, 0.6)
      n.body.material.emissive.copy(c)
      n.ring.material.emissive?.copy(c)
      n.glow.material.color.copy(c)
    }
  }

  // Original OBJ and PBR textures from 3e4dc12. Geometry is shared by every variant.
  _loadMeteor() {
    const A = ASSET.meteor3D
    const tx = (url, srgb) => {
      const t = this._loader.load(url)
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.anisotropy = LOW_GFX ? 1 : 4
      return t
    }
    const diff = tx(A.diffuse, true)
    this.meteorMat = new THREE.MeshStandardMaterial({
      map: diff,
      emissiveMap: diff, emissive: 0xffffff, emissiveIntensity: 1.05,
      normalMap: tx(A.normal, false),
      roughnessMap: tx(A.roughness, false),
      metalness: 0, roughness: 1,
      side: THREE.DoubleSide,
    })
    new OBJLoader().load(A.obj, (grp) => {
      if (this._meteorDisposed) return
      let geo = null
      grp.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry })
      if (!geo) { console.warn('[meteor3D] OBJ sin malla:', A.obj); return }
      geo.computeBoundingSphere()
      const c = geo.boundingSphere.center, r = geo.boundingSphere.radius || 1
      geo.translate(-c.x, -c.y, -c.z)
      geo.scale(1 / r, 1 / r, 1 / r)
      this.meteorGeo = geo
      this.meteorBase = { geo, mat: this.meteorMat }
    })
  }

  _updateMeteors(dt) {
    const now = performance.now()
    updateMeteorMaterials(this.meteorBase, now)
    for (const [m, e] of this.meteors) {
      if (e.dying) {
        e.dieT += dt
        const k = 1 - e.dieT / 0.45
        if (k <= 0) {
          this.scene.remove(e.root)
          e.model.userData.dispose()
          e.halo.material.dispose()
          this.meteors.delete(m)
          continue
        }
        e.root.scale.setScalar(k)
      } else {
        e.model.rotateOnAxis(e.axis, e.spin * dt * (m.special === 'giant' ? 2.5 : 1))
        // El explosivo actual no tiene cuenta regresiva; admite una si se agrega al estado.
        e.model.userData.urgency = m.explodeAt
          ? Math.max(0, Math.min(1, 1 - (m.explodeAt - now) / 3000)) : 0
        e.model.userData.update(dt, now)
        const color = m.special === 'giant' ? 0xffd24a : m.special === 'explosive' ? 0xff3d2e : 0x49e07a
        if (e.halo.material.color.getHex() !== color) e.halo.material.color.setHex(color)
        const haloSize = m.radius * (m.special === 'giant' ? 6 : 5.5)
        if (e.halo.scale.x !== haloSize) e.halo.scale.set(haloSize, haloSize, 1)
        e.halo.material.opacity = m.special === 'explosive'
          ? 0.45 + 0.5 * (0.5 + 0.5 * Math.sin(now * 0.008 + m.x))
          : m.special === 'giant' ? 0.85 + 0.15 * Math.sin(now * 0.004) : 0.95
      }
    }
  }
  _makeStructure(s) {
    const root = new THREE.Group()
    const sides = s.isCore ? 6 : (s.def.sides || 6)
    const size = s.radius
    const color = s.def.color
    const shape = new THREE.Shape()
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2
      const x = Math.cos(a) * size, y = Math.sin(a) * size
      i ? shape.lineTo(x, y) : shape.moveTo(x, y)
    }
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: size * 1.3, bevelEnabled: true, bevelThickness: size * 0.18,
      bevelSize: size * 0.16, bevelSegments: 2, steps: 1,
    })
    geo.translate(0, 0, -size * 0.65)
    const mat = new THREE.MeshStandardMaterial({
      color: darken(color), emissive: new THREE.Color(color), emissiveIntensity: 0.9,
      metalness: 0.55, roughness: 0.32, side: THREE.DoubleSide,
    })
    const body = new THREE.Mesh(geo, mat)
    // contorno neón nítido
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    )
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, alphaTest: 0.01,
    }))
    glow.scale.set(size * 5, size * 5, 1)
    glow.position.z = -1
    root.add(glow, body, edges)
    this.scene.add(root)
    return { root, mat, glow, spin: s.isCore ? 0.004 : 0 }
  }

  _makeEnemy(en) {
    const root = new THREE.Group()
    const url = ASSET.ships[en.def.textureKey]
    const r = en.radius * 2.6
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: en.def.color, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, alphaTest: 0.01,
    }))
    glow.scale.set(r * 1.7, r * 1.7, 1)
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex(url), transparent: true, depthWrite: false, alphaTest: 0.01,
    }))
    spr.scale.set(r, r, 1)
    root.add(glow, spr)
    this.scene.add(root)
    return { root, spr, glow }
  }

  // ----------------------------------------------------------------- explosión
  // Explosiones nuevas (fxModels.js, Codex). kind opcional: small|big|plasma|emp|meteor|boss.
  explode(x, y, color, radius, kind) {
    kind ||= radius >= 110 ? 'boss' : radius >= 45 ? 'big' : 'small'
    this.fx ||= []
    if (this.fx.length >= (LOW_GFX ? 10 : 24)) this.fx.shift().dispose()
    this.fx.push(createExplosion(this.scene, { x, y, color, radius, kind }))
  }

  _updateFx(dt) {
    if (!this.fx) return
    for (let i = this.fx.length - 1; i >= 0; i--) {
      if (!this.fx[i].update(dt)) { this.fx[i].dispose(); this.fx.splice(i, 1) }
    }
  }

  // Versión anterior (Points + anillos); queda por si hace falta comparar.
  _explodeLegacy(x, y, color, radius) {
    const n = Math.min(LOW_GFX ? 40 : 90, (LOW_GFX ? 15 : 30) + Math.round(radius * 1.6))
    const pos = new Float32Array(n * 3)
    const vel = []
    const c = new THREE.Color(color)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = 12
      const a = Math.random() * Math.PI * 2
      const sp = (0.4 + Math.random()) * radius * 3
      vel.push(Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.5) * sp * 0.5)
      // mezcla: brasas del color + chispas blancas/amarillas
      const k = Math.random()
      const cc = k > 0.6 ? new THREE.Color(0xffeeaa) : c
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.PointsMaterial({
      size: Math.max(6, radius * 0.6) * RENDER_SCALE, map: this.sparkTex, vertexColors: true,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, alphaTest: 0.01,
    })
    const pts = new THREE.Points(geo, mat)
    this.scene.add(pts)

    // onda de choque
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.3, radius * 0.5, 32), ringMat)
    ring.position.set(x, y, 11)
    this.scene.add(ring)

    // segunda onda más lenta y fina (da sensación de profundidad)
    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.2, radius * 0.28, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    ring2.position.set(x, y, 11)
    this.scene.add(ring2)

    // flash central blanco-caliente que muere rápido
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffffff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }))
    flash.position.set(x, y, 13)
    flash.scale.set(radius * 3.5, radius * 3.5, 1)
    this.scene.add(flash)

    this.explosions.push({ pts, vel, ring, ring2, flash, life: 0, max: 0.7, baseSize: mat.size })
  }

  _updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i]
      ex.life += dt
      const t = ex.life / ex.max
      if (t >= 1) {
        this.scene.remove(ex.pts); ex.pts.geometry.dispose(); ex.pts.material.dispose()
        this.scene.remove(ex.ring); ex.ring.geometry.dispose(); ex.ring.material.dispose()
        if (ex.ring2) { this.scene.remove(ex.ring2); ex.ring2.geometry.dispose(); ex.ring2.material.dispose() }
        if (ex.flash) { this.scene.remove(ex.flash); ex.flash.material.dispose() }
        this.explosions.splice(i, 1); continue
      }
      const p = ex.pts.geometry.attributes.position.array
      for (let j = 0; j < ex.vel.length / 3; j++) {
        p[j * 3] += ex.vel[j * 3] * dt
        p[j * 3 + 1] += ex.vel[j * 3 + 1] * dt
        p[j * 3 + 2] += ex.vel[j * 3 + 2] * dt
        ex.vel[j * 3] *= 0.92; ex.vel[j * 3 + 1] *= 0.92
      }
      ex.pts.geometry.attributes.position.needsUpdate = true
      ex.pts.material.opacity = 1 - t
      ex.pts.material.size = ex.baseSize * (1 - t * 0.5)
      const s = 1 + t * 4
      ex.ring.scale.set(s, s, s)
      ex.ring.material.opacity = 0.8 * (1 - t)
      if (ex.ring2) {
        const s2 = 1 + t * 2.2
        ex.ring2.scale.set(s2, s2, s2)
        ex.ring2.material.opacity = 0.5 * (1 - t)
      }
      if (ex.flash) {
        // flash: cae al cuadrado (muy brillante solo el primer instante) mientras crece
        ex.flash.material.opacity = Math.max(0, 1 - t * 3) ** 2
        ex.flash.scale.multiplyScalar(1 + dt * 2)
      }
    }
  }

  // -------------------------------------------------------------------- render
  render(timeMs) {
    if (this.game) {
      this.pendingRender = true
      return
    }
    this._renderFrame()
  }

  _onPostRender() {
    if (!this.pendingRender) return
    this.pendingRender = false
    this._renderFrame()
  }

  _renderFrame() {
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.tickPrev) / 1000)
    this.tickPrev = now

    this.starUniforms.uTime.value = now * 0.001
    this._updateExplosions(dt)
    this._updateFx(dt)
    this._updateMeteors(dt)
    this._updateNexus(dt)

    // Estrellas fugaces (cada 6-14s)
    this.shootingStarTimer += dt * 1000
    if (this.shootingStarTimer >= this.shootingStarNext) {
      this.shootingStarTimer = 0
      this.shootingStarNext = 6000 + Math.random() * 8000
      this._createShootingStar()
    }
    this._updateShootingStars(dt)

    // parallax de fondo respecto al centro de vista
    const ox = (this.viewCenter.x - WORLD.width / 2)
    const oy = (this.viewCenter.y - WORLD.height / 2)
    for (const p of this.bgGroups) {
      p.position.x = (p.userData.bx || 0) - ox * p.userData.factor
      p.position.y = (p.userData.by || 0) + oy * p.userData.factor
      p.rotation.z += (p.userData.drift || 0) * dt * 60
    }
    this.backdrop.update(now * 0.001, ox, oy)
    this.stars.position.x = -ox * this.stars.userData.factor
    this.stars.position.y = oy * this.stars.userData.factor

    const r = this.renderer
    r.clear()
    r.render(this.bgScene, this.bgCamera)
    r.clearDepth()
    r.render(this.scene, this.camera)
  }

  resize(w, _phaserHeight) {
    const screenHeight = Math.round((this.parent.clientHeight || window.innerHeight) * RENDER_SCALE)
    this.renderer.setSize(w, screenHeight, false)
    this.bgCamera.aspect = w / screenHeight
    this.bgCamera.updateProjectionMatrix()
    this.backdrop?.fit(this.bgCamera)
  }

  // Crear una estrella fugaz (línea additiva blanca)
  _createShootingStar() {
    const startAngle = Math.random() * Math.PI * 2
    const length = 300 + Math.random() * 200 // 15% de pantalla aprox
    const x = (Math.random() - 0.5) * 5000
    const y = (Math.random() - 0.5) * 3500
    const z = -400 - Math.random() * 200

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const geo = new THREE.PlaneGeometry(length, 2)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.rotation.z = startAngle

    const star = {
      mesh,
      life: 0,
      max: 500, // 0.5s
      dir: startAngle,
      speed: 1500 + Math.random() * 500,
    }
    this.bgScene.add(mesh)
    this.shootingStars.push(star)
  }

  _updateShootingStars(dt) {
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const s = this.shootingStars[i]
      s.life += dt * 1000
      if (s.life >= s.max) {
        this.bgScene.remove(s.mesh)
        s.mesh.geometry.dispose()
        s.mesh.material.dispose()
        this.shootingStars.splice(i, 1)
        continue
      }
      const prog = s.life / s.max
      s.mesh.material.opacity = 1 - prog
      // Mover en la dirección de la estrella
      const dist = s.speed * dt
      s.mesh.position.x += Math.cos(s.dir) * dist
      s.mesh.position.y += Math.sin(s.dir) * dist
    }
  }

  _dispose(e) {
    e.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose() // texturas compartidas (cache this.tex) no se liberan aquí
    })
    this.scene.remove(e.root)
  }

  dispose() {
    this._meteorDisposed = true
    this.game?.events.off('postrender', this._onPostRender, this)
    if (this.nexus) { this._dispose(this.nexus); this.nexus = null; this.nexusCore = null }
    for (const [, e] of this.meshes) this._dispose(e)
    this.meshes.clear()
    for (const [, e] of this.meteors) { this.scene.remove(e.root); e.model.userData.dispose(); e.halo.material.dispose() }
    this.meteors.clear()
    disposeMeteorModels(this.meteorBase)
    this.meteorGeo?.dispose()
    this.meteorMat?.dispose()
    this.meteorMat?.map?.dispose()
    this.meteorMat?.normalMap?.dispose()
    this.meteorMat?.roughnessMap?.dispose()
    for (const ex of this.explosions) { this.scene.remove(ex.pts); this.scene.remove(ex.ring) }
    this.explosions = []
    if (this.vignette) {
      this.vignette.material.map?.dispose()
      this.vignette.material.dispose()
      this.bgScene.remove(this.vignette)
    }
    for (const [, e] of this.structs || []) e.root.userData.dispose()
    for (const [, m] of this.missiles || []) m.userData.dispose()
    for (const [, e] of this.gens || []) { e.root.userData.dispose(); e.trail?.geometry.dispose(); e.trail?.material.dispose() }
    this.enemyInst?.dispose()
    for (const f of this.fx || []) f.dispose()
    this.nebulaAlpha?.dispose()
    this.backdrop?.dispose()
    this.glowTex?.dispose()
    this.sparkTex?.dispose()
    this.renderer.domElement.remove()
    this.renderer.dispose()
  }
}
