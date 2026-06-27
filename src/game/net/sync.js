import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { WORLD, CAMERA, structureByKey } from '../balance.js'
import { net } from '../net.js'
import { bus } from '../bus.js'
import { createStructure } from '../structures/StructureRegistry.js'
import { drawPolygon, darken } from '../structures/draw.js'
import { REGISTRY } from '../enemies/EnemyType.js'
import { createMeteorite } from '../systems/worldgen.js'
import { drawLinks } from '../systems/energyNet.js'
import { tryPlace } from '../systems/placement.js'
import { explosion, hitFlash, drawBeam } from '../render/fx.js'
import { glowBlend } from '../render/blend.js'

// Capa de sincronización multijugador (host-authoritative ~12 Hz).
// Host: buildSnapshot/sendSnapshot/onIntent. Cliente: createRemote/applySnapshot/
// setupRemoteInput/drawRemoteGhost/renderRemote. Todas reciben `scene`; el estado
// (eById, sById, rbeams, _snap…) vive en la escena. GameScene solo orquesta y hace input.

// ---------------------------------------------------------------- host
export function onIntent(scene, d) {
  if (d.t === 'build') {
    const k = scene.placementKey
    scene.placementKey = d.key
    tryPlace(scene, d.x, d.y)
    scene.placementKey = k
  } else if (d.t === 'general') {
    if (!scene.cgActive) { scene.cgActive = true; scene.clientGeneral.sprite.setVisible(true) }
    scene.clientGeneral.setTarget(d.x, d.y, scene)
  } else if (d.t === 'speed') {
    scene.setSpeed(d.v)
  }
}

export function buildSnapshot(scene) {
  const expl = scene._explQueue
  scene._explQueue = []
  const beams = scene._beamQueue
  scene._beamQueue = []
  return {
    t: 'snap',
    eco: {
      minerals: Math.round(gameState.minerals), mineralsCap: gameState.mineralsCap,
      energy: Math.round(gameState.energy), energyMax: gameState.energyMax,
      coreHp: gameState.coreHp, coreHpMax: gameState.coreHpMax,
      wave: gameState.wave, waveTotal: gameState.waveTotal, nextWaveIn: gameState.nextWaveIn,
      enemiesAlive: gameState.enemiesAlive, status: gameState.status, bossWave: gameState.bossWave,
    },
    enemies: scene.enemies.map((e) => [e.id, e.type, Math.round(e.x), Math.round(e.y), Math.round(e.hp), Math.round(e.maxHp), Math.round((e.heading || 0) * 100) / 100]),
    structs: scene.structures.map((s) => [s.id, s.key, Math.round(s.x), Math.round(s.y), Math.round(s.hp), Math.round(s.maxHp), s.powered ? 1 : 0, s.building ? 1 : 0, s.building && s.buildTime ? Math.round((s.buildProgress / s.buildTime) * 100) / 100 : 1]),
    // misiles del jugador: sprite 'missile_rod' orientado → mando rotación; enemigos: sprite 'star'
    missiles: scene.projectiles.map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.color, Math.round(p.vx || 0), Math.round(p.vy || 0)]),
    emissiles: scene.epSystem.projectiles.map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.color, Math.round(p.vx || 0), Math.round(p.vy || 0)]),
    links: scene.links.map(([a, b]) => [a.id, b.id]),
    meteors: scene.meteorites.filter((m) => !m.depleted).map((m) => [Math.round(m.x), Math.round(m.y), m.radius]),
    fx: {
      beams,
      mining: scene.structures
        .filter((s) => s.role === 'collector' && s.powered && s.target && !s.target.depleted)
        .map((s) => [Math.round(s.x), Math.round(s.y), Math.round(s.target.x), Math.round(s.target.y)]),
      gmining: scene.general?.gmining || null,
      expl,
    },
    gen: scene.cgActive
      ? [[0, Math.round(scene.general.x), Math.round(scene.general.y), Math.round(scene.general.hp), scene.general.alive ? 1 : 0],
         [1, Math.round(scene.clientGeneral.x), Math.round(scene.clientGeneral.y), Math.round(scene.clientGeneral.hp), scene.clientGeneral.alive ? 1 : 0]]
      : [[0, Math.round(scene.general.x), Math.round(scene.general.y), Math.round(scene.general.hp), scene.general.alive ? 1 : 0]],
  }
}

