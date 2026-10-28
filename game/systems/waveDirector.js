// Director de oleadas: elige desde qué direcciones ataca una oleada y reparte
// las naves entre esas direcciones (sin agregar ni quitar naves).
// Función PURA: no importa Phaser ni usa Math.random; el azar entra por `rng`.

const TAU = Math.PI * 2
const SAMPLES = 16 // puntos en que se muestrea la ruta aparición → core
const NEAR_ROUTE = 350 // radio para contar una estructura "en la ruta"
const THREAT_KINDS = ['defense', 'economy', 'relay']

// Distancia mínima de un punto al segmento A→B.
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  if (t < 0) t = 0
  if (t > 1) t = 1
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

// Diferencia angular mínima en el círculo (0..π).
function angDiff(a, b) {
  const d = Math.abs(a - b) % TAU
  return d > Math.PI ? TAU - d : d
}

// Analiza una dirección candidata: cuánta defensa cubre su ruta y qué
// estructuras quedan cerca de ella.
function analyzeAngle(a, core, structures, spawnRadius) {
  const px = core.x + Math.cos(a) * spawnRadius
  const py = core.y + Math.sin(a) * spawnRadius
  const near = { defense: 0, economy: 0, relay: 0 }
  let defense = 0
  for (const s of structures) {
    if (s.kind === 'defense') {
      const range = s.range || 0
      if (range > 0) {
        let hits = 0
        for (let i = 0; i < SAMPLES; i++) {
          const t = i / (SAMPLES - 1)
          const x = px + (core.x - px) * t
          const y = py + (core.y - py) * t
          if (Math.hypot(x - s.x, y - s.y) <= range) hits++
        }
        defense += s.power * (hits / SAMPLES)
      }
    }
    if (THREAT_KINDS.includes(s.kind) && distToSegment(s.x, s.y, px, py, core.x, core.y) < NEAR_ROUTE) {
      near[s.kind]++
    }
  }
  return { a, defense, near, score: 0 }
}

// Vulnerabilidad de una dirección para un tag de objetivo.
function vulnOf(info, kind) {
  if (kind === 'core') return 1.5 / (1 + info.defense)
  const value = info.near[kind] || 0
  return (value + 0.5) / (1 + info.defense)
}

// Cuotas enteras que suman exactamente `total` (método del mayor resto).
function allocate(weights, total) {
  const sum = weights.reduce((acc, w) => acc + w, 0)
  const quota = weights.map((w) => (sum > 0 ? Math.floor((total * w) / sum) : 0))
  const rest = weights.map((w, d) => ({
    d,
    frac: sum > 0 ? (total * w) / sum - quota[d] : 0
  }))
  rest.sort((a, b) => b.frac - a.frac || a.d - b.d)
  let left = total - quota.reduce((acc, q) => acc + q, 0)
  for (let k = 0; left > 0; k++, left--) quota[rest[k % rest.length].d]++
  return quota
}

// Direcciones aleatorias respetando la separación mínima.
function randomAngles(limit, rng, minSep, tries) {
  const out = []
  for (let k = 0; k < tries && out.length < limit; k++) {
    const a = rng() * TAU
    if (out.every((b) => angDiff(a, b) >= minSep)) out.push(a)
  }
  if (!out.length) out.push(rng() * TAU)
  return out
}

export function planAttack({
  core,
  structures,
  list,
  tags,
  maxDirs,
  spawnRadius,
  rng = Math.random,
  minSep = Math.PI / 4,
  candidates = 24
}) {
  // Sin naves no hay nada que repartir: una sola dirección decorativa.
  if (list.length === 0) return { dirs: [rng() * TAU], assign: [], scores: [0] }

  const total = list.length
  const shipTags = list.map((type) => tags[type] || 'core')
  const weightsByTag = new Map()
  for (const tag of shipTags) weightsByTag.set(tag, (weightsByTag.get(tag) || 0) + 1)

  const limit = Math.min(maxDirs, total)
  const hasThreat = structures.some((s) => THREAT_KINDS.includes(s.kind))

  let chosen
  if (!hasThreat) {
    // Solo el core (o nada): todas las direcciones valen lo mismo → azar.
    chosen = randomAngles(limit, rng, minSep, Math.max(candidates * 8, 64)).map((a) =>
      analyzeAngle(a, core, structures, spawnRadius)
    )
  } else {
    const offset = (rng() * TAU) / candidates
    const infos = []
    for (let k = 0; k < candidates; k++) {
      const info = analyzeAngle(offset + (k * TAU) / candidates, core, structures, spawnRadius)
      for (const [tag, count] of weightsByTag) {
        const kind = tag === 'boss' ? 'core' : tag
        info.score += (count / total) * vulnOf(info, kind)
      }
      infos.push(info)
    }
    // Codicioso: mayor puntaje primero, separación mínima entre elegidas.
    const order = infos.map((_, i) => i).sort((i, j) => infos[j].score - infos[i].score || i - j)
    chosen = []
    for (const i of order) {
      if (chosen.length >= limit) break
      if (chosen.every((info) => angDiff(info.a, infos[i].a) >= minSep)) chosen.push(infos[i])
    }
    if (!chosen.length) chosen.push(infos[order[0]])
  }

  const dirs = chosen.map((info) => info.a)
  const scores = chosen.map((info) => info.score)
  const nDirs = dirs.length

  // Dirección de mayor puntaje: destino de los jefes.
  let bossDir = 0
  for (let d = 1; d < nDirs; d++) if (scores[d] > scores[bossDir]) bossDir = d

  // Agrupar naves por tag y repartir cada grupo entre las direcciones.
  const groups = new Map()
  shipTags.forEach((tag, i) => {
    if (!groups.has(tag)) groups.set(tag, [])
    groups.get(tag).push(i)
  })

  const members = Array.from({ length: nDirs }, () => [])
  for (const [tag, idxs] of groups) {
    if (tag === 'boss') {
      for (const i of idxs) members[bossDir].push(i)
      continue
    }
    const weights = chosen.map((info) => vulnOf(info, tag))
    const quota = allocate(weights, idxs.length)
    let p = 0
    for (let d = 0; d < nDirs; d++) {
      for (let k = 0; k < quota[d]; k++) members[d].push(idxs[p++])
    }
  }

  // Garantizar al menos una nave por dirección moviendo desde la más cargada.
  const bossSet = new Set(groups.get('boss') || [])
  if (total - bossSet.size >= nDirs) {
    for (let t = 0; t < nDirs; t++) {
      if (members[t].length > 0) continue
      let src = -1
      for (let d = 0; d < nDirs; d++) {
        if (d === t || members[d].length < 2) continue
        if (!members[d].some((i) => !bossSet.has(i))) continue
        if (src === -1 || members[d].length > members[src].length) src = d
      }
      if (src === -1) break
      const idx = members[src].find((i) => !bossSet.has(i))
      members[src].splice(members[src].indexOf(idx), 1)
      members[t].push(idx)
    }
  }

  const assign = new Array(total)
  members.forEach((idxs, d) => {
    for (const i of idxs) assign[i] = d
  })

  return { dirs, assign, scores }
}
