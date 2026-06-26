# PROMPT PARA DEEPSEEK — Fase 4: enemigos (doble objetivo + más disparos + ~200 unidades, naves SVG)

> Pega este documento completo en DeepSeek. Es autocontenido.
> Proyecto: **Phaser 3.90 + Vue 3 + Vite**, JS / ES modules, Windows. Comentarios en español.
> **No rompas** estructuras, energía, red, oleadas, cámara/minimapa ni controles. `npm run build`
> debe pasar limpio al terminar. Sin dependencias nuevas.

---

## CONTEXTO DEL CÓDIGO ACTUAL (léelo antes de tocar)

- **Clase enemigo** [src/game/enemies/Enemy.js](../src/game/enemies/Enemy.js): por cada enemigo crea
  `this.sprite` (nave SVG, ya rasterizada a bitmap en `BootScene`), `this.glow` (imagen aditiva) y
  `this.bar` (un `Graphics` **por enemigo** para la barra de HP, que redibuja cada frame). **El SVG no
  es el problema** (en runtime es una imagen normal); lo que **no escala a 200** es el `Graphics` por
  enemigo y el O(n²) de abajo. **Conservamos las naves SVG.**
- **Targeting de UN objetivo**: `this.targeting = TARGETING[this.def.targeting]`; en `update()`
  `if (!this.target || this.target.dead) this.target = this.targeting(this, world)`.
- **Cuellos O(n²)** en [behaviors/steering.js](../src/game/enemies/behaviors/steering.js):
  `separate(e, world)` recorre **todos** los enemigos por cada enemigo; `avoidObstacles(e, world)`
  recorre **todos** los meteoritos por cada enemigo.
- **Registro** [src/game/enemies/EnemyType.js](../src/game/enemies/EnemyType.js): `REGISTRY` (por tipo)
  + `ROLE_GROUPS` (`CORE, INFRA, GENERATOR, DEFENSE`). Tipos: GRUNT, RUNNER, BRUTE, SABOTEUR,
  SKIRMISHER, ARTILLERY, MOTHERSHIP.
- **Ataques** [behaviors/attack.js](../src/game/enemies/behaviors/attack.js): `MELEE, BEAM, MISSILE,
  BIG_BEAM`. Beams hitscan via `world.fireEnemyBeam(...)`; misiles via `world.spawnEnemyMissile(...)`.
- **Validación** [validateRegistry.js](../src/game/enemies/validateRegistry.js): valida que
  `targeting/movement/attack` (+ `evasion/risk`) existan en sus mapas. **Habrá que actualizarla.**
- **BootScene** [BootScene.js](../src/game/scenes/BootScene.js): `preload()` carga los SVG de naves;
  `create()` genera texturas canvas (`star`, `glow`, `missile_rod`).
- **GameScene** [GameScene.js](../src/game/scenes/GameScene.js): `spawnEnemy(type)`,
  `updateEnemies(delta)` (recorre `this.enemies`, llama `e.update(dt, this.world, this.time.now)`),
  y construye `this.world` con `enemies, meteorites, core, structures, fireEnemyBeam,
  spawnEnemyMissile, killEnemy, damageStructure, nearestStructure`.
- **Oleadas** [balance.js `buildWaves`](../src/game/balance.js): genera 10 oleadas; el pico de enemigos
  vivos hoy es modesto.

**Implementa en este orden (4a → 4e). Compila y prueba cada bloque antes de seguir.**

---

## 4a — Quitar el coste por enemigo (mantener las naves SVG)

**Meta:** conservar las **naves SVG actuales** (no se usa ASCII; el render no cambia) y eliminar el
coste que no escala: el `Graphics` de barra de HP **por enemigo**. Las barras pasan a dibujarse **todas
juntas** en un único `Graphics` de la escena.

### 4a.1 `Enemy.js` — quitar solo la barra propia
- **Deja igual** `this.sprite` (nave SVG `textureKey`), `this.glow`, la **rotación al rumbo**, el flash
  de daño y `this.attack(...)`. El aspecto de las naves **no cambia**.
