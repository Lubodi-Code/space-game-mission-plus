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
import { initTone, play as playTone, playExplosion, setEngine } from './audio/tone.js'

// Motores de naves enemigas: un loop por tipo (Kenney "Sci-Fi Sounds", CC0 — ver
// sounds/ships/KENNEY-LICENSE.txt). El archivo se llama como el EnemyType (grunt.ogg, brute.ogg…).
const SHIP_ENGINE_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('./sounds/ships/*.ogg', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => ['ship_' + path.split('/').pop().replace('.ogg', ''), url]),
)
// Volumen por nave cercana y techo de cada tipo: las grandes pesan más y suenan más graves.
const SHIP_ENGINE_MIX = {
  grunt: [0.0175, 0.06], runner: [0.015, 0.055], skirmisher: [0.0175, 0.06], kamikaze: [0.025, 0.07],
  saboteur: [0.02, 0.06], leech: [0.02, 0.06], bomber: [0.025, 0.07], warden: [0.025, 0.065],
  brute: [0.035, 0.08], artillery: [0.03, 0.075], commandship: [0.04, 0.085], mothership: [0.05, 0.1],
}

// Bancos de variantes (Kenney, CC0 — ver sounds/kenney/LICENSE.txt): carpeta = banco, archivos NN.ogg.
// Cada disparo elige una variante al azar (+ pequeño cambio de tono): evita la fatiga de oír siempre
// el mismo sample. Si el banco aún no decodificó, se usa el sonido de antes.
const BANK_URLS = {}
for (const [path, url] of Object.entries(import.meta.glob('./sounds/kenney/*/*.ogg', { eager: true, query: '?url', import: 'default' }))) {
  const bank = path.split('/')[3]
  ;(BANK_URLS[bank] ||= []).push(url)
}
const banks = {}              // banco → AudioBuffer[]

const MUSIC = { ingame: inGameUrl, transition: transitionUrl }
const SAMPLES = {
  laser: laserTurretUrl,
  enemybeam: enemyBeamUrl,
  missile: missileUrl,
  explosion: explosionUrl,
  mine: collectorUrl,
  speed: speedUrl,
  ...SHIP_ENGINE_URLS,
}
const MUSIC_VOL = 0.5

let ctx = null
let master = null
let musicBus = null
let sfxBus = null
let reverbBus = null
let echoBus = null
const audioPrefs = { music: 1, sfx: 1 }
let prefsLoaded = false
const view = { cx: 0, cy: 0, w: 1920 }
const lastAt = {}
const buffers = {}            // nombre → AudioBuffer (samples)
const beds = {}               // camas en loop (movimiento de naves)
const music = { buffers: {}, node: null, gain: null, lfo: null, name: null, want: null, loaded: false }

// Contexto único de la página. Se le pasa a Phaser (createGame.js, audio.context): así al destruir
// la partida Phaser lo suspende en vez de cerrarlo. Antes cerraba el suyo y este módulo seguía
// usándolo: la siguiente partida quedaba muda y cada sonido creaba nodos sobre un contexto muerto.
export function sharedAudioContext() {
  if (typeof window === 'undefined') return undefined
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return undefined
    // 'playback' = buffer de salida más grande. Con 'interactive' (~10 ms) el hilo de audio no
    // llegaba a tiempo mientras Phaser+Three cargan la máquina: ~12% de underruns, oído como
    // estática/crepitar en música y SFX. Unos ms más de latencia no se notan en este juego.
    try { ctx = new AC({ latencyHint: 'playback' }) } catch { return undefined }
  }
  return ctx
}

export function initSound(scene) {
  if (typeof window === 'undefined') return
  if (master) { if (ctx?.state === 'suspended') ctx.resume(); return }
  ctx = ctx || scene?.sound?.context || null // null si Phaser cae a HTML5 audio → silencio
  if (!ctx) return
  loadAudioPrefs()
  master = ctx.createGain()
  master.gain.value = 0.7
  musicBus = ctx.createGain()
  sfxBus = ctx.createGain()
  musicBus.gain.value = audioPrefs.music
  sfxBus.gain.value = audioPrefs.sfx
  const comp = ctx.createDynamicsCompressor() // techo para que la suma de sonidos no sature
  // Por defecto (-24 dB, rodilla 30, ratio 12) no frena los picos rápidos: con muchas explosiones
  // la mezcla pasaba de 0 dBFS y recortaba (crepitaba). Configurado como limitador.
  comp.threshold.value = -6
  comp.knee.value = 4
  comp.ratio.value = 20
  comp.attack.value = 0.002
  comp.release.value = 0.2
  musicBus.connect(master)
  sfxBus.connect(master)
  master.connect(comp)
  comp.connect(ctx.destination)
  buildReverb()
  buildEcho()
  loadAudio()
  void initTone(ctx, sfxBus, { shots: TONE_SHOTS })
}

