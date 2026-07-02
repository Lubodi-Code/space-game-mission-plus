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
import { explosion, hitFlash, drawBeam, spawnMarker, auraBurst, drawPlayerCursor, HEAL_ORB_COLOR, orbScale } from '../render/fx.js'
import { glowBlend } from '../render/blend.js'
import { GEN_TINTS } from '../General.js'
import { UPGRADES } from '../structures/upgrades.js'

// Capa de sincronización multijugador (host-authoritative ~12 Hz).
// Host: buildSnapshot/sendSnapshot/onIntent. Cliente: createRemote/applySnapshot/
// setupRemoteInput/drawRemoteGhost/renderRemote. Todas reciben `scene`; el estado
// (eById, sById, rbeams, _snap…) vive en la escena. GameScene solo orquesta y hace input.

// ---------------------------------------------------------------- host
export function onIntent(scene, d, nc) {
  if (d.t === 'build') {
    const k = scene.placementKey
    scene.placementKey = d.key
    // General del CLIENTE + sin snap del host (su _snapPos apuntaba a la última posición
    // del ghost del host y hacía fallar/desviar todas las construcciones remotas).
    tryPlace(scene, d.x, d.y, scene.generals.get(nc.pid), false)
    scene.placementKey = k
  } else if (d.t === 'cursor') {
    scene.remoteCursors?.set(nc.pid, { x: d.x, y: d.y })
  } else if (d.t === 'general') {
    scene.generals.get(nc.pid)?.setTarget(d.x, d.y, scene)
  } else if (d.t === 'hello') {
    nc.name = d.name || nc.name
    if (d.name) scene.generals.get(nc.pid)?.setLabel(d.name)
  } else if (d.t === 'speed') {
    scene.setSpeed(d.v)
  }
}

export function buildSnapshot(scene) {
  const expl = scene._explQueue
  scene._explQueue = []
  const beams = scene._beamQueue
  scene._beamQueue = []
  const aura = scene._auraQueue
  scene._auraQueue = []
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
    structs: scene.structures.map((s) => [s.id, s.key, Math.round(s.x), Math.round(s.y), Math.round(s.hp), Math.round(s.maxHp), s.powered ? 1 : 0, s.building ? 1 : 0, s.building && s.buildTime ? Math.round((s.buildProgress / s.buildTime) * 100) / 100 : 1, (s.upgrades || []).join(',')]),
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
      aura,
    },
    // [pid, x, y, hp, alive, name]. El nombre va en cada snap (≤16 chars × ≤4 generales,
    // ~12 Hz). ponytail: trivial; separar a un mensaje aparte solo si el ancho de banda importa.
    gen: [...scene.generals.values()].map((g) => [g.pid, Math.round(g.x), Math.round(g.y), Math.round(g.hp), g.alive ? 1 : 0, g.labelName || '']),
    // Esferas del Enjambre Sanador (solo posición + si está curando) para que el cliente las vea.
    orbs: (scene.healers || []).map((h) => [Math.round(h.x), Math.round(h.y), h.target ? 1 : 0]),
    // Cursores de todos los jugadores: host (pid 0, puntero local) + clientes (intents 'cursor').
    cursors: [
      [0, Math.round(scene.input.activePointer.worldX), Math.round(scene.input.activePointer.worldY)],
      ...[...(scene.remoteCursors || new Map())].map(([pid, c]) => [pid, c.x, c.y]),
    ],
  }
}

// Bloque del update() del host: emite snapshot ~12 Hz (incluso en game over para propagar status).
export function sendSnapshot(scene, d) {
  if (net.isHost && net.conns.length) {
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
  scene.myPid = -1 // llega en 'welcome'; hasta entonces no se filtra ningún cursor
  scene.orbSprites = [] // pool de sprites para las esferas sanadoras
  scene.rCursors = new Map() // pid -> {x,y,tx,ty} interpolado
  net.onData = (d) => {
    if (d.t === 'snap') applySnapshot(scene, d)
    else if (d.t === 'welcome') scene.myPid = d.pid
  }
  gameState.status = 'playing'
  scene.speed = 1
  scene.placementKey = null
  setupRemoteInput(scene)
  net.send({ t: 'hello', name: net.myName }) // el host etiqueta mi general con mi nombre

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    net.onData = () => {}
    for (const spr of scene.eById.values()) spr.destroy()
    for (const s of scene.sById.values()) s.container.destroy()
    for (const g of scene.genSprites.values()) { g.label?.destroy(); g.destroy() }
    for (const m of scene.mById.values()) m.container.destroy()
    for (const s of scene.pMissiles.values()) s.destroy()
    for (const s of scene.eMissiles.values()) s.destroy()
    for (const s of scene.orbSprites) s.destroy()
  })
}

