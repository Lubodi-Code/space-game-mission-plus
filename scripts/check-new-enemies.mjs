// Verifica las 6 naves nuevas sin Phaser: node scripts/check-new-enemies.mjs
// EnemyType.js y sectors.js son importables en node; los mapas de behaviors/ importan Phaser y el
// alias '~', así que sus claves se comprueban leyendo el código fuente.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { REGISTRY, EnemyType, ROLE_GROUPS } from '../game/enemies/EnemyType.js'
import { SECTORS } from '../game/meta/sectors.js'

const FIXED = {
  hunter: [0.7, 0xff4040], phantom: [0.75, 0x9aa8ff], aegis: [0.95, 0x4dd6ff],
  graviton: [1.0, 0xb388ff], hive: [1.3, 0xffd23f], drone: [0.45, 0xffe680],
}
for (const [id, [scale, color]] of Object.entries(FIXED)) {
  const def = REGISTRY[id]
  assert.ok(def, `falta ${id}`)
  assert.equal(def.scale, scale, `${id} scale`)
  assert.equal(def.color, color, `${id} color`)
  assert.equal(def.textureKey, 'enemy_' + id)
  assert.ok(Object.values(EnemyType).includes(id))
}

const keys = (file) => {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8')
  return new Set([...src.matchAll(/^  ([A-Z_]+): /gm)].map((m) => m[1]))
}
const movement = keys('../game/enemies/behaviors/movement.js')
const attack = keys('../game/enemies/behaviors/attack.js')
const evasion = keys('../game/enemies/behaviors/evasion.js')
const risk = keys('../game/enemies/behaviors/risk.js')
const groups = new Set(['CORE', 'GENERAL', ...Object.keys(ROLE_GROUPS)])

for (const [id, def] of Object.entries(REGISTRY)) {
  assert.ok(movement.has(def.movement), `${id}: movement ${def.movement}`)
  assert.ok(attack.has(def.attack), `${id}: attack ${def.attack}`)
  if (def.evasion) assert.ok(evasion.has(def.evasion), `${id}: evasion ${def.evasion}`)
  if (def.risk) assert.ok(risk.has(def.risk), `${id}: risk ${def.risk}`)
  assert.ok(groups.has(def.targetPriority) && groups.has(def.targetSecondary), `${id}: grupos`)
  assert.ok(def.maxForce > 0 && def.evasionChance >= 0 && def.evasionChance <= 1, `${id}: maxForce/evasionChance`)
}
assert.ok(REGISTRY[REGISTRY.hive.deathSpawn.type], 'deathSpawn válido')
assert.equal(REGISTRY.drone.deathSpawn, undefined)

// Rosters: sector 6..10 suma una nave; el dron no está en ninguno.
const added = { 6: 'hunter', 7: 'phantom', 8: 'aegis', 9: 'graviton', 10: 'hive' }
for (const [n, id] of Object.entries(added)) {
  assert.deepEqual(SECTORS[n - 1].newEnemies, [id])
  assert.ok(SECTORS[n - 1].roster.includes(id))
  assert.equal(SECTORS[n - 2].roster.includes(id), false)
}
for (const s of SECTORS) assert.equal(s.roster.includes('drone'), false)

// El código fuente de targeting/Enemy/killEnemy expone lo pactado.
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
assert.match(read('../game/enemies/behaviors/targeting.js'), /GENERAL/)
assert.match(read('../game/enemies/Enemy.js'), /this\.phased/)
assert.match(read('../game/systems/enemies.js'), /deathSpawn/)
assert.match(read('../game/scenes/GameScene.js'), /generals: this\.generals/)
console.log('OK new enemies')