// Menús (lobby/tienda): crea el contexto propio en el primer gesto del usuario. Si luego
// arranca Phaser, initSound reutiliza este mismo contexto.
export function initUiSound() {
  if (typeof window === 'undefined') return
  if (!sharedAudioContext()) return
  if (ctx.state === 'suspended') ctx.resume()
  initSound(null)
}

export function setMasterVolume(v) {
  if (master) master.gain.value = v
}

function loadAudioPrefs() {
  if (prefsLoaded) return
  prefsLoaded = true
  try {
    const saved = JSON.parse(localStorage.getItem('sgmp_audio'))
    if (Number.isFinite(saved?.music)) audioPrefs.music = Math.max(0, Math.min(1, saved.music))
    if (Number.isFinite(saved?.sfx)) audioPrefs.sfx = Math.max(0, Math.min(1, saved.sfx))
  } catch { /* storage no disponible */ }
}

function saveAudioPrefs() {
  try { localStorage.setItem('sgmp_audio', JSON.stringify(audioPrefs)) } catch { /* storage no disponible */ }
}

export function setMusicVolume(v) {
  loadAudioPrefs()
  audioPrefs.music = Math.max(0, Math.min(1, Number(v) || 0))
  if (musicBus) musicBus.gain.value = audioPrefs.music
  saveAudioPrefs()
}

export function setSfxVolume(v) {
  loadAudioPrefs()
  audioPrefs.sfx = Math.max(0, Math.min(1, Number(v) || 0))
  if (sfxBus) sfxBus.gain.value = audioPrefs.sfx
  saveAudioPrefs()
}

export function getAudioPrefs() {
  loadAudioPrefs()
  return { ...audioPrefs }
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
  // Bancos: de a pocos por vuelta de event loop para no competir con el arranque del juego.
  // Primero lo más frecuente (disparos e interfaz); el resto después.
  const PRIORITY = ['boom', 'laser', 'uiClick']
  const order = Object.entries(BANK_URLS).sort(([x], [y]) => {
    const ix = PRIORITY.indexOf(x), iy = PRIORITY.indexOf(y)
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy)
  })
  for (const [bank, urls] of order) {
    banks[bank] = []
    for (const url of urls) {
      try { banks[bank].push(await decode(url)) } catch { /* variante fallida: se omite */ }
    }
    await new Promise((r) => setTimeout(r, 0))
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
  wet.connect(sfxBus)
  reverbBus = conv
}

// ------------------------------------------------------------------- eco espacial
// Delay con realimentación filtrada: cada repetición sale más grave y apagada (paso bajo dentro
// del lazo), como un retumbe lejano en el vacío. El paso alto evita que los graves se acumulen.
function buildEcho() {
  const input = ctx.createGain()
  const delay = ctx.createDelay(1.5)
  delay.delayTime.value = 0.42
  // Realimentación 0.58 con filtros sin pico de resonancia (Q 0 dB): ganancia del lazo < 1, así
  // las ~6-8 repeticiones audibles se apagan solas y nunca se embala.
  const fb = ctx.createGain()
  fb.gain.value = 0.58
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 750
  lp.Q.value = 0
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 55
  hp.Q.value = 0
  const wet = ctx.createGain()
  wet.gain.value = 0.9
  input.connect(delay)
  delay.connect(lp); lp.connect(hp); hp.connect(fb); fb.connect(delay)
  hp.connect(wet)
  wet.connect(sfxBus)
  if (reverbBus) wet.connect(reverbBus) // las repeticiones también reverberan: más «espacio»
  echoBus = input
}

// --------------------------------------------------------------- música/ambiente
export function setMusicState(name) {
  if (!ctx) return
  music.want = name
  startAmbience()
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
  g.connect(musicBus)
  src.start(t)
  music.node = src; music.gain = g; music.lfo = lfo; music.name = name
}

