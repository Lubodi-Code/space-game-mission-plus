// Verificación headless de los diseños de naves enemigas 3D (enemyShipParts).
// Uso: node scripts/check-enemy-ships.mjs
import * as THREE from 'three'
import { EnemyType } from '../game/enemies/EnemyType.js'
import { enemyShipParts } from '../game/three/shipModel.js'

const types = [...new Set([...Object.values(EnemyType), 'hunter', 'phantom', 'aegis', 'graviton', 'hive', 'drone'])]
const BOSSES = new Set(['mothership', 'commandship'])
const fail = (m) => { throw new Error(m) }
const vertexCounts = new Map()

for (const type of types) {
  for (const radius of [6, 10, 22]) {
    const tag = `${type}@${radius}`
    const parts = enemyShipParts({ radius, type })
    for (const k of ['solid', 'edges', 'cockpit', 'engine']) {
      if (!(parts[k] instanceof THREE.BufferGeometry)) fail(`${tag}: falta ${k}`)
    }
    const { solid } = parts
    const pos = solid.attributes.position
    const col = solid.attributes.color
    if (!col) fail(`${tag}: solid sin atributo color`)
    if (col.count !== pos.count) fail(`${tag}: color.count ${col.count} != position.count ${pos.count}`)

    const r = Math.max(4, radius)
    const size = new THREE.Box3().setFromBufferAttribute(pos).getSize(new THREE.Vector3())
    if (size.x < 1.6 * r - 1e-6 || size.x > 3.2 * r + 1e-6) fail(`${tag}: largo ${(size.x / r).toFixed(2)}r fuera de 1.6r..3.2r`)
    if (size.y > 3 * r + 1e-6) fail(`${tag}: ancho ${(size.y / r).toFixed(2)}r > 3r`)

    const tris = (solid.index ? solid.index.count : pos.count) / 3
    const budget = BOSSES.has(type) ? 900 : type === 'hive' ? 600 : 400
    if (tris > budget) fail(`${tag}: ${tris} triángulos > ${budget}`)

    if (radius === 10) vertexCounts.set(type, pos.count)
  }
}

const seen = new Map()
for (const [type, n] of vertexCounts) {
  if (seen.has(n)) fail(`${type} y ${seen.get(n)} tienen el mismo número de vértices (${n})`)
  seen.set(n, type)
}

console.log(`OK: ${types.length} enemy ship designs`)
