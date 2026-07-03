import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { WORLD } from '../balance.js'

// Capa de render 3D (Three.js) que vive DETRÁS del canvas de Phaser (canvas transparente al frente).
// Modo actual: FONDO 3D + METEORITOS 3D + explosiones. Dibuja el fondo espacial (estrellas con
// twinkle + nebulosas con parallax), los meteoritos (malla OBJ con texturas PBR, ver _loadMeteor/
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
  constructor(parent, phaserCanvas) {
    this.parent = parent
    this.tickPrev = performance.now()
    this.viewCenter = { x: WORLD.width / 2, y: WORLD.height / 2 }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.autoClear = false
    renderer.setClearColor(0x010104, 1)
    const cv = renderer.domElement
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none'
    parent.insertBefore(cv, parent.firstChild)
    // Canvas de Phaser (transparente) ENCIMA de Three: z-index 1. El HUD de Vue debe tener un
    // z-index mayor para seguir recibiendo clics por encima del juego.
    if (phaserCanvas) {
      phaserCanvas.style.position = 'absolute'
      phaserCanvas.style.zIndex = '1'
      phaserCanvas.style.background = 'transparent'
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
    this.meteors = new Map()  // meteorito de juego -> { mesh, baseScale, spin, axis, dying, dieT }
    this.explosions = []
    this.nexus = null         // núcleo 3D (se crea en sync cuando existe el core)
    this._loadMeteor()

    this.resize(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight)
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
    const nebulaConfigs = [
      { z: -1200, color: 0x342050, opacity: 0.10, factor: 0.07, scale: 1.2, drift: 0.00012 },
      { z: -1500, color: 0x102838, opacity: 0.09, factor: 0.09, scale: 1.5, drift: 0.00006 },
      { z: -1350, color: 0x3a2018, opacity: 0.05, factor: 0.06, scale: 0.9, drift: -0.00009 },
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
    const N = 2400
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
          gl_PointSize = aSize * (300.0 / -mv.z);
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
    const galCount = 6
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
    const dustN = 300
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
          gl_PointSize = aSize * (300.0 / -mv.z);
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
    // Frustum en coords de MUNDO con la cámara en el origen: left/right/top/bottom
    // son relativos a la posición de la cámara, así que NO la movemos (si la moviéramos
    // al centro se duplicaría el offset y todo quedaría fuera de vista). top<bottom invierte Y.
    this.camera.left = wv.x - ox
    this.camera.right = wv.x + wv.width - ox
    this.camera.top = wv.y - oy
    this.camera.bottom = wv.y + wv.height - oy
    this.camera.position.set(0, 0, 600)
    this.camera.updateProjectionMatrix()
    this.viewCenter.x = wv.x + wv.width / 2
    this.viewCenter.y = wv.y + wv.height / 2
  }

  // Modo "fondo 3D + meteoritos 3D + explosiones": Three solo sincroniza meteoritos (estructuras/
  // enemigos los dibuja Phaser en 2D encima). Reconcilia mallas con scene.meteorites: crea una malla
  // por meteorito vivo y la encoge/elimina cuando se agota (depleted) o su container muere.
  sync(scene) {
    this._syncNexus(scene)
    if (!this.meteorGeo || !scene?.meteorites) return
    for (const m of scene.meteorites) {
      let e = this.meteors.get(m)
      // El container muere al agotarse (tween de Collector) o al quitarlo el cliente remoto.
      const dead = m.depleted || !m.container || m.container.scene == null
      if (!e) {
        if (dead) continue
        const root = new THREE.Group()
        root.position.set(m.x, m.y, 0)
        const mesh = new THREE.Mesh(this.meteorGeo, this.meteorMat)
        mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28)
        mesh.scale.setScalar(m.radius)
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTex, color: 0x49e07a, transparent: true, opacity: 0.78,
          blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, alphaTest: 0.01,
        }))
        halo.scale.set(m.radius * 5.5, m.radius * 5.5, 1)
        halo.position.z = -2
        root.add(halo, mesh)
        this.scene.add(root)
        e = {
          root, mesh, halo, dying: false, dieT: 0,
          spin: (Math.random() - 0.5) * 0.6,
          axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        }
        this.meteors.set(m, e)
      }
      if (dead) e.dying = true
    }
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

    const color = core.def.color
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
    this.nexus = { root, body, ring, inner, glow }
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
  }

  // Carga la malla OBJ + texturas PBR una vez; la geometría se normaliza a radio 1 (la escala por
  // meteorito = m.radius). Asíncrono: sync() no crea mallas hasta que meteorGeo está listo.
  _loadMeteor() {
    const A = ASSET.meteor3D
    const tx = (url, srgb) => {
      const t = this._loader.load(url)
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.anisotropy = 4
      return t
    }
    // ponytail: roca = no metálica; omito metalnessMap (~1.4MB) — imperceptible a 40px. metalness=0.
    // DoubleSide: la malla decimada no es 100% estanca; dibujar la cara trasera tapa los huecos.
    // emissiveMap = el mismo diffuse: la roca se auto-ilumina (brilla aunque la luz no le pegue).
    const diff = tx(A.diffuse, true)
    this.meteorMat = new THREE.MeshStandardMaterial({
      map: diff,
      emissiveMap: diff, emissive: 0xffffff, emissiveIntensity: 0.75,
      normalMap: tx(A.normal, false),
      roughnessMap: tx(A.roughness, false),
      metalness: 0, roughness: 1,
      side: THREE.DoubleSide,
    })
    new OBJLoader().load(A.obj, (grp) => {
      let geo = null
      grp.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry })
      if (!geo) { console.warn('[meteor3D] OBJ sin malla:', A.obj, '(¿404 → index.html? reinicia el dev server)'); return }
      geo.computeBoundingSphere()
      const c = geo.boundingSphere.center, r = geo.boundingSphere.radius || 1
      geo.translate(-c.x, -c.y, -c.z)
      geo.scale(1 / r, 1 / r, 1 / r) // ahora radio ~1; el OBJ ya trae normales (no recomputar)
      this.meteorGeo = geo
    })
  }

  _updateMeteors(dt) {
    for (const [m, e] of this.meteors) {
      if (e.dying) {
        e.dieT += dt
        const k = 1 - e.dieT / 0.45
        if (k <= 0) {
          this.scene.remove(e.root)
          e.halo.material.dispose()
          this.meteors.delete(m)
          continue
        }
        e.root.scale.setScalar(k)
      } else {
        e.mesh.rotateOnAxis(e.axis, e.spin * dt)
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
  explode(x, y, color, radius) {
    const n = Math.min(90, 30 + Math.round(radius * 1.6))
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
      size: Math.max(6, radius * 0.6), map: this.sparkTex, vertexColors: true,
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
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.tickPrev) / 1000)
    this.tickPrev = now

    this.starUniforms.uTime.value = now * 0.001
    this._updateExplosions(dt)
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
    this.stars.position.x = -ox * this.stars.userData.factor
    this.stars.position.y = oy * this.stars.userData.factor

    const r = this.renderer
    r.clear()
    r.render(this.bgScene, this.bgCamera)
    r.clearDepth()
    r.render(this.scene, this.camera)
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false)
    this.bgCamera.aspect = w / h
    this.bgCamera.updateProjectionMatrix()
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
    if (this.nexus) { this._dispose(this.nexus); this.nexus = null; this.nexusCore = null }
    for (const [, e] of this.meshes) this._dispose(e)
    this.meshes.clear()
    for (const [, e] of this.meteors) { this.scene.remove(e.root); e.halo.material.dispose() }
    this.meteors.clear()
    this.meteorGeo?.dispose()
    if (this.meteorMat) {
      // map y emissiveMap son la misma textura (diff); normal/roughness aparte
      for (const k of ['map', 'normalMap', 'roughnessMap']) this.meteorMat[k]?.dispose()
      this.meteorMat.dispose()
    }
    for (const ex of this.explosions) { this.scene.remove(ex.pts); this.scene.remove(ex.ring) }
    this.explosions = []
    if (this.vignette) {
      this.vignette.material.map?.dispose()
      this.vignette.material.dispose()
      this.bgScene.remove(this.vignette)
    }
    this.nebulaAlpha?.dispose()
    this.glowTex?.dispose()
    this.sparkTex?.dispose()
    this.renderer.domElement.remove()
    this.renderer.dispose()
  }
}