// ----------------------------------------------------------------- espacialización
// reach: alcance relativo a media pantalla (1.7 = se oye bastante fuera de cuadro). near: caída
// cuadrática, para sonidos de ambiente que solo deben oírse cuando la cámara está encima.
function spatial(x, y, reach = 1.7, near = false) {
  const half = view.w * 0.5 || 960
  const dx = x - view.cx
  const dy = y - view.cy
  const pan = Math.max(-1, Math.min(1, dx / half))
  const k = Math.max(0, 1 - Math.hypot(dx, dy) / (half * reach))
  const vol = near ? k * k : k
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
function playSample(name, x, y, { gain = 1, rate = 1, bass = 0, reverb = 0, throttleMs = 30, reach = 1.7, near = false, buffer = null, maxDur = 0, echo = 0 } = {}) {
  const buf = buffer || buffers[name]
  if (!ctx || !buf) return false
  const { pan, vol } = x == null ? { pan: 0, vol: 1 } : spatial(x, y, reach, near)
  // El throttle va después del volumen: un recolector lejano (vol 0) no le roba el turno a uno cercano.
  if (vol <= 0.02) return true
  if (throttleMs && !throttle(name, throttleMs)) return true
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = buf
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
  if (maxDur) { // recorta colas largas con fundido: con muchas explosiones se apilarían
    const end = t + maxDur / rate
    g.gain.setValueAtTime(gain * vol, Math.max(t, end - 0.5))
    g.gain.linearRampToValueAtTime(0.0001, end)
  }
  node.connect(g)
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    g.connect(p)
    p.connect(sfxBus)
  } else {
    g.connect(sfxBus)
  }
  if (reverb && reverbBus) {
    const rg = ctx.createGain()
    rg.gain.value = gain * vol * reverb
    g.connect(rg)
    rg.connect(reverbBus)
  }
  if (echo && echoBus) {
    const eg = ctx.createGain()
    eg.gain.value = gain * vol * echo
    g.connect(eg)
    eg.connect(echoBus)
  }
  src.start(t)
  if (maxDur) src.stop(t + maxDur / rate + 0.05)
  return true
}

// Reproduce una variante al azar del banco. Devuelve false si el banco aún no cargó (→ fallback).
// detune: variación de tono ±(detune/2) para que dos disparos seguidos no suenen idénticos.
function playBank(bank, x, y, { detune = 0.1, rate = 1, ...opts } = {}) {
  const list = banks[bank]
  if (!ctx || !list?.length) return false
  const buffer = list[(Math.random() * list.length) | 0]
  return playSample('bank_' + bank, x, y, { ...opts, buffer, rate: rate * (1 + (Math.random() - 0.5) * detune) })
}

// ------------------------------------------------------------------- SFX (samples)
// Los disparos con Tone.js quedaron apagados a pedido (sonaban peor que los de antes): con
// TONE_SHOTS = false cada arma usa su sample o síntesis original. Explosiones y motor siguen en Tone.
const TONE_SHOTS = false

function toneShot(kind, x, y, gain, ms) {
  if (!TONE_SHOTS) return false
  if (!ctx || !throttle(kind, ms)) return true
  const { pan, vol } = at(x, y)
  if (vol <= 0.02) return true
  return playTone(kind, pan, gain * vol)
}

export function sfxLaser(x, y) {
  if (toneShot('laser', x, y, 0.9, 35)) return
  if (!playBank('laser', x, y, { gain: 0.8, bass: 5, reverb: 0.25, detune: 0.08, throttleMs: 0 })) playSample('laser', x, y, { gain: 0.9, bass: 8, throttleMs: 0 })
}
export function sfxMissile(x, y) {
  if (toneShot('missile', x, y, 1, 45)) return
  playSample('missile', x, y, { gain: 1, reverb: 0.55, throttleMs: 0 })
  playBank('thruster', x, y, { gain: 0.3, reverb: 0.4, throttleMs: 40 }) // estela del misil
}
export function sfxImpact(x, y, size = 1) {                                                                     // explosión/impacto (+graves)
  // A pedido: la explosión suena como el misil (trhowlasermisil.ogg), bajada de tono, suave, y con
  // mucho «espacio»: poco sonido directo y mucho eco + reverb. Más grande = más grave y más eco.
  const big = Math.min(1, Math.max(0, (size - 0.8) / 1.6))
  const rate = (0.62 - big * 0.17) * (0.95 + Math.random() * 0.1)
  playSample('missile', x, y, { gain: 0.38 + big * 0.17, rate, bass: 7 + big * 4, reverb: 0.9, echo: 0.9 + big * 0.4, throttleMs: 45 + big * 80 })
  if (size >= 1.5 && ctx) {
    const { pan, vol } = at(x, y)
    if (vol > 0.02) playExplosion(pan, vol * Math.min(size, 2))
  }
}
// Rayo recolector: el sample original (recolectorsound.ogg), a pedido: los bancos nuevos no lo tocan.
export function sfxMine(x, y) { playSample('mine', x, y, { gain: 0.2, throttleMs: 500, reach: 0.75, near: true }) } // bajito; sube solo al acercarse                      // recolector
export function sfxEnemyBeam(x, y) {
  if (toneShot('enemyBeam', x, y, 0.6, 40)) return
  if (!playBank('laserSmall', x, y, { gain: 0.45, rate: 0.85, reverb: 0.2, throttleMs: 0 })) playSample('enemybeam', x, y, { gain: 0.6, throttleMs: 0 })
}
export function sfxGeneralShot(x, y) {
  if (toneShot('generalShot', x, y, 0.3, 60)) return
  // bajo: el comandante dispara seguido
  if (!playBank('laserSmall', x, y, { gain: 0.2, rate: 1.15, reverb: 0.2, detune: 0.1, throttleMs: 0 })) playSample('laser', x, y, { gain: 0.3, rate: 1.5, throttleMs: 0 })
}
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
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(sfxBus) }
    else g.connect(sfxBus)
    osc.start(t)
    osc.stop(t + 0.07)
  }
}

