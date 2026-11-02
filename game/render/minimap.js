// Minimapa dibujado aparte: un <canvas> 2D del DOM superpuesto al juego (esquina inferior izquierda).
// Antes era una cámara secundaria de Phaser, pero el render 3D (Three.js, canvas detrás de Phaser)
// no aparecía en ella. Patrón del repo: funciones que reciben `scene`; el estado vive en `scene.minimap`.
// Funciona también en cliente remoto (scene.remote): ahí lee las colecciones interpoladas de sync.js.
import { WORLD } from '~/game/balance.js'
import { gameState } from '~/game/gameState.js'
import { REGISTRY } from '~/game/enemies/EnemyType.js'
import { IS_TOUCH, RENDER_SCALE } from '~/game/quality.js'

const KEY_PLEGADO = 'sgmp_minimap_collapsed'
const REDIBUJO_MS = 100 // ~10 fps
const AVISO_OLEADA_MS = 4500
const EVENTOS_BLOQUEADOS = [
  'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
  'mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend',
  'wheel', 'contextmenu', 'click', 'dblclick',
]

function leerPlegado() {
  try { return localStorage.getItem(KEY_PLEGADO) === '1' } catch { return false }
}

function guardarPlegado(v) {
  try { localStorage.setItem(KEY_PLEGADO, v ? '1' : '0') } catch { /* modo privado */ }
}

// Rectángulo redondeado con respaldo para navegadores sin ctx.roundRect.
function trazoRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Fondo estático (panel oscuro + retícula) en un canvas aparte: se pinta una vez y se copia en cada frame.
function crearFondo(w, h, dpr) {
  const bg = document.createElement('canvas')
  bg.width = Math.round(w * dpr)
  bg.height = Math.round(h * dpr)
  const c = bg.getContext('2d')
  c.scale(dpr, dpr)
  trazoRedondeado(c, 0, 0, w, h, 8)
  c.fillStyle = 'rgba(4, 10, 24, 0.72)'
  c.fill()
  c.save()
  c.clip()
  c.strokeStyle = 'rgba(108, 200, 255, 0.10)'
  c.lineWidth = 1
  c.beginPath()
  const cols = 8
  const rows = 5
  for (let i = 1; i < cols; i++) { const x = Math.round((w * i) / cols) + 0.5; c.moveTo(x, 0); c.lineTo(x, h) }
  for (let j = 1; j < rows; j++) { const y = Math.round((h * j) / rows) + 0.5; c.moveTo(0, y); c.lineTo(w, y) }
  c.stroke()
  c.restore()
  return bg
}

export function createMinimap(scene) {
  const parent = scene.game?.canvas?.parentElement
  if (!parent || typeof document === 'undefined') return
  if (scene.minimap) destroyMinimap(scene)

  const w = IS_TOUCH ? 120 : 220
  const h = Math.round((w * WORLD.height) / WORLD.width)
  const dpr = RENDER_SCALE

  const wrap = document.createElement('div')
  wrap.className = 'sg-minimap'
  // Abajo a la izquierda: arriba-izq está el panel del núcleo, arriba-der recursos/inspección y
  // abajo-der la barra de habilidades. En móvil sube para no tapar la barra de construcción.
  const bottom = IS_TOUCH ? 'calc(3.6rem + env(safe-area-inset-bottom))' : '12px'
  const left = IS_TOUCH ? 'calc(0.4rem + env(safe-area-inset-left))' : 'calc(12px + env(safe-area-inset-left))'
  wrap.style.cssText = `position:absolute;left:${left};bottom:${bottom};z-index:10;pointer-events:none;`

  const cv = document.createElement('canvas')
  cv.width = Math.round(w * dpr)
  cv.height = Math.round(h * dpr)
  cv.style.cssText = `display:block;width:${w}px;height:${h}px;touch-action:none;pointer-events:auto;cursor:crosshair;border-radius:8px;box-shadow:0 0 12px rgba(108,200,255,0.25);`

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.title = 'Plegar / desplegar minimapa'
  btn.style.cssText = 'position:absolute;right:3px;top:3px;width:20px;height:20px;padding:0;line-height:18px;font-size:12px;'
    + 'color:#8be9fd;background:rgba(4,10,24,0.8);border:1px solid rgba(108,200,255,0.5);border-radius:5px;'
    + 'cursor:pointer;pointer-events:auto;'

  wrap.appendChild(cv)
  wrap.appendChild(btn)
  parent.appendChild(wrap)

  const m = {
    wrap, cv, btn, w, h, dpr,
    ctx: cv.getContext('2d'),
    bg: crearFondo(w, h, dpr),
    k: w / WORLD.width,
    acc: REDIBUJO_MS, // fuerza el primer dibujo
    t: 0,
    collapsed: leerPlegado(),
    arrastrando: false,
    ultimaOleada: gameState.wave ?? 0,
    avisoMs: 0,
    avisoDirs: [],
    handlers: [],
  }
  scene.minimap = m

  const aplicarPlegado = () => {
    cv.style.display = m.collapsed ? 'none' : 'block'
    btn.textContent = m.collapsed ? '+' : '–'
    btn.style.position = m.collapsed ? 'static' : 'absolute'
    btn.style.width = m.collapsed ? '26px' : '20px'
    btn.style.height = m.collapsed ? '26px' : '20px'
    m.acc = REDIBUJO_MS
  }
  aplicarPlegado()

  const escuchar = (el, tipo, fn, opts) => {
    el.addEventListener(tipo, fn, opts)
    m.handlers.push([el, tipo, fn, opts])
  }

  // Ningún evento del minimapa debe llegar al juego (cámara, colocar estructuras, etc.).
  const frenar = (e) => { e.stopPropagation() }
  for (const tipo of EVENTOS_BLOQUEADOS) { escuchar(cv, tipo, frenar); escuchar(btn, tipo, frenar) }

  const centrar = (e) => {
    const r = cv.getBoundingClientRect()
    if (!r.width || !r.height || !scene.cameras?.main) return
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    scene.cameras.main.centerOn(nx * WORLD.width, ny * WORLD.height)
    scene._touchInertia = null // si había inercia táctil, no debe arrastrar la cámara recién centrada
    m.acc = REDIBUJO_MS
  }
  escuchar(cv, 'pointerdown', (e) => {
    e.stopPropagation()
    e.preventDefault()
    m.arrastrando = true
    try { cv.setPointerCapture(e.pointerId) } catch { /* puntero ya liberado */ }
    centrar(e)
  })
  escuchar(cv, 'pointermove', (e) => {
    e.stopPropagation()
    if (m.arrastrando) centrar(e)
  })
  const soltar = (e) => {
    e.stopPropagation()
    m.arrastrando = false
    try { cv.releasePointerCapture(e.pointerId) } catch { /* sin captura */ }
  }
  escuchar(cv, 'pointerup', soltar)
  escuchar(cv, 'pointercancel', soltar)

  escuchar(btn, 'click', (e) => {
    e.stopPropagation()
    m.collapsed = !m.collapsed
    guardarPlegado(m.collapsed)
    aplicarPlegado()
  })
}

