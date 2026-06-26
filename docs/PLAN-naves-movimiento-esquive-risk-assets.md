# Plan de implementación — Movimiento orgánico, esquive predictivo, evaluación de riesgo y naves SVG

> Documento de arquitectura para que una IA implementadora lo ejecute paso a paso.
> Proyecto: Phaser **3.90** + Vite. JS, ES modules. Assets estáticos en `public/`.
> Rutas relativas a la raíz del repo.

---

## 0. Objetivo y referencia técnica

Hoy el movimiento de enemigos es **cinemático puro**: cada frame `movement()` devuelve una
velocidad instantánea y se integra `x += vx*dt` ([Enemy.js:41-50](../src/game/enemies/Enemy.js#L41-L50)).
Sin inercia ni aceleración → se ve lineal y, al sumarle parches perpendiculares, errático.
El esquive (`DODGE_MISSILES`) solo empuja lateral cuando un proyectil está a <90px, sin predecir
si realmente va a impactar.

Reescribimos el motor de movimiento sobre el modelo de **Steering Behaviors de Craig Reynolds**
("Steering Behaviors For Autonomous Characters", 1999), tal como lo formaliza *The Nature of Code*
(Daniel Shiffman, cap. *Autonomous Agents*, https://natureofcode.com/autonomous-agents/):

- Fórmula base: **`steering = desired_velocity − current_velocity`**, truncada a `maxForce`.
- Cada frame: `acceleration += Σ(steering_i * peso_i)`; `velocity += acceleration*dt` (trunc. a `maxSpeed`);
  `position += velocity*dt`; `acceleration = 0`.
- Primitivas: `seek`, `arrive`, `flee`, `pursue` (predice futuro del objetivo), `evade` (predice
  futuro de la amenaza y huye), `wander` (meandro orgánico con coherencia temporal), `separate`
  (anti-aglomeración), `avoidObstacles`.

Sobre eso añadimos:
- **Esquive real (predictivo)**: detección de amenaza por *Closest Point of Approach* (CPA) y maniobra
  `evade` lateral, no un zigzag fijo.
- **Nueva evaluación `RISK`**: la nave decide por cada amenaza si **aguanta el daño y sigue su curso**
  o **prefiere esquivar**, según HP, daño entrante, tiempo al impacto y cercanía a su objetivo.
- **Naves SVG** vectoriales con estética neón, una silueta distinta por tipo, rotando hacia su rumbo.

> Nota: este plan es autocontenido. Incluye también el arreglo de la clave `INFRA`/`INFRASTRUCTURE`
> y la validación del registro (si ya se aplicó el prompt anterior, omitir la sección 7).
> El cambio del proyectil de la torreta de misiles a barra "I" es un prompt independiente y no entra aquí.

---

## 1. Mapa de archivos

```
NUEVOS
  public/assets/ships/grunt.svg, runner.svg, brute.svg, saboteur.svg,
                      skirmisher.svg, artillery.svg, mothership.svg
  src/game/enemies/behaviors/steering.js     # primitivas (devuelven FUERZAS {fx,fy})
  src/game/enemies/behaviors/risk.js         # perfiles de decisión esquivar-vs-aguantar
  src/game/enemies/validateRegistry.js       # validación al arranque (si no existe ya)

MODIFICADOS
  src/game/enemies/Enemy.js                  # estado físico, suma de fuerzas, rotación, glow
  src/game/enemies/EnemyType.js              # params de steering + slot risk en REGISTRY; rename INFRA
  src/game/enemies/behaviors/movement.js     # estrategias compuestas con primitivas → devuelven FUERZA
  src/game/enemies/behaviors/evasion.js      # esquive predictivo (CPA) + estilos de maniobra
  src/game/enemies/behaviors/targeting.js    # rename INFRASTRUCTURE → INFRA
  src/game/scenes/BootScene.js               # preload() de los SVG; quitar texturas bitmap de enemigos
  src/game/balance.js                        # bloque STEERING con pesos y constantes de tuning

NO TOCAR
  src/game/enemies/EnemyProjectiles.js       # misiles enemigos: quedan igual
```

---

## 2. Modelo físico del enemigo (`Enemy.js`)

### 2.1 Estado nuevo en el constructor
Añadir tras la asignación de `this.heading`:

```js
// --- Estado físico para steering ---
this.vx = Math.cos(this.heading) * 8
this.vy = Math.sin(this.heading) * 8
this.maxSpeed = this.def.speed
this.maxForce = this.def.maxForce          // px/s^2 (agilidad de giro)
this.radius = (STEERING.shipBase / 2) * this.def.scale
this.wanderAngle = Math.random() * Math.PI * 2
```

Importar arriba: `import { STEERING } from '../balance.js'`.

### 2.2 Sprite SVG + glow neón
Reemplazar la creación del sprite. En vez de:

```js
this.sprite = scene.add.image(x, y, this.def.textureKey).setScale(this.def.scale).setDepth(15)
```

usar (la textura SVG ya viene pre-dimensionada en BootScene, por eso `setScale(1)`):

```js
// Halo neón detrás de la nave (mismo recurso que usan las estructuras).
this.glow = scene.add.image(x, y, 'glow')
  .setTint(this.def.color).setBlendMode(Phaser.BlendModes.ADD)
  .setScale(0.5 * this.def.scale).setAlpha(0.45).setDepth(14)
this.sprite = scene.add.image(x, y, this.def.textureKey).setScale(1).setDepth(15)
```

Importar `Phaser` arriba si no está: `import Phaser from 'phaser'`.

En `destroy()` añadir `if (this.glow) this.glow.destroy()`.

### 2.3 Bucle `update` (reescritura del paso de movimiento)
Sustituir los pasos 2–5 actuales por el modelo de fuerzas:

```js
update(dt, world, time) {
  if (this.dead) return

  // 1) Objetivo
  if (!this.target || this.target.dead) this.target = this.targeting(this, world)

  // 2) Acumular fuerzas de dirección (steering)
  let fx = 0, fy = 0
  const add = (f, w) => { fx += f.fx * w; fy += f.fy * w }

  add(this.movement(this, world, dt, time), STEERING.wMove)        // estrategia base
  add(separate(this, world), STEERING.wSeparate)                   // anti-aglomeración
  add(avoidObstacles(this, world), STEERING.wAvoid)                // rodear meteoritos
  add(wander(this, dt), STEERING.wWander)                          // meandro orgánico
  if (this.evasion) add(this.evasion(this, world, dt), STEERING.wEvade) // esquive (gobernado por risk)

  // 3) Truncar fuerza total a maxForce
  const fmag = Math.hypot(fx, fy)
  if (fmag > this.maxForce) { const s = this.maxForce / fmag; fx *= s; fy *= s }

  // 4) Integrar: aceleración -> velocidad (trunc a maxSpeed) -> posición
  this.vx += fx * dt
  this.vy += fy * dt
  const vmag = Math.hypot(this.vx, this.vy)
  if (vmag > this.maxSpeed) { const s = this.maxSpeed / vmag; this.vx *= s; this.vy *= s }
  this.x += this.vx * dt
  this.y += this.vy * dt

  // 5) Render + rumbo (los SVG se dibujan apuntando a +X)
  this.sprite.setPosition(this.x, this.y)
  this.glow.setPosition(this.x, this.y)
  if (vmag > 1) this.sprite.setRotation(Math.atan2(this.vy, this.vx))

  // 6) Atacar
  this.attack(this, world, dt)

  // 7) flash + barra de HP  (igual que ahora)
  ...
}
```

Importar las primitivas: `import { separate, avoidObstacles, wander } from './behaviors/steering.js'`.

> Las estrategias de `movement.js` y `evasion.js` ahora **devuelven `{fx,fy}` (fuerza)**, no velocidad.

---

## 3. Primitivas de steering (`behaviors/steering.js`, NUEVO)

Todas son puras y devuelven una **fuerza** `{fx, fy}`. Usan `e.vx, e.vy, e.x, e.y, e.maxSpeed`.

```js
import Phaser from 'phaser'
import { STEERING } from '../../balance.js'

const ZERO = { fx: 0, fy: 0 }

// desired (vector hacia target a maxSpeed) - velocidad actual
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

// Llega y frena suavemente dentro de slowR.
export function arrive(e, tx, ty, slowR) {
  const dx = tx - e.x, dy = ty - e.y
  const d = Math.hypot(dx, dy)
  if (d < 1) return { fx: -e.vx, fy: -e.vy }
  const speed = d < slowR ? e.maxSpeed * (d / slowR) : e.maxSpeed
  const dvx = (dx / d) * speed, dvy = (dy / d) * speed
  return { fx: dvx - e.vx, fy: dvy - e.vy }
}

// Llega a un ANILLO de radio R alrededor del objetivo (standoff / keep-distance).
export function arriveAtRange(e, t, R) {
  const dx = e.x - t.x, dy = e.y - t.y
  const d = Math.hypot(dx, dy) || 1
  const px = t.x + (dx / d) * R
  const py = t.y + (dy / d) * R
  return arrive(e, px, py, Math.max(40, R * 0.4))
}

// Persigue prediciendo la posición futura del objetivo (lidera el tiro/embiste).
export function pursue(e, target) {
  const tvx = target.vx || 0, tvy = target.vy || 0
  const d = Phaser.Math.Distance.Between(e.x, e.y, target.x, target.y)
  const ahead = Math.min(0.6, d / (e.maxSpeed || 1))
  return seek(e, target.x + tvx * ahead, target.y + tvy * ahead)
}

// Meandro orgánico: punto sobre un círculo proyectado al frente que va girando.
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

// Empuje lejos de enemigos cercanos (evita que se apilen / oscilen).
export function separate(e, world) {
  let sx = 0, sy = 0, n = 0
  const R = STEERING.separationRadius
  for (const o of world.enemies) {
    if (o === e || o.dead) continue
    const dx = e.x - o.x, dy = e.y - o.y
    const d = Math.hypot(dx, dy)
    if (d > 0 && d < R) { sx += (dx / d) / d; sy += (dy / d) / d; n++ }
  }
  if (!n) return ZERO
  const m = Math.hypot(sx, sy) || 1
  const dvx = (sx / m) * e.maxSpeed, dvy = (sy / m) * e.maxSpeed
  return { fx: dvx - e.vx, fy: dvy - e.vy }
}

// Rodea el meteorito más cercano que esté en la trayectoria inmediata.
export function avoidObstacles(e, world) {
  const vmag = Math.hypot(e.vx, e.vy)
  if (vmag < 1 || !world.meteorites) return ZERO
  const hx = e.vx / vmag, hy = e.vy / vmag
  const look = STEERING.avoidLookahead
  let best = null, bestD = Infinity
  for (const m of world.meteorites) {
    if (m.depleted) continue
    const rx = m.x - e.x, ry = m.y - e.y
    const proj = rx * hx + ry * hy            // distancia a lo largo del rumbo
    if (proj < 0 || proj > look) continue
    const perp = Math.abs(rx * -hy + ry * hx) // separación lateral a la trayectoria
    if (perp < (m.radius || 26) + e.radius && proj < bestD) { bestD = proj; best = { m, rx, ry, hx, hy } }
  }
  if (!best) return ZERO
  // Empuje lateral hacia el lado contrario del obstáculo.
  const side = (best.rx * -best.hy + best.ry * best.hx) > 0 ? -1 : 1
  const px = -best.hy * side, py = best.hx * side
  return { fx: px * e.maxSpeed - e.vx, fy: py * e.maxSpeed - e.vy }
}
```

> `world` debe exponer `enemies` y `meteorites`. Ver sección 6.

---

## 4. Estrategias de movimiento (`behaviors/movement.js`, REESCRITURA)

Cada estrategia compone primitivas y **devuelve una fuerza**. El `wander`/`separate`/`avoid`
globales (sección 2.3) ya aportan organicidad; aquí va solo la intención táctica.

```js
import Phaser from 'phaser'
import { seek, arrive, arriveAtRange } from './steering.js'

const ZERO = { fx: 0, fy: 0 }

export const MOVEMENT = {
  // Avanza y frena al entrar en rango de ataque (melee o a distancia).
  STRAIGHT: (e, world) => {
    const t = e.target
    if (!t) return ZERO
    const reach = (t.radius || 0) + 14
    const stopAt = e.def.attackRange > 0 ? e.def.attackRange : reach
    return arriveAtRange(e, t, stopAt)
  },

  // Avance con tejido sinusoidal deliberado (encima del wander global).
  WEAVE: (e, world, dt, time) => {
    const t = e.target
    if (!t) return ZERO
    const base = seek(e, t.x, t.y)
    const vmag = Math.hypot(e.vx, e.vy) || 1
    const perpX = -e.vy / vmag, perpY = e.vx / vmag
    const w = Math.sin((time || 0) * 0.006 + e.heading) * e.maxSpeed * 0.6
    return { fx: base.fx + perpX * w, fy: base.fy + perpY * w }
  },

  // Acercarse hasta el borde de su rango de ataque y mantener.
  APPROACH_THEN_HOLD: (e) => {
    const t = e.target
    if (!t) return ZERO
    return arriveAtRange(e, t, (e.def.attackRange || 130) * 0.9)
  },

  // Mantener distancia orbitando (kiting): anillo + deriva lateral.
  KEEP_DISTANCE: (e) => {
    const t = e.target
    if (!t) return ZERO
    const ring = arriveAtRange(e, t, (e.def.attackRange || 200) * 0.85)
    const dx = t.x - e.x, dy = t.y - e.y
    const d = Math.hypot(dx, dy) || 1
    const strafe = e.maxSpeed * 0.5
    return { fx: ring.fx + (-dy / d) * strafe, fy: ring.fy + (dx / d) * strafe }
  },

  // Artillería: se planta a su rango preferido (largo).
  STANDOFF: (e) => {
    const t = e.target
    if (!t) return ZERO
    return arriveAtRange(e, t, e.def.preferredRange || 600)
  },
}
```

> En `EnemyType.js` el RUNNER pasa de `movement: 'ZIGZAG'` a `movement: 'WEAVE'`.

---

## 5. Esquive predictivo + evaluación de riesgo

### 5.1 `behaviors/risk.js` (NUEVO) — decide esquivar vs. aguantar
Cada perfil recibe el contexto de una amenaza concreta y devuelve la **intención de esquive** `[0,1]`.
`ctx = { ttc, missDist, incomingDamage, distToTarget }`.

```js
// Estima cuánto "quiere" la nave esquivar esta amenaza (0 = aguanta, 1 = esquiva a toda costa).
export const RISK = {
  // Valiente: solo esquiva si el golpe lo dejaría crítico o lo mata.
  BRAVE: (e, ctx) => (ctx.incomingDamage >= e.hp * 0.6 ? 1 : 0),

  // Cauteloso: esquiva casi cualquier impacto entrante.
  CAUTIOUS: (e, ctx) => 0.9,

  // Calculador: pondera daño/HP contra el progreso hacia su objetivo.
  // Si está a punto de atacar (cerca del objetivo) prioriza cumplir la misión.
  CALCULATED: (e, ctx) => {
    const dmgRatio = ctx.incomingDamage / Math.max(1, e.hp)         // 0..>1
    const range = e.def.attackRange || 150
    const committed = ctx.distToTarget < range * 1.2 ? 0.5 : 0      // resta ganas de huir
    return Math.max(0, Math.min(1, dmgRatio * 1.6 - committed))
  },
}
```

### 5.2 `behaviors/evasion.js` (REESCRITURA) — detección por CPA + maniobra
La función de evasión:
1. recolecta amenazas (proyectiles del jugador),
2. para cada una calcula **CPA** (tiempo al punto más cercano y distancia de fallo),
3. si va a impactar dentro del horizonte, consulta `e.risk` para la intención,
4. acumula una fuerza lateral de esquive según el **estilo** y la urgencia.

```js
import { STEERING } from '../../balance.js'

const ZERO = { fx: 0, fy: 0 }

// Closest Point of Approach entre enemigo e y proyectil p (con velocidad pvx,pvy).
function cpa(e, p, pvx, pvy) {
  const rx = p.x - e.x, ry = p.y - e.y          // posición relativa
  const vx = pvx - e.vx, vy = pvy - e.vy         // velocidad relativa
  const vv = vx * vx + vy * vy
  const ttc = vv < 1e-6 ? 0 : Math.max(0, -(rx * vx + ry * vy) / vv)
  const mx = rx + vx * ttc, my = ry + vy * ttc
  return { ttc, missDist: Math.hypot(mx, my) }
}

// Fábrica de evasión: cada estilo define la FORMA de la maniobra lateral.
function makeEvasion(style) {
  return (e, world, dt) => {
    if (!e.risk || !world.playerProjectiles) return ZERO
    let fx = 0, fy = 0
    for (const p of world.playerProjectiles) {
      if (!p.sprite || !p.sprite.active || !p._dir) continue
      const pvx = p._dir.x * p.speed, pvy = p._dir.y * p.speed
      const { ttc, missDist } = cpa(e, p, pvx, pvy)
      if (ttc > STEERING.threatHorizon) continue
      if (missDist > e.radius + STEERING.evadeMargin) continue   // no me iba a dar

      const ctx = {
        ttc, missDist,
        incomingDamage: p.damage || 0,
        distToTarget: e.target ? Math.hypot(e.target.x - e.x, e.target.y - e.y) : Infinity,
      }
      const intent = e.risk(e, ctx)                              // 0..1 (aguantar vs esquivar)
      if (intent <= 0.05) continue

      const urgency = 1 - ttc / STEERING.threatHorizon            // 0..1
      const pmag = Math.hypot(pvx, pvy) || 1
      // Lado que MAXIMIZA la distancia de fallo (perpendicular a la velocidad del proyectil).
      const perpX = -pvy / pmag, perpY = pvx / pmag
      const sign = ((e.x - p.x) * perpX + (e.y - p.y) * perpY) >= 0 ? 1 : -1
      const w = style.shape(e, ttc) * intent * urgency * e.maxSpeed
      fx += perpX * sign * w + style.back * (-pvx / pmag) * intent * e.maxSpeed
      fy += perpY * sign * w + style.back * (-pvy / pmag) * intent * e.maxSpeed
    }
    if (fx === 0 && fy === 0) return ZERO
    // Convertir a fuerza tipo steering (deseada - velocidad).
    return { fx: fx - e.vx, fy: fy - e.vy }
  }
}

export const EVASION = {
  // Juke lateral simple.
  JUKE: makeEvasion({ shape: () => 1.0, back: 0 }),
  // Ráfaga lateral fuerte + leve retroceso (rompe la línea de tiro).
  STRAFE_BURST: makeEvasion({ shape: () => 1.3, back: 0.35 }),
  // Serpenteo: el lado oscila con el tiempo restante -> tejido evasivo.
  SERPENTINE: makeEvasion({ shape: (e, ttc) => Math.sign(Math.sin(ttc * 14 + e.heading)) * 1.1, back: 0 }),
}
```

> Compatibilidad: los proyectiles del jugador ya llevan `_dir`, `speed`, `damage`
> ([GameScene.js:877-881](../src/game/scenes/GameScene.js#L877-L881)). No hace falta cambiarlos.
> Los rayos láser de torreta son hitscan (instantáneos) → no se esquivan, se ignoran a propósito.

---

## 6. `world` API (en `GameScene.create`, objeto `this.world`)

Añadir dos referencias que las primitivas necesitan (no rompe nada existente):

```js
this.world = {
  core: this.core,
  structures: this.structures,
  enemies: this.enemies,            // NUEVO (separación)
  meteorites: this.meteorites,      // NUEVO (avoidObstacles)
  playerProjectiles: this.projectiles,
  bounds: WORLD,
  ...
}
```

Asegurar que cada meteorito tenga `radius`. En `createMeteorite` ([GameScene.js:431-467](../src/game/scenes/GameScene.js#L431-L467))
ya existe `radius` local; guardarlo en el objeto: `this.meteorites.push({ ..., radius })`.

---

## 7. Registro: claves, parámetros y validación (`EnemyType.js`)

### 7.1 Rename de targeting (arreglo del bug actual)
En `behaviors/targeting.js`, renombrar la clave `INFRASTRUCTURE` → `INFRA` (el saboteur usa `'INFRA'`).

### 7.2 Añadir a cada entrada de `REGISTRY`: `maxForce`, `risk` y ajustar `movement`/`evasion`

| tipo        | maxForce | movement            | evasion        | risk       |
|-------------|---------:|---------------------|----------------|------------|
| GRUNT       | 160      | STRAIGHT            | —              | BRAVE      |
| RUNNER      | 360      | WEAVE               | SERPENTINE     | CAUTIOUS   |
| BRUTE       | 120      | STRAIGHT            | —              | BRAVE      |
| SABOTEUR    | 200      | APPROACH_THEN_HOLD  | JUKE           | CALCULATED |
| SKIRMISHER  | 320      | KEEP_DISTANCE       | STRAFE_BURST   | CAUTIOUS   |
| ARTILLERY   | 150      | STANDOFF            | JUKE           | CALCULATED |
| MOTHERSHIP  | 90       | STRAIGHT            | —              | BRAVE      |

> `risk` solo aplica si el tipo tiene `evasion`. Los que no esquivan pueden omitir `risk`.
> En `Enemy.js` resolver el slot: `this.risk = this.def.risk ? RISK[this.def.risk] : null`
> (import `{ RISK } from './behaviors/risk.js'`).

### 7.3 `validateRegistry.js` (NUEVO; si no existe del prompt anterior)
Valida al arranque que cada `targeting/movement/attack` y, si existen, `evasion`/`risk`
referencien funciones reales en sus mapas; si no, lanza error descriptivo. Llamar
`validateRegistry()` como primera línea de `BootScene.create()`.

```js
import { REGISTRY } from './EnemyType.js'
import { TARGETING } from './behaviors/targeting.js'
import { MOVEMENT } from './behaviors/movement.js'
import { ATTACK } from './behaviors/attack.js'
import { EVASION } from './behaviors/evasion.js'
import { RISK } from './behaviors/risk.js'

export function validateRegistry() {
  const req = [['targeting', TARGETING], ['movement', MOVEMENT], ['attack', ATTACK]]
  const opt = [['evasion', EVASION], ['risk', RISK]]
  for (const [k, def] of Object.entries(REGISTRY)) {
    for (const [f, map] of req)
      if (typeof map[def[f]] !== 'function')
        throw new Error(`Enemy "${k}": ${f} "${def[f]}" inválido. Válidos: ${Object.keys(map).join(', ')}`)
    for (const [f, map] of opt)
      if (def[f] && typeof map[def[f]] !== 'function')
        throw new Error(`Enemy "${k}": ${f} "${def[f]}" inválido. Válidos: ${Object.keys(map).join(', ')}`)
  }
}
```

---

## 8. Constantes de tuning (`balance.js`)

Añadir un bloque exportado:

```js
export const STEERING = {
  shipBase: 40,            // px base de la textura SVG (radio = shipBase/2 * scale)
  wMove: 1.0,
  wSeparate: 1.3,
  wAvoid: 1.6,
  wWander: 0.4,
  wEvade: 2.4,             // el esquive domina cuando se activa
  separationRadius: 38,
  avoidLookahead: 90,
  wanderDistance: 55,
  wanderRadius: 22,
  wanderJitter: 3.5,
  threatHorizon: 1.2,      // s de anticipación para CPA
  evadeMargin: 18,         // px extra al radio para considerar "me va a dar"
}
```

---

## 9. Assets SVG de naves

### 9.1 Carga en `BootScene`
Añadir `preload()` (hoy BootScene solo tiene `create()`). Cada SVG se rasteriza a textura al
tamaño final (`shipBase * scale`), por lo que el sprite usa `setScale(1)`:

```js
import { STEERING } from '../balance.js'
...
preload() {
  for (const [typeKey, def] of Object.entries(REGISTRY)) {
    const size = Math.round(STEERING.shipBase * def.scale)
    this.load.svg(def.textureKey, `assets/ships/${typeKey}.svg`, { width: size, height: size })
  }
}
```

En `create()`: eliminar el bucle que genera texturas bitmap de enemigos
([BootScene.js:79-82](../src/game/scenes/BootScene.js#L79-L82)) y el objeto `ENEMY_PATTERNS`
y el método `makeEnemyTexture` (quedan obsoletos). Mantener `makeStarTexture` y `makeGlowTexture`.
`textureKey` en `REGISTRY` sigue siendo `enemy_grunt`, `enemy_runner`, etc. — el nombre del archivo
es por `typeKey` (`grunt.svg`...).

### 9.2 Reglas de diseño de cada SVG
- `viewBox="0 0 64 64"`, nave **centrada en (32,32)** y **con el morro hacia +X (derecha)**
  (la rotación en runtime ya la orienta hacia el rumbo).
- Estética neón: `stroke` del color del tipo (brillante), `fill` muy oscuro del mismo tono,
  `stroke-width` 3–4, `stroke-linejoin="round"`, y un filtro de glow suave.
- Colores por tipo: grunt/skirmisher `#49e07a`, runner/artillery `#ffd24a`,
  brute/saboteur `#ff5566`, mothership `#c08bff`.

### 9.3 Contenido de los 7 archivos (crear tal cual)

`public/assets/ships/grunt.svg` — punta de flecha (chevron ">")
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><filter id="n" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.2" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <path filter="url(#n)" d="M10 12 L54 32 L10 52 L24 32 Z"
        fill="#0b2e1c" stroke="#49e07a" stroke-width="3" stroke-linejoin="round"/>
</svg>
```

`public/assets/ships/runner.svg` — dardo veloz y esbelto
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><filter id="n" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.2" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#n)" fill="#3a2e08" stroke="#ffd24a" stroke-width="3" stroke-linejoin="round">
    <path d="M6 22 L58 32 L6 42 L16 32 Z"/>
    <path d="M16 30 L4 16 M16 34 L4 48" fill="none" stroke-width="2"/>
  </g>
</svg>
```

`public/assets/ships/brute.svg` — cuña pesada (doble chevron "«")
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><filter id="n" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.6" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#n)" fill="#3a0f14" stroke="#ff5566" stroke-width="4" stroke-linejoin="round">
    <path d="M14 8 L54 32 L14 56 L30 32 Z"/>
    <path d="M6 18 L18 32 L6 46" fill="none"/>
  </g>
</svg>
```

`public/assets/ships/saboteur.svg` — daga con cuerpo en "I" ("I>")
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><filter id="n" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.2" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#n)" fill="#3a0f14" stroke="#ff5566" stroke-width="3" stroke-linejoin="round">
    <rect x="12" y="20" width="6" height="24"/>
    <rect x="18" y="28" width="24" height="8"/>
    <path d="M42 22 L58 32 L42 42 Z"/>
  </g>
</svg>
```

`public/assets/ships/skirmisher.svg` — caza con prongs ("<I")
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><filter id="n" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.2" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#n)" fill="#0b2e1c" stroke="#49e07a" stroke-width="3" stroke-linejoin="round">
    <path d="M8 14 L56 32 L8 50 L20 32 Z"/>
    <path d="M20 24 L6 14 M20 40 L6 50" fill="none" stroke-width="2"/>
  </g>
</svg>
```

`public/assets/ships/artillery.svg` — cañón ancho con garras traseras
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><filter id="n" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.2" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#n)" fill="#3a2e08" stroke="#ffd24a" stroke-width="3" stroke-linejoin="round">
    <rect x="16" y="22" width="22" height="20" rx="3"/>
    <rect x="38" y="28" width="20" height="8"/>
    <path d="M16 22 L6 12 M16 42 L6 52" fill="none"/>
  </g>
</svg>
```

`public/assets/ships/mothership.svg` — nodriza alargada con núcleo
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><filter id="n" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#n)" fill="#1c1233" stroke="#c08bff" stroke-width="3" stroke-linejoin="round">
    <path d="M60 32 L40 12 L14 18 L6 32 L14 46 L40 52 Z"/>
    <circle cx="28" cy="32" r="7" fill="#2a1a4d" stroke-width="2"/>
  </g>
</svg>
```

> Si algún glow SVG no se ve por el rasterizado de Phaser, no pasa nada: el halo neón principal
> viene del sprite `glow` aditivo detrás de la nave (sección 2.2). El filtro SVG es un extra.

---

## 10. Orden de implementación sugerido

1. `balance.js` → bloque `STEERING`.
2. `behaviors/steering.js` (primitivas).
3. `behaviors/risk.js`.
4. `behaviors/movement.js` (reescritura a fuerzas) + rename RUNNER a `WEAVE`.
5. `behaviors/evasion.js` (CPA + estilos).
6. `behaviors/targeting.js` (rename `INFRA`).
7. `EnemyType.js` (maxForce, risk, movement/evasion por tipo).
8. `Enemy.js` (estado físico, suma de fuerzas, rotación, glow, slot `risk`).
9. `GameScene.js` (`world.enemies`, `world.meteorites`, `radius` en meteoritos).
10. Crear los 7 SVG en `public/assets/ships/`.
11. `BootScene.js` (`preload` SVG; quitar bitmap de enemigos).
12. `validateRegistry.js` + llamada en `BootScene.create`.

---

## 11. Criterios de aceptación

1. `npm run dev` arranca sin errores; `validateRegistry()` no lanza nada.
2. Las naves se mueven con **inercia y curvas suaves** (no líneas rectas perfectas), sin temblequeo,
   y **rotan apuntando a su rumbo**.
3. No se apilan unas sobre otras (separación) y **bordean meteoritos** en vez de atravesarlos en seco.
4. Al dispararles un misil de torreta, las naves con `evasion` **detectan el impacto previsto y lo
   esquivan lateralmente**; las `BRAVE` aguantan salvo que el golpe sea casi letal (verificable con
   RUNNER/SKIRMISHER esquivando y GRUNT/BRUTE aguantando).
5. Cada tipo usa su **SVG neón** distinto.
6. Disparos, oleadas, red de energía y misiles enemigos siguen funcionando igual (sin regresiones).

---

## 12. Notas de tuning (post-implementación)

- Si las naves giran lento/“flotan”, subir `maxForce` por tipo o `wEvade`.
- Si esquivan demasiado pronto/tarde, ajustar `threatHorizon` y `evadeMargin`.
- Si el `wander` las desvía mucho del objetivo, bajar `wWander` o `wanderRadius`.
- `RISK.CALCULATED`: ajustar el `1.6` (sensibilidad daño/HP) y el `0.5` (compromiso con el objetivo).
