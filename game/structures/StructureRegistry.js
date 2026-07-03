import { STRUCTURES, CORE, structureByKey } from '../balance.js'
import { Core } from './Core.js'
import { Node } from './Node.js'
import { Collector } from './Collector.js'
import { Battery } from './Battery.js'
import { Healer } from './Healer.js'
import { LaserTurret } from './LaserTurret.js'
import { MissileTurret } from './MissileTurret.js'

// Clave = ROL de la estructura (no su `key`). El nodo tiene role 'relay'.
const CLASS_MAP = {
  core: Core,
  relay: Node,
  collector: Collector,
  battery: Battery,
  healer: Healer,
  turret: LaserTurret,
  missile: MissileTurret,
}

export function createStructure(key, x, y, scene) {
  if (key === 'core') return new Core(x, y, scene)
  const def = structureByKey(key)
  if (!def) throw new Error(`Estructura desconocida: ${key}`)
  const Cls = CLASS_MAP[def.role]
  if (!Cls) throw new Error(`Sin clase para rol: ${def.role}`)
  return new Cls(def, x, y, scene)
}

export { structureByKey, STRUCTURES, CORE }
