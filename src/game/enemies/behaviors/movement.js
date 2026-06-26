import { seek, arriveAtRange } from './steering.js'

const ZERO = { fx: 0, fy: 0 }

/**
 * Filtro de Físicas de Nave
 * Toma una fuerza deseada (ideal) y la transforma limitando cuánto
 * puede desplazarse lateralmente frente a cuánto acelera hacia adelante.
 */
export function shipDrive(e, desiredForce, agility = 0.2) {
  const heading = e.heading !== undefined ? e.heading : Math.atan2(e.vy || 0, e.vx || 1)

  const fwdX = Math.cos(heading)
  const fwdY = Math.sin(heading)

  const perpX = -fwdY
  const perpY = fwdX

  const forwardDesire = desiredForce.fx * fwdX + desiredForce.fy * fwdY
  const lateralDesire = desiredForce.fx * perpX + desiredForce.fy * perpY

  const mainThrust = Math.max(0, forwardDesire)
  const rcsThrust = lateralDesire * agility

  return {
    fx: fwdX * mainThrust + perpX * rcsThrust,
    fy: fwdY * mainThrust + perpY * rcsThrust,
  }
}

export const MOVEMENT = {
  STRAIGHT: (e, world) => {
    const t = e.target
    if (!t) return ZERO
    const reach = (t.radius || 0) + 14
    const stopAt = e.def.attackRange > 0 ? e.def.attackRange : reach
    const idealForce = arriveAtRange(e, t, stopAt)
    return shipDrive(e, idealForce, e.def.agility || 0.2)
  },

  WEAVE: (e, world, dt, time) => {
    const t = e.target
    if (!t) return ZERO

    const dist = Math.hypot(t.x - e.x, t.y - e.y)
    const waveAmplitude = Math.min(dist * 0.5, 150)

    const perpX = -e.vy / (Math.hypot(e.vx, e.vy) || 1)
    const perpY = e.vx / (Math.hypot(e.vx, e.vy) || 1)

    const wave = Math.sin((time || 0) * 0.005) * waveAmplitude
    const fakeTargetX = t.x + perpX * wave
    const fakeTargetY = t.y + perpY * wave

    const idealForce = seek(e, fakeTargetX, fakeTargetY)

    return shipDrive(e, idealForce, (e.def.agility || 0.2) * 1.5)
  },

  APPROACH_THEN_HOLD: (e) => {
    const t = e.target
    if (!t) return ZERO
    const idealForce = arriveAtRange(e, t, (e.def.attackRange || 130) * 0.9)
    return shipDrive(e, idealForce, e.def.agility || 0.2)
  },

  KEEP_DISTANCE: (e) => {
    const t = e.target
    if (!t) return ZERO

    const idealForce = arriveAtRange(e, t, (e.def.attackRange || 200) * 0.85)

    const dx = t.x - e.x, dy = t.y - e.y
    const d = Math.hypot(dx, dy) || 1
    const orbitSpeed = e.maxSpeed * 0.6
    idealForce.fx += (-dy / d) * orbitSpeed
    idealForce.fy += (dx / d) * orbitSpeed

    return shipDrive(e, idealForce, (e.def.agility || 0.2) * 2.0)
  },

  STANDOFF: (e) => {
    const t = e.target
    if (!t) return ZERO
    const idealForce = arriveAtRange(e, t, e.def.preferredRange || 600)
    return shipDrive(e, idealForce, e.def.agility || 0.2)
  },
}
