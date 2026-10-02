// Instrumentos persistentes. Solo se importa Tone en el cliente y después de crear el
// AudioContext de sound.js; ninguna voz se conecta al destino propio de Tone.
import { LOW_GFX } from '../quality.js'

let Tone
let ready = false
let starting = null
let pools = {}
let engine = null
let boom = null
let sharedReverb = null
let engineUpdatedAt = 0

const specs = {
  laser:       { count: 6, level: 0.20, duration: 0.10, note: 900, end: 300, type: 'fm' },
  missile:     { count: 4, level: 0.23, duration: 0.32, note: 1650, end: 420, type: 'noise' },
  rail:        { count: 3, level: 0.25, duration: 0.23, note: 140, type: 'membrane', accent: 'noise' },
  tesla:       { count: 4, level: 0.15, duration: 0.13, note: 3600, type: 'noise' },
  flak:        { count: 3, level: 0.15, duration: 0.26, note: 450, type: 'metal' },
  mortar:      { count: 3, level: 0.28, duration: 0.42, note: 75, type: 'membrane' },
  cryo:        { count: 3, level: 0.12, duration: 0.25, note: 1900, end: 1250, type: 'fm' },
  generalShot: { count: 4, level: 0.12, duration: 0.075, note: 1450, end: 760, type: 'fm' },
  enemyBeam:   { count: 4, level: 0.14, duration: 0.16, note: 300, end: 220, type: 'saw' },
}

function instrument(type, kind) {
  if (type === 'fm') return new Tone.FMSynth({
    harmonicity: kind === 'cryo' ? 2.4 : 1.5, modulationIndex: kind === 'cryo' ? 3 : 8,
    envelope: { attack: 0.004, decay: 0.05, sustain: 0.12, release: 0.08 },
    modulationEnvelope: { attack: 0.003, decay: 0.07, sustain: 0, release: 0.04 },
  })
  if (type === 'membrane') return new Tone.MembraneSynth({
    pitchDecay: kind === 'mortar' ? 0.12 : 0.035, octaves: kind === 'mortar' ? 5 : 8,
    envelope: { attack: 0.002, decay: kind === 'mortar' ? 0.35 : 0.16, sustain: 0, release: 0.12 },
  })
  if (type === 'metal') return new Tone.MetalSynth({
    frequency: 450, harmonicity: 4.2, modulationIndex: 24, resonance: 900,
    envelope: { attack: 0.001, decay: 0.055, release: 0.035 },
  })
  if (type === 'saw') return new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { type: 'lowpass', Q: 2 },
    filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.08, baseFrequency: 450, octaves: 2 },
    envelope: { attack: 0.004, decay: 0.08, sustain: 0.18, release: 0.07 },
  })
  return new Tone.NoiseSynth({
    noise: { type: kind === 'tesla' ? 'pink' : 'white' },
    envelope: { attack: 0.002, decay: kind === 'missile' ? 0.22 : 0.10, sustain: 0, release: 0.05 },
  })
}

function makeVoice(kind, spec, output) {
  const synth = instrument(spec.type, kind)
  const filter = new Tone.Filter(kind === 'missile' ? 1800 : kind === 'rail' ? 4200 : 3200,
    kind === 'rail' ? 'highpass' : 'lowpass')
  const pan = new Tone.Panner(0)
  const level = new Tone.Gain(0)
  let last = synth
  const effects = []
  if (kind === 'tesla') {
    const crusher = new Tone.BitCrusher(LOW_GFX ? 7 : 5)
    const distortion = new Tone.Distortion(LOW_GFX ? 0.15 : 0.35)
    last.connect(crusher); crusher.connect(distortion); last = distortion
    effects.push(crusher, distortion)
  } else if (kind === 'cryo' && !LOW_GFX) {
    const chorus = new Tone.Chorus({ frequency: 2.8, delayTime: 2.5, depth: 0.35, wet: 0.22 }).start()
    last.connect(chorus); last = chorus
    effects.push(chorus)
  } else if (kind === 'enemyBeam' && !LOW_GFX) {
    const vibrato = new Tone.Vibrato({ frequency: 12, depth: 0.07, wet: 0.3 })
    last.connect(vibrato); last = vibrato
    effects.push(vibrato)
  }
  last.connect(filter); filter.connect(pan); pan.connect(level); level.connect(output)
  let accent = null
  if (kind === 'rail' || kind === 'missile') {
    accent = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.01 } })
    const high = new Tone.Filter(kind === 'rail' ? 4500 : 3200, 'highpass')
    accent.connect(high); high.connect(pan)
    effects.push(high)
  }
  return { synth, filter, pan, level, accent, effects, freeAt: 0 }
}