// ----------------------------------------------------- camas de movimiento de naves
function bedTarget(name, count, perUnit, max) {
  if (!ctx) return
  let b = beds[name]
  if (!b) {
    if (count <= 0.01) return // no crear el loop hasta que haga falta
    if (!buffers[name]) return // aún no cargó el sample
    const src = ctx.createBufferSource()
    src.buffer = buffers[name]
    src.loop = true
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(g)
    g.connect(sfxBus)
    src.start()
    b = beds[name] = { gain: g }
  }
  // count ya viene ponderado por cercanía a la cámara (GameScene): sin naves cerca → silencio.
  const target = count > 0.01 ? Math.min(max, count * perUnit) : 0
  // Escribir gain.value cada frame da saltos escalonados (zipper noise: crepita). Se agenda una
  // rampa en el hilo de audio y solo cuando el objetivo cambia de verdad.
  if (b.target !== undefined && Math.abs(target - b.target) < 0.002) return
  b.target = target
  b.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.35)
}

// Llamar cada frame con { tipoDeNave: peso } de las naves CERCANAS (peso 0..1 por distancia a la
// cámara, sumado por tipo). Cada tipo suena con su propio motor; los tipos ausentes se apagan.
// Silencia todos los motores al salir de la partida (si no, quedan sonando con el último volumen).
export function stopShipEngines() {
  stopAmbience()
  if (!ctx) return
  for (const [name, b] of Object.entries(beds)) {
    if (!name.startsWith('ship_')) continue
    b.target = 0
    b.gain.gain.cancelScheduledValues(ctx.currentTime)
    b.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
  }
}

export function updateShipEngines(weights) {
  for (const [type, [perUnit, max]] of Object.entries(SHIP_ENGINE_MIX)) {
    bedTarget('ship_' + type, weights[type] || 0, perUnit, max)
  }
}

// Llamar cada frame: mantiene el centro de cámara para espacializar los SFX.
export function updateSound(cx, cy, viewW) {
  view.cx = cx; view.cy = cy; view.w = viewW || view.w
  const fresh = engineWorld && performance.now() - engineWorld.updated < 200
  if (fresh) {
    const { pan, vol } = spatial(engineWorld.x, engineWorld.y)
    setEngine(vol > 0.02 && engineWorld.speed01 > 0.01, engineWorld.speed01 * vol, pan)
  } else setEngine(false, 0, 0)
}

let engineWorld = null
// GameScene.update, después de General.update, debe llamar con la velocidad real:
// setEngineFromWorld(this.general.x, this.general.y, velocidadActual / this.general.speed)
// El motor permanece apagado hasta conectar esa llamada (GameScene está fuera del alcance S4).
export function setEngineFromWorld(x, y, speed01) {
  if (!ctx || !Number.isFinite(x) || !Number.isFinite(y)) return
  engineWorld = { x, y, speed01: Math.max(0, Math.min(1, speed01 || 0)), updated: performance.now() }
}

// ------------------------------------------------ SFX sintetizados (Fase 10: habilidades y UI)
// Todo con osciladores + ruido: no pesan nada y no requieren samples nuevos.
function out(vol, pan) {
  const g = ctx.createGain()
  g.gain.value = vol
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(sfxBus) }
  else g.connect(sfxBus)
  return g
}

