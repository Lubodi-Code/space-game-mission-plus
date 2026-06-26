import Phaser from 'phaser'
import { STEERING } from '../../balance.js'

const ZERO = { fx: 0, fy: 0 }

export function seek(e, tx, ty) {
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy) || 1
  const dvx = (dx / d) * e.maxSpeed
  const dvy = (dy / d) * e.maxSpeed
  return { fx: dvx - e.vx, fy: dvy - e.vy }
}

export function flee(e, tx, ty) {
  const s = seek(e, tx, ty)
  return { fx: -s.fx, fy: -s.fy }
}

export function arrive(e, tx, ty, slowR) {
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy)
  if (d < 1) return { fx: -e.vx, fy: -e.vy }
  const speed = d < slowR ? e.maxSpeed * (d / slowR) : e.maxSpeed
  const dvx = (dx / d) * speed, dvy = (dy / d) * speed
  return { fx: dvx - e.vx, fy: dvy - e.vy }
}

export function arriveAtRange(e, t, R) {
  const dx = e.x - t.x, dy = e.y - t.y
  const d = Math.hypot(dx, dy) || 1
  const px = t.x + (dx / d) * R
  const py = t.y + (dy / d) * R
  return arrive(e, px, py, Math.max(40, R * 0.4))
}

export function pursue(e, target) {
  const tvx = target.vx || 0, tvy = target.vy || 0
  const d = Phaser.Math.Distance.Between(e.x, e.y, target.x, target.y)
  const ahead = Math.min(0.6, d / (e.maxSpeed || 1))
  return seek(e, target.x + tvx * ahead, target.y + tvy * ahead)
}

export function wander(e, dt) {
  e.wanderAngle += (Math.random() - 0.5) * STEERING.wanderJitter
  const vmag = Math.hypot(e.vx, e.vy) || 1
  const hx = e.vx / vmag, hy = e.vy / vmag
  const cx = e.x + hx * STEERING.wanderDistance
  const cy = e.y + hy * STEERING.wanderDistance
  const tx = cx + Math.cos(e.wanderAngle) * STEERING.wanderRadius
  const ty = cy + Math.sin(e.wanderAngle) * STEERING.wanderRadius
  return seek(e, tx, ty)
}

export function separate(e, world) {
  let sx = 0, sy = 0, n = 0
  const R = STEERING.separationRadius
  const grid = world.enemyGrid
  if (grid) {
    grid.forEachNear(e.x, e.y, R, (o) => {
      if (o === e || o.dead) return
      const dx = e.x - o.x, dy = e.y - o.y
      const d = Math.hypot(dx, dy)
      if (d > 0 && d < R) { sx += (dx / d) / d; sy += (dy / d) / d; n++ }
    })
  }
  if (!n) return ZERO
  const m = Math.hypot(sx, sy) || 1
  const dvx = (sx / m) * e.maxSpeed, dvy = (sy / m) * e.maxSpeed
  return { fx: dvx - e.vx, fy: dvy - e.vy }
}

export function avoidObstacles(e, world) {
  const vmag = Math.hypot(e.vx, e.vy)
  if (vmag < 1 || !world.meteorites) return ZERO
  const hx = e.vx / vmag, hy = e.vy / vmag
  const look = STEERING.avoidLookahead
  let best = null, bestD = Infinity
  for (const m of world.meteorites) {
    if (m.depleted) continue
    const rx = m.x - e.x, ry = m.y - e.y
    const proj = rx * hx + ry * hy
    if (proj < 0 || proj > look) continue
    const perp = Math.abs(rx * -hy + ry * hx)
    if (perp < (m.radius || 26) + e.radius && proj < bestD) { bestD = proj; best = { m, rx, ry, hx, hy } }
  }
  if (!best) return ZERO
  const side = (best.rx * -best.hy + best.ry * best.hx) > 0 ? -1 : 1
  const px = -best.hy * side, py = best.hx * side
  return { fx: px * e.maxSpeed - e.vx, fy: py * e.maxSpeed - e.vy }
}
