import assert from 'node:assert/strict'
import { badgeTierFor, badgeShapeFor, getBadge, nextBadge, awardBadge, badgeLevels } from '../game/meta/badges.js'

// Tier por dificultad
assert.equal(badgeTierFor('easy'), 1)
assert.equal(badgeTierFor('normal'), 2)
assert.equal(badgeTierFor('hard'), 3)
assert.equal(badgeTierFor('???'), 2)

// Forma por sector
for (const n of [1, 2, 3]) assert.deepEqual(badgeShapeFor(n), { kind: 'chevrons', chevrons: n })
for (const n of [4, 5, 6]) assert.equal(badgeShapeFor(n).kind, 'winged-shield')
for (const n of [7, 8, 9]) assert.equal(badgeShapeFor(n).kind, 'winged-star')
assert.equal(badgeShapeFor(10).kind, 'crown')

// awardBadge: sube, no baja, isNew correcto
const stats = { wins: 3 }
assert.equal(getBadge(2, stats), 0)
let r = awardBadge(2, 'normal', stats)
assert.deepEqual(r, { sector: 2, tier: 2, prevTier: 0, isNew: true })
assert.equal(stats.badgeS2, 2)
r = awardBadge(2, 'easy', stats)
assert.deepEqual(r, { sector: 2, tier: 2, prevTier: 2, isNew: false })
assert.equal(stats.badgeS2, 2)
r = awardBadge(2, 'normal', stats)
assert.equal(r.isNew, false)
r = awardBadge(2, 'hard', stats)
assert.deepEqual(r, { sector: 2, tier: 3, prevTier: 2, isNew: true })
assert.equal(stats.badgeS2, 3)

// nextBadge no muta
const s2 = {}
nextBadge(s2, 1, 'hard')
assert.deepEqual(s2, {})

assert.equal(badgeLevels({ badgeS1: 1, badgeS10: 3, runs: 9 }), 4)
console.log('OK: badges')