function sweep({ type = 'sine', f0, f1, dur, gain = 0.2, at = 0, pan = 0, vol = 1 }) {
  const t = ctx.currentTime + at
  const g = out(1, pan)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain * vol, t + Math.min(0.03, dur * 0.2))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  o.connect(g)
  o.start(t)
  o.stop(t + dur + 0.02)
}

let noiseBuf = null
function noise({ dur, gain = 0.2, at = 0, pan = 0, vol = 1, lp = 2000 }) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t = ctx.currentTime + at
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(lp, t)
  f.frequency.exponentialRampToValueAtTime(80, t + dur)
  const g = out(1, pan)
  g.gain.setValueAtTime(gain * vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f); f.connect(g)
  src.start(t)
  src.stop(t + dur + 0.02)
}

function at(x, y) { return x == null ? { pan: 0, vol: 1 } : spatial(x, y) }

export function sfxCharge(x, y, ms = 800) {
  if (!ctx) return
  const { pan, vol } = at(x, y)
  sweep({ type: 'sawtooth', f0: 90, f1: 900, dur: ms / 1000, gain: 0.12, pan, vol })
  sweep({ type: 'sine', f0: 180, f1: 1800, dur: ms / 1000, gain: 0.08, pan, vol })
}

export function sfxMegaBeam(x, y) {
  if (!ctx) return
  const { pan, vol } = at(x, y)
  noise({ dur: 0.9, gain: 0.5, pan, vol, lp: 5000 })
  sweep({ type: 'sawtooth', f0: 420, f1: 40, dur: 1.1, gain: 0.3, pan, vol })
  sweep({ type: 'square', f0: 1200, f1: 200, dur: 0.5, gain: 0.08, pan, vol })
  playSample('laser', x, y, { gain: 1.2, rate: 0.45, bass: 12, reverb: 0.6, throttleMs: 0 })
}

export function sfxEmp(x, y) {
  if (!ctx) return
  const { pan, vol } = at(x, y)
  playBank('forcefield', x, y, { gain: 0.8, rate: 0.7, reverb: 0.6, throttleMs: 0 })
  sweep({ type: 'sine', f0: 160, f1: 30, dur: 0.8, gain: 0.5, pan, vol })
  sweep({ type: 'triangle', f0: 2400, f1: 120, dur: 0.6, gain: 0.12, pan, vol })
  noise({ dur: 0.5, gain: 0.25, pan, vol, lp: 1500 })
}

export function sfxRepair(x, y) {
  if (!ctx) return
  const { pan, vol } = at(x, y)
  playBank('forcefield', x, y, { gain: 0.3, rate: 1.3, throttleMs: 0 })
  ;[523, 659, 784, 1047].forEach((f, i) => sweep({ type: 'sine', f0: f, f1: f * 1.01, dur: 0.25, gain: 0.12, at: i * 0.07, pan, vol }))
}

export function sfxStrike(x, y) {
  if (!ctx) return
  const { pan, vol } = at(x, y)
  sweep({ type: 'sine', f0: 1800, f1: 300, dur: 0.9, gain: 0.08, pan, vol }) // silbido de caída
}

export function sfxUi(kind = 'click') {
  if (!ctx) return
  const UI_BANK = { click: ['uiClick', 0.35], hover: ['uiHover', 0.18], error: ['uiError', 0.4], open: ['uiOpen', 0.35], close: ['uiClose', 0.35], confirm: ['uiConfirm', 0.4], switch: ['uiSwitch', 0.35] }
  const [bank, gain] = UI_BANK[kind] || UI_BANK.click
  if (playBank(bank, null, null, { gain, detune: 0.06, throttleMs: kind === 'hover' ? 60 : 25 })) return
  if (kind === 'click') sweep({ type: 'triangle', f0: 880, f1: 660, dur: 0.06, gain: 0.08 })
  else if (kind === 'hover') sweep({ type: 'sine', f0: 1400, f1: 1500, dur: 0.03, gain: 0.03 })
  else if (kind === 'error') sweep({ type: 'square', f0: 180, f1: 120, dur: 0.14, gain: 0.07 })
}

export function sfxPurchase() {
  if (!ctx) return
  // Tienda / investigación: power up de Kenney + confirmación. Las mejoras DENTRO de la partida
  // (sfxUpgrade) siguen con el sonido sintetizado original, a pedido.
  if (playBank('powerUp', null, null, { gain: 0.5, throttleMs: 0 })) { playBank('uiConfirm', null, null, { gain: 0.35, throttleMs: 0 }); return }
  ;[988, 1319, 1976].forEach((f, i) => sweep({ type: 'triangle', f0: f, f1: f, dur: 0.18, gain: 0.1, at: i * 0.06 }))
  noise({ dur: 0.35, gain: 0.05, lp: 9000, at: 0.1 })
}