// Bloque del update() del host: emite snapshot ~12 Hz (incluso en game over para propagar status).
export function sendSnapshot(scene, d) {
  if (net.isHost && net.conn) {
    scene._snapAccum = (scene._snapAccum || 0) + d
    if (scene._snapAccum >= 80) {
      scene._snapAccum = 0
      net.send(buildSnapshot(scene))
    }
  }
}

// ---------------------------------------------------------------- cliente
export function createRemote(scene) {
  scene.cam.centerOn(WORLD.width / 2, WORLD.height / 2)
  scene.eById = new Map()
  scene.sById = new Map()
  scene.genSprites = new Map()
  scene.mById = new Map()
  scene.rbeams = []
  scene.pMissiles = new Map() // id -> sprite 'missile_rod' (jugador)
  scene.eMissiles = new Map() // id -> sprite 'star' (misiles enemigos)
  scene._fx = null
  scene._snap = null
  net.onData = (d) => { if (d.t === 'snap') applySnapshot(scene, d) }
  gameState.status = 'playing'
  scene.speed = 1
  scene.placementKey = null
  setupRemoteInput(scene)

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    net.onData = () => {}
    for (const spr of scene.eById.values()) spr.destroy()
    for (const s of scene.sById.values()) s.container.destroy()
    for (const g of scene.genSprites.values()) g.destroy()
    for (const m of scene.mById.values()) m.container.destroy()
    for (const s of scene.pMissiles.values()) s.destroy()
    for (const s of scene.eMissiles.values()) s.destroy()
  })
}

export function applySnapshot(scene, snap) {
  scene._snap = snap
  scene._fx = snap.fx
  Object.assign(gameState, snap.eco)

  // Estructuras: instancias REALES → mismo render que el host (núcleo animado incluido).
  const seenS = new Set()
  for (const [id, key, x, y, hp, maxHp, powered, building, frac] of snap.structs) {
    seenS.add(id)
    let s = scene.sById.get(id)
    const isNew = !s
    if (isNew) { s = createStructure(key, x, y, scene); scene.sById.set(id, s) }
    if (!isNew && hp < s.hp) {
      hitFlash(scene, x, y)
      if (key === 'core') scene.cameras.main.shake(120, 0.004)
    }
    s.hp = hp; s.maxHp = maxHp
    s.setPowered(!!powered)
    s.building = !!building
    if (building) {
      s.container.setAlpha(0.5)
      s.buildProgress = (frac ?? 1) * (s.buildTime || 1)
      s.drawBuildBar()
    } else {
      s.container.setAlpha(1)
      if (s.buildBar) s.buildBar.clear()
    }
    s.drawHpBar()
  }
  for (const [id, s] of scene.sById) if (!seenS.has(id)) { s.container.destroy(); scene.sById.delete(id) }

  // Enlaces: reusa drawLinks() de systems/energyNet.js.
  scene.links = (snap.links || [])
    .map(([ai, bi]) => [scene.sById.get(ai), scene.sById.get(bi)])
    .filter((p) => p[0] && p[1])
  drawLinks(scene)

  // Meteoritos: instancias reales (reusa createMeteorite); crear/quitar por posición.
  const seenM = new Set()
  for (const [x, y] of snap.meteors || []) {
    const k = x + ',' + y
    seenM.add(k)
    if (!scene.mById.has(k)) scene.mById.set(k, createMeteorite(scene, x, y))
  }
  for (const [k, m] of scene.mById) if (!seenM.has(k)) { m.container.destroy(); scene.mById.delete(k) }

  // Enemigos: sprites con glow + rumbo.
  const seenE = new Set()
  for (const [id, type, x, y, hp, maxHp, h] of snap.enemies) {
    seenE.add(id)
    let spr = scene.eById.get(id)
    if (!spr) {
      spr = scene.add.image(x, y, REGISTRY[type].textureKey).setDepth(15)
      spr.glow = scene.add.image(x, y, REGISTRY[type].textureKey)
        .setScale(1.3).setAlpha(0.35).setBlendMode(glowBlend()).setDepth(14)
      spr.tx = x; spr.ty = y
      scene.eById.set(id, spr)
    }
    spr.tx = x; spr.ty = y
    spr.heading = h || 0
    spr.hp = hp; spr.maxHp = maxHp; spr.escala = REGISTRY[type].scale
  }
  for (const [id, spr] of scene.eById) if (!seenE.has(id)) { spr.glow?.destroy(); spr.destroy(); scene.eById.delete(id) }

  // Generales con interpolación (tx/ty para movimiento suave en update).
  const seenG = new Set()
  for (const [pid, x, y, hp, alive] of snap.gen) {
    seenG.add(pid)
    let g = scene.genSprites.get(pid)
    if (!g) {
      g = scene.add.image(x, y, 'enemy_skirmisher').setTint(pid === 0 ? 0xffaa44 : 0x8be9fd).setScale(1.3).setDepth(17)
      g.tx = x; g.ty = y
      scene.genSprites.set(pid, g)
    }
    g.tx = x; g.ty = y; g.setVisible(!!alive)
  }
  for (const [pid, g] of scene.genSprites) if (!seenG.has(pid)) { g.destroy(); scene.genSprites.delete(pid) }

  // Rayos: encolar cada evento. b = [x1,y1,x2,y2,color,width,ttl,ttlBase]; índice 6 cuenta atrás.
  for (const b of (snap.fx?.beams || [])) scene.rbeams.push([...b])

  // Misiles: Map por id + dead-reckoning (sin salto, con reconciliación suave).
  const seenP = new Set()
  for (const [id, x, y, color, vx, vy] of (snap.missiles || [])) {
    seenP.add(id)
    let s = scene.pMissiles.get(id)
    if (!s) {
      s = scene.add.image(x, y, 'missile_rod').setScale(0.55).setDepth(20).setTint(color)
      scene.pMissiles.set(id, s)
    } else {
      s.x += (x - s.x) * 0.5
      s.y += (y - s.y) * 0.5
    }
    s.vx = vx; s.vy = vy
  }
  for (const [id, s] of scene.pMissiles) if (!seenP.has(id)) { s.destroy(); scene.pMissiles.delete(id) }

  const seenEM = new Set()
  for (const [id, x, y, color, vx, vy] of (snap.emissiles || [])) {
    seenEM.add(id)
    let s = scene.eMissiles.get(id)
    if (!s) {
      s = scene.add.image(x, y, 'star').setScale(0.8).setBlendMode(Phaser.BlendModes.ADD).setDepth(20).setTint(color)
      scene.eMissiles.set(id, s)
    } else {
      s.x += (x - s.x) * 0.5
      s.y += (y - s.y) * 0.5
    }
    s.vx = vx; s.vy = vy
  }
  for (const [id, s] of scene.eMissiles) if (!seenEM.has(id)) { s.destroy(); scene.eMissiles.delete(id) }

  // Explosiones puntuales: reusa explosion().
  for (const [x, y, color, rr] of (snap.fx?.expl || [])) explosion(scene, x, y, color, rr)
}

