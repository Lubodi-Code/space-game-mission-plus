import Phaser from 'phaser'
import { gameState } from '~/game/gameState.js'
import { WORLD } from '~/game/balance.js'
import { currentMode } from '~/game/modes/index.js'
import { createMeteorite } from '~/game/systems/worldgen.js'
import { spawnFloatingText } from '~/game/render/fx.js'
import { sfxAlarm, sfxBonus } from '~/game/sound.js'

// Meteoritos especiales. Solo host/single-player. Tiempos en MS (el `d` del loop).
//
// - GIGANTE (evento temporal): aparece cada tanto lejos del núcleo, dura poco y SOLO el
//   comandante puede minarlo, a ritmo x4. Los recolectores lo ignoran.
// - EXPLOSIVO: sembrados alrededor. Si un disparo enemigo impacta cerca, estallan y dañan todo
//   lo que tengan alrededor (estructuras y enemigos). El comandante los DESACTIVA disparándoles
//   cuando está ocioso cerca; desactivado queda como meteorito normal y da un bono.

export const GIANT = { firstMs: 45000, everyMs: { quick: 70000, classic: 110000 }, lifeMs: 45000, radius: 64, amount: 3200, mineMult: 4 }
export const EXPLOSIVE = { count: 12, minDist: 500, maxDist: 2600, triggerR: 80, blastR: 170, dmgStructure: 45, dmgEnemy: 90, defuseMs: 1500, bonus: 60 }

export function initSpecialMeteors(scene) {
  scene.giantTimer = GIANT.firstMs
  scene.giant = null
  gameState.event = null
  const cx = WORLD.width / 2; const cy = WORLD.height / 2
  for (let i = 0; i < EXPLOSIVE.count; i++) {
    const a = (i / EXPLOSIVE.count) * Math.PI * 2 + Math.random() * 0.4
    const dist = Phaser.Math.Between(EXPLOSIVE.minDist, EXPLOSIVE.maxDist)
    const m = createMeteorite(scene, cx + Math.cos(a) * dist, cy + Math.sin(a) * dist)
    m.special = 'explosive'
    m.defuse = 0
  }
}

// Llamado desde EnemyProjectileSystem cuando un rayo o misil enemigo impacta en (x, y).
export function enemyImpactAt(scene, x, y) {
  for (const m of scene.meteorites) {
    if (m.special !== 'explosive' || m.depleted) continue
    if (Math.hypot(m.x - x, m.y - y) <= EXPLOSIVE.triggerR + m.radius) detonate(scene, m)
  }
}

function detonate(scene, m) {
  m.special = null
  m.depleted = true
  m.container?.destroy()
  scene.explosion(m.x, m.y, 0xff3d2e, EXPLOSIVE.blastR * 0.6, 'meteor')
  scene.cam.shake(220, 0.004)
  for (const s of [...scene.structures]) {
    if (s.dead) continue
    if (Math.hypot(s.x - m.x, s.y - m.y) <= EXPLOSIVE.blastR + s.radius) scene.damageStructure(s, EXPLOSIVE.dmgStructure)
  }
  for (const e of scene.enemies) {
    if (!e.dead && Math.hypot(e.x - m.x, e.y - m.y) <= EXPLOSIVE.blastR + e.radius) e.hit(EXPLOSIVE.dmgEnemy, scene.world)
  }
  // Reacción en cadena con otros explosivos cercanos.
  for (const o of scene.meteorites) {
    if (o !== m && o.special === 'explosive' && !o.depleted && Math.hypot(o.x - m.x, o.y - m.y) <= EXPLOSIVE.blastR) {
      scene.time.delayedCall(180, () => { if (o.special === 'explosive') detonate(scene, o) })
    }
  }
}

