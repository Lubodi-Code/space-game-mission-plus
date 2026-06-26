# PROMPT PARA DEEPSEEK — Corrección de la Fase 3 (Torreta Láser)

> Pega este documento completo en DeepSeek. Es autocontenido.
> **Contexto:** la Fase 3 ya está implementada (panel de inspección, barras de construcción,
> mejoras de misiles, modo de disparo). Esta tarea corrige **solo** lo que quedó incompleto en la
> **Torreta Láser** + balance + dos detalles menores.

---

## YA ESTÁ ARREGLADO — NO LO TOQUES

Estos dos bugs ya se corrigieron por otra vía; **no los rehagas ni los revientes**:
1. El crash de arranque por `this.busOff.push(...)` en `create()` (las suscripciones `upgrade`/
   `fireMode` ya viven dentro del array `this.busOff = [...]` de `setupInput`).
2. La fuga del listener `bus.on('select')` en `Hud.vue` (ya se cierra en `onUnmounted`).

Reglas: JS / ES modules, **sin dependencias nuevas**, comentarios en español, no rompas oleadas /
energía / red / misiles. Tras terminar, `npm run build` debe pasar limpio.

---

## PROBLEMA A CORREGIR

En [src/game/structures/LaserTurret.js](../src/game/structures/LaserTurret.js) los estilos de disparo
**no están implementados**: `fireLaser` dispara siempre **un solo rayo al enemigo más cercano**.

- `style: 'spread'` (mejora `laser_a2`, "Ráfaga triple") → no hace nada visible.
- `style: 'bigbeam'` (mejora `laser_b2`, "Anti-grande") → no prioriza al enemigo más grande y la
  "rampa de daño progresivo" no funciona (los disparos son discretos y muy espaciados).

Además, los multiplicadores de `upgrades.js` se diseñaron para un **cooldown base de 20000 ms**, pero
`balance.js` tiene `cooldown: 130`, así que la rama A queda absurda (~50 disparos/s).

---

## CORRECCIÓN 1 — Balance del láser (`src/game/balance.js`)

### 1a. Def de la torreta láser (`key: 'laser'`)
Cambia el cooldown base a 20 s y sube el daño base (un disparo cargado debe pegar fuerte). El láser
base es lento a propósito; las ramas definen su rol.
```js
// en la entrada { key: 'laser', ... }
cooldown: 20000,   // ~20 s de recarga (antes 130)
damage: 28,        // disparo cargado fuerte (antes 7)  ·  ambos valores son AJUSTABLES
```
(Deja `atkRange: 140` y `energyDrain: 1` como están.)

### 1b. Constantes del rayo progresivo (en el bloque `COMBAT`)
Añade tres campos:
```js
export const COMBAT = {
  attackReachOffset: 12,
  laserTtlMs: 90,
  missileTurnRate: 1.2,
  missileMaxLifeMs: 5000,
  bigbeamCooldown: 150,   // ms: el rayo "anti-grande" dispara casi en continuo
  bigbeamRampStep: 0.12,  // incremento de daño por tick sobre el mismo blanco
  bigbeamRampMax: 3,      // tope de la rampa → daño máx = base × (1 + 3) = ×4
}
```

> `upgrades.js` **no se toca**: `laser_b` deja el cooldown en ~28 s, pero `LaserTurret` ignora ese
> cooldown cuando el estilo es `bigbeam` y usa `COMBAT.bigbeamCooldown` (continuo). Así la rampa sí
> sube mientras el haz se mantiene sobre el mismo blanco grande.

---

## CORRECCIÓN 2 — Comportamiento del láser (`src/game/structures/LaserTurret.js`)

**Reemplaza el archivo completo por esto** (conserva el patrón actual; añade selección por estilo,
disparo en dispersión, priorización del más grande, rampa real y modo foco estricto):

