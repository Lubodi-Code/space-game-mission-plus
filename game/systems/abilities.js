import Phaser from 'phaser'
import { RENDER_SCALE } from '~/game/quality.js'
import { gameState } from '~/game/gameState.js'
import { abilityUnlocked, runBonuses } from '~/game/meta/research.js'
import { equippedBeam } from '~/game/meta/cosmetics.js'
import { drawBeam, spawnFloatingText } from '~/game/render/fx.js'
import { sfxCharge, sfxMegaBeam, sfxEmp, sfxRepair, sfxStrike, sfxUi } from '~/game/sound.js'

// Habilidades activas de cada comandante; el host ejecuta también las del invitado.
// - target 'enemy': espera clic sobre una unidad enemiga (Mega Rayo)
// - target 'point': espera clic en el mapa (Bombardeo)
// - target 'self' : se lanza al instante alrededor del General
// Estado en la escena: scene.abilityCd (pid → {id → ms restantes}), scene.abilityFx.
// Todos los tiempos en MS (se llama con el `d` del loop).

export const ABILITIES = {
  megalaser: {
    id: 'megalaser', label: 'Mega Rayo', icon: '⚡', key: 'Z', target: 'enemy',
    desc: 'Carga y dispara un rayo masivo hacia la unidad elegida. Perfora todo lo que cruza.',
    cooldownMs: 35000, chargeMs: 850, damage: 1400, width: 30, beamMs: 650, overshoot: 1.35,
  },
  emp: {
    id: 'emp', label: 'Pulso EMP', icon: '◎', key: 'C', target: 'self',
    desc: 'Paraliza a todos los enemigos alrededor del comandante.',
    cooldownMs: 45000, radius: 480, stunMs: 3500,
  },
  repair: {
    id: 'repair', label: 'Reparación', icon: '✚', key: 'V', target: 'self',
    desc: 'Repara al instante el 50% de la vida de las estructuras cercanas.',
    cooldownMs: 60000, radius: 520, healFrac: 0.5,
  },
  strike: {
    id: 'strike', label: 'Bombardeo', icon: '✹', key: 'B', target: 'point',
    desc: 'Lluvia de misiles orbitales sobre la zona elegida.',
    cooldownMs: 55000, radius: 240, bombs: 16, damage: 90, delayMs: 900, spanMs: 1400,
  },
}

export const ABILITY_ORDER = ['megalaser', 'emp', 'repair', 'strike']

export function initAbilities(scene) {
  scene.abilityCd = new Map([[0, {}]])
  scene.abilityFx = []
  scene.abilityGfx = scene.add.graphics().setDepth(32).setBlendMode(Phaser.BlendModes.ADD)
  const b = runBonuses()
  scene.abilityMods = { megaDmg: b.megalaser2 ? 1.5 : 1, megaCd: b.megalaser2 ? 0.75 : 1 }
  publish(scene)
}

function cooldownOf(scene, def) {
  return def.id === 'megalaser' ? def.cooldownMs * scene.abilityMods.megaCd : def.cooldownMs
}

export function abilityCooldownsFor(scene, pid) {
  const cds = scene.abilityCd?.get(pid) || {}
  return ABILITY_ORDER.map((id) => ({
    id,
    frac: Math.max(0, cds[id] || 0) / cooldownOf(scene, ABILITIES[id]),
  }))
}

// Publica el estado para el HUD (ready/cd). Barato: pocos campos.
function publish(scene) {
  const out = {}
  for (const id of ABILITY_ORDER) {
    const def = ABILITIES[id]
    const cdLeft = Math.max(0, scene.abilityCd.get(0)?.[id] || 0)
    out[id] = {
      unlocked: abilityUnlocked(id),
      ready: cdLeft <= 0,
      cdLeft: Math.ceil(cdLeft / 1000),
      frac: cdLeft / cooldownOf(scene, def),
    }
  }
  gameState.abilities = out
}

// Desde el HUD (bus 'ability'). Las 'self' se lanzan ya; las otras entran en modo apuntado.
export function requestAbility(scene, id, pid = 0, target = null) {
  const def = ABILITIES[id]
  const g = pid === 0 ? scene.general : scene.generals.get(pid)
  if (!def || !abilityUnlocked(id) || !g?.alive) { if (pid === 0) sfxUi('error'); return }
  if ((scene.abilityCd.get(pid)?.[id] || 0) > 0) { if (pid === 0) sfxUi('error'); return }
  if (def.target === 'self') { cast(scene, def, null, g); return }
  if (pid !== 0) {
    if (def.target === 'point') {
      if (Number.isFinite(target?.x) && Number.isFinite(target?.y)) cast(scene, def, target, g)
    } else if (def.target === 'enemy') {
      let enemy = scene.enemies.find((e) => !e.dead && e.id === target?.targetId)
      if (!enemy && Number.isFinite(target?.x) && Number.isFinite(target?.y)) {
        let bestD = 60
        for (const e of scene.enemies) {
          if (e.dead) continue
          const d = Math.hypot(e.x - target.x, e.y - target.y)
          if (d <= bestD) { bestD = d; enemy = e }
        }
      }
      if (enemy) cast(scene, def, enemy, g)
    }
    return
  }
  gameState.abilityTargeting = gameState.abilityTargeting === id ? null : id
}