export function setupRemoteInput(scene) {
  scene.input.mouse?.disableContextMenu()
  scene.cursors = scene.input.keyboard?.createCursorKeys()
  scene.wasdKeys = scene.input.keyboard?.addKeys('W,A,S,D')
  scene.ghost = scene.add.graphics().setDepth(40).setVisible(false)

  scene.input.on('pointerdown', (p) => {
    scene._downX = p.x; scene._downY = p.y; scene._dragging = false
    if (p.rightButtonDown()) {
      if (gameState.generalMode === 'selected') gameState.generalMode = null
      else { scene.placementKey = null; gameState.activeBuild = null; scene.ghost.setVisible(false) }
    }
  })

  scene.input.on('pointermove', (p) => {
    if (p.isDown) {
      const dist = Math.hypot(p.x - scene._downX, p.y - scene._downY)
      if (dist > CAMERA.dragThreshold) {
        scene._dragging = true
        scene.cam.scrollX -= (p.x - p.prevPosition.x) / scene.cam.zoom
        scene.cam.scrollY -= (p.y - p.prevPosition.y) / scene.cam.zoom
      }
    }
    if (scene.placementKey && gameState.generalMode !== 'selected') drawRemoteGhost(scene, p.worldX, p.worldY)
  })

  scene.input.on('pointerup', (p) => {
    if (!scene._dragging) {
      if (scene.placementKey && gameState.generalMode !== 'selected') {
        net.send({ t: 'build', key: scene.placementKey, x: p.worldX, y: p.worldY })
      } else if (gameState.generalMode === 'selected') {
        net.send({ t: 'general', x: p.worldX, y: p.worldY })
      }
    }
    scene._dragging = false
  })

  scene.input.on('wheel', (_p, _o, _dx, dy) => {
    const step = dy > 0 ? -CAMERA.zoomStep : CAMERA.zoomStep
    scene.cam.setZoom(Phaser.Math.Clamp(scene.cam.zoom + step, CAMERA.minZoom, CAMERA.maxZoom))
  })

  scene.busOff = [
    bus.on('build', (key) => { scene.placementKey = key; gameState.activeBuild = key; gameState.generalMode = null }),
    bus.on('selectGeneral', () => {
      scene.placementKey = null
      gameState.activeBuild = null
      gameState.generalMode = 'selected'
      scene.ghost.setVisible(false)
    }),
    bus.on('cancel', () => {
      if (gameState.generalMode === 'selected') gameState.generalMode = null
      else { scene.placementKey = null; gameState.activeBuild = null; scene.ghost.setVisible(false) }
    }),
    bus.on('speed', (v) => net.send({ t: 'speed', v })),
  ]
}