// ---- Torretas del Arsenal
export function sfxTesla(x, y) {
  if (!ctx || !throttle('tesla', 70)) return
  const { pan, vol } = at(x, y)
  if (vol <= 0.03) return
  if (TONE_SHOTS && playTone('tesla', pan, vol)) return
  if (playBank('zap', x, y, { gain: 0.5, throttleMs: 0 })) return
  noise({ dur: 0.12, gain: 0.18, lp: 6000, pan, vol })
  sweep({ type: 'square', f0: 1800, f1: 400, dur: 0.1, gain: 0.05, pan, vol })
}
export function sfxCryo(x, y) {
  if (!ctx || !throttle('cryo', 90)) return
  const { pan, vol } = at(x, y)
  if (vol <= 0.03) return
  if (TONE_SHOTS && playTone('cryo', pan, vol)) return
  if (playBank('phaser', x, y, { gain: 0.3, throttleMs: 0 })) return
  sweep({ type: 'sine', f0: 2400, f1: 1600, dur: 0.18, gain: 0.05, pan, vol })
  noise({ dur: 0.2, gain: 0.05, lp: 9000, pan, vol })
}
export function sfxRail(x, y) {
  if (!ctx || !throttle('rail', 120)) return
  const { pan, vol } = at(x, y)
  if (vol <= 0.03) return
  if (TONE_SHOTS && playTone('rail', pan, vol)) return
  if (playBank('laser', x, y, { gain: 0.9, rate: 0.6, bass: 10, reverb: 0.4, throttleMs: 0 })) return
  sweep({ type: 'sawtooth', f0: 3000, f1: 120, dur: 0.35, gain: 0.12, pan, vol })
  noise({ dur: 0.25, gain: 0.2, lp: 3000, pan, vol })
}
export function sfxFlak(x, y) {
  if (!ctx || !throttle('flak', 80)) return
  const { pan, vol } = at(x, y)
  if (vol <= 0.03) return
  if (TONE_SHOTS && playTone('flak', pan, vol)) return
  if (playBank('hitHeavy', x, y, { gain: 0.8, bass: 6, throttleMs: 0 })) return
  noise({ dur: 0.16, gain: 0.3, lp: 1800, pan, vol })
  sweep({ type: 'triangle', f0: 220, f1: 60, dur: 0.15, gain: 0.12, pan, vol })
}

export function sfxMortar(x, y) {
  if (!ctx || !throttle('mortar', 120)) return
  const { pan, vol } = at(x, y)
  if (vol <= 0.03) return
  if (TONE_SHOTS && playTone('mortar', pan, vol)) return
  if (playBank('boom', x, y, { gain: 0.7, bass: 8, reverb: 0.4, throttleMs: 0 })) return
  sweep({ type: 'sine', f0: 180, f1: 55, dur: 0.38, gain: 0.2, pan, vol })
  noise({ dur: 0.18, gain: 0.12, lp: 1100, pan, vol })
}

// Mejora comprada: barrido ascendente + acorde brillante.
export function sfxUpgrade(x, y) {
  if (!ctx) return
  const { pan, vol } = at(x, y)
  sweep({ type: 'sawtooth', f0: 220, f1: 880, dur: 0.22, gain: 0.08, pan, vol })
  ;[660, 880, 1320].forEach((f, i) => sweep({ type: 'triangle', f0: f, f1: f * 1.005, dur: 0.35, gain: 0.09, at: 0.12 + i * 0.05, pan, vol }))
  noise({ dur: 0.3, gain: 0.06, lp: 8000, at: 0.1, pan, vol })
}

// Recolección de un meteorito especial / bonus.
export function sfxBonus(x, y) {
  if (!ctx) return
  const { pan, vol } = at(x, y)
  if (playBank('warp', x, y, { gain: 0.5, throttleMs: 0 })) return
  ;[784, 988, 1175, 1568].forEach((f, i) => sweep({ type: 'sine', f0: f, f1: f, dur: 0.16, gain: 0.08, at: i * 0.05, pan, vol }))
}