export function destroyMinimap(scene) {
  const m = scene.minimap
  if (!m) return
  for (const [el, tipo, fn, opts] of m.handlers) el.removeEventListener(tipo, fn, opts)
  m.handlers.length = 0
  m.wrap.remove()
  scene.minimap = null
}

export function updateMinimap(scene, deltaMs) {
  const m = scene.minimap
  if (!m) return
  m.t += deltaMs
  // Detecta el inicio de una oleada (aun plegado, para no perder el aviso al desplegar).
  const oleada = gameState.wave ?? 0
  if (oleada !== m.ultimaOleada) {
    if (oleada > m.ultimaOleada) {
      const dirs = scene.wave?.dirs?.length ? scene.wave.dirs : gameState.waveDirs
      if (dirs?.length) { m.avisoDirs = [...dirs]; m.avisoMs = AVISO_OLEADA_MS }
    }
    m.ultimaOleada = oleada
  }
  if (m.avisoMs > 0) m.avisoMs -= deltaMs
  if (m.collapsed) return
  m.acc += deltaMs
  if (m.acc < REDIBUJO_MS) return
  m.acc = 0
  dibujar(scene, m)
}

// ------------------------------------------------------------------ dibujo

function dibujar(scene, m) {
  const { ctx, w, h, k } = m
  ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(m.bg, 0, 0, w, h)

  ctx.save()
  trazoRedondeado(ctx, 0, 0, w, h, 8)
  ctx.clip()

  barrido(ctx, m, w, h)

  const remote = scene.remote === true

  // Meteoritos
  const meteoritos = remote ? scene.mById?.values() : scene.meteorites
  if (meteoritos) {
    ctx.fillStyle = 'rgba(150, 158, 170, 0.75)'
    for (const mt of meteoritos) {
      if (mt.depleted) continue
      ctx.fillRect(mt.x * k - 0.75, mt.y * k - 0.75, 1.5, 1.5)
    }
  }

  // Enlaces de energía: scene.links = [[structA, structB], ...] (en remoto lo rearma sync.js igual)
  const enlaces = scene.links
  if (enlaces && enlaces.length) {
    ctx.strokeStyle = 'rgba(108, 200, 255, 0.35)'
    ctx.lineWidth = 0.75
    ctx.beginPath()
    for (const par of enlaces) {
      const a = par[0]
      const b = par[1]
      if (!a || !b || a.dead || b.dead) continue
      ctx.moveTo(a.x * k, a.y * k)
      ctx.lineTo(b.x * k, b.y * k)
    }
    ctx.stroke()
  }

  // Estructuras
  const estructuras = remote ? scene.sById?.values() : scene.structures
  if (estructuras) {
    for (const s of estructuras) {
      if (s.dead) continue
      const x = s.x * k
      const y = s.y * k
      if (s.isCore || s.key === 'core') {
        ctx.shadowColor = '#8be9fd'
        ctx.shadowBlur = 8
        ctx.fillStyle = '#e6fbff'
        ctx.fillRect(x - 4, y - 4, 8, 8)
        ctx.shadowBlur = 0
        ctx.strokeStyle = '#6cc8ff'
        ctx.lineWidth = 1
        ctx.strokeRect(x - 5.5, y - 5.5, 11, 11)
      } else {
        ctx.fillStyle = s.powered ? '#4fd8ff' : 'rgba(108, 200, 255, 0.28)'
        ctx.fillRect(x - 2, y - 2, 4, 4)
      }
    }
  }

  // Enemigos
  const enemigos = remote ? scene.eById?.values() : scene.enemies
  if (enemigos) {
    const pulso = 0.5 + 0.5 * Math.sin(m.t / 180)
    for (const e of enemigos) {
      if (e.dead) continue
      const x = e.x * k
      const y = e.y * k
      const jefe = remote ? REGISTRY[e.type]?.boss : e.def?.boss
      if (jefe) {
        const r = 3.5 + pulso * 1.5
        ctx.fillStyle = `rgba(255, 60, 80, ${0.55 + pulso * 0.45})`
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = '#ff4d5e'
        ctx.fillRect(x - 1, y - 1, 2, 2)
      }
    }
  }

  // Generales (host: Map scene.generals; remoto: sprites en scene.genSprites)
  ctx.fillStyle = '#ffc247'
  if (remote) {
    if (scene.genSprites) for (const g of scene.genSprites.values()) { if (g.visible) triangulo(ctx, g.x * k, g.y * k) }
  } else {
    let hayLocal = false
    if (scene.generals) {
      for (const g of scene.generals.values()) {
        if (g === scene.general) hayLocal = true
        if (g.alive !== false) triangulo(ctx, g.x * k, g.y * k)
      }
    }
    const g0 = scene.general
    if (!hayLocal && g0 && g0.alive !== false) triangulo(ctx, g0.x * k, g0.y * k)
  }

  avisoOleada(ctx, m, w, h)

  // Vista actual de la cámara
  const wv = scene.cameras?.main?.worldView
  if (wv) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.lineWidth = 1
    ctx.strokeRect(wv.x * k + 0.5, wv.y * k + 0.5, wv.width * k, wv.height * k)
  }

  ctx.restore()

  // Borde neón
  trazoRedondeado(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 8)
  ctx.strokeStyle = 'rgba(108, 220, 255, 0.9)'
  ctx.lineWidth = 1.5
  ctx.shadowColor = '#6cc8ff'
  ctx.shadowBlur = 6
  ctx.stroke()
  ctx.shadowBlur = 0
}