- **Quita** del constructor `this.bar = scene.add.graphics()...` y **borra el bloque de `update()`** que
  dibuja la barra de HP (las líneas con `this.bar`).
- En `destroy()`, quita `this.bar.destroy()` (deja `this.sprite` y `this.glow`).
- *(Palanca de rendimiento, opcional):* `this.glow` es una **segunda imagen aditiva por enemigo**. Los
  SVG ya traen su propio resplandor (filtro de blur). Si con ~200 enemigos hay tirones, puedes
  **eliminar `this.glow`** (su creación y sus `setPosition/alpha/rotation` en `update()` y su
  `destroy()`). Si el framerate va bien, déjalo tal cual.

> **No toques** el `preload()` de SVG de `BootScene` ni `makeStarTexture/makeGlowTexture/makeRodTexture`:
> las naves SVG se siguen cargando exactamente igual.

### 4a.2 Barras de HP en lote (`GameScene.js`)
- En `create()`: `this.enemyBars = this.add.graphics().setDepth(16)`.
- En `updateEnemies(delta)`, tras actualizar todos los enemigos, **dibuja todas las barras de una vez**:
  ```js
  const g = this.enemyBars
  g.clear()
  for (const e of this.enemies) {
    if (e.dead || e.hp >= e.maxHp) continue
    const w = 14 * e.def.scale
    const frac = Math.max(0, e.hp / e.maxHp)
    const by = e.y - 12 * e.def.scale
    g.fillStyle(0x000000, 0.6).fillRect(e.x - w / 2 - 1, by - 1, w + 2, 4)
    g.fillStyle(0xff5566, 1).fillRect(e.x - w / 2, by, w * frac, 2)
  }
  ```

**Aceptación 4a:** las naves SVG se ven **igual que antes**; las barras de HP siguen apareciendo; sin
regresiones; menos coste por enemigo (un `Graphics` total en vez de uno por enemigo).

---

## 4b — Grid espacial (separación y vecindad en O(n), no O(n²))

**Meta:** sostener ~200 enemigos. Reemplaza los recorridos "todos contra todos".

### 4b.1 Nuevo archivo `src/game/enemies/SpatialGrid.js`
```js
// Grid espacial uniforme para consultas de vecindad en O(1) amortizado.
export class SpatialGrid {
  constructor(cellSize) {
    this.cell = cellSize
    this.map = new Map()
  }
  _key(cx, cy) { return cx * 73856093 ^ cy * 19349663 }
  clear() { this.map.clear() }
  insert(item) {
    const cx = Math.floor(item.x / this.cell)
    const cy = Math.floor(item.y / this.cell)
    const k = this._key(cx, cy)
    let arr = this.map.get(k)
    if (!arr) { arr = []; this.map.set(k, arr) }
    arr.push(item)
  }
  // Llama cb(item) para cada item en celdas que cubren el radio dado.
  forEachNear(x, y, radius, cb) {
    const minx = Math.floor((x - radius) / this.cell)
    const maxx = Math.floor((x + radius) / this.cell)
    const miny = Math.floor((y - radius) / this.cell)
    const maxy = Math.floor((y + radius) / this.cell)
    for (let cx = minx; cx <= maxx; cx++) {
      for (let cy = miny; cy <= maxy; cy++) {
        const arr = this.map.get(this._key(cx, cy))
        if (!arr) continue
        for (let i = 0; i < arr.length; i++) cb(arr[i])
      }
    }
  }
}
```

### 4b.2 Construir el grid cada frame (`GameScene.js`)
- En `create()`: `this.enemyGrid = new SpatialGrid(48)` y añádelo al `world`:
  `this.world.enemyGrid = this.enemyGrid`.
- Al inicio de `updateEnemies(delta)` (antes del bucle de update):
  ```js
  this.enemyGrid.clear()
  for (const e of this.enemies) if (!e.dead) this.enemyGrid.insert(e)
  ```

