import { REGISTRY, ROLE_GROUPS } from './EnemyType.js'
import { MOVEMENT } from './behaviors/movement.js'
import { ATTACK } from './behaviors/attack.js'
import { EVASION } from './behaviors/evasion.js'
import { RISK } from './behaviors/risk.js'

const VALID_GROUPS = new Set(['CORE', ...Object.keys(ROLE_GROUPS)])

export function validateRegistry() {
  const maps = [
    ['movement', MOVEMENT],
    ['attack', ATTACK],
  ]
  for (const [typeKey, def] of Object.entries(REGISTRY)) {
    for (const [field, map] of maps) {
      if (typeof map[def[field]] !== 'function') {
        throw new Error(
          'Enemy "' + typeKey + '": ' + field + ' "' + def[field] + '" invalido. ' +
          'Validos: ' + Object.keys(map).join(', ')
        )
      }
    }
    if (!VALID_GROUPS.has(def.targetPriority)) {
      throw new Error(
        'Enemy "' + typeKey + '": targetPriority "' + def.targetPriority + '" invalido. ' +
        'Validos: CORE, ' + Object.keys(ROLE_GROUPS).join(', ')
      )
    }
    if (!VALID_GROUPS.has(def.targetSecondary)) {
      throw new Error(
        'Enemy "' + typeKey + '": targetSecondary "' + def.targetSecondary + '" invalido. ' +
        'Validos: CORE, ' + Object.keys(ROLE_GROUPS).join(', ')
      )
    }
    if (def.evasion && typeof EVASION[def.evasion] !== 'function') {
      throw new Error(
        'Enemy "' + typeKey + '": evasion "' + def.evasion + '" invalido. ' +
        'Validos: ' + Object.keys(EVASION).join(', ')
      )
    }
    if (typeof def.maxForce !== 'number' || def.maxForce <= 0) {
      throw new Error(
        'Enemy "' + typeKey + '": maxForce debe ser > 0.'
      )
    }
    if (def.risk && typeof RISK[def.risk] !== 'function') {
      throw new Error(
        'Enemy "' + typeKey + '": risk "' + def.risk + '" invalido. ' +
        'Validos: ' + Object.keys(RISK).join(', ')
      )
    }
    if (typeof def.evasionChance !== 'number' ||
        def.evasionChance < 0 || def.evasionChance > 1) {
      throw new Error(
        'Enemy "' + typeKey + '": evasionChance debe ser numero entre 0 y 1.'
      )
    }
  }
}