export function applySnapshot(scene, snap) {
  scene._snap = snap
  scene._fx = snap.fx
  Object.assign(gameState, snap.eco)

  // Estructuras: instancias REALES → mismo render que el host (núcleo animado incluido).
  const seenS = new Set()
  for (const row of snap.structs) {
    const [id, key, x, y, hp, maxHp, powered, building, frac, upgStr] = row
    seenS.add(id)
    let s = scene.sById.get(id)
    const isNew = !s
    if (isNew) { s = createStructure(key, x, y, scene); scene.sById.set(id, s) }
    if (!isNew && hp < s.hp) {
      hitFlash(scene, x, y)
      if (key === 'core') scene.cameras.main.shake(100, 0.0008)
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
    // Aplicar mejoras visuales (cliente no simula stats, solo aspecto)
    const upIds = upgStr ? upgStr.split(',') : []
    for (const id of upIds) {
      if (!s.upgrades?.includes(id)) {
        const u = UPGRADES.find((x) => x.id === id)
        if (u) { s.applyUpgrade?.(u); s.applyUpgradeVisual(u); (s.upgrades ||= []).push(id) }
      }
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

  // Enemigos: sprites con glow + rumbo + marcador de spawn al aparecer.
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
      spawnMarker(scene, x, y)
    }
    spr.tx = x; spr.ty = y
    spr.heading = h || 0
    spr.hp = hp; spr.maxHp = maxHp; spr.escala = REGISTRY[type].scale
  }
  for (const [id, spr] of scene.eById) if (!seenE.has(id)) { spr.glow?.destroy(); spr.destroy(); scene.eById.delete(id) }

  // Generales con interpolación (tx/ty para movimiento suave en update) + nombre encima.
  const seenG = new Set()
  for (const [pid, x, y, hp, alive, name] of snap.gen) {
    seenG.add(pid)
    let g = scene.genSprites.get(pid)
    if (!g) {
      // Misma nave y escala que el host (General.js usa 'general_ship' 0.85).
      g = scene.add.image(x, y, 'general_ship').setTint(GEN_TINTS[pid % GEN_TINTS.length]).setScale(0.85).setDepth(17)
      g.tx = x; g.ty = y
      g.label = scene.add.text(x, y - 30, name || '', { fontSize: '11px', color: '#cfe8ff', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(19)
      scene.genSprites.set(pid, g)
    }
    g.tx = x; g.ty = y; g.setVisible(!!alive)
    if (name && g.label.text !== name) g.label.setText(name)
    g.label.setVisible(!!alive)
  }
  for (const [pid, g] of scene.genSprites) if (!seenG.has(pid)) { g.label?.destroy(); g.destroy(); scene.genSprites.delete(pid) }

  // Rayos: encolar cada evento. b = [x1,y1,x2,y2,color,width,ttl,ttlBase]; índice 6 cuenta atrás.
  for (const b of (snap.fx?.beams || [])) scene.rbeams.push([...b])

  // Explosiones de aura (ojiva de plasma).
  for (const [x, y, color, r] of (snap.fx?.aura || [])) auraBurst(scene, x, y, color, r)

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

  // Cursores de otros jugadores (objetivos para interpolar en renderRemote).
  const seenC = new Set()
  for (const [pid, x, y] of (snap.cursors || [])) {
    if (pid === scene.myPid) continue
    seenC.add(pid)
    const c = scene.rCursors.get(pid)
    if (c) { c.tx = x; c.ty = y } else scene.rCursors.set(pid, { x, y, tx: x, ty: y })
  }
  for (const pid of scene.rCursors.keys()) if (!seenC.has(pid)) scene.rCursors.delete(pid)
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
    // Cursor propio hacia el host (throttle ~80 ms, mismo ritmo que el snapshot).
    const now = performance.now()
    if (!scene._curSent || now - scene._curSent > 80) {
      scene._curSent = now
      net.send({ t: 'cursor', x: Math.round(p.worldX), y: Math.round(p.worldY) })
    }
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

  // Generales: interpolar + rotar + reposicionar nombre
  for (const [, gen] of scene.genSprites) {
    const dx = gen.tx - gen.x; const dy = gen.ty - gen.y
    gen.x += dx * 0.3; gen.y += dy * 0.3
    if (Math.hypot(dx, dy) > 1) gen.setRotation(Math.atan2(dy, dx))
    if (gen.label) gen.label.setPosition(gen.x, gen.y - 30)
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

  // Esferas sanadoras: pool de sprites con el mismo color/pulso que el host.
  const orbs = scene._snap?.orbs || []
  while (scene.orbSprites.length < orbs.length) {
    scene.orbSprites.push(scene.add.image(0, 0, 'glow').setTint(HEAL_ORB_COLOR)
      .setBlendMode(glowBlend()).setDepth(18))
  }
  for (let i = 0; i < scene.orbSprites.length; i++) {
    const s = scene.orbSprites[i]
    const o = orbs[i]
    if (!o) { s.setVisible(false); continue }
    s.setVisible(true)
    // Interpolación suave hacia la posición del snapshot (12 Hz → 60 fps).
    if (s.ox === undefined) { s.ox = o[0]; s.oy = o[1] }
    s.ox += (o[0] - s.ox) * 0.3; s.oy += (o[1] - s.oy) * 0.3
    s.setPosition(s.ox, s.oy)
    s.setScale(orbScale(time, i, o[2]))
    s.setAlpha(o[2] ? 1 : 0.75)
  }

  // Cursores de los demás jugadores, interpolados.
  const cg = scene.cursorGfx
  if (cg) {
    cg.clear()
    for (const [pid, c] of scene.rCursors) {
      c.x += (c.tx - c.x) * 0.35; c.y += (c.ty - c.y) * 0.35
      drawPlayerCursor(cg, c.x, c.y, GEN_TINTS[pid % GEN_TINTS.length], time)
    }
  }
}