// Alarma corta (meteorito explosivo armado / evento).
export function sfxAlarm(x, y) {
  if (!ctx || !throttle('alarm', 900)) return
  const { pan, vol } = at(x, y)
  sweep({ type: 'square', f0: 660, f1: 440, dur: 0.18, gain: 0.05, pan, vol })
  sweep({ type: 'square', f0: 660, f1: 440, dur: 0.18, gain: 0.05, at: 0.22, pan, vol })
}

// Esfera sanadora que nace / cura.
export function sfxHeal(x, y) {
  if (!ctx || !throttle('heal', 220)) return
  const { pan, vol } = at(x, y)
  if (vol <= 0.05) return
  if (playBank('forcefield', x, y, { gain: 0.12, throttleMs: 0, reach: 1 })) return
  sweep({ type: 'sine', f0: 900, f1: 1400, dur: 0.12, gain: 0.035, pan, vol })
}

export function sfxLevelUp() {
  if (!ctx) return
  if (playBank('jingleLevel', null, null, { gain: 0.55, detune: 0, throttleMs: 0 })) return
  ;[392, 523, 659, 784, 1047].forEach((f, i) => sweep({ type: 'sawtooth', f0: f, f1: f, dur: 0.22, gain: 0.07, at: i * 0.09 }))
}

// Señales de oleada y estado de la partida.
export function sfxWaveStart(isBoss) {
  if (!ctx) return
  const dur = isBoss ? 1.35 : 0.75
  playBank(isBoss ? 'flybyL' : 'flybyM', null, null, { gain: isBoss ? 0.7 : 0.45, bass: 6, reverb: 0.5, throttleMs: 0 }) // la flota entra en sector
  sweep({ type: 'sawtooth', f0: isBoss ? 95 : 145, f1: isBoss ? 58 : 105, dur, gain: isBoss ? 0.075 : 0.055 })
  sweep({ type: 'sine', f0: isBoss ? 72 : 110, f1: isBoss ? 48 : 82, dur: dur + 0.15, gain: 0.16 })
  if (isBoss) sweep({ type: 'sine', f0: 107, f1: 71, dur: 1.5, gain: 0.07, at: 0.12 })
}

export function sfxCoreAlarm() {
  if (!ctx || !throttle('coreAlarm', 2500)) return
  for (const delay of [0, 0.38]) {
    sweep({ type: 'triangle', f0: 780, f1: 520, dur: 0.3, gain: 0.09, at: delay })
    sweep({ type: 'sine', f0: 390, f1: 260, dur: 0.3, gain: 0.07, at: delay })
  }
}

export function sfxVictory() {
  if (!ctx) return
  if (playBank('jingleWin', null, null, { gain: 0.7, detune: 0, throttleMs: 0 })) return
  ;[[392, 0], [494, 0.32], [587, 0.64], [784, 0.96]].forEach(([f, delay]) => {
    sweep({ type: 'triangle', f0: f, f1: f * 1.005, dur: 0.65, gain: 0.075, at: delay })
    sweep({ type: 'sine', f0: f * 1.5, f1: f * 1.5, dur: 0.55, gain: 0.035, at: delay })
  })
  ;[392, 494, 587].forEach((f) => sweep({ type: 'sine', f0: f, f1: f, dur: 0.7, gain: 0.055, at: 1.35 }))
}

export function sfxDefeat() {
  if (!ctx) return
  if (playBank('jingleLose', null, null, { gain: 0.7, detune: 0, throttleMs: 0 })) return
  ;[[392, 0], [330, 0.33], [262, 0.66], [196, 0.99]].forEach(([f, delay]) => {
    sweep({ type: 'triangle', f0: f, f1: f * 0.94, dur: 0.75, gain: 0.07, at: delay })
    sweep({ type: 'sine', f0: f / 2, f1: f / 2, dur: 0.65, gain: 0.08, at: delay })
  })
  sweep({ type: 'sine', f0: 98, f1: 62, dur: 0.8, gain: 0.11, at: 1.3 })
}

// size es un multiplicador aproximado del tamaño del enemigo.
export function sfxEnemyDeath(x, y, size = 1) {
  if (!ctx || !throttle('enemyDeath', 75)) return
  const { pan, vol } = at(x, y)
  if (vol <= 0.03) return
  if (size >= 1.5) {
    sweep({ type: 'sine', f0: 150, f1: 55, dur: 0.3, gain: 0.14, pan, vol })
    noise({ dur: 0.17, gain: 0.08, lp: 900, pan, vol })
  } else {
    sweep({ type: 'triangle', f0: 1400, f1: 520, dur: 0.11, gain: 0.065, pan, vol })
    noise({ dur: 0.07, gain: 0.035, lp: 4200, pan, vol })
  }
}