### 4b.3 `separate()` usa el grid (`behaviors/steering.js`)
```js
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
  return { fx: (sx / m) * e.maxSpeed - e.vx, fy: (sy / m) * e.maxSpeed - e.vy }
}
```
(`avoidObstacles` puede quedarse igual: 80 meteoritos × N es asumible. Opcional: gridéalo también.)

**Aceptación 4b:** con ~150–200 enemigos el framerate se mantiene jugable en PC y en móvil de gama
media; los enemigos siguen sin apilarse (separación correcta).

---

## 4c — Doble objetivo (prioritario + secundario)

**Meta:** cada tipo tiene un objetivo **prioritario** y uno **secundario** (grupos de rol). Elige el
más cercano del prioritario; si no hay, del secundario; si tampoco, el núcleo.

### 4c.1 Grupos de rol (`EnemyType.js`)
Añade a `ROLE_GROUPS`:
```js
NODE: (s) => s.role === 'relay',
```
(Ya existen `CORE, INFRA, GENERATOR, DEFENSE`.)

### 4c.2 Resolver de objetivo (`behaviors/targeting.js`)
Añade un resolver dual y mantén el mapa `TARGETING` para compatibilidad:
```js
function nearestInGroupName(enemy, world, groupName) {
  const fn = ROLE_GROUPS[groupName]
  if (!fn) return null
  let best = null, bestD = Infinity
  for (const s of world.structures) {
    if (s.dead || !fn(s)) continue
    const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, s.x, s.y)
    if (d < bestD) { bestD = d; best = s }
  }
  return best
}

// Prioritario → secundario → núcleo.
export function resolveTarget(enemy, world) {
  const def = enemy.def
  return nearestInGroupName(enemy, world, def.targetPriority)
      || nearestInGroupName(enemy, world, def.targetSecondary)
      || world.core
}
```

### 4c.3 `Enemy.js` — usar el resolver + throttle de re-targeting
- Quita `this.targeting = TARGETING[...]` (y su check en el constructor). Importa `resolveTarget`.
- Añade en el constructor: `this.retargetTimer = Math.random() * 400`.
- En `update()`, sustituye la resolución de objetivo por:
  ```js
  this.retargetTimer -= dt * 1000
  if (!this.target || this.target.dead || this.retargetTimer <= 0) {
    this.target = resolveTarget(this, world)
    this.retargetTimer = 400 // reevalúa ~cada 0.4 s (reparte carga)
  }
  ```

### 4c.4 Asignación por tipo (`REGISTRY`)
Reemplaza `targeting: '...'` por `targetPriority`/`targetSecondary`:

| tipo        | targetPriority | targetSecondary |
|-------------|----------------|-----------------|
| GRUNT       | DEFENSE        | CORE            |
| RUNNER      | CORE           | DEFENSE         |
| BRUTE       | DEFENSE        | CORE            |
| SABOTEUR    | GENERATOR      | NODE            |
| SKIRMISHER  | GENERATOR      | DEFENSE         |
| ARTILLERY   | NODE           | CORE            |
| MOTHERSHIP  | CORE           | DEFENSE         |

### 4c.5 `validateRegistry.js`
Quita la validación de `targeting` y valida en su lugar que `targetPriority`/`targetSecondary` sean
claves de `ROLE_GROUPS` o `'CORE'`. Mantén la validación de `movement/attack` (+ `evasion/risk`).

**Aceptación 4c:** los grunts van a por las torretas y, si no hay, al núcleo; saboteurs/skirmishers van
a por los recolectores; la artillería apunta a los nodos. Al destruir el objetivo prioritario, caen al
secundario.

---

## 4d — Más enemigos disparan (laséres pequeños)

**Meta:** la mayoría lanza un par de láseres pequeños; los brutes también; algunos, misiles.

