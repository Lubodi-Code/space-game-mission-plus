import assert from 'node:assert/strict'
import { planAttack } from '../game/systems/waveDirector.js'

// LCG determinista (misma secuencia para la misma semilla).
function lcg(seed = 12345) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const TAU = Math.PI * 2
const angDiff = (a, b) => {
  const d = Math.abs(a - b) % TAU
  return d > Math.PI ? TAU - d : d
}
const countsByDir = (assign, nDirs) => Array.from({ length: nDirs }, (_, d) => assign.filter((x) => x === d).length)
const tally = (list) => list.reduce((acc, t) => ((acc[t] = (acc[t] || 0) + 1), acc), {})

const core = { x: 0, y: 0 }
const defensesEast = [200, 300, 400, 500, 600].map((x) => ({ x, y: 0, kind: 'defense', range: 250, power: 3 }))
const economyWest = [-500, -450, -400].map((x) => ({ x, y: 0, kind: 'economy', range: 0, power: 1 }))
const relayNorth = { x: 0, y: 400, kind: 'relay', range: 0, power: 1 }

// a) Defensas fuertes al este, economía al oeste: con maxDirs 1 debe ir al oeste.
const a = planAttack({
  core,
  structures: [...defensesEast, ...economyWest],
  list: ['grunt', 'grunt'],
  tags: { grunt: 'economy' },
  maxDirs: 1,
  spawnRadius: 700,
  rng: lcg(1)
})
assert.equal(a.dirs.length, 1)
assert.ok(Math.cos(a.dirs[0]) < 0, `a) la dirección debe apuntar al oeste (cos=${Math.cos(a.dirs[0])})`)

// b) Conservación: no se agregan ni quitan naves y los índices son válidos.
const listB = ['grunt', 'grunt', 'grunt', 'raider', 'raider', 'tank', 'relay_bug']
const tagsB = { raider: 'economy', tank: 'defense', relay_bug: 'relay' }
const beforeB = tally(listB)
const b = planAttack({
  core,
  structures: [...defensesEast, ...economyWest, relayNorth],
  list: listB,
  tags: tagsB,
  maxDirs: 3,
  spawnRadius: 700,
  rng: lcg(2)
})
assert.equal(b.assign.length, listB.length, 'b) assign debe tener el mismo largo que list')
for (const d of b.assign) {
  assert.ok(Number.isInteger(d) && d >= 0 && d < b.dirs.length, `b) índice de dir inválido: ${d}`)
}
assert.deepEqual(tally(listB), beforeB, 'b) la cuenta por tipo no cambia')
assert.equal(b.assign.length, listB.length, 'b) el total de naves no cambia')

// c) Tope de direcciones y separación mínima.
const minSep = Math.PI / 4
const maxDirsC = 3
const c = planAttack({
  core,
  structures: [...defensesEast, ...economyWest, relayNorth],
  list: Array.from({ length: 12 }, (_, i) => (i % 4 === 0 ? 'commandship' : 'grunt')),
  tags: { commandship: 'boss' },
  maxDirs: maxDirsC,
  spawnRadius: 700,
  minSep,
  rng: lcg(3)
})
assert.ok(c.dirs.length <= maxDirsC, `c) ${c.dirs.length} direcciones supera maxDirs ${maxDirsC}`)
assert.ok(c.dirs.length > 1, 'c) el caso debe producir más de una dirección')
for (let i = 0; i < c.dirs.length; i++) {
  for (let j = i + 1; j < c.dirs.length; j++) {
    assert.ok(angDiff(c.dirs[i], c.dirs[j]) >= minSep - 1e-9, `c) separación ${i}-${j} menor que minSep`)
  }
}

// d) Con maxDirs 3 y 30 naves, cada dirección recibe al menos una nave.
const listD = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? 'raider' : 'grunt'))
const d = planAttack({
  core,
  structures: [...defensesEast, ...economyWest, relayNorth],
  list: listD,
  tags: { raider: 'economy' },
  maxDirs: 3,
  spawnRadius: 700,
  rng: lcg(4)
})
assert.equal(d.dirs.length, 3, `d) se esperaban 3 direcciones, llegaron ${d.dirs.length}`)
const countsD = countsByDir(d.assign, d.dirs.length)
for (const n of countsD) assert.ok(n >= 1, `d) dirección sin naves: ${countsD.join(',')}`)
assert.equal(d.assign.length, 30, 'd) no se agregan ni quitan naves')

// e) El jefe (tag 'boss') cae en la dirección de mayor score.
const listE = ['grunt', 'grunt', 'grunt', 'commandship']
const e = planAttack({
  core: { x: 0, y: 0 },
  structures: [
    { x: 300, y: 0, kind: 'defense', range: 250, power: 3 },
    { x: 400, y: 0, kind: 'defense', range: 250, power: 3 },
    { x: -400, y: 0, kind: 'economy', range: 0, power: 1 },
    relayNorth
  ],
  list: listE,
  tags: { commandship: 'boss' },
  maxDirs: 2,
  spawnRadius: 700,
  rng: lcg(5)
})
const bestE = e.scores.indexOf(Math.max(...e.scores))
assert.equal(e.assign[3], bestE, `e) el jefe debe ir a la dir de mayor score (${bestE}), fue a ${e.assign[3]}`)

// f) Lista vacía y estructuras vacías no lanzan error.
const f1 = planAttack({ core, structures: [], list: [], tags: {}, maxDirs: 1, spawnRadius: 700, rng: lcg(6) })
assert.equal(f1.assign.length, 0)
assert.equal(f1.dirs.length, 1)
assert.equal(f1.scores.length, 1)
const f2 = planAttack({ core, structures: [], list: ['grunt', 'grunt'], tags: {}, maxDirs: 2, spawnRadius: 700, rng: lcg(7) })
assert.equal(f2.assign.length, 2)
assert.ok(f2.assign.every((d) => d >= 0 && d < f2.dirs.length))

console.log('OK: waveDirector')
