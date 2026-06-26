# PROMPT PARA DEEPSEEK — Fase 8a: sacar 3 sistemas del monolito `GameScene` (refactor sin cambio de comportamiento)

> Pega este documento completo en DeepSeek. Autocontenido. Phaser/Vue/Vite, JS/ESM, comentarios en
> español. **Esto es un REFACTOR puro: el juego debe comportarse EXACTAMENTE igual.** No se añade ni se
> quita ninguna mecánica, número ni efecto. Solo se mueve código de `src/game/scenes/GameScene.js` a tres
> módulos nuevos en `src/game/systems/`. `npm run build` debe quedar limpio **después de cada parte**.

## OBJETIVO
`GameScene` es un monolito (~1400 líneas) dueño de todo; cualquier cambio arriesga romper algo no
relacionado. Sacamos tres subsistemas a archivos propios para aislarlos (y poder, más adelante,
intercambiarlos por modo de juego). Patrón a imitar: el que ya existe con
`EnemyProjectileSystem` (`new EnemyProjectileSystem(this)` recibe la escena y opera sobre ella).

Aquí los módulos exportan **funciones que reciben `scene`** (no clases): el estado sigue viviendo en la
escena (`scene.structures`, `scene.links`, `scene.wave`, etc.), igual que hoy. Solo se mueve la lógica.

## REGLAS DE ORO (los bugs recurrentes de este repo)
1. **No cambies la lógica.** Copia el cuerpo actual de cada función tal cual; solo sustituye `this.` por
   `scene.` donde corresponda y ajusta a función.
2. **Unidades de `dt`.** `updateWaves` recibe `delta` en **milisegundos** (el `d` del loop). NO lo
   dividas: los timers de oleada (`w.timer`, `w.spawnTimer`) están en ms.
3. **Reuso por el cliente remoto.** `createMeteorite` y `drawLinks` se llaman también desde el modo
   remoto (`applySnapshot`). Después del refactor deben seguir funcionando en remoto.
4. **`Structure.js` depende del método de la escena.** `Structure.js` llama a
   `this.scene.recomputeNetwork()` (dos sitios, con guard `if (this.scene.recomputeNetwork)`). **No
   toques `Structure.js`.** Para que siga funcionando, conserva en `GameScene` un **wrapper de una línea**
   `recomputeNetwork()` que delega al módulo.
5. Haz las 3 partes **una a una** y corre `npm run build` tras cada una.

---

## PARTE A — `systems/worldgen.js` (la más simple; empieza por aquí)

Crea `src/game/systems/worldgen.js`:
```js
import Phaser from 'phaser'
import { WORLD, METEOR } from '../balance.js'

// Crea un meteorito (sprite + datos) y lo registra en scene.meteorites. Devuelve el meteorito.
export function createMeteorite(scene, x, y) {
  // ⬅️ copia AQUÍ el cuerpo actual de GameScene.createMeteorite(x, y) tal cual,
  //    cambiando this.add → scene.add y this.meteorites → scene.meteorites.
}

// Siembra los meteoritos iniciales alrededor del centro del mundo.
export function populateMeteorites(scene) {
  // ⬅️ copia AQUÍ el cuerpo actual de GameScene.createMeteorites(),
  //    cambiando this.createMeteorite(x, y) → createMeteorite(scene, x, y).
}
```

En `GameScene.js`:
- Importa: `import { createMeteorite, populateMeteorites } from '../systems/worldgen.js'`
- **Borra** los métodos `createMeteorites()` y `createMeteorite()` de la clase.
- Sustituye los call-sites:
  - `this.createMeteorites()`  →  `populateMeteorites(this)`   *(en `create()`)*
  - `this.createMeteorite(x, y)`  →  `createMeteorite(this, x, y)`   *(en `applySnapshot`, modo remoto)*
- Quita de los imports de `GameScene` los que ya no use (p. ej. `METEOR` si no queda otro uso).

**Build limpio. El mapa y los meteoritos (host y cliente) se ven igual.**

---

## PARTE B — `systems/waves.js` (FSM de oleadas; solo host)

Crea `src/game/systems/waves.js`:
```js
import Phaser from 'phaser'
import { appState, DIFFICULTY } from '../appState.js'
import { gameState } from '../gameState.js'
import { buildWaves, WAVE_TOTAL, INTERMISSION_MS, FIRST_WAVE_MS, WORLD } from '../balance.js'
import { Enemy } from '../enemies/Enemy.js'

export function initWaves(scene) {
  // ⬅️ cuerpo actual de GameScene.initWaves() tal cual (usa scene.waves / scene.wave).
}

export function updateWaves(scene, delta) {
  // ⬅️ cuerpo actual de GameScene.updateWaves(delta). delta en MS, no dividir.
  //    this.startNextWave() → startNextWave(scene); this.victory() → scene.victory()
}

export function startNextWave(scene) {
  // ⬅️ cuerpo actual de GameScene.startNextWave().
}

export function spawnEnemy(scene, type) {
  // ⬅️ cuerpo actual de GameScene.spawnEnemy(type).
  //    this.add/this.tweens → scene.add/scene.tweens; new Enemy(type, x, y, this) → new Enemy(type, x, y, scene)
  //    this.core → scene.core; this._enemySeq → scene._enemySeq; this.enemies → scene.enemies
}
```
> El estado (`scene.waves` = lista construida, `scene.wave` = FSM, `scene._enemySeq`, `scene.enemies`,
> `scene.core`) sigue en la escena. Solo se mueve la lógica.

