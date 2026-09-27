// Verifica el protocolo multijugador sin red: node scripts/check-net-protocol.mjs
import assert from 'node:assert/strict'
import {
  parseIntent, parseHostMessage, createRateLimiter, QUICK_MESSAGES, newSessionToken, playerColor,
} from '../game/net/protocol.js'

// Intents válidos se normalizan
assert.deepEqual(parseIntent({ t: 'build', key: 'laser', x: 100, y: 200 }), { t: 'build', key: 'laser', x: 100, y: 200 })
assert.deepEqual(parseIntent({ t: 'general', x: 5, y: 5 }), { t: 'move', x: 5, y: 5 })
assert.equal(parseIntent({ t: 'ability', id: 'emp' }).id, 'emp')
assert.equal(parseIntent({ t: 'ability', id: 'megalaser', targetId: 12, x: 10, y: 10 }).targetId, 12)
assert.equal(parseIntent({ t: 'quick', msgId: QUICK_MESSAGES.length - 1 }).msgId, QUICK_MESSAGES.length - 1)

// Basura, fuera de rango y tipos desconocidos → null
for (const bad of [
  null, 'x', {}, { t: 'nope' }, { t: 'build', key: 'laser', x: -1, y: 0 }, { t: 'build', key: 'laser', x: 1e9, y: 0 },
  { t: 'build', key: '', x: 1, y: 1 }, { t: 'build', key: 'a'.repeat(100), x: 1, y: 1 }, { t: 'move', x: NaN, y: 1 },
  { t: 'ability', id: 'nuke' }, { t: 'ability', id: 'strike', x: 1 }, { t: 'fireMode', sid: 1, mode: 'rage' },
  { t: 'ping', kind: 'lol', x: 1, y: 1 }, { t: 'quick', msgId: 99 }, { t: 'quick', msgId: 1.5 }, { t: 'speed', v: 50 },
  { t: 'upgrade', sid: {}, uid: 'x' },
]) assert.equal(parseIntent(bad), null, `debió rechazar ${JSON.stringify(bad)}`)

// El pid nunca sale del mensaje
assert.equal('pid' in parseIntent({ t: 'move', x: 1, y: 1, pid: 0 }), false)

// hello limpia nombre y cosméticos
const h = parseIntent({ t: 'hello', name: 'Lu\u0000is'.padEnd(40, 'x'), equipped: { hull: 'hull_red', bad: {}, ['k'.repeat(99)]: 'v' } })
assert.equal(h.name.length <= 16 && !h.name.includes('\u0000'), true)
assert.deepEqual(h.equipped, { hull: 'hull_red' })

// Rate limit por pid y tipo
const rl = createRateLimiter()
assert.equal(rl.allow(1, 'ping', 0), true)
assert.equal(rl.allow(1, 'ping', 500), false)
assert.equal(rl.allow(2, 'ping', 500), true)
assert.equal(rl.allow(1, 'ping', 1600), true)
assert.equal(rl.allow(1, 'move', 1), true)
assert.equal(rl.allow(1, 'move', 1), true)

// Mensajes del host
assert.equal(parseHostMessage({ t: 'welcome', pid: 0 }), null) // pid 0 es el host
assert.equal(parseHostMessage({ t: 'start', difficulty: 'normal', mode: 'quick', sector: 2, seed: 99 }).seed, 99)
assert.equal(parseHostMessage({ t: 'roster', players: new Array(9).fill({ pid: 1, name: 'a' }) }).players.length, 4)
assert.equal(parseHostMessage({ t: 'whatever' }), null)

assert.match(newSessionToken(), /^[0-9a-f]{24}$/)
assert.equal(playerColor(4), playerColor(0))
// Propiedades heredadas no son intents; host malicioso no revienta al cliente
for (const t of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(parseIntent({ t }), null)
assert.equal(parseHostMessage({ t: 'roster', players: [null, 3, { pid: 2, name: 'b' }] }).players.length, 1)
assert.equal(parseHostMessage({ t: 'snap', structs: 'x' }), null)
assert.deepEqual(parseHostMessage({ t: 'snap' }).enemies, [])
const huge = {}; for (let i = 0; i < 100000; i++) huge['k' + i] = 'v'
assert.equal(Object.keys(parseIntent({ t: 'hello', equipped: huge }).equipped).length <= 12, true)
console.log('OK net protocol')