export function initTone(ctx, outputNode) {
  if (typeof window === 'undefined' || !ctx || !outputNode) return Promise.resolve(false)
  if (ready) return Promise.resolve(true)
  if (starting) return starting
  starting = (async () => {
    try {
      Tone = await import('tone')
      Tone.setContext(ctx)
      const next = {}
      for (const [kind, spec] of Object.entries(specs)) {
        next[kind] = Array.from({ length: LOW_GFX ? Math.max(2, Math.ceil(spec.count / 2)) : spec.count },
          () => makeVoice(kind, spec, outputNode))
      }
      pools = next
      if (!LOW_GFX) {
        sharedReverb = new Tone.Reverb({ decay: 1.2, wet: 0.18 })
        sharedReverb.connect(outputNode)
        await sharedReverb.ready
      }
      boom = makeVoice('mortar', { ...specs.mortar }, outputNode)
      if (sharedReverb) boom.level.connect(sharedReverb)
      const enginePan = new Tone.Panner(0)
      const engineGain = new Tone.Gain(0)
      enginePan.connect(engineGain); engineGain.connect(outputNode)
      const osc = new Tone.FatOscillator({ frequency: 65, type: 'sawtooth', count: LOW_GFX ? 2 : 3, spread: 9 })
      const rumble = new Tone.Noise('pink')
      const rumbleFilter = new Tone.Filter(170, 'lowpass')
      const rumbleGain = new Tone.Gain(0.08)
      osc.connect(enginePan)
      rumble.connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(enginePan)
      osc.start(); rumble.start()
      engine = { osc, rumble, rumbleFilter, rumbleGain, pan: enginePan, gain: engineGain }
      ready = true
      return true
    } catch (error) {
      console.warn('Tone.js no disponible; se usan los sonidos originales.', error)
      ready = false
      return false
    }
  })()
  return starting
}

// Devuelve false solo si Tone no está listo: sound.js puede usar su sonido anterior.
// Si el pool está lleno, se descarta la voz para mantener el límite global por arma.
export function play(kind, pan, gain) {
  if (!ready || !pools[kind]) return false
  try {
  const spec = specs[kind]
  const now = Tone.now()
  const voice = pools[kind].find((v) => v.freeAt <= now)
  if (!voice || gain <= 0) return true
  const variation = 0.94 + Math.random() * 0.12
  const velocity = 0.78 + Math.random() * 0.22
  voice.pan.pan.value = Math.max(-1, Math.min(1, pan))
  voice.level.gain.value = Math.min(1, Math.max(0, gain)) * spec.level
  voice.filter.frequency.value = (kind === 'cryo' ? 5500 : kind === 'laser' ? 2900 : 3200) * (0.9 + Math.random() * 0.2)
  const { synth } = voice
  const note = spec.note * variation
  if (spec.type === 'noise') {
    voice.filter.frequency.setValueAtTime((kind === 'missile' ? 4700 : 3500) * variation, now)
    voice.filter.frequency.exponentialRampToValueAtTime((kind === 'missile' ? 520 : 900) * variation, now + spec.duration)
    synth.triggerAttackRelease(spec.duration, now, velocity)
    if (voice.accent) voice.accent.triggerAttackRelease(0.025, now, velocity * 0.65)
  } else if (spec.type === 'metal') {
    synth.frequency.value = note
    for (let i = 0; i < 3; i++) synth.triggerAttackRelease(0.035, now + i * 0.07, velocity * (1 - i * 0.2))
  } else {
    synth.triggerAttackRelease(note, spec.duration, now, velocity)
    if (spec.end) synth.frequency.exponentialRampToValueAtTime(spec.end * variation, now + spec.duration * 0.75)
    if (voice.accent) voice.accent.triggerAttackRelease(0.045, now + 0.025, velocity)
  }
  voice.freeAt = now + spec.duration + 0.09
  return true
  } catch (error) {
    console.warn('Tone.js falló durante un disparo; se restauran los sonidos originales.', error)
    ready = false
    return false
  }
}

export function playExplosion(pan, gain) {
  if (!ready || !boom || gain <= 0) return false
  const now = Tone.now()
  if (boom.freeAt > now) return true
  boom.pan.pan.value = Math.max(-1, Math.min(1, pan))
  boom.level.gain.value = Math.min(0.3, gain * 0.13)
  boom.synth.triggerAttackRelease(55 * (0.94 + Math.random() * 0.12), 0.35, now, 0.9)
  boom.freeAt = now + 0.5
  return true
}

export function setEngine(active, speed01, pan) {
  if (!ready || !engine) return
  const now = Tone.now()
  if (now - engineUpdatedAt < 0.08) return
  engineUpdatedAt = now
  const speed = Math.max(0, Math.min(1, speed01 || 0))
  engine.pan.pan.rampTo(Math.max(-1, Math.min(1, pan || 0)), 0.08) // saltos de paneo = clics
  engine.osc.frequency.rampTo(65 + speed * 75, 0.1)
  engine.rumbleFilter.frequency.rampTo(150 + speed * 250, 0.1)
  engine.gain.gain.rampTo(active ? 0.005 + speed * 0.02 : 0, active ? 0.12 : 0.25, now) // más bajo: el comandante no debe tapar la batalla
}