En `GameScene.js`:
- Importa: `import { initWaves, updateWaves } from '../systems/waves.js'`
- **Borra** de la clase: `initWaves()`, `updateWaves()`, `startNextWave()`, `spawnEnemy()`.
- Sustituye los call-sites:
  - `this.initWaves()`  →  `initWaves(this)`   *(en `create()`)*
  - `this.updateWaves(d)`  →  `updateWaves(this, d)`   *(en `update()`)*
- Quita de los imports de `GameScene` los que ya no use (probablemente `buildWaves`, `WAVE_TOTAL`,
  `INTERMISSION_MS`, `FIRST_WAVE_MS`; **deja** `WORLD` y `DIFFICULTY` si los usa otra parte de la escena).

**Build limpio. Oleadas, conteo, victoria y FX de aparición idénticos.**

---

## PARTE C — `systems/energyNet.js` (la más enredada; hazla la última)

`isRelay`/`portCap` son helpers puros (solo necesitan la estructura) y los comparte la **colocación**
(`findAttachRelay`, que SE QUEDA en la escena). `drawLinks` lo reusa el **cliente remoto**.
`recomputeNetwork` lo llama **`Structure.js`** vía `this.scene.recomputeNetwork()` → conservamos wrapper.

Crea `src/game/systems/energyNet.js`:
```js
import Phaser from 'phaser'
import { gameState } from '../gameState.js'
import { CORE } from '../balance.js'

const LINK_ON = 0x6cc8ff
const LINK_OFF = 0x37506a

export function isRelay(s) {
  return !s.building && (s.isCore || s.role === 'relay')
}

export function portCap(s) {
  if (s.isCore) return s.def.maxPorts || 8
  if (s.role === 'relay') return s.def.maxPorts || 5
  return Infinity
}

export function recomputeNetwork(scene) {
  // ⬅️ cuerpo actual de GameScene.recomputeNetwork(), con:
  //    this.structures → scene.structures, this.links → scene.links,
  //    this.isRelay(x) → isRelay(x), this.portCap(x) → portCap(x),
  //    this.recomputeEnergyCap() → recomputeEnergyCap(scene),
  //    this.drawLinks() → drawLinks(scene)
}

export function recomputeEnergyCap(scene) {
  // ⬅️ cuerpo actual de GameScene.recomputeEnergyCap() (usa scene.structures, gameState, CORE).
}

export function drawLinks(scene) {
  // ⬅️ cuerpo actual de GameScene.drawLinks() (usa scene.linkGraphics, scene.links, LINK_ON/LINK_OFF).
}
```

En `GameScene.js`:
- Importa (con alias para no chocar con el wrapper):
  `import { recomputeNetwork as recomputeNetworkSys, drawLinks, isRelay, portCap } from '../systems/energyNet.js'`
- **Borra** de la clase: `recomputeEnergyCap()`, `drawLinks()`, `isRelay()`, `portCap()`, y el **cuerpo**
  de `recomputeNetwork()`.
- **Conserva** un wrapper de una línea (para `Structure.js`):
  ```js
  recomputeNetwork() { recomputeNetworkSys(this) }
  ```
- **Borra** del tope del archivo los `const LINK_ON` / `const LINK_OFF` (ahora viven en el módulo).
- Sustituye los usos internos:
  - En `findAttachRelay`: `this.isRelay(s)` → `isRelay(s)`, `this.portCap(s)` → `portCap(s)`.
  - En `applySnapshot` (remoto): `this.drawLinks()` → `drawLinks(this)`.
- `this.recomputeNetwork()` en `create()` y en `tryPlace()` pueden quedarse igual (usan el wrapper).
- Deja `CORE` importado en `GameScene` si lo usa otra parte (lo usa la creación del núcleo).

**Build limpio. Enlaces, señal/energía, colocación, destrucción y render de enlaces (host y cliente)
idénticos.**

---

## ACEPTACIÓN
1. `npm run build` limpio tras CADA parte (A, B, C).
2. Single-player: meteoritos, oleadas (incl. victoria y FX de aparición), red de energía, colocación y
   destrucción de estructuras se comportan **exactamente igual** que antes.
3. Multijugador: host y cliente se ven igual que antes (el cliente sigue dibujando enlaces y meteoritos).
4. `GameScene.js` queda más corto; la lógica de los 3 sistemas vive en `src/game/systems/`.
5. `Structure.js`, `EnemyProjectiles.js` y el resto **no se tocan**.

## NOTA
Esto es un refactor de "mover cajas": si algo se ve o se comporta distinto, es que se cambió lógica al
copiar (un `this.` mal sustituido, un import faltante, o el guard de `recomputeNetwork`). No "mejores"
nada de paso. Las funciones puras de verdad (recibir `(world, dt)` sin tocar `scene.add`) son un paso
posterior; aquí solo aislamos por archivo.
