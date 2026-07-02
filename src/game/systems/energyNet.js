import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { CORE } from '../balance.js'

const LINK_ON = 0x6cc8ff
const LINK_OFF = 0x37506a
const LINK_DEAD = 0x2a3a4a

// Estado para pulso de flujo (por enlace)
const flowPulses = new Map() // enlace -> { progress, speed, parent, child }

// Helpers puros (solo necesitan la estructura). Los comparte la colocación (findAttachRelay).
export function isRelay(s) {
  return !s.building && (s.isCore || s.role === 'relay')
}

// Puertos máximos de un relay; los no-relays no limitan (solo se cuelgan de relays).
export function portCap(s) {
  if (s.isCore) return s.def.maxPorts || 8
  if (s.role === 'relay') return s.def.maxPorts || 5
  return Infinity
}

// Reglas: un enlace es legal solo si AL MENOS un extremo es relay (núcleo/nodo).
// Los relays tienen puertos limitados: se conservan los enlaces más cercanos.
// La potencia (señal) fluye desde el núcleo por BFS; sin ruta = sin señal = apagado.
export function recomputeNetwork(scene) {
  const n = scene.structures.length
  const adj = Array.from({ length: n }, () => [])
  scene.links = []
  scene.structures.forEach((s) => { s.ports = 0 })

  // 1) Enlaces candidatos legales (al menos un relay, en rango), ordenados por cercanía.
  const candidates = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = scene.structures[i]
      const b = scene.structures[j]
      if (!isRelay(a) && !isRelay(b)) continue // ilegal: no-relay ↔ no-relay
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)
      if (d <= Math.max(a.range, b.range)) candidates.push({ a, b, i, j, d })
    }
  }
  candidates.sort((p, q) => p.d - q.d)

  // 2) Respetar puertos: un enlace sobrevive solo si ambos extremos tienen puerto libre.
  for (const c of candidates) {
    if (c.a.ports >= portCap(c.a) || c.b.ports >= portCap(c.b)) continue
    c.a.ports++
    c.b.ports++
    adj[c.i].push(c.j)
    adj[c.j].push(c.i)
    scene.links.push([c.a, c.b])
  }

  // 3) Flood de señal desde el núcleo.
  scene.structures.forEach((s) => s.setPowered(false))
  const coreIdx = scene.structures.findIndex((s) => s.isCore)
  if (coreIdx >= 0) {
    const queue = [coreIdx]
    scene.structures[coreIdx].setPowered(true)
    while (queue.length) {
      const cur = queue.shift()
      for (const next of adj[cur]) {
        if (!scene.structures[next].powered) {
          scene.structures[next].setPowered(true)
          queue.push(next)
        }
      }
    }
  }

  recomputeEnergyCap(scene)
  drawLinks(scene)
}

// Almacén global = núcleo + baterías vivas. Recalcular al construir/destruir.
export function recomputeEnergyCap(scene) {
  let cap = CORE.energyCap || 100
  for (const s of scene.structures) {
    if (!s.dead && !s.building && s.role === 'battery') cap += s.energyCap ?? s.def.energyCap ?? 0
  }
  gameState.energyMax = cap
  gameState.energy = Math.min(gameState.energy, cap)
}

export function drawLinks(scene) {
  const g = scene.linkGraphics
  g.clear()

  // Determinar el padre de cada estructura para el pulso de flujo (BFS desde core)
  const parentMap = new Map()
  const core = scene.structures.find((s) => s.isCore)
  if (core && core.powered) {
    const queue = [core]
    const visited = new Set([core])
    while (queue.length) {
      const cur = queue.shift()
      for (const [a, b] of scene.links) {
        if (a === cur && !visited.has(b) && b.powered) {
          parentMap.set(b, a)
          visited.add(b)
          queue.push(b)
        } else if (b === cur && !visited.has(a) && a.powered) {
          parentMap.set(a, b)
          visited.add(a)
          queue.push(a)
        }
      }
    }
  }

  for (const [a, b] of scene.links) {
    // No dibujar enlaces directos entre edificios que no son relays.
    if (!isRelay(a) && !isRelay(b)) continue

    const on = a.powered && b.powered
    const isCoreRelay = a.isCore || b.isCore || a.role === 'relay' || b.role === 'relay'
    const isBothRelay = (a.isCore || a.role === 'relay') && (b.isCore || b.role === 'relay')

    // Jerarquía visual: core↔relay gruesos/brillantes, relay↔hoja finos
    if (isBothRelay) {
      g.lineStyle(on ? 3 : 2, on ? LINK_ON : LINK_OFF, on ? 0.7 : 0.25)
    } else {
      g.lineStyle(on ? 1.5 : 1, on ? LINK_ON : LINK_DEAD, on ? 0.4 : 0.15)
    }

    if (!on) {
      // Sin energía: gris punteado
      g.lineStyle(1, LINK_DEAD, 0.25)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy)
      const segments = Math.max(5, Math.floor(dist / 30))
      for (let i = 0; i < segments; i++) {
        const t1 = i / segments
        const t2 = (i + 0.5) / segments
        if (i % 2 === 0) {
          g.moveTo(a.x + dx * t1, a.y + dy * t1)
          g.lineTo(a.x + dx * t2, a.y + dy * t2)
        }
      }
      g.strokePath()
    } else {
      // Con energía: línea continua
      g.beginPath()
      g.moveTo(a.x, a.y)
      g.lineTo(b.x, b.y)
      g.strokePath()

      // Pulso de flujo: punto que viaja del padre al hijo
      const child = parentMap.get(a) === b ? a : (parentMap.get(b) === a ? b : null)
      if (child) {
        const parent = parentMap.get(child)
        if (!flowPulses.has(`${parent.id}-${child.id}`)) {
          flowPulses.set(`${parent.id}-${child.id}`, {
            progress: Math.random(),
            speed: 0.8 + Math.random() * 0.4,
            parent,
            child,
          })
        }
      }
    }
  }

  // Dibujar pulsos de flujo
  const now = scene.time.now
  for (const pulse of flowPulses.values()) {
    if (!pulse.parent.powered || !pulse.child.powered) continue
    pulse.progress += (1 / 60) * pulse.speed
    if (pulse.progress > 1) pulse.progress = 0

    const t = pulse.progress
    const x = pulse.parent.x + (pulse.child.x - pulse.parent.x) * t
    const y = pulse.parent.y + (pulse.child.y - pulse.parent.y) * t

    g.fillStyle(0x8be9fd, 0.8)
    g.fillCircle(x, y, 2.5)
  }

  // Limpiar pulsos de enlaces que ya no existen
  const currentKeys = new Set(scene.links.map(([a, b]) => `${a.id}-${b.id}|${b.id}-${a.id}`))
  for (const key of flowPulses.keys()) {
    const [pid, cid] = key.split('-')
    if (!currentKeys.has(`${pid}-${cid}|${cid}-${pid}`)) {
      flowPulses.delete(key)
    }
  }
}