export function cancelTargeting() {
  gameState.abilityTargeting = null
}

// Clic en el mundo mientras hay una habilidad apuntando. Devuelve true si consumió el clic.
export function handleTargetClick(scene, wx, wy) {
  const id = gameState.abilityTargeting
  if (!id) return false
  const def = ABILITIES[id]
  if (def.target === 'enemy') {
    // Tolerancia en px de pantalla → coherente a cualquier zoom (y con el dedo en móvil).
    const tol = (36 * RENDER_SCALE) / scene.cam.zoom
    let best = null; let bestD = Infinity
    for (const e of scene.enemies) {
      if (e.dead) continue
      const d = Math.hypot(e.x - wx, e.y - wy) - e.radius
      if (d < tol && d < bestD) { bestD = d; best = e }
    }
    if (!best) { sfxUi('error'); return true } // sigue apuntando
    cast(scene, def, best, scene.general)
  } else {
    cast(scene, def, { x: wx, y: wy }, scene.general)
  }
  gameState.abilityTargeting = null
  return true
}

function cast(scene, def, target, general) {
  const g = general
  const cds = scene.abilityCd.get(g.pid) || {}
  cds[def.id] = cooldownOf(scene, def)
  scene.abilityCd.set(g.pid, cds)
  if (def.id === 'megalaser') {
    sfxCharge(g.x, g.y, def.chargeMs)
    scene.abilityFx.push({ kind: 'charge', t: 0, dur: def.chargeMs, def, target, general: g })
  } else if (def.id === 'emp') {
    sfxEmp(g.x, g.y)
    for (const e of scene.enemies) {
      if (e.dead) continue
      if (Math.hypot(e.x - g.x, e.y - g.y) <= def.radius) e.stunMs = Math.max(e.stunMs || 0, def.stunMs)
    }
    scene.abilityFx.push({ kind: 'ring', t: 0, dur: 700, x: g.x, y: g.y, r: def.radius, color: 0x8be9fd })
    scene.cam.shake(180, 0.003)
  } else if (def.id === 'repair') {
    sfxRepair(g.x, g.y)
    for (const s of scene.structures) {
      if (s.dead || s.hp >= s.maxHp) continue
      if (Math.hypot(s.x - g.x, s.y - g.y) > def.radius) continue
      const heal = Math.round(s.maxHp * def.healFrac)
      s.hp = Math.min(s.maxHp, s.hp + heal)
      if (s.isCore) gameState.coreHp = Math.ceil(s.hp)
      s.drawHpBar?.()
      spawnFloatingText(scene, s.x, s.y - 16, `+${heal}`, '#7dffd0')
    }
    scene.abilityFx.push({ kind: 'ring', t: 0, dur: 800, x: g.x, y: g.y, r: def.radius, color: 0x7dffd0 })
  } else if (def.id === 'strike') {
    sfxStrike(target.x, target.y)
    const bombs = []
    for (let i = 0; i < def.bombs; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * def.radius
      bombs.push({ x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r, at: def.delayMs + Math.random() * def.spanMs, done: false })
    }
    scene.abilityFx.push({ kind: 'strike', t: 0, dur: def.delayMs + def.spanMs + 300, x: target.x, y: target.y, def, bombs })
  }
  publish(scene)
}

// Daño a todo enemigo a menos de `halfW` del segmento (x1,y1)-(x2,y2).
function damageAlongSegment(scene, x1, y1, x2, y2, halfW, dmg) {
  const dx = x2 - x1; const dy = y2 - y1
  const len2 = dx * dx + dy * dy || 1
  let hits = 0
  for (const e of scene.enemies) {
    if (e.dead) continue
    const t = Phaser.Math.Clamp(((e.x - x1) * dx + (e.y - y1) * dy) / len2, 0, 1)
    const px = x1 + dx * t; const py = y1 + dy * t
    if (Math.hypot(e.x - px, e.y - py) <= halfW + e.radius) { e.hit(dmg, scene.world); hits++ }
  }
  return hits
}