function spawnGiant(scene) {
  const core = scene.core
  const a = Math.random() * Math.PI * 2
  const dist = Phaser.Math.Between(900, 1700)
  const x = Phaser.Math.Clamp(core.x + Math.cos(a) * dist, 200, WORLD.width - 200)
  const y = Phaser.Math.Clamp(core.y + Math.sin(a) * dist, 200, WORLD.height - 200)
  const m = createMeteorite(scene, x, y)
  m.special = 'giant'
  m.radius = GIANT.radius
  m.amount = GIANT.amount
  m.expiresAt = GIANT.lifeMs
  scene.giant = m
  sfxAlarm()
}

function expireGiant(scene) {
  const m = scene.giant
  scene.giant = null
  gameState.event = null
  if (!m || m.depleted) return
  m.depleted = true
  scene.tweens.add({ targets: m.container, alpha: 0, duration: 400, onComplete: () => m.container.destroy() })
}

export function updateSpecialMeteors(scene, d) {
  // --- Evento del meteorito gigante (empieza a contar con la 1ª oleada).
  if (gameState.wave >= 1) {
    if (!scene.giant) {
      scene.giantTimer -= d
      if (scene.giantTimer <= 0) {
        spawnGiant(scene)
        scene.giantTimer = GIANT.everyMs[currentMode().id] || GIANT.everyMs.classic
      }
    } else {
      const m = scene.giant
      m.expiresAt -= d
      if (m.depleted || m.amount <= 0 || m.expiresAt <= 0) expireGiant(scene)
    }
  }
  if (scene.giant) {
    const m = scene.giant
    const wv = scene.cam.worldView
    const onScreen = m.x > wv.x && m.x < wv.right && m.y > wv.y && m.y < wv.bottom
    gameState.event = {
      kind: 'giant',
      timeLeft: Math.ceil(m.expiresAt / 1000),
      amount: m.amount,
      onScreen,
      angle: Math.atan2(m.y - wv.centerY, m.x - wv.centerX),
      mining: scene.general?.mineTarget === m,
    }
  }

  // --- Desactivar explosivos: cualquier comandante (host o cliente), sin enemigos en rango, les dispara.
  const armed = new Set()
  for (const g of scene.generals?.values?.() || []) {
    if (!g.alive) continue
    let busy = false
    for (const e of scene.enemies) {
      if (!e.dead && Math.hypot(e.x - g.x, e.y - g.y) - e.radius < g.atkRange) { busy = true; break }
    }
    let target = null
    if (!busy) {
      for (const m of scene.meteorites) {
        if (m.special !== 'explosive' || m.depleted) continue
        if (Math.hypot(m.x - g.x, m.y - g.y) - m.radius <= g.atkRange) { target = m; break }
      }
    }
    if (target && !armed.has(target)) {
      armed.add(target)
      target.defuse += d
      const k = Math.min(1, target.defuse / EXPLOSIVE.defuseMs)
      const bg = scene.beamGraphics
      bg.lineStyle(2, 0x8be9fd, 0.4 + 0.5 * k).lineBetween(g.x, g.y, target.x, target.y)
      bg.lineStyle(3, 0x8be9fd, 0.9).beginPath()
      bg.arc(target.x, target.y, target.radius + 10, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2)
      bg.strokePath()
      if (k >= 1) {
        target.special = null
        gameState.minerals = Math.min(gameState.mineralsCap, gameState.minerals + EXPLOSIVE.bonus)
        spawnFloatingText(scene, target.x, target.y - 20, `Desactivado +${EXPLOSIVE.bonus}`, '#8be9fd')
        sfxBonus(target.x, target.y)
      }
    }
  }
  // Lo que nadie está desactivando pierde progreso de a poco.
  for (const m of scene.meteorites) if (m.special === 'explosive' && !armed.has(m)) m.defuse = Math.max(0, m.defuse - d * 0.5)
}

// Envía al comandante a minar el gigante (botón del HUD).
export function goToGiant(scene) {
  const m = scene.giant
  if (!m || !scene.general?.alive) return
  scene.general.setTarget(m.x, m.y, scene)
  scene.general.mineTarget = m // aunque haya otra roca superpuesta, el objetivo es el gigante
  scene.general.minedAccum = 0
  scene.cam.pan(m.x, m.y, 500, 'Sine.easeInOut')
}