```js
import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { COMBAT } from '../balance.js'
import { Structure } from './Structure.js'

export class LaserTurret extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
    this.atkRange = def.atkRange
    this.cooldown = def.cooldown
    this.laserDamage = def.damage
    this.energyDrain = def.energyDrain || 0
    this.fireMode = 'auto'
    this.focusTarget = null
    this.upgrades = []
    this.style = 'default'      // 'default' | 'spread' | 'bigbeam'
    this.damageRamp = 0
    this.lastTarget = null
  }

  update(dt, world, time) {
    super.update(dt, world, time)
    if (this.building || !this.powered) return

    this.fireTimer -= dt // dt en ms (igual que cooldown)
    if (this.fireTimer > 0) return

    // 1) Selección de objetivo según modo y estilo.
    let target = null
    if (this.fireMode === 'focus') {
      // En foco dispara SOLO a su blanco fijo (si vive y está en rango); si muere, libera el foco.
      if (this.focusTarget && !this.focusTarget.dead) {
        const d = Phaser.Math.Distance.Between(this.x, this.y, this.focusTarget.x, this.focusTarget.y)
        if (d <= this.atkRange) target = this.focusTarget
      } else {
        this.focusTarget = null
      }
    } else if (this.style === 'bigbeam') {
      target = this.largestEnemy(world)   // prioriza al más grande
    } else {
      target = this.nearestEnemy(world)
    }
    if (!target) return

    // 2) Energía.
    if (this.energyDrain > 0 && gameState.energy < this.energyDrain) return
    if (this.energyDrain > 0) gameState.energy = Math.max(0, gameState.energy - this.energyDrain)

    // 3) Disparo.
    this.fireLaser(target, world)

    // 4) Recarga: el rayo progresivo es continuo; el resto respeta su cooldown.
    this.fireTimer = this.style === 'bigbeam' ? COMBAT.bigbeamCooldown : this.cooldown
  }

  // --- selección de enemigos ---
  nearestEnemy(world) {
    let best = null
    let bestD = this.atkRange
    for (const e of world.enemies) {
      if (e.dead) continue
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y)
      if (d <= bestD) { bestD = d; best = e }
    }
    return best
  }

  // Los N enemigos más cercanos en rango (para el disparo en dispersión).
  nearestEnemies(world, n) {
    const inRange = []
    for (const e of world.enemies) {
      if (e.dead) continue
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y)
      if (d <= this.atkRange) inRange.push({ e, d })
    }
    inRange.sort((a, b) => a.d - b.d)
    return inRange.slice(0, n).map((o) => o.e)
  }

  // El enemigo más GRANDE en rango (por radio; desempata por maxHp).
  largestEnemy(world) {
    let best = null
    let bestScore = -1
    for (const e of world.enemies) {
      if (e.dead) continue
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y)
      if (d > this.atkRange) continue
      const score = (e.radius || 0) * 1000 + (e.maxHp || 0)
      if (score > bestScore) { bestScore = score; best = e }
    }
    return best
  }

  // --- disparo según estilo ---
  fireLaser(target, world) {
    // Dispersión: golpea hasta 3 enemigos cercanos con un rayo a cada uno.
    if (this.style === 'spread') {
      const targets = this.nearestEnemies(world, 3)
      for (const t of targets) {
        t.hit(this.laserDamage, world)
        this.pushBeam(t.x, t.y, false)
      }
      return
    }

    // Anti-grande: daño progresivo mientras se mantenga sobre el MISMO blanco.
    if (this.style === 'bigbeam') {
      if (this.lastTarget === target) {
        this.damageRamp = Math.min(COMBAT.bigbeamRampMax, this.damageRamp + COMBAT.bigbeamRampStep)
      } else {
        this.damageRamp = 0
      }
      this.lastTarget = target
      target.hit(this.laserDamage * (1 + this.damageRamp), world)
      this.pushBeam(target.x, target.y, true)
      return
    }

    // Por defecto: un rayo al objetivo.
    target.hit(this.laserDamage, world)
    this.pushBeam(target.x, target.y, false)
  }

  pushBeam(x2, y2, big) {
    this.scene.lasers.push({
      x1: this.x, y1: this.y, x2, y2,
      ttl: big ? COMBAT.laserTtlMs * 3 : COMBAT.laserTtlMs,
      color: this.def.color,
      width: big ? 5 : 2.5,
    })
  }

  applyUpgrade(upgrade) {
    if (upgrade.atkRange) this.atkRange = Math.round(this.atkRange * upgrade.atkRange)
    if (upgrade.cooldown) this.cooldown = Math.round(this.cooldown * upgrade.cooldown)
    if (upgrade.damage) this.laserDamage = Math.round(this.laserDamage * upgrade.damage)
    if (upgrade.style) this.style = upgrade.style
    this.upgrades.push(upgrade.id)
  }
}
```

---

## CORRECCIÓN 3 — Grosor del rayo en el dibujo (`src/game/scenes/GameScene.js`)

En `drawFx`, donde se dibujan `this.lasers`, usa el ancho del rayo (para que el `bigbeam` se vea más
grueso). Busca la línea `g.lineStyle(2.5, l.color, a)` y cámbiala por:
```js
g.lineStyle(l.width ?? 2.5, l.color, a)
```

---

## CORRECCIÓN 4 (menor) — Las estructuras en construcción no son relay todavía

En `src/game/scenes/GameScene.js`:

`isRelay(s)` debe excluir lo que está en construcción (un nodo a medio construir no debe dar señal ni
puerto hasta terminar; al completar, `onBuilt` ya llama a `recomputeNetwork`):
```js
isRelay(s) {
  return !s.building && (s.isCore || s.role === 'relay')
}
```

`recomputeEnergyCap()` debe ignorar baterías en construcción:
```js
for (const s of this.structures) {
  if (!s.dead && !s.building && s.role === 'battery') cap += s.def.energyCap || 0
}
```

---

## CRITERIOS DE ACEPTACIÓN

1. `npm run build` pasa limpio; el juego arranca sin errores.
2. **Láser base:** dispara fuerte cada ~20 s.
3. **Rama A (`laser_a`):** dispara mucho más rápido (~3 s) con menos radio y daño. Al añadir
   **`laser_a2` (Ráfaga triple):** dispara **3 rayos** a los 3 enemigos más cercanos, a ~300 ms.
4. **Rama B → `laser_b2` (Anti-grande):** el láser pasa a un **rayo continuo** que **apunta al enemigo
   más grande** en rango y cuyo **daño sube** mientras se mantiene sobre el mismo blanco (se ve más
   grueso y largo); si cambia de blanco, la rampa se reinicia.
5. **Modo foco:** una torreta en `focus` dispara **solo** a su blanco fijo; si sale de rango aguanta el
   fuego, y si muere libera el foco. No cae al más cercano.
6. Un nodo **en construcción** no alimenta a otras estructuras hasta que su barra termina.
7. Sin regresiones en misiles, energía, red, oleadas ni curación.

---

## NOTA DE BALANCE (informativa, ajustable)
`laser.cooldown` (20000), `laser.damage` (28) y los `COMBAT.bigbeam*` son valores de partida. Si el
láser base se siente demasiado lento para empezar, baja el cooldown base o sube el daño; el árbol de
mejoras sigue siendo coherente porque los multiplicadores son relativos.
