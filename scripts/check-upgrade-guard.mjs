import assert from 'node:assert/strict'
import { UPGRADES, purchasableUpgrade } from '../game/structures/upgrades.js'

// La compra de mejoras (UI local e intents de clientes en cooperativo) pasa por purchasableUpgrade.
const first = (role, branch) => UPGRADES.find((u) => u.forRole === role && u.branch === branch && !u.requires && !u.research)

const laserA = first('turret', 'A')
const laserB = first('turret', 'B')
const genA = first('general', 'A')
const genB = first('general', 'B')
assert.ok(laserA && laserB && genA && genB, 'faltan mejoras raíz en el catálogo')

// Rol equivocado: una mejora del General no se aplica a una torreta.
assert.equal(purchasableUpgrade('turret', [], genA.id), null)
// Ramas excluyentes en edificios.
assert.equal(purchasableUpgrade('turret', [laserA.id], laserB.id), null)
// Repetida.
assert.equal(purchasableUpgrade('turret', [laserA.id], laserA.id), null)
// Prerequisito: un nivel 2 sin el 1.
const tier2 = UPGRADES.find((u) => u.forRole === 'turret' && u.requires === laserA.id && !u.research)
if (tier2) {
  assert.equal(purchasableUpgrade('turret', [], tier2.id), null)
  assert.equal(purchasableUpgrade('turret', [laserA.id], tier2.id)?.id, tier2.id)
}
// Válidas.
assert.equal(purchasableUpgrade('turret', [], laserA.id)?.id, laserA.id)
// El General sí combina ramas.
assert.equal(purchasableUpgrade('general', [genA.id], genB.id)?.id, genB.id)
// Id inexistente.
assert.equal(purchasableUpgrade('turret', [], 'no_existe'), null)

console.log('OK upgrade guard')