export function updateAbilities(scene, d) {
  for (const cds of scene.abilityCd.values()) {
    for (const id of ABILITY_ORDER) if (cds[id] > 0) cds[id] = Math.max(0, cds[id] - d)
  }
  const g = scene.general
  const gfx = scene.abilityGfx
  gfx.clear()

  // Indicador de apuntado: anillo en el General.
  if (gameState.abilityTargeting && g?.alive) {
    const pulse = 0.5 + 0.5 * Math.sin(scene.time.now * 0.012)
    gfx.lineStyle(2, 0xffe066, 0.5 + 0.4 * pulse).strokeCircle(g.x, g.y, g.radius + 14 + pulse * 4)
  }

  const beam = equippedBeam()
  for (let i = scene.abilityFx.length - 1; i >= 0; i--) {
    const fx = scene.abilityFx[i]
    fx.t += d
    const k = Math.min(1, fx.t / fx.dur)
    if (fx.kind === 'charge') {
      const g = fx.general
      const tgt = fx.target
      if (!g.alive || tgt.dead) { scene.abilityFx.splice(i, 1); continue } // se canceló: no reembolsa
      gfx.lineStyle(2, beam.color, 0.3 + 0.6 * k).strokeCircle(g.x, g.y, 40 * (1 - k) + 8)
      gfx.fillStyle(beam.core, 0.3 + 0.6 * k).fillCircle(g.x, g.y, 4 + 10 * k)
      gfx.lineStyle(1, beam.color, 0.25 * k).lineBetween(g.x, g.y, tgt.x, tgt.y) // mira
      if (k >= 1) {
        const ang = Math.atan2(tgt.y - g.y, tgt.x - g.x)
        const dist = Math.hypot(tgt.x - g.x, tgt.y - g.y) * fx.def.overshoot + 120
        const x2 = g.x + Math.cos(ang) * dist; const y2 = g.y + Math.sin(ang) * dist
        const dmg = fx.def.damage * scene.abilityMods.megaDmg
        tgt.hit(dmg, scene.world) // el blanco elegido siempre recibe el golpe completo
        damageAlongSegment(scene, g.x, g.y, x2, y2, fx.def.width * 0.5, dmg * 0.45)
        sfxMegaBeam(g.x, g.y)
        scene.cam.shake(260, 0.006)
        scene.explosion(tgt.x, tgt.y, beam.color, 60)
        scene.abilityFx[i] = { kind: 'beam', t: 0, dur: fx.def.beamMs, x1: g.x, y1: g.y, x2, y2, w: fx.def.width }
      }
    } else if (fx.kind === 'beam') {
      const a = 1 - k
      const w = fx.w * (0.6 + 0.4 * Math.sin(k * Math.PI))
      drawBeam(gfx, fx.x1, fx.y1, fx.x2, fx.y2, beam.color, w * 0.5, a)
      gfx.lineStyle(w * 0.25, beam.core, a).lineBetween(fx.x1, fx.y1, fx.x2, fx.y2)
      if (fx.t >= fx.dur) scene.abilityFx.splice(i, 1)
    } else if (fx.kind === 'ring') {
      gfx.lineStyle(6 * (1 - k) + 1, fx.color, 0.8 * (1 - k)).strokeCircle(fx.x, fx.y, fx.r * (0.2 + 0.8 * k))
      gfx.fillStyle(fx.color, 0.12 * (1 - k)).fillCircle(fx.x, fx.y, fx.r * (0.2 + 0.8 * k))
      if (fx.t >= fx.dur) scene.abilityFx.splice(i, 1)
    } else if (fx.kind === 'strike') {
      gfx.lineStyle(2, 0xff8a3d, 0.25 + 0.2 * Math.sin(fx.t * 0.02)).strokeCircle(fx.x, fx.y, fx.def.radius)
      for (const b of fx.bombs) {
        if (b.done) continue
        const lead = b.at - fx.t
        if (lead > 0) {
          if (lead < 500) gfx.fillStyle(0xff8a3d, 0.5 * (1 - lead / 500)).fillCircle(b.x, b.y, 10 * (1 - lead / 500) + 2)
          continue
        }
        b.done = true
        for (const e of scene.enemies) {
          if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) <= 70 + e.radius) e.hit(fx.def.damage, scene.world)
        }
        scene.explosion(b.x, b.y, 0xff8a3d, 45)
      }
      if (fx.t >= fx.dur) scene.abilityFx.splice(i, 1)
    }
  }

  scene._abilityPub = (scene._abilityPub || 0) + d
  if (scene._abilityPub >= 200) { scene._abilityPub = 0; publish(scene) }
}