// ------------------------------------------------ construcción, impactos y naves (bancos Kenney)
export function sfxBuild(x, y) {
  if (!ctx || !throttle('build', 60)) return
  playBank('build', x, y, { gain: 0.55, bass: 4, throttleMs: 0 })
}

// Impacto sobre una estructura. Throttle propio: con 200 enemigos no debe ser una ametralladora.
export function sfxHit(x, y, heavy = false) {
  if (!ctx || !throttle(heavy ? 'hitH' : 'hit', heavy ? 90 : 70)) return
  playBank(heavy ? 'hitHeavy' : 'hitMetal', x, y, { gain: heavy ? 0.5 : 0.3, reach: 1.2, throttleMs: 0 })
}

// Una nave pasa/aparece. size: 'small' | 'medium' | 'large'. Suena solo si está cerca de la cámara.
export function sfxFlyby(x, y, size = 'small') {
  if (!ctx || !throttle('flyby_' + size, size === 'large' ? 1200 : 450)) return
  const bank = size === 'large' ? 'flybyL' : size === 'medium' ? 'flybyM' : 'flybyS'
  playBank(bank, x, y, { gain: size === 'large' ? 0.5 : 0.3, reach: 1.1, reverb: 0.3, throttleMs: 0 })
}

// ------------------------------------------------------------ ambiente de espacio profundo
// Capa continua bajo la música, sin samples: drones graves desafinados con LFO lento + viento
// espacial (ruido marrón filtrado que respira) + «pings» de consola lejanos cada 9-22 s. Va por
// musicBus, así el slider de Música lo controla. start/stop son idempotentes.
let ambience = null
export function startAmbience() {
  if (!ctx || !musicBus || ambience) return
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.linearRampToValueAtTime(0.5, t + 4)
  out.connect(musicBus)
  const stoppables = []
  for (const [f, det, g] of [[55, 0, 0.09], [55, 7, 0.07], [82.4, -5, 0.05], [110.5, 3, 0.025]]) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    o.detune.value = det
    const og = ctx.createGain()
    og.gain.value = g
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.03 + Math.random() * 0.05
    const lg = ctx.createGain()
    lg.gain.value = g * 0.5
    lfo.connect(lg); lg.connect(og.gain)
    o.connect(og); og.connect(out)
    o.start(t); lfo.start(t)
    stoppables.push(o, lfo)
  }
  const len = ctx.sampleRate * 4
  const nb = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = nb.getChannelData(c)
    let last = 0
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5 }
  }
  const ns = ctx.createBufferSource()
  ns.buffer = nb
  ns.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 320
  bp.Q.value = 0.7
  const sweepLfo = ctx.createOscillator()
  sweepLfo.frequency.value = 0.045
  const sweepG = ctx.createGain()
  sweepG.gain.value = 140
  sweepLfo.connect(sweepG); sweepG.connect(bp.frequency)
  const wg = ctx.createGain()
  wg.gain.value = 0.16
  ns.connect(bp); bp.connect(wg); wg.connect(out)
  ns.start(t); sweepLfo.start(t)
  stoppables.push(ns, sweepLfo)
  ambience = { out, stoppables, timer: 0 }
  const ping = () => {
    if (!ambience) return
    const list = banks.computer
    if (list?.length && ctx.state === 'running') {
      const src = ctx.createBufferSource()
      src.buffer = list[(Math.random() * list.length) | 0]
      src.playbackRate.value = 0.7 + Math.random() * 0.5
      const g = ctx.createGain()
      g.gain.value = 0.05 + Math.random() * 0.05
      src.connect(g)
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner()
        p.pan.value = Math.random() * 2 - 1
        g.connect(p); p.connect(out)
        if (reverbBus) { const wet = ctx.createGain(); wet.gain.value = 1.5; p.connect(wet); wet.connect(reverbBus) }
      } else g.connect(out)
      src.start()
    }
    ambience.timer = setTimeout(ping, 9000 + Math.random() * 13000)
  }
  ambience.timer = setTimeout(ping, 6000)
}

export function stopAmbience() {
  if (!ambience || !ctx) return
  const a = ambience
  ambience = null
  clearTimeout(a.timer)
  const t = ctx.currentTime
  a.out.gain.cancelScheduledValues(t)
  a.out.gain.setValueAtTime(a.out.gain.value, t)
  a.out.gain.linearRampToValueAtTime(0.0001, t + 1.2)
  for (const n of a.stoppables) { try { n.stop(t + 1.3) } catch { /* ya parado */ } }
}
