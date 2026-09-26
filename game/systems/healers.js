import Phaser from 'phaser'
import { gameState } from '~/game/gameState.js'
import { HEAL_ORB_COLOR, orbScale, healSparkFx } from '~/game/render/fx.js'

// Esferas sanadoras (estructura Healer). delta en MS; dt en segundos.

// Los edificios Enjambre no se curan a sí mismos ni entre ellos: no son objetivo
// válido de esferas sanadoras.
const isHealable = (s) => !s.dead && s.role !== 'healer'

export function mostDamagedStructure(scene) {
  let best = null
  let worst = 1
  for (const s of scene.structures) {
    if (!isHealable(s)) continue
    const frac = s.hp / s.maxHp
    if (frac < worst) {
      worst = frac
      best = s
    }
  }
  return worst < 1 ? best : null
}

// Asignación por reclamo (claim): cada esfera cura "su" edificio; dos esferas
// no comparten objetivo mientras haya otros edificios dañados.
// IMPORTANTE: el reclamo excluye a la PROPIA esfera. Si se incluyera su objetivo
// actual en `claimed`, al re-evaluar lo vería "ocupado" y abandonaría un edificio
// válido y cercano para irse a otro sin reclamar → esferas divagando sin curar.
function claimTarget(scene, sphere) {
  const claimed = new Set()
  for (const h of scene.healers) {
    if (h !== sphere && h.target) claimed.add(h.target)
  }
  let best = null, bestFrac = 1
  let bestShared = null, bestSharedFrac = 1
  for (const s of scene.structures) {
    if (!isHealable(s) || s.hp >= s.maxHp) continue
    const frac = s.hp / s.maxHp
    if (!claimed.has(s)) { if (frac < bestFrac) { bestFrac = frac; best = s } }
    else if (frac < bestSharedFrac) { bestSharedFrac = frac; bestShared = s }
  }
  return best || bestShared
}

export function updateHealers(scene, delta) {
  const dt = delta / 1000

  for (let i = scene.healers.length - 1; i >= 0; i--) {
    const h = scene.healers[i]
    if (h.owner.dead) {
      h.sprite.destroy()
      scene.healers.splice(i, 1)
      continue
    }
    // Mantener el objetivo mientras siga siendo válido (vivo y dañado). Solo
    // re-evaluar si es inválido, o cada 500 ms para migrar a un edificio MÁS
    // dañado. En la re-evaluación periódica nunca se suelta un objetivo válido:
    // si no hay mejor candidato se conserva el actual → sin thrashing ni divagar.
    if (h.retarget === undefined) h.retarget = 0
    h.retarget -= delta
    const invalid = !h.target || h.target.dead || h.target.hp >= h.target.maxHp
    if (invalid) {
      h.target = claimTarget(scene, h)
      h.retarget = 500
    } else if (h.retarget <= 0) {
      const better = claimTarget(scene, h)
      if (better) h.target = better
      h.retarget = 500
    }
    // Stats de la ESTRUCTURA (las mejoras las modifican), no del def base.
    const speed = h.owner.sphereSpeed ?? h.owner.def.sphereSpeed
    let healing = false
    if (h.target) {
      const t = h.target
      const d = Phaser.Math.Distance.Between(h.x, h.y, t.x, t.y)
      if (d > 22) {
        const inv = d > 0 ? 1 / d : 0
        h.x += (t.x - h.x) * inv * speed * dt
        h.y += (t.y - h.y) * inv * speed * dt
      } else {
        // Órbita alrededor del edificio mientras cura (radio "respirando")
        const orbitAngle = (scene.time.now * 0.004 + i) % (Math.PI * 2)
        const orbitR = 18 + 4 * Math.sin(scene.time.now * 0.006 + i)
        h.x = t.x + Math.cos(orbitAngle) * orbitR
        h.y = t.y + Math.sin(orbitAngle) * orbitR
        // Cooldown: si la estructura recibió daño hace poco, la esfera orbita pero no cura.
        const cd = h.owner.def.healDamageCooldown || 0
        const onCooldown = cd > 0 && scene.time.now - (t.lastDamaged ?? -Infinity) < cd
        if (!onCooldown) {
          t.hp = Math.min(t.maxHp, t.hp + (h.owner.healRate ?? h.owner.def.healRate) * dt)
          h.sparkT = (h.sparkT || 0) - delta
          if (h.sparkT <= 0) { healSparkFx(scene, t.x, t.y, t.radius); h.sparkT = 380 }
          if (t.isCore) gameState.coreHp = Math.min(t.maxHp, Math.ceil(t.hp))
          t.drawHpBar()
          // Hilo de curación esfera→edificio
          const a = 0.35 + 0.25 * Math.sin(scene.time.now * 0.012 + i)
          scene.beamGraphics.lineStyle(1.5, HEAL_ORB_COLOR, a)
          scene.beamGraphics.lineBetween(h.x, h.y, t.x, t.y)
          healing = true
        }
      }
    } else {
      const a = (scene.time.now * 0.002 + i) % (Math.PI * 2)
      h.x += (h.owner.x + Math.cos(a) * 34 - h.x) * 0.05
      h.y += (h.owner.y + Math.sin(a) * 34 - h.y) * 0.05
    }
    h.sprite.setPosition(h.x, h.y)
    // Nacimiento: crece con rebote en ~350 ms.
    const age = Math.min(1, (scene.time.now - (h.born ?? 0)) / 350)
    const pop = age < 1 ? Phaser.Math.Easing.Back.Out(age) : 1
    h.sprite.setScale(orbScale(scene.time.now, i, healing) * pop)
    h.sprite.setAlpha(healing ? 1 : 0.75)
  }
}
