import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { CORE } from '../balance.js'

const LINK_ON = 0x6cc8ff
const LINK_OFF = 0x37506a

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
    if (!s.dead && !s.building && s.role === 'battery') cap += s.def.energyCap || 0
  }
  gameState.energyMax = cap
  gameState.energy = Math.min(gameState.energy, cap)
}

export function drawLinks(scene) {
  const g = scene.linkGraphics
  g.clear()
  for (const [a, b] of scene.links) {
    // No dibujar enlaces directos entre edificios que no son relays.
    // Todo lo demás (relay↔relay y relay↔no-relay) sí se muestra.
    if (!isRelay(a) && !isRelay(b)) continue
    const on = a.powered && b.powered
    g.lineStyle(on ? 2 : 1.5, on ? LINK_ON : LINK_OFF, on ? 0.5 : 0.18)
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.strokePath()
  }
}
