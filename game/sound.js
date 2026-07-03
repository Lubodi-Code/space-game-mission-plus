// Sonido del juego (Web Audio). Usa el AudioContext que Phaser desbloquea en el primer clic.
//
// - Música/ambiente: pistas reales en sounds/ambient/ (inGame en combate, Transition entre oleadas),
//   en loop con crossfade + pequeñas fluctuaciones de volumen (LFO).
// - SFX: samples .ogg de sounds/ (láser, misil, explosión, recolector, rayo enemigo, velocidad) +
//   camas en loop para el movimiento de naves (ligeras/pesadas), con volumen según cantidad.
// - Cadena: cada sonido → master(gain) → compresor → destino (el compresor evita que el realce de
//   graves sature). Reverb bus (convolución) para el misil. Realce de graves (lowshelf) en torreta y
//   explosiones.

import inGameUrl from './sounds/ambient/inGame.mp3'
import transitionUrl from './sounds/ambient/Transition.mp3'
import laserTurretUrl from './sounds/laserLarge_002.ogg'
import enemyBeamUrl from './sounds/laserLarge_001.ogg'
import missileUrl from './sounds/trhowlasermisil.ogg'
import explosionUrl from './sounds/lowFrequency_explosion_001.ogg'
import collectorUrl from './sounds/recolectorsound.ogg'
import speedUrl from './sounds/barofspeed.ogg'
import shipLightUrl from './sounds/shipmovesound.ogg'
import shipHeavyUrl from './sounds/heavyshipmovesound.ogg'

const MUSIC = { ingame: inGameUrl, transition: transitionUrl }
const SAMPLES = {
  laser: laserTurretUrl,
  enemybeam: enemyBeamUrl,
  missile: missileUrl,
  explosion: explosionUrl,
  mine: collectorUrl,
  speed: speedUrl,
  shipLight: shipLightUrl,
  shipHeavy: shipHeavyUrl,
}
const MUSIC_VOL = 0.5

let ctx = null
let master = null
let reverbBus = null
const view = { cx: 0, cy: 0, w: 1920 }
const lastAt = {}
const buffers = {}            // nombre → AudioBuffer (samples)
const beds = {}               // camas en loop (movimiento de naves)
const music = { buffers: {}, node: null, gain: null, lfo: null, name: null, want: null, loaded: false }

export function initSound(scene) {
  if (ctx) return
  ctx = scene?.sound?.context || null // null si Phaser cae a HTML5 audio → silencio
  if (!ctx) return
  master = ctx.createGain()
  master.gain.value = 0.7
  const comp = ctx.createDynamicsCompressor() // techo suave para que los graves no saturen
  master.connect(comp)
  comp.connect(ctx.destination)
  buildReverb()
  loadAudio()
}

export function setMasterVolume(v) {
  if (master) master.gain.value = v
}

// ----------------------------------------------------------- carga (música + samples)
async function decode(url) {
  const res = await fetch(url)
  const arr = await res.arrayBuffer()
  return ctx.decodeAudioData(arr)
}

async function loadAudio() {
  for (const [name, url] of Object.entries(MUSIC)) {
    try { music.buffers[name] = await decode(url) } catch { /* ignora pista fallida */ }
  }
  music.loaded = true
  if (music.want) swapMusic(music.want)
  for (const [name, url] of Object.entries(SAMPLES)) {
    try { buffers[name] = await decode(url) } catch { /* ignora sample fallido */ }
  }
}

// ---------------------------------------------------------------------- reverb
function buildReverb() {
  const conv = ctx.createConvolver()
  const rate = ctx.sampleRate
  const len = Math.floor(rate * 1.8)
  const buf = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5)
  }
  conv.buffer = buf
  const wet = ctx.createGain()
  wet.gain.value = 0.9
  conv.connect(wet)
  wet.connect(master)
  reverbBus = conv
}

// --------------------------------------------------------------- música/ambiente
export function setMusicState(name) {
  if (!ctx) return
  music.want = name
  if (music.loaded) swapMusic(name)
}

function swapMusic(name, fade = 1.4) {
  if (music.name === name || !music.buffers[name]) return
  const t = ctx.currentTime
  if (music.node) {
    const oldNode = music.node, oldGain = music.gain, oldLfo = music.lfo
    oldGain.gain.cancelScheduledValues(t)
    oldGain.gain.setValueAtTime(oldGain.gain.value, t)
    oldGain.gain.linearRampToValueAtTime(0.0001, t + fade)
    oldNode.stop(t + fade + 0.05)
    if (oldLfo) oldLfo.stop(t + fade + 0.05)
  }
  const src = ctx.createBufferSource()
  src.buffer = music.buffers[name]
  src.loop = true
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(MUSIC_VOL, t + fade)
  // Pequeñas fluctuaciones: LFO lento (~16s) que modula ±10% el volumen.
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.06
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = MUSIC_VOL * 0.1
  lfo.connect(lfoDepth)
  lfoDepth.connect(g.gain)
  lfo.start(t)
  src.connect(g)
  g.connect(master)
  src.start(t)
  music.node = src; music.gain = g; music.lfo = lfo; music.name = name
}