### 4d.1 Nuevo ataque `LIGHT_LASER` (`behaviors/attack.js`)
Hitscan barato y de cadencia rápida, daño bajo:
```js
LIGHT_LASER: (enemy, world, dt) => {
  const t = enemy.target
  if (!t) return
  const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, t.x, t.y)
  if (d > (enemy.def.attackRange || 120)) return
  enemy.atkTimer -= dt * 1000
  if (enemy.atkTimer > 0) return
  world.fireEnemyBeam({
    from: enemy, to: t,
    damage: enemy.damage,
    color: enemy.def.beamColor || enemy.def.color,
    width: 1.5,
  })
  world.damageStructure(t, enemy.damage)
  enemy.atkTimer = enemy.def.atkCooldown
},
```

### 4d.2 Reasignar ataques (`REGISTRY`)
- **GRUNT** → `attack: 'LIGHT_LASER'`, `attackRange: 120`, `atkCooldown: 700`, `damage: 4`,
  `movement: 'STANDOFF'`? No — mantén su `movement` actual (`STRAIGHT` se detiene en `attackRange`).
- **BRUTE** → `attack: 'LIGHT_LASER'`, `attackRange: 160`, `atkCooldown: 900`, `damage: 9`.
- **SABOTEUR** → deja `BEAM` (ya dispara).
- **SKIRMISHER / ARTILLERY** → dejan `MISSILE`.
- **MOTHERSHIP** → deja `BIG_BEAM`.
- **RUNNER** → mantén `MELEE` (corredor que embiste rápido).

> Como GRUNT/BRUTE pasan a tener `attackRange > 0`, su `movement` (`STRAIGHT`/`arriveAtRange`) ya los
> detiene en rango y disparan. Verifica que `attackRange` esté puesto en sus entradas.

**Aceptación 4d:** la mayoría de enemigos dispara pequeños rayos a su objetivo desde la distancia;
skirmishers/artillería siguen con misiles; la nodriza con su rayo grande.

---

## 4e — Más enemigos por oleada (~200 de pico)

En [balance.js `buildWaves`](../src/game/balance.js): sube las cantidades y baja el `gap` de spawn para
que el **pico de enemigos vivos** llegue a ~150–200 en oleadas tardías (sin disparar el spawn de golpe:
mantén el goteo por `gap`). Ejemplo de ajuste conservador:
- Sube los `push(...)` base (p. ej. GRUNT `20 + i * 10`) y/o el `factor`.
- Baja el `gap`: `Math.max(45, 300 - i * 25) * gapMult`.

Ajusta hasta que una oleada tardía mantenga ~150–200 vivos a la vez con framerate jugable. Documenta
los números finales.

**Aceptación 4e:** una oleada tardía sostiene ~200 enemigos en pantalla moviéndose y disparando, fluido
en PC y móvil. Sin fugas de memoria (los muertos se destruyen y se quitan de `this.enemies`).

---

## (Opcional recomendado) Pooling de enemigos
Si tras 4a–4e el GC causa tirones al spawnear/morir en masa, añade un pool: en vez de `new Enemy` /
`destroy()`, reutiliza instancias (resetea estado y reusa la imagen). No es imprescindible si el
framerate ya es estable.

---

## CRITERIOS DE ACEPTACIÓN GLOBALES
1. `npm run build` limpio; el juego arranca sin errores.
2. **Naves SVG conservadas** (render sin cambios); barras de HP en lote.
3. ~**200 enemigos** simultáneos fluidos en PC y móvil de gama media.
4. **Doble objetivo** funcionando (prioritario → secundario → núcleo) según la tabla.
5. La mayoría **dispara láseres pequeños**; algunos, misiles; la nodriza, rayo grande.
6. Sin regresiones en estructuras, energía, red, construcción, oleadas ni curación.

## ENTREGABLE
Resumen de archivos creados/cambiados por bloque (4a–4e) y los números finales de oleadas. No incluyas
las Fases 5–7 (assets PNG, general, multijugador): tienen sus propios prompts.
