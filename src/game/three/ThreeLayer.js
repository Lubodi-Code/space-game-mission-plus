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
  nebula: ['assets/bg/nebula1.jpg', 'assets/bg/nebula2.png', 'assets/bg/nebula3.png'],
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
    renderer.setClearColor(0x04060d, 1)
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

    this.scene.add(new THREE.AmbientLight(0x6a7da0, 1.9))
    const key = new THREE.DirectionalLight(0xdfe9ff, 2.6)
    key.position.set(-0.5, -0.8, 1)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x66aaff, 1.1)
    rim.position.set(0.6, 0.5, 0.4)
    this.scene.add(rim)
  }

  // ------------------------------------------------------------- fondo parallax
  _buildBackground() {
    this.bgScene = new THREE.Scene()
    this.bgCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000)
    this.bgCamera.position.set(0, 0, 600)

    this.bgGroups = []

    // Fondo estático (imagen de nebulosa, sin rotación). El plano se hace mucho más grande que el
    // viewport para que sus bordes cuadrados queden fuera de pantalla y no generen siluetas.
    const t = this.tex(ASSET.nebula[0])
    const z = -1400
    const w = Math.abs(z) * 6 // suficiente para cubrir el frustum incluso al paneo
    const mat = new THREE.MeshBasicMaterial({
      map: t, transparent: true, opacity: 0.45, color: 0x5a6480,
      blending: THREE.NormalBlending, depthWrite: false, depthTest: false,
    })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.62), mat)
    plane.position.set(0, 0, z)
    plane.userData.factor = 0.04
    plane.userData.drift = 0 // No rota
    this.bgScene.add(plane)
    this.bgGroups.push(plane)

    // Estrellas titilantes (Points con shader de twinkle).
    const N = 2400
    const pos = new Float32Array(N * 3)
    const phase = new Float32Array(N)
    const size = new Float32Array(N)
    const col = new Float32Array(N * 3)
    const tint = new THREE.Color()
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 3600
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2400
      pos[i * 3 + 2] = -200 - Math.random() * 1600
      phase[i] = Math.random() * Math.PI * 2
      size[i] = 2 + Math.random() * Math.random() * 7
      const h = 0.55 + Math.random() * 0.12
      tint.setHSL(h, 0.5 + Math.random() * 0.3, 0.7 + Math.random() * 0.3)
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

    // Viñeta oscura (mantiene el centro de juego claro y bordes oscuros).
    // El borde exterior debe ser totalmente opaco para ocultar el contorno cuadrado del plano.
    const vig = radialTexture([[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(2,4,10,0.0)'], [1, 'rgba(1,2,6,1.0)']])
    const vmat = new THREE.MeshBasicMaterial({ map: vig, transparent: true, depthWrite: false, depthTest: false })
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), vmat)
    this.vignette.position.z = -50
    this.bgScene.add(this.vignette)
  }

  // --------------------------------------------------------------- sincronizar
  syncCamera(cam) {
    const wv = cam.worldView
    // Frustum en coords de MUNDO con la cámara en el origen: left/right/top/bottom
    // son relativos a la posición de la cámara, así que NO la movemos (si la moviéramos
    // al centro se duplicaría el offset y todo quedaría fuera de vista). top<bottom invierte Y.
    this.camera.left = wv.x
    this.camera.right = wv.x + wv.width
    this.camera.top = wv.y
    this.camera.bottom = wv.y + wv.height
    this.camera.position.set(0, 0, 600)
    this.camera.updateProjectionMatrix()
    this.viewCenter.x = wv.x + wv.width / 2
    this.viewCenter.y = wv.y + wv.height / 2
  }

  // Modo "fondo 3D + meteoritos 3D + explosiones": Three solo sincroniza meteoritos (estructuras/
  // enemigos los dibuja Phaser en 2D encima). Reconcilia mallas con scene.meteorites: crea una malla
  // por meteorito vivo y la encoge/elimina cuando se agota (depleted) o su container muere.
  sync(scene) {
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
          map: this.glowTex, color: 0x49e07a, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, alphaTest: 0.01,
        }))
        halo.scale.set(m.radius * 4, m.radius * 4, 1)
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
      emissiveMap: diff, emissive: 0xffffff, emissiveIntensity: 0.32,
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

    this.explosions.push({ pts, vel, ring, life: 0, max: 0.7, baseSize: mat.size })
  }

  _updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i]
      ex.life += dt
      const t = ex.life / ex.max
      if (t >= 1) {
        this.scene.remove(ex.pts); ex.pts.geometry.dispose(); ex.pts.material.dispose()
        this.scene.remove(ex.ring); ex.ring.geometry.dispose(); ex.ring.material.dispose()
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

    // parallax de fondo respecto al centro de vista
    const ox = (this.viewCenter.x - WORLD.width / 2)
    const oy = (this.viewCenter.y - WORLD.height / 2)
    for (const p of this.bgGroups) {
      p.position.x = -ox * p.userData.factor
      p.position.y = oy * p.userData.factor
      p.rotation.z += p.userData.drift * dt * 60
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

  _dispose(e) {
    e.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose() // texturas compartidas (cache this.tex) no se liberan aquí
    })
    this.scene.remove(e.root)
  }

  dispose() {
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
    this.renderer.domElement.remove()
    this.renderer.dispose()
  }
}