// ----------------------------------------------------------------- espacialización
function spatial(x, y) {
  const half = view.w * 0.5 || 960
  const dx = x - view.cx
  const dy = y - view.cy
  const pan = Math.max(-1, Math.min(1, dx / half))
  const vol = Math.max(0, 1 - Math.hypot(dx, dy) / (half * 1.7))
  return { pan, vol }
}

function throttle(key, ms) {
  const now = performance.now()
  if (lastAt[key] && now - lastAt[key] < ms) return false
  lastAt[key] = now
  return true
}

// -------------------------------------------------------------- reproducir sample
// x/y null → sonido no espacial (centrado, vol completo). bass = dB de realce de graves.
function playSample(name, x, y, { gain = 1, rate = 1, bass = 0, reverb = 0, throttleMs = 30 } = {}) {
  if (!ctx || !buffers[name]) return
  if (throttleMs && !throttle(name, throttleMs)) return
  const { pan, vol } = x == null ? { pan: 0, vol: 1 } : spatial(x, y)
  if (vol <= 0.02) return
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = buffers[name]
  src.playbackRate.value = rate
  let node = src
  if (bass) {
    const ls = ctx.createBiquadFilter()
    ls.type = 'lowshelf'
    ls.frequency.value = 180
    ls.gain.value = bass
    node.connect(ls)
    node = ls
  }
  const g = ctx.createGain()
  g.gain.value = gain * vol
  node.connect(g)
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    g.connect(p)
    p.connect(master)
  } else {
    g.connect(master)
  }
  if (reverb && reverbBus) {
    const rg = ctx.createGain()
    rg.gain.value = gain * vol * reverb
    g.connect(rg)
    rg.connect(reverbBus)
  }
  src.start(t)
}

// ------------------------------------------------------------------- SFX (samples)
export function sfxLaser(x, y) { playSample('laser', x, y, { gain: 0.9, bass: 8, throttleMs: 35 }) }            // torreta láser
export function sfxMissile(x, y) { playSample('missile', x, y, { gain: 1.0, reverb: 0.55, throttleMs: 45 }) }   // misil (+reverb)
export function sfxImpact(x, y, size = 1) {                                                                     // explosión/impacto (+graves)
  playSample('explosion', x, y, { gain: Math.min(1.25, 0.8 + size * 0.18), bass: 9, throttleMs: 28 })
}
export function sfxMine(x, y) { playSample('mine', x, y, { gain: 0.5, throttleMs: 500 }) }                      // recolector
export function sfxEnemyBeam(x, y) { playSample('enemybeam', x, y, { gain: 0.6, throttleMs: 40 }) }             // rayo enemigo
export function sfxSpeed() { playSample('speed', null, null, { gain: 0.7, throttleMs: 120 }) }                  // cambio de velocidad

// SFX sintetizado (sin sample): blip de fijado de objetivo.
export function sfxLock(x, y) {
  if (!ctx || !throttle('lock', 70)) return
  const { pan, vol } = spatial(x, y)
  if (vol <= 0.02) return
  for (const f of [1320, 1760]) {
    const t = ctx.currentTime
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.11 * vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = f
    osc.connect(g)
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master) }
    else g.connect(master)
    osc.start(t)
    osc.stop(t + 0.07)
  }
}

// ----------------------------------------------------- camas de movimiento de naves
function bedTarget(name, count, perUnit, max) {
  if (!ctx) return
  let b = beds[name]
  if (!b) {
    if (!buffers[name]) return // aún no cargó el sample
    const src = ctx.createBufferSource()
    src.buffer = buffers[name]
    src.loop = true
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(g)
    g.connect(master)
    src.start()
    b = beds[name] = { gain: g }
  }
  const target = count > 0 ? Math.min(max, 0.05 + count * perUnit) : 0
  b.gain.gain.value += (target - b.gain.gain.value) * 0.04 // suavizado
}

// Llamar cada frame con la cantidad de naves ligeras/pesadas vivas.
export function updateShipBeds(light, heavy) {
  bedTarget('shipLight', light, 0.01, 0.32)
  bedTarget('shipHeavy', heavy, 0.02, 0.32)
}

// Llamar cada frame: mantiene el centro de cámara para espacializar los SFX.
export function updateSound(cx, cy, viewW) {
  view.cx = cx; view.cy = cy; view.w = viewW || view.w
}
