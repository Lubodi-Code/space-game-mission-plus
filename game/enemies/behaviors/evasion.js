import { STEERING } from '../../balance.js'
import { shipDrive } from './movement.js'

const ZERO = { fx: 0, fy: 0 }

let _frameTime = -1
let _sharedThreats = []

function getSharedThreats(world, time) {
  if (_frameTime === time) return _sharedThreats
  _frameTime = time

  const list = []
  for (const p of world.playerProjectiles) {
    if (!p.sprite || !p.sprite.active || !p._dir) continue
    list.push({
      x: p.x, y: p.y,
      vx: p._dir.x * p.speed,
      vy: p._dir.y * p.speed,
      speed: p.speed,
      damage: p.damage || 0,
    })
  }
  _sharedThreats = list
  return list
}

function relevantThreats(e, threats, horizon, marginSq) {
  const result = []
  for (const t of threats) {
    const rx = t.x - e.x, ry = t.y - e.y
    const cull = t.speed * horizon + 150
    if (Math.abs(rx) > cull || Math.abs(ry) > cull) continue

    const vx = t.vx - e.vx, vy = t.vy - e.vy
    const dot = rx * vx + ry * vy
    if (dot >= 0) continue

    const vv = vx * vx + vy * vy
    if (vv < 1e-6) continue

    const ttc = -dot / vv
    if (ttc > horizon) continue

    const cpx = rx + vx * ttc, cpy = ry + vy * ttc
    const cpaSq = cpx * cpx + cpy * cpy
    if (cpaSq > marginSq * 8) continue

    result.push({
      ttc, cpaSq, rx, ry,
      pvx: t.vx, pvy: t.vy,
      damage: t.damage,
    })
  }
  return result
}

function makeEvasion(style) {
  return (e, world, dt, time) => {
    if (!e.risk || !world.playerProjectiles || !world.playerProjectiles.length) return ZERO
    if (Math.random() >= (e.def.evasionChance ?? 1)) return ZERO

    const horizon = STEERING.threatHorizon * 2.0
    const margin = e.radius + STEERING.evadeMargin + 10
    const marginSq = margin * margin

    const all = getSharedThreats(world, time ?? 0)
    const hits = relevantThreats(e, all, horizon, marginSq)
    if (!hits.length) return ZERO

    hits.sort((a, b) => a.ttc - b.ttc)
    const threats = hits.slice(0, 6)

    const riskCtx = {
      ttc: threats[0].ttc,
      cpa: Math.sqrt(threats[0].cpaSq),
      incomingDamage: hits.reduce((s, t) => s + t.damage, 0),
      threatCount: hits.length,
      distToTarget: e.target
        ? Math.hypot(e.target.x - e.x, e.target.y - e.y)
        : Infinity,
    }

    const intent = e.risk(e, riskCtx)
    if (intent <= 0.05) return ZERO

    let dodgeX = 0, dodgeY = 0, totalWeight = 0

    for (const t of threats) {
      const urgency = Math.max(0.15, 1 - t.ttc / horizon)
      const cpaWeight = 1 / (1 + t.cpaSq / marginSq)
      const dmgWeight = 1 + t.damage * 0.04
      const w = urgency * cpaWeight * dmgWeight

      const pmag = Math.hypot(t.pvx, t.pvy) || 1
      const perpX = -t.pvy / pmag
      const perpY = t.pvx / pmag
      const side = (t.rx * perpX + t.ry * perpY) >= 0 ? 1 : -1

      dodgeX += perpX * side * w
      dodgeY += perpY * side * w
      totalWeight += w
    }

    if (totalWeight < 1e-8) return ZERO
    dodgeX /= totalWeight
    dodgeY /= totalWeight

    const primaryUrgency = Math.max(0.15, 1 - threats[0].ttc / horizon)
    const countBonus = 1 + Math.min(hits.length, 8) * 0.1

    // Dodge waypoint: the ship steers toward this point, creating a
    // smooth parabolic arc instead of an instant lateral slide.
    // Closer waypoint = sharper turn, farther = gentler curve.
    const intensity = style.shape(e, threats[0].ttc) * intent * primaryUrgency * countBonus
    const dodgeDist = Math.max(120, 400 * (1 - primaryUrgency * 0.45))
    const wayX = e.x + dodgeX * dodgeDist
    const wayY = e.y + dodgeY * dodgeDist

    const sx = wayX - e.x, sy = wayY - e.y
    const sd = Math.hypot(sx, sy) || 1

    // Desired velocity toward waypoint — this is a seek, not a raw impulse.
    // shipDrive will convert forward desire to main engine and lateral to RCS.
    const desiredVx = (sx / sd) * e.maxSpeed * intensity
    const desiredVy = (sy / sd) * e.maxSpeed * intensity

    const force = {
      fx: desiredVx - e.vx,
      fy: desiredVy - e.vy,
    }

    // Boost agility during active evasion for sharper parabolic turns
    const agility = Math.min(1.0, (e.def.agility ?? 0.2) + primaryUrgency * 0.55)

    return shipDrive(e, force, agility)
  }
}

export const EVASION = {
  JUKE: makeEvasion({ shape: () => 1.0 }),
  STRAFE_BURST: makeEvasion({ shape: () => 1.4 }),
  SERPENTINE: makeEvasion({ shape: () => 1.2 }),
}
