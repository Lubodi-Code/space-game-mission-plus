import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { BUILD, structureByKey } from '../balance.js'
import { createStructure } from '../structures/StructureRegistry.js'
import { drawPolygon, darken } from '../structures/draw.js'
import { isRelay, portCap, recomputeNetwork } from './energyNet.js'
import { spawnFloatingText } from '../render/fx.js'

// Colocación de estructuras: ghost, validación (relay/rango/solapamiento) y construcción.
// Funciones que reciben `scene`; el estado vive en la escena (placementKey, ghost, structures…).

export function startPlacement(scene, key) {
  scene.placementKey = key
  gameState.activeBuild = key
  scene.ghost.setVisible(true)
  updateGhost(scene, scene.input.activePointer.worldX, scene.input.activePointer.worldY)
}

export function cancelPlacement(scene) {
  scene.placementKey = null
  gameState.activeBuild = null
  scene.ghost.setVisible(false)
}

// Relay powered, con puerto libre y en rango, al que se engancharía algo en (x,y).
export function findAttachRelay(scene, x, y, def) {
  let best = null
  let bestD = Infinity
  for (const s of scene.structures) {
    if (s.dead || !s.powered || !isRelay(s)) continue
    if ((s.ports || 0) >= portCap(s)) continue
    const d = Phaser.Math.Distance.Between(x, y, s.x, s.y)
    if (d <= Math.max(def.range, s.range) && d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

export function canConnectAt(scene, x, y, def) {
  return !!findAttachRelay(scene, x, y, def)
}

export function tryPlace(scene, x, y) {
  if (!scene.general.alive) { flashPlacementFeedback(scene, false); return }
  const def = structureByKey(scene.placementKey)
  if (!def) return
  if (gameState.minerals < def.cost) return
  if (!canConnectAt(scene, x, y, def)) {
    flashPlacementFeedback(scene, false)
    return
  }
  if (overlapsExisting(scene, x, y)) {
    flashPlacementFeedback(scene, false)
    return
  }

  gameState.minerals -= def.cost
  if (def.role === 'battery') gameState.mineralsCap += def.capBonus

  const s = createStructure(def.key, x, y, scene)
  scene.structures.push(s)
  recomputeNetwork(scene)
  flashPlacementFeedback(scene, true, x, y, def)

  if (gameState.minerals < def.cost) cancelPlacement(scene)
  else updateGhost(scene, x, y)
}

export function flashPlacementFeedback(scene, success, x, y, def) {
  if (success) {
    const feedback = scene.add.graphics().setDepth(35)
    feedback.lineStyle(2, 0x49e07a, 0.8)
    feedback.strokeCircle(x, y, def ? def.size * 1.5 : 20)
    scene.tweens.add({
      targets: feedback,
      alpha: 0,
      scale: 1.6,
      duration: 300,
      ease: 'Quad.out',
      onComplete: () => feedback.destroy(),
    })
    spawnFloatingText(scene, x, y - 20, `-${def.cost}`, '#ff5566')
  } else {
    const ghostColor = 0xff5566
    const g = scene.ghost
    const px = scene.input.activePointer.worldX
    const py = scene.input.activePointer.worldY
    g.clear()
    g.lineStyle(2, ghostColor, 0.8)
    g.strokeCircle(px, py, 20)
    scene.time.delayedCall(200, () => {
      if (scene.placementKey) updateGhost(scene, scene.input.activePointer.worldX, scene.input.activePointer.worldY)
    })
  }
}

export function overlapsExisting(scene, x, y) {
  return scene.structures.some((s) => Phaser.Math.Distance.Between(x, y, s.x, s.y) < BUILD.overlapRadius)
}

export function updateGhost(scene, x, y) {
  if (!scene.placementKey) return
  const def = structureByKey(scene.placementKey)
  const affordable = gameState.minerals >= def.cost
  const relay = findAttachRelay(scene, x, y, def)
  const free = !overlapsExisting(scene, x, y)
  const valid = affordable && !!relay && free
  const color = valid ? 0x49e07a : 0xff5566

  const g = scene.ghost
  g.clear()
  // Línea al relay (núcleo/nodo) al que se engancharía: deja claro de dónde viene la señal.
  if (relay) {
    g.lineStyle(1.5, color, 0.5)
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(relay.x, relay.y)
    g.strokePath()
  }
  g.lineStyle(1, color, 0.4)
  g.strokeCircle(x, y, def.range)
  drawPolygon(g, x, y, def.size, def.sides, color, 2, 0.9, darken(color))
}

export function updateRangePreview(scene, x, y) {
  const g = scene.rangePreview
  g.clear()
  const hovered = scene.structures.find((s) => {
    if (s.isCore) return false
    const d = Phaser.Math.Distance.Between(x, y, s.x, s.y)
    return d <= Math.max(s.radius, 20)
  })
  if (hovered && (hovered.role === 'turret' || hovered.role === 'missile')) {
    g.lineStyle(1, 0xffffff, 0.15)
    g.strokeCircle(hovered.x, hovered.y, hovered.def.atkRange || 0)
    g.setVisible(true)
  } else {
    g.setVisible(false)
  }
}
