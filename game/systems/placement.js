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

// `gen` = general del jugador que construye (host por defecto). `useSnap=false` para
// intents remotos: el _snapPos del ghost es del HOST y desviaría la posición del cliente.
export function tryPlace(scene, x, y, gen = scene.general, useSnap = true) {
  if (!gen?.alive) { flashPlacementFeedback(scene, false); return }
  const def = structureByKey(scene.placementKey)
  if (!def) return
  if (gameState.minerals < def.cost) return

  const snap = useSnap ? scene._snapPos : null
  const placeX = snap ? snap.x : x
  const placeY = snap ? snap.y : y

  if (!canConnectAt(scene, placeX, placeY, def)) {
    flashPlacementFeedback(scene, false)
    return
  }
  if (overlapsExisting(scene, placeX, placeY)) {
    flashPlacementFeedback(scene, false)
    return
  }

  gameState.minerals -= def.cost
  if (def.role === 'battery') gameState.mineralsCap += def.capBonus

  const s = createStructure(def.key, placeX, placeY, scene)
  scene.structures.push(s)
  recomputeNetwork(scene)
  flashPlacementFeedback(scene, true, placeX, placeY, def)

  if (gameState.minerals < def.cost) cancelPlacement(scene)
  else updateGhost(scene, placeX, placeY)
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

  // Snap a rejilla radial si estamos cerca de un relay
  let snapX = x, snapY = y
  if (relay) {
    const d = Phaser.Math.Distance.Between(x, y, relay.x, relay.y)
    if (d <= relay.range) {
      const angle = Math.atan2(y - relay.y, x - relay.x)
      const dist = d

      // Rejilla radial: anillos a 60/110/160 px y 12 rayos
      const rings = [60, 110, 160]
      const rayCount = 12

      let bestSnapDist = 14
      let bestSnap = null

      // Probar snap a anillos
      for (const ringR of rings) {
        if (Math.abs(dist - ringR) < bestSnapDist) {
          const snapAngle = Math.round(angle / (Math.PI * 2) * rayCount) * (Math.PI * 2) / rayCount
          const testX = relay.x + Math.cos(snapAngle) * ringR
          const testY = relay.y + Math.sin(snapAngle) * ringR
          if (!overlapsExisting(scene, testX, testY)) {
            bestSnapDist = Math.abs(dist - ringR)
            bestSnap = { x: testX, y: testY }
          }
        }
      }

      // Probar snap a rayos
      const rayAngle = Math.round(angle / (Math.PI * 2) * rayCount) * (Math.PI * 2) / rayCount
      const rayX = relay.x + Math.cos(rayAngle) * dist
      const rayY = relay.y + Math.sin(rayAngle) * dist
      const raySnapDist = Phaser.Math.Distance.Between(x, y, rayX, rayY)
      if (raySnapDist < bestSnapDist && !overlapsExisting(scene, rayX, rayY)) {
        bestSnap = { x: rayX, y: rayY }
        bestSnapDist = raySnapDist
      }

      if (bestSnap) {
        snapX = bestSnap.x
        snapY = bestSnap.y
      }
    }
  }

  const valid = affordable && !!relay && free
  const color = valid ? 0x49e07a : 0xff5566

  const g = scene.ghost
  g.clear()

  // Dibujar rejilla radial del relay si está cerca
  if (relay && !scene.remote) {
    const d = Phaser.Math.Distance.Between(snapX, snapY, relay.x, relay.y)
    if (d <= relay.range) {
      // Anillos de snap
      g.lineStyle(1, 0x6cc8ff, 0.15)
      const rings = [60, 110, 160]
      for (const ringR of rings) {
        if (ringR > relay.range) continue
        g.strokeCircle(relay.x, relay.y, ringR)
      }

      // Rayos de snap
      const rayCount = 12
      for (let i = 0; i < rayCount; i++) {
        const a = (i / rayCount) * Math.PI * 2
        g.beginPath()
        g.moveTo(relay.x, relay.y)
        g.lineTo(
          relay.x + Math.cos(a) * relay.range,
          relay.y + Math.sin(a) * relay.range
        )
        g.strokePath()
      }

      // Puntos de snap en las intersecciones del anillo más cercano
      const currentRing = rings.find(r => r >= d - 20) || rings[0]
      if (currentRing <= relay.range) {
        for (let i = 0; i < rayCount; i++) {
          const a = (i / rayCount) * Math.PI * 2
          const px = relay.x + Math.cos(a) * currentRing
          const py = relay.y + Math.sin(a) * currentRing
          g.fillStyle(0x6cc8ff, 0.3)
          g.fillCircle(px, py, 2)
        }
      }
    }
  }

  // Línea al relay (núcleo/nodo) al que se engancharía
  if (relay) {
    g.lineStyle(1.5, color, 0.5)
    g.beginPath()
    g.moveTo(snapX, snapY)
    g.lineTo(relay.x, relay.y)
    g.strokePath()
  }
  g.lineStyle(1, color, 0.4)
  g.strokeCircle(snapX, snapY, def.range)
  drawPolygon(g, snapX, snapY, def.size, def.sides, color, 2, 0.9, darken(color))

  // Almacenar posición snappeada para uso en tryPlace
  scene._snapPos = { x: snapX, y: snapY }
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