function triangulo(ctx, x, y) {
  ctx.beginPath()
  ctx.moveTo(x, y - 4)
  ctx.lineTo(x + 3.5, y + 3)
  ctx.lineTo(x - 3.5, y + 3)
  ctx.closePath()
  ctx.fill()
}

// Barrido de radar: abanico de cuñas con alfa decreciente, centrado en el mapa.
function barrido(ctx, m, w, h) {
  const cx = w / 2
  const cy = h / 2
  const radio = Math.hypot(cx, cy)
  const ang = (m.t / 3500) * Math.PI * 2
  const pasos = 6
  const ancho = 0.5 / pasos
  for (let i = 0; i < pasos; i++) {
    ctx.fillStyle = `rgba(108, 220, 255, ${0.10 * (1 - i / pasos)})`
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radio, ang - (i + 1) * ancho, ang - i * ancho)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(108, 220, 255, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(ang) * radio, cy + Math.sin(ang) * radio)
  ctx.stroke()
}

// Flechas rojas en el borde por donde llega la oleada (ángulos en radianes desde el núcleo).
function avisoOleada(ctx, m, w, h) {
  if (m.avisoMs <= 0 || !m.avisoDirs.length) return
  const parpadeo = 0.45 + 0.55 * Math.abs(Math.sin(m.t / 140))
  const alfa = Math.min(1, m.avisoMs / 600) * parpadeo
  const cx = w / 2
  const cy = h / 2
  const margen = 9
  for (const a of m.avisoDirs) {
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    // Distancia hasta el borde (con margen) siguiendo el rayo desde el centro.
    const tx = Math.abs(dx) > 1e-6 ? (cx - margen) / Math.abs(dx) : Infinity
    const ty = Math.abs(dy) > 1e-6 ? (cy - margen) / Math.abs(dy) : Infinity
    const t = Math.min(tx, ty)
    const px = cx + dx * t
    const py = cy + dy * t
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(a) // la punta (lado -x) apunta hacia el centro
    ctx.fillStyle = `rgba(255, 70, 90, ${alfa})`
    ctx.shadowColor = '#ff4659'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(-6, 0)
    ctx.lineTo(3, -5)
    ctx.lineTo(3, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}
