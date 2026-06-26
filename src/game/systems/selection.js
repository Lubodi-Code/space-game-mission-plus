import { bus } from '../bus.js'
import { gameState } from '../gameState.js'
import { UPGRADES } from '../structures/upgrades.js'

// Selección/inspección de estructuras: emite al bus para que el HUD muestre el panel.
// Estado en la escena: scene.selectedStructure, scene._pendingFocusId.

export function selectStructure(scene, s) {
  scene.selectedStructure = s
  bus.emit('select', {
    id: s.id,
    key: s.key,
    role: s.role,
    label: s.def.label,
    hp: s.hp,
    maxHp: s.maxHp,
    powered: s.powered,
    building: s.building,
    fireMode: s.fireMode || 'auto',
    upgrades: s.upgrades || [],
    // stats contextuales según rol
    stats: {
      atkRange: s.atkRange || s.def.atkRange || null,
      damage: s.laserDamage ?? s.missileDamage ?? s.def.damage ?? null,
      cooldown: s.cooldown || s.def.cooldown || null,
      energyDrain: s.energyDrain || s.def.energyDrain || null,
      healRate: s.def.healRate || null,
      maxSpheres: s.def.maxSpheres || null,
      miningRange: s.def.miningRange || null,
      rate: s.def.rate || null,
      energyRate: s.def.energyRate || null,
      energyCap: s.def.energyCap || null,
      capBonus: s.def.capBonus || null,
      splash: s.splash || s.def.splash || null,
      projSpeed: s.projSpeed || s.def.projSpeed || null,
      range: s.range,
    },
  })
}

export function deselectStructure(scene) {
  scene.selectedStructure = null
  scene._pendingFocusId = null
  bus.emit('select', null)
}

export function applyUpgrade(scene, structureId, upgradeId) {
  const s = scene.structures.find((x) => x.id === structureId)
  if (!s || s.dead || !s.applyUpgrade) return
  const upg = UPGRADES.find((u) => u.id === upgradeId)
  if (!upg) return
  const cost = upg.cost || 0
  if (gameState.minerals < cost) return
  gameState.minerals -= cost
  s.applyUpgrade(upg)
  selectStructure(scene, s)
}

export function setFireMode(scene, structureId, mode) {
  const s = scene.structures.find((x) => x.id === structureId)
  if (!s || s.dead) return
  if (mode === 'focus') {
    // Entrar en modo focus: el siguiente clic sobre un enemigo lo fija.
    s.fireMode = 'focus'
    scene._pendingFocusId = s.id
    selectStructure(scene, s)
  } else {
    s.fireMode = 'auto'
    s.focusTarget = null
    scene._pendingFocusId = null
    selectStructure(scene, s)
  }
}