export function drawRemoteGhost(scene, x, y) {
  const def = structureByKey(scene.placementKey)
  scene.ghost.setVisible(true).clear()
  scene.ghost.lineStyle(1, 0x6cc8ff, 0.4).strokeCircle(x, y, def.range)
  drawPolygon(scene.ghost, x, y, def.size, def.sides, 0x6cc8ff, 2, 0.9, darken(0x6cc8ff))
}

// Bloque del update() del cliente: interpola enemigos/generales, dibuja rayos/misiles/minería.
export function renderRemote(scene, time, delta) {
  // Enemigos: interpolar, rotar, glow con pulso, barras de HP
  const g = scene.enemyBars
  g.clear()
  for (const [, spr] of scene.eById) {
    spr.x += (spr.tx - spr.x) * 0.3
    spr.y += (spr.ty - spr.y) * 0.3
    spr.setRotation(spr.heading || 0)
    if (spr.glow) {
      spr.glow.setPosition(spr.x, spr.y).setRotation(spr.heading || 0)
      spr.glow.setAlpha(0.3 + Math.sin((time || 0) * 0.008 + (spr.heading || 0)) * 0.15)
    }
    if (spr.hp < spr.maxHp) {
      const sc = spr.escala || 1
      const w = 14 * sc; const frac = Math.max(0, spr.hp / spr.maxHp); const by = spr.y - 12 * sc
      g.fillStyle(0x000000, 0.6).fillRect(spr.x - w / 2 - 1, by - 1, w + 2, 4)
      g.fillStyle(0xff5566, 1).fillRect(spr.x - w / 2, by, w * frac, 2)
    }
  }

  // Generales: interpolar + rotar
  for (const [, gen] of scene.genSprites) {
    const dx = gen.tx - gen.x; const dy = gen.ty - gen.y
    gen.x += dx * 0.3; gen.y += dy * 0.3
    if (Math.hypot(dx, dy) > 1) gen.setRotation(Math.atan2(dy, dx))
  }

  // Rayos desde la cola rbeams: reusa drawBeam() del host → render idéntico (glow en boca incluido).
  const fg = scene.fxGraphics; fg.clear()
  for (let i = scene.rbeams.length - 1; i >= 0; i--) {
    const r = scene.rbeams[i]
    r[6] -= delta
    if (r[6] <= 0) { scene.rbeams.splice(i, 1); continue }
    drawBeam(fg, r[0], r[1], r[2], r[3], r[4], r[5], r[6] / r[7])
  }
  // Misiles: dead-reckoning (extrapolar por velocidad cada frame a 60 fps).
  const mdt = delta / 1000
  for (const s of scene.pMissiles.values()) {
    s.x += s.vx * mdt; s.y += s.vy * mdt
    s.setPosition(s.x, s.y)
    if (s.vx || s.vy) s.setRotation(Math.atan2(s.vy, s.vx) + Math.PI / 2)
  }
  for (const s of scene.eMissiles.values()) {
    s.x += s.vx * mdt; s.y += s.vy * mdt
    s.setPosition(s.x, s.y)
  }

  // Minería desde _fx (con pulso): recolectores + General.
  const bg = scene.beamGraphics; bg.clear()
  const fx = scene._fx
  if (fx) {
    const pulse = 0.45 + 0.3 * Math.sin((time || 0) * 0.012)
    for (const [sx, sy, mx, my] of fx.mining || []) {
      bg.lineStyle(3, 0x49e07a, pulse); bg.lineBetween(sx, sy, mx, my)
      bg.fillStyle(0x49e07a, pulse); bg.fillCircle(mx, my, 4)
    }
    if (fx.gmining) {
      const [gx, gy, mx, my] = fx.gmining
      bg.lineStyle(3, 0x49e07a, pulse); bg.lineBetween(gx, gy, mx, my)
      bg.fillStyle(0x49e07a, pulse); bg.fillCircle(mx, my, 4)
    }
  }
}
