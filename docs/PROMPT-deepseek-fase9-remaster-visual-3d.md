# FASE 9 — Remaster visual 3D, paridad host/cliente y rebalance de IA

> Documento de implementación para una IA. Contiene TODO el contexto necesario: arquitectura,
> archivos exactos, diseño visual, ejemplos de código y criterios de aceptación por sub-fase.
> Implementar en el orden dado (9A → 9K): las fases tempranas son correcciones que las tardías asumen.

---

## 0. Contexto del proyecto (leer antes de tocar nada)

### 0.1 Stack y arquitectura

- **Vue 3** dibuja el UI (lobby, HUD). Nunca llama a la escena Phaser: lee el store reactivo
  `gameState` (`src/game/gameState.js`) y emite intents por `bus` (`src/game/bus.js`).
- **Phaser 3** simula el juego. `GameScene` (`src/game/scenes/GameScene.js`) orquesta módulos
  extraídos que **exportan funciones que reciben `scene`** y mutan el estado que vive en la escena
  (`scene.structures`, `scene.enemies`, `scene.wave`, …):
  - `src/game/systems/` — lógica: `waves.js`, `energyNet.js`, `projectiles.js`, `healers.js`,
    `enemies.js`, `placement.js`, `selection.js`, `worldgen.js`.
  - `src/game/render/` — visual puro: `fx.js` (explosión, beams, textos), `scenery.js`.
  - `src/game/structures/` — clases `Structure` + subclases; factory `createStructure(key,x,y,scene)`
    en `StructureRegistry.js`. **El `CLASS_MAP` del factory se indexa por `def.role`, NO por `key`**
    (el Nodo tiene `key:'node'` pero `role:'relay'`).
  - `src/game/enemies/` — data-driven: `EnemyType.js` (`REGISTRY` + `ROLE_GROUPS`), clase `Enemy`,
    behaviors en `behaviors/` (targeting/movement/attack/evasion/risk/steering). `validateRegistry()`
    revienta en boot si una key de behavior no existe.
- **Three.js** (`src/game/three/ThreeLayer.js`) es una capa WebGL **detrás** del canvas de Phaser
  (canvas Phaser transparente, `z-index:1`; canvas Three `z-index:0`). Hoy dibuja: fondo espacial
  (estrellas twinkle + 1 nebulosa), meteoritos 3D (OBJ + PBR) y partículas de explosión. Phaser
  dibuja encima TODO el gameplay 2D (estructuras, enemigos, láseres, barras, selector, minimapa).
  `GameScene.render3D()` (hook `POST_UPDATE`) llama `three.syncCamera(cam)` → `three.sync(scene)` →
  `three.render(time)`. `syncCamera` copia `cam.worldView` (+ offset de shake) a una cámara
  ortográfica: **las coordenadas de mundo Phaser son directamente coordenadas Three (x, y, z=altura)**.

### 0.2 Multijugador (host-authoritative)

- `src/game/net.js` = transporte PeerJS. `src/game/net/sync.js` = toda la capa de sync.
- El **host** simula todo y emite snapshots ~12 Hz (`buildSnapshot`/`sendSnapshot`). El **cliente**
  corre `GameScene` con `this.remote = true`, que **desactiva toda simulación**: solo
  `renderRemote()` interpola lo que llega en `applySnapshot()`. Los efectos puntuales viajan en
  `snap.fx` (`beams`, `expl`, `mining`, `gmining`) mediante colas del host (`scene._beamQueue`,
  `scene._explQueue`).
- **Regla:** todo efecto visual nuevo del host debe (a) reproducirse desde datos del snapshot en el
  cliente, o (b) derivarse de estado ya sincronizado (hp, powered, posición). Nada de "solo host".

### 0.3 El gotcha de unidades de `dt` (fuente #1 de bugs)

`GameScene.update` computa `d = delta * speed` en **milisegundos**. Después:

| Subsistema | Unidad de dt |
|---|---|
| `Structure.update(d)` y subclases | **ms** (comparar contra `cooldown`/`buildTime` en ms) |
| `Enemy.update(delta/1000)` | **segundos** |
| `General.update(d/1000)` | **segundos** |
| `EnemyProjectileSystem.update(d/1000)` | **segundos** |
| `updateWaves(scene, d)` | **ms** |
| `updateHealers(scene, delta)` | recibe **ms**, convierte a s internamente |
| `ThreeLayer.render()` | calcula su propio dt en **segundos** con `performance.now()` |

Antes de escribir cualquier timer, identificar la convención del subsistema.

### 0.4 Verificación

No hay tests ni linter. `npm run build` es el único check automático (atrapa imports/sintaxis, no
lógica). Verificar comportamiento con `npm run dev` (el usuario valida lo visual; no lanzar
navegadores headless). No borrar los wrappers delegantes de `GameScene`
(`recomputeNetwork()`, `explosion()`): otros archivos los llaman vía `this.scene.X()`.

---

## 1. FASE 9A — Bug de las explosiones ("rayo / círculo extraño") — **YA CORREGIDO, no reintroducir**

### 1.1 Diagnóstico (documentación de la solución)

Síntoma: al explotar algo, un círculo salía disparado en diagonal atravesando la pantalla como un
"rayo", y en cada spawn de oleada un circulito rojo hacía lo mismo.

Causa raíz (en dos sitios, el mismo patrón): se creaba un `Phaser.Graphics` **en el origen (0,0)**
y se dibujaba el círculo en coordenadas de mundo `(x,y)`; luego un tween animaba `scale`. En Phaser
`scale` escala alrededor del **origen del GameObject**, no del dibujo: con scale 2.2 un círculo
dibujado en (3600, 2400) se desplaza hacia (7920, 5280) mientras crece → se percibe como un
proyectil/rayo fantasma.

Arreglo aplicado (patrón correcto: Graphics posicionado en el punto, dibujo relativo a 0,0):

```js
// src/game/render/fx.js — explosion(): ANTES (bug) → DESPUÉS
const ring = scene.add.graphics().setDepth(28).setBlendMode(Phaser.BlendModes.ADD).setPosition(x, y)
ring.fillStyle(color, 0.5).fillCircle(0, 0, radius * 0.6)
ring.lineStyle(2, color, 0.9).strokeCircle(0, 0, radius * 0.6)
// el tween de { scale: 2.2, alpha: 0 } ahora escala en el sitio
```

```js
// src/game/systems/waves.js — spawnEnemy(): mismo fix en el marcador de spawn
const marker = scene.add.graphics().setDepth(14).setPosition(x, y)
marker.strokeCircle(0, 0, 12) // antes: strokeCircle(x, y, 12)
```

### 1.2 Regla permanente

**Cualquier Graphics que vaya a ser tweeneado en `scale` debe crearse con `.setPosition(x,y)` y
dibujar relativo a (0,0).** `auraBurst()` y `hitFlash()` ya lo hacen bien; usarlos de referencia.
Al añadir efectos nuevos en las fases siguientes, auditar este patrón.

Criterio de aceptación: explotar enemigos y ver el anillo expandirse EN el punto del impacto;
ningún círculo se desplaza. Igual con el marcador rojo del spawn.

---

## 2. FASE 9B — Paridad host/cliente ("que se vean igual")

Objetivo: un espectador no debe poder distinguir la pantalla del cliente de la del host.

### 2.1 Gaps detectados (arreglar todos)

1. **Mejoras de estructuras invisibles en el cliente.** `buildSnapshot()` (`src/game/net/sync.js`)
   serializa `structs` como `[id,key,x,y,hp,maxHp,powered,building,frac]` — **sin `upgrades` ni
   `fireMode`**. En el host, `applyUpgrade` (`systems/selection.js`) llama
   `s.applyUpgradeVisual(upgrade)` que tinta y dibuja el `decor` (`Structure.js`). El cliente nunca
   lo ve: sus torretas quedan con el aspecto base para siempre.

   Fix: añadir al array la lista de ids de mejora (compacta) y aplicarlas al crear/actualizar:

   ```js
   // buildSnapshot — añadir campo 9: ids de upgrades unidos por coma ('' si no hay)
   structs: scene.structures.map((s) => [s.id, s.key, ..., (s.upgrades || []).join(',')])

   // applySnapshot — tras crear/obtener s:
   const upIds = row[9] ? row[9].split(',') : []
   for (const id of upIds) {
     if (!s.upgrades?.includes(id)) {
       const u = UPGRADES.find((x) => x.id === id)
       if (u) { s.applyUpgrade?.(u); s.applyUpgradeVisual(u); (s.upgrades ||= []).push(id) }
     }
   }
   ```

   Nota: en el cliente `applyUpgrade` solo importa por sus efectos visuales colaterales (p.ej.
   `style` cambia el decor); los stats no se usan porque el cliente no simula. Si alguna subclase
   no define `applyUpgrade`, basta `applyUpgradeVisual`.

2. **`auraBurst` no viaja.** La ojiva de plasma (`missile_a2`) dibuja `auraBurst()` solo en host
   (buscar su callsite en `systems/projectiles.js`). Añadir una cola `scene._auraQueue` idéntica a
   `_explQueue` (push en `auraBurst()` si `net.isHost`), campo `fx.aura` en el snapshot, y en
   `applySnapshot`: `for (const [x,y,color,r] of snap.fx?.aura || []) auraBurst(scene, x, y, color, r)`.

3. **Textos flotantes** (`spawnFloatingText`: "+minerales", "¡Sin energía!"…): sincronizar solo los
   de recompensa por kill si se quiere paridad total; alternativa aceptable y más barata: el cliente
   los genera localmente al detectar la muerte de un enemigo (cuando un id desaparece de
   `snap.enemies` cerca del jugador no hay dato de recompensa → aceptar omitirlos, PERO entonces
   documentarlo como diferencia deliberada en este archivo).

4. **Marcador de spawn** (círculo rojo de `spawnEnemy`): el cliente no lo ve. Al aparecer un id
   nuevo en `snap.enemies`, dibujar el mismo marcador (mismo código, extraerlo a
   `render/fx.js: spawnMarker(scene,x,y)` y llamarlo desde ambos lados).

5. **General del cliente**: el host dibuja `General` con su clase (glow, selector, label); el
   cliente dibuja `scene.add.image(..., 'enemy_skirmisher')` tintada. Igualar: extraer el dibujo
   del cuerpo del General a una función compartida o, mínimo, usar la misma textura + glow additivo
   + mismo tamaño que el host.

6. **Shake de cámara**: `explosion()` ya corre en el cliente vía `snap.fx.expl` → el shake
   proximity-based ya es idéntico. Verificar que el fix de 9A también rige en cliente (rige: es la
   misma función).

### 2.2 Criterios de aceptación

- Host mejora una torreta láser a `laser_b` → el cliente ve el tint azul y el decor `wide` en <100 ms.
- Misil de plasma detona → ambos ven el aura.
- Con dos ventanas lado a lado (host + cliente), una oleada completa se ve igual: mismos beams,
  explosiones, marcadores de spawn, tamaños de naves.

---

## 3. FASE 9C — Remaster 3D: naves, torretas, láseres y explosiones (LO MÁS IMPORTANTE)

Objetivo: pasar el gameplay al render 3D de `ThreeLayer` manteniendo Phaser para lógica, input,
barras y HUD. `_makeStructure()` y `_makeEnemy()` ya existen en `ThreeLayer.js` como base — esta
fase los activa, los mejora y resuelve el compositing para que **2D y 3D no se solapen**.

### 3.1 Regla de compositing (evitar el doble dibujo)

El problema histórico: si Three dibuja la nave Y Phaser dibuja su sprite, se ven dos naves
vibrando una sobre otra. La regla:

> **Un objeto se dibuja en UNA capa.** Cuando `ThreeLayer` adopta una categoría (enemigos,
> estructuras), los GameObjects Phaser correspondientes se ponen `setVisible(false)` — pero NO se
> destruyen: siguen siendo la fuente de posición/rotación/hp y el hit-test de input.

Orden de capas resultante (de atrás a delante):
```
Three bgScene   → nebulosas, estrellas, viñeta            (z-index 0, render 1º)
Three scene     → meteoritos, ESTRUCTURAS, NAVES, LÁSERES 3D, explosiones
Phaser (transp) → enlaces de red, barras HP/build, ghost, selector, minimapa, marcadores
Vue HUD         → paneles, botones                          (z-index > 1)
```

Qué se queda en Phaser a propósito (es UI de mundo, se lee mejor plano): `linkGraphics`,
`enemyBars`, `ghost`/`rangePreview`, barras de construcción, textos flotantes, minimapa.

### 3.2 Sincronización de mallas (patrón de reconciliación)

Extender `ThreeLayer.sync(scene)` con el mismo patrón que ya usa para meteoritos: reconciliar un
`Map` objeto-de-juego → entrada 3D. Funciona idéntico en host (`scene.enemies` = instancias `Enemy`)
y cliente (`scene.eById` = sprites interpolados): **ambos exponen `.x .y` y rotación**, que es lo
único que Three necesita. Unificar con un accessor:

```js
// ThreeLayer.sync(scene) — enemigos (host y cliente)
const list = scene.remote ? [...scene.eById.values()] : scene.enemies
const seen = new Set()
for (const e of list) {
  if (e.dead) continue
  seen.add(e)
  let m = this.meshes.get(e)
  if (!m) { m = this._makeEnemy(e); this.meshes.set(e, m) }
  m.root.position.set(e.x, e.y, 8)                    // z=8: por encima de meteoritos
  m.root.rotation.z = (e.heading ?? e.rotation ?? 0)  // host: heading; cliente: spr.heading
  // banking: inclinar la nave al girar (ver 3.3)
  const turn = m.prevHeading !== undefined ? (m.root.rotation.z - m.prevHeading) : 0
  m.prevHeading = m.root.rotation.z
  m.body.rotation.x = Phaser.Math.Clamp(m.body.rotation.x * 0.9 + turn * 6, -0.6, 0.6)
}
for (const [obj, m] of this.meshes) if (obj.__isEnemy && !seen.has(obj)) { this._dispose(m); this.meshes.delete(obj) }
```

En cuanto una categoría está adoptada: en `Enemy.js` (host) y en `applySnapshot` (cliente),
`sprite.setVisible(false)` / `spr.glow.setVisible(false)` cuando `scene.three` existe. Mantener un
flag `THREE_DRAWS = { enemies: true, structures: true, lasers: true }` en `ThreeLayer.js` para poder
apagar categorías al depurar.

### 3.3 Diseño de naves 3D

No hay modelos de naves; se construyen **mallas procedurales low-poly** a partir del SVG existente
como "cartel" superior + casco extruido debajo. Receta por nave (en `_makeEnemy`):

```js
_makeEnemy(en) {
  const def = en.def ?? REGISTRY[en.type]
  const r = en.radius || 12
  const root = new THREE.Group()

  // 1. Casco: cono aplanado apuntando a +X (la convención de heading del juego)
  const hull = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.8, r * 2.4, 6),
    new THREE.MeshStandardMaterial({
      color: darken(def.color, 0.35), emissive: def.color, emissiveIntensity: 0.35,
      metalness: 0.6, roughness: 0.4, flatShading: true,
    }),
  )
  hull.rotation.z = -Math.PI / 2   // el cono mira a +X
  hull.scale.y = 0.45              // aplanado (vista cenital)

  // 2. Motor: glow additivo pulsante en la cola
  const engine = new THREE.Sprite(new THREE.SpriteMaterial({
    map: this.glowTex, color: 0x66ccff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  engine.position.set(-r * 1.2, 0, 1)
  engine.scale.set(r * 1.4, r * 0.9, 1)

  // 3. Halo de facción (reusar el patrón glow ya presente)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: this.glowTex, color: def.color, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  glow.scale.set(r * 4, r * 4, 1); glow.position.z = -1

  root.add(glow, hull, engine)
  this.scene.add(root)
  return { root, body: hull, engine, glow, t: Math.random() * 10 }
}
```

Detalles por tipo (variar la silueta, no solo el color):
- `grunt`: cono hexagonal base (receta de arriba).
- `runner`: casco más largo y fino (`hull.scale.set(1, 0.3, 0.7)`), dos motores pequeños.
- `brute`: `BoxGeometry` achatada + placas laterales (2 boxes), motor grande naranja.
- `saboteur`: `OctahedronGeometry` + anillo `TorusGeometry` fino girando (spin en `render`).
- `skirmisher`: casco en flecha (cone estirado) + 2 pods de misiles (cilindros pequeños).
- `artillery`: plataforma ancha + cañón cilíndrico largo que apunta al objetivo.
- `mothership`: ver FASE 9F (diseño propio, mucho más grande).

Animación por frame (en un `_updateShips(dt)` llamado desde `render()`): pulso del motor
`engine.material.opacity = 0.6 + 0.3*Math.sin(now*8 + e.t)` y **estela**: cada ~60 ms, spawn de una
partícula additiva en la cola que se desvanece 0.4 s (reusar el pool de explosiones o un
`THREE.Points` circular por nave con 8 posiciones históricas — más barato).

Presupuesto: ~200 enemigos × (2 sprites + 1 malla low-poly ≤ 60 tris) es trivial para WebGL.
**Compartir geometrías y materiales por TIPO** (cache `this._shipGeo[type]`), nunca crear
geometría por instancia; solo el `Group` y los sprites son por nave.

### 3.4 Torretas y estructuras 3D

`_makeStructure(s)` ya genera prisma extruido + edges neón + glow — activarlo para todas las
estructuras y añadir por rol:

- **Core**: `spin: 0.004` ya existe; añadir un `TorusGeometry` orbitando (anillo de energía) y un
  `PointLight` azul suave (ya existe `coreGlow`, moverlo con el core).
- **Torreta láser/misiles**: separar la malla en `base` (prisma estático) + `head` (cono/caja
  pequeña) y **rotar `head` hacia el último objetivo**. El host ya conoce el objetivo; para el
  cliente, derivar el ángulo del último beam recibido con origen en esa torreta (`rbeams`).
  Retroceso al disparar: `head.position.x = -recoil` decae a 0 en 120 ms.
- **Recolector**: 3 esferas pequeñas orbitando (mineral bits).
- **Batería**: barra vertical emissiva cuya `emissiveIntensity` sigue `gameState.energy/energyMax`.
- **Enjambre**: las esferas sanadoras (`scene.healers`, ya tienen `h.x/h.y`) se dibujan como
  `SphereGeometry(3)` emissiva rosa + trail corto; ocultar su sprite Phaser.
- **Estado sin energía** (`!s.powered`): `emissiveIntensity 0.35 → 0.06` y glow al 20% (el "apagón"
  se tiene que leer también en 3D).
- **En construcción** (`s.building`): malla con `opacity 0.35` + `wireframe` en un segundo material,
  y escalar de 0.4 → 1 con `buildProgress/buildTime`.

Estructuras usan el mismo `sync` que enemigos (host: `scene.structures`; cliente: `scene.sById`).
Al adoptarlas, `Structure` esconde su container Phaser **excepto** barras y acentos 2D si se decide
mantenerlos planos (recomendado: barras planas, cuerpo 3D).

### 3.5 Láseres 3D volumétricos

Sustituir el dibujo de beams de `fxGraphics` por beams 3D (mantener `drawBeam` 2D como fallback y
para el minimapa nada — el minimapa ignora fx). Diseño: **plano billboard estirado + núcleo blanco +
glow en boca y punto de impacto**:

```js
// ThreeLayer.beam(x1, y1, x2, y2, color, width, ttlMs)
beam(x1, y1, x2, y2, color, width, ttl) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const g = new THREE.Group()
  const mk = (w, opacity, col) => new THREE.Mesh(
    new THREE.PlaneGeometry(len, w),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  g.add(mk(width * 4, 0.25, color))   // halo exterior
  g.add(mk(width * 1.4, 0.9, color))  // cuerpo
  g.add(mk(width * 0.5, 1.0, 0xffffff)) // núcleo blanco caliente
  g.position.set((x1 + x2) / 2, (y1 + y2) / 2, 10)
  g.rotation.z = Math.atan2(y2 - y1, x2 - x1)
  // flash en boca + impacto
  const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  muzzle.position.set(x1, y1, 10); muzzle.scale.set(width * 8, width * 8, 1)
  const hit = muzzle.clone(); hit.position.set(x2, y2, 10); hit.scale.set(width * 12, width * 12, 1)
  this.scene.add(g, muzzle, hit)
  this.beams.push({ g, muzzle, hit, life: 0, max: ttl / 1000 })
}
```

Actualización: `opacity *= (1 - t)`; el bigbeam (`width 5`, ttl×3) además ondula el cuerpo con
`g.children[1].scale.y = 1 + 0.25*Math.sin(now*40)` → se lee como rayo pesado continuo.

Puntos de enganche (no duplicar la lógica): en `drawFx()` (host) y en el bucle `rbeams` de
`renderRemote()` (cliente), si `scene.three && THREE_DRAWS.lasers` llamar `scene.three.beam(...)`
**cuando el beam entra en la lista** (una vez, no por frame — marcar `l._3d = true`), y saltarse el
`drawBeam` 2D. Como `rbeams` ya llega con `[x1,y1,x2,y2,color,width,ttl,ttlBase]`, el cliente tiene
todos los parámetros → paridad automática.

### 3.6 Explosiones multi-etapa (mejorar `ThreeLayer.explode`)

La explosión actual es chispas + un anillo. Ampliar a 4 etapas (todas additivas, `depthWrite:false`):

1. **Flash** (0–80 ms): sprite blanco `glowTex`, escala `radius*6 → radius*9`, opacity 1→0. Vende el impacto.
2. **Bola de fuego** (0–350 ms): 3 sprites `glowTex` tintados (blanco→amarillo→color del muerto)
   con escalas escalonadas, creciendo `radius*1.5 → radius*3.5`, opacity 0.9→0.
3. **Chispas** (0–700 ms): el `THREE.Points` actual, pero con **gravedad hacia fuera + drag** (ya
   hay drag 0.92) y 30% de chispas "trazadoras" más rápidas y pequeñas.
4. **Onda de choque** (80–600 ms): el `RingGeometry` actual + un segundo anillo retrasado 120 ms a
   media opacidad. Para muertes grandes (`radius ≥ 40`, brute/mothership/estructuras), añadir
   **anillo de escombros**: 6–10 fragmentos `TetrahedronGeometry(2)` oscuros con spin, que se
   apagan en 1 s.

Firma sin cambios (`explode(x, y, color, radius)`) → host y cliente la disparan igual que hoy
(cliente vía `snap.fx.expl`). El shake 2D queda como está (ya sincronizado con la capa Three vía
`syncCamera`).

### 3.7 Criterios de aceptación 9C

- Ninguna entidad se ve doble; apagar `THREE_DRAWS.enemies` vuelve a mostrar los sprites 2D (flag de debug).
- 150+ enemigos en pantalla a 60 fps en una GPU integrada (verificar con la oleada 8+).
- Las torretas giran la cabeza hacia su objetivo y retroceden al disparar; láseres con núcleo
  blanco y glow de impacto; explosiones con flash + bola de fuego + onda + chispas.
- El cliente multijugador ve exactamente lo mismo (beams desde `rbeams`, explosiones desde `fx.expl`).
- Barras de HP, enlaces, ghost de construcción y minimapa siguen en 2D, nítidos, encima.

---

## 4. FASE 9D — Fondo galáctico y ambientación

Hoy: 1 nebulosa estática + 2400 estrellas twinkle + viñeta. Objetivo: profundidad y "espacio vivo".
Todo en `_buildBackground()` (`ThreeLayer.js`); assets en `public/assets/bg/` (`nebula1.jpg`,
`nebula2.png`, `nebula3.png` ya existen — usarlos todos).

1. **Banda galáctica**: plano ancho (proporción ~4:1) cruzando en diagonal (`rotation.z ≈ -0.5`),
   con `nebula2`, opacity 0.30, `factor` de parallax 0.02, tinte `0x8a93c8`. Es la "vía láctea".
2. **2–3 nebulosas de color** a distintas z (−900, −1200) y factores 0.05–0.09, tintes distintos
   (`0x6b4a8a` violeta, `0x2a5a7a` teal) — máscara radial `nebulaAlpha` ya existe, reusarla.
3. **Galaxias lejanas**: 4–6 sprites pequeños (elipses generadas por canvas con 2 gradientes
   radiales cruzados, o reusar `glowTex` achatado `scale.set(60, 22, 1)`), opacity 0.4, con
   `rotation.z` fijo aleatorio.
4. **Capa de polvo cercana**: 300 puntos grandes (size 12–20) MUY tenues (alpha ≤ 0.08), factor
   0.25 → da sensación de velocidad al panear.
5. **Estrellas fugaces**: cada 6–14 s, una línea additiva blanca que cruza un 15% de la pantalla en
   0.5 s y se desvanece (un `beam()` reciclado del 3.5 con ttl 500 y width 1 sirve).
6. **Color grading barato**: subir levemente el `setClearColor` a `0x050810` y añadir un
   `HemisphereLight` ya existe — no tocar la iluminación de gameplay.

Regla de legibilidad: el fondo NUNCA compite con el gameplay — saturación baja, alphas ≤ 0.5,
nada de movimiento rápido salvo las fugaces. Criterio: capturar pantalla en zoom 0.25 y verificar
que enemigos/estructuras se distinguen a primer golpe de vista.

---

## 5. FASE 9E — Enjambre sanador: una esfera, un edificio

Problema actual (`src/game/systems/healers.js`): todas las esferas llaman
`mostDamagedStructure(scene)` → el enjambre entero viaja en bola al mismo edificio y se re-asigna
en masa cuando se cura.

Diseño: **asignación por reclamo (claim)**. Cada esfera cura "su" edificio; dos esferas no
comparten objetivo mientras haya otros dañados.

```js
// systems/healers.js — sustituir la selección de objetivo
function claimTarget(scene, sphere) {
  // edificios dañados no reclamados, el más dañado primero; si todos están reclamados,
  // permitir compartir (mejor dos curando el core que esferas ociosas).
  const claimed = new Set(scene.healers.map((h) => h.target).filter(Boolean))
  let best = null, bestFrac = 1
  let bestShared = null, bestSharedFrac = 1
  for (const s of scene.structures) {
    if (s.dead || s.hp >= s.maxHp) continue
    const frac = s.hp / s.maxHp
    if (!claimed.has(s)) { if (frac < bestFrac) { bestFrac = frac; best = s } }
    else if (frac < bestSharedFrac) { bestSharedFrac = frac; bestShared = s }
  }
  return best || bestShared
}

// en updateHealers: reemplazar `h.target = mostDamagedStructure(scene)` por
h.target = claimTarget(scene, h)
```

Extras de comportamiento (baratos, gran efecto):
- **Histéresis**: no soltar el objetivo hasta `hp >= maxHp` (ya es así) — pero re-evaluar el claim
  solo cada 500 ms (`h.retarget -= dt`), no cada frame, para que no tiemblen entre objetivos.
- **Órbita al curar**: mientras cura (d ≤ 22), orbitar el edificio
  (`h.x = t.x + cos(now*0.004 + i)*18`) en vez de quedarse clavada — se lee como "reparando".
- **Ociosas**: la órbita alrededor del owner ya existe; separar fases por índice `i` (ya se hace).
- Visual: beam corto rosa esfera→edificio mientras cura (2D `beamGraphics` o el `beam()` 3D con
  width 1); en cliente derivable de nada → aceptar que es detalle host-only o añadir a `fx.mining`
  un array `healing` análogo (recomendado: campo `fx.heal = [[hx,hy,tx,ty],…]`).

`mostDamagedStructure` sigue exportada (la usa la UI o futuros consumidores) — no borrarla.

Criterio: colocar 1 Enjambre con 4 esferas y dañar 3 edificios → cada esfera va a un edificio
distinto; al sanar todos, las 4 vuelven a orbitar el Enjambre.

---

## 6. FASE 9F — Rebalance de IA: skirmishers, saboteadores y nave nodriza gigante

Archivos: `src/game/enemies/EnemyType.js` (REGISTRY), `src/game/balance.js` (`buildWaves`).
`validateRegistry()` valida las keys de behavior en boot — usar solo keys existentes
(`STRAIGHT/WEAVE/APPROACH_THEN_HOLD/KEEP_DISTANCE/STANDOFF`, `LIGHT_LASER/MELEE/BEAM/MISSILE/BIG_BEAM`, etc.).

### 6.1 Skirmisher: menos cantidad, foco en infraestructura

- `buildWaves()`: bajar `push(EnemyType.SKIRMISHER, 4 + (i - 2) * 6)` → `push(EnemyType.SKIRMISHER, 2 + (i - 2) * 2)`.
- `REGISTRY.skirmisher`: `targetPriority: 'GENERATOR'` → `'INFRA'` (baterías, recolectores,
  sanadores y nodos), `targetSecondary: 'DEFENSE'` se mantiene. Sube `reward` 16 → 20 (hay menos).

### 6.2 Saboteador: cazador de infraestructura con capacidades de skirmisher

El usuario quiere que el saboteador ataque batería/recolectores **con las mismas capacidades que el
skirm** (misiles a distancia, movilidad, evasión alta):

```js
[EnemyType.SABOTEUR]: {
  hp: 60, speed: 44, scale: 0.8, reward: 20,
  color: 0xd24aff, textureKey: 'enemy_saboteur',
  targetPriority: 'SUPPLY',        // nuevo grupo, ver abajo
  targetSecondary: 'INFRA',
  movement: 'KEEP_DISTANCE',       // antes APPROACH_THEN_HOLD
  attack: 'MISSILE',               // antes BEAM
  attackRange: 260, atkCooldown: 1800, damage: 12,
  splash: 40, projSpeed: 160,
  maxForce: 320, agility: 0.3,
  evasion: 'STRAFE_BURST', risk: 'CAUTIOUS', evasionChance: 0.80,
},
```

Nuevo grupo en `ROLE_GROUPS` (mismo archivo):
```js
SUPPLY: (s) => ['collector', 'battery'].includes(s.role),
```
(`resolveTarget` en `behaviors/targeting.js` ya resuelve prioridad→secundaria→core; no tocar.)

Diferenciación skirm vs saboteador tras el cambio (que no sean clones): el skirm mantiene
`targetSecondary: 'DEFENSE'` (acosa torretas), el saboteador `'INFRA'` (nunca pica a defensa por
voluntad propia). Colores/silueta ya los distinguen.

### 6.3 Nave nodriza mucho más grande

`REGISTRY.mothership`: `scale: 1.7 → 3.4`, `hp: 440 → 900`, `attackRange: 220 → 300`,
`damage: 35 → 45`, `speed: 18 → 13`, `reward: 160 → 320`. En `buildWaves`, bajar la cantidad
(`1 + (i - 6)` → `1 + Math.floor((i - 7) / 2)`) — una nodriza gigante debe ser EVENTO, no plaga.

Diseño 3D (en `_makeEnemy`, rama `mothership`): disco central `CylinderGeometry(r, r*1.15, r*0.5, 12)`
violeta oscuro + anillo `TorusGeometry(r*1.4, r*0.12)` emissivo girando lento + 4 torretas
(conos pequeños) en cruz + 3 motores traseros con glow grande + **luz puntual propia**
(`PointLight` violeta, intensidad 0.6, radio 500) → ilumina meteoritos al pasar. Al morir:
`explode()` con `radius = 90` + 3 explosiones secundarias retardadas 150/300/450 ms en offsets
aleatorios dentro del casco (el host las encola normal → el cliente las ve).

Nota host/cliente: el tamaño del enemigo en cliente sale de la textura/las mallas por tipo, no del
snapshot — al cambiar `scale` del REGISTRY, ambos lados lo leen del mismo sitio. Verificar que la
barra de HP del cliente usa `spr.escala` (ya lo hace en `renderRemote`).

### 6.4 Criterios de aceptación

- Oleada 5: contar skirmishers ≈ un tercio de lo que había; se van a por recolectores/baterías.
- Saboteadores orbitan a 260 px de recolectores/baterías lanzando misiles, esquivando como skirm.
- La nodriza se ve inmensa (≈ 2× el core), tanquea, y su muerte es un espectáculo multi-explosión.
- `validateRegistry()` no lanza en boot (probar `npm run dev` y mirar consola).

---

## 7. FASE 9G — Spawn de oleada aleatorio + panel de análisis de la oleada

### 7.1 Spawn aleatorio multi-sector

Hoy `buildWaves` fija `dir` de una tabla `DIRECTIONS` y `spawnEnemy` abre ±0.45 rad. Cambios en
`src/game/balance.js` y `src/game/systems/waves.js`:

- `buildWaves`: eliminar `DIRECTIONS`; `dir: Math.random() * Math.PI * 2` por oleada.
- Oleadas 4+: **2 sectores**; oleadas 8+: **3 sectores**. Representar `dirs: [a1, a2, …]` en la
  def de la oleada; `spawnEnemy` elige `w.dirs[k % w.dirs.length]` rotando por spawn (así los
  grupos se reparten de verdad, no al azar con rachas).
- Guardar también en `gameState.waveDirs` (array de ángulos) para que el HUD pinte flechas.

### 7.2 Análisis de la oleada entrante (HUD)

Durante la intermisión el jugador debe poder ver QUÉ viene y POR DÓNDE:

- `startNextWave` ya conoce `def.list`; calcular el resumen ANTES (en `updateWaves`, al entrar en
  intermission, del `scene.waves[w.index]` siguiente):

```js
// systems/waves.js — al entrar en intermission
const next = scene.waves[w.index] // la siguiente (index aún no incrementado)
if (next) {
  const counts = {}
  for (const t of next.list) counts[t] = (counts[t] || 0) + 1
  gameState.nextWave = { counts, dirs: next.dirs, hasBoss: next.hasBoss }
} else gameState.nextWave = null
```

- `gameState.js`: añadir `nextWave: null` (y a `resetGameState()` — **debe espejar cada campo**).
- `Hud.vue`: panel "Oleada N entrante" en la intermisión: fila por tipo con el glifo/color del
  REGISTRY (exportar un mapa `key → {color, label}`), cantidad, y una brújula minimal (círculo con
  flechas en los ángulos de `dirs`). Aviso `⚠ NAVE NODRIZA` si `hasBoss`.
- Multijugador: `nextWave` es parte de `gameState` → añadirlo al bloque `eco` del snapshot para que
  el cliente lo vea (es JSON pequeño, ~12 Hz lo aguanta; enviarlo solo si cambió es opcional).
- Marcadores de mundo: durante la intermisión, dibujar en el borde del mapa un glow rojo pulsante
  por cada dir (2D Graphics en `beamGraphics` o un sprite; también visible en minimapa si es barato).

Criterio: en la intermisión se ve la composición exacta y las flechas; los enemigos entran por ahí.

---

## 8. FASE 9H — Mapa más grande

`src/game/balance.js`:
```js
export const WORLD = { width: 10800, height: 7200 }   // antes 7200×4800 (+50%)
export const METEOR = { count: 140, minDist: 400, maxDist: 4500, amountMin: 1500, amountMax: 3000 }
export const CAMERA = { minZoom: 0.18, /* resto igual */ }
```
- Revisar consumidores de `WORLD`: `spawnEnemy` (radio de spawn: usa `hypot(w,h)*0.48` — escala
  solo), `worldgen.populateMeteorites` (`maxDist` debe crecer o el anillo exterior queda vacío),
  minimapa en `GameScene`/HUD (escala por WORLD — verificar que no hay constantes duras),
  `ThreeLayer` (usa `WORLD` para el parallax — ok), `sync.js createRemote` (centerOn — ok).
- El fondo de `_buildBackground` reparte estrellas en 3600×2400 alrededor del centro: multiplicar
  esos rangos ×1.6 para cubrir el paneo extra.
- Densidad: +50% de área ⇒ `METEOR.count` 80 → 140 mantiene la densidad aprox.; si el early game
  se siente pobre cerca del core, bajar `minDist` a 350.

Criterio: paneando a cualquier esquina hay estrellas y meteoritos; el minimapa cubre todo el mundo;
las oleadas siguen llegando desde fuera de la vista.

---

## 9. FASE 9I — Ordenamiento visual de la red de nodos

Problema: con muchos nodos los enlaces se cruzan y la red se lee mal. Sin cambiar las REGLAS de
red (`energyNet.js`: enlaza si un extremo es relay, `maxPorts` gana el más cercano, BFS desde el
core), mejorar la LECTURA y la COLOCACIÓN:

1. **Jerarquía visual de enlaces** (`drawLinks` en `systems/energyNet.js`): enlaces core↔relay más
   gruesos (3 px) y brillantes; relay↔hoja finos (1.5 px); enlaces sin energía (rama no alimentada)
   en gris punteado (`lineStyle` alpha 0.25 + segmentos). Pulso de flujo: un punto que viaja del
   padre al hijo cada ~1.2 s en enlaces con energía (barato: 1 fillCircle por enlace interpolando).
2. **Snap de colocación** (`systems/placement.js` — `updateGhost`/`tryPlace`): al colocar CERCA de
   un relay (dentro de su `range`), imantar la posición a la **rejilla radial** del relay: anillos
   a 60/110/160 px y 12 rayos; snap si el cursor está a <14 px de una intersección libre (respetar
   `BUILD.overlapRadius`). Mostrar en el ghost los puntos de snap del anillo actual (puntitos
   tenues). Resultado: colonias ordenadas en anillos sin obligar (lejos del relay, colocación libre).
3. **Indicador de puertos**: al seleccionar/hover un relay, dibujar `usados/maxPorts` como muescas
   alrededor (el dato ya existe: contar `scene.links` que tocan el relay).
4. El cliente ya reusa `drawLinks` desde el snapshot → 1 y 3 le llegan gratis; el snap (2) es
   input del host/cliente local y no necesita sync (el intent `build` ya manda x/y snappeados).

Criterio: una base de 10+ nodos se lee como árbol (troncos gruesos, hojas finas, ramas muertas
grises); construir alrededor de un nodo produce anillos limpios sin esfuerzo.

---

## 10. FASE 9J — Tuning: láseres, ramas y comandante

`src/game/balance.js` + `src/game/structures/upgrades.js`. Ajustes de datos (sin código nuevo):

### 10.1 Torreta láser base
El cooldown base 4000 ms se siente muerto y hace que `laser_a` (×0.12 ⇒ 480 ms) sea LA opción.
- Base: `cooldown: 4000 → 1400`, `damage: 20 → 11`, `atkRange: 140 → 150` (DPS base ≈ igual pero
  la torreta se siente viva).
- `laser_a` (Ráfaga): `cooldown: 0.12 → 0.38` (⇒ ~530 ms), `damage: 0.5 → 0.6`.
- `laser_a2` (Triple): `atkRange: 2.2 → 1.6` (con base 150 ⇒ 240; 330 era medio mapa en zoom).
- `laser_b` (Cañón): `cooldown: 1.8 → 2.2`, `damage: 1.6 → 2.2`, mantener `atkRange: 2.0` — sniper real.
- `laser_b2` (Progresivo): subir `COMBAT.bigbeamRampStep 0.12 → 0.16` (llega antes al techo, se
  siente el "carga y funde"); el resto igual.

### 10.2 Ramas nuevas (una tercera opción por rama existente donde falta simetría)
- `heal_b2` (`requires: 'heal_b'`): "Nano-reparación" — `healRate: 1.4`, `tint: 0x9ae8ff`,
  `decor: 'wide'` (la rama B hoy muere en tier 1).
- `bat_b2` (`requires: 'bat_b'`): "Reactor" — `energyRate: +3` adicional, `energyCap: 1.2`,
  `tint: 0x4dff9a`, `decor: 'plasma'`.
- Los campos aditivos vs multiplicativos siguen la convención de cada `applyUpgrade` de subclase —
  revisar `Battery.js`/`Healer.js` antes de elegir el nombre del campo (p.ej. `energyRate` en
  `bat_b` es aditivo hoy).

### 10.3 Comandante (General)
- `GENERAL.cooldown: 450 → 380`, `collectRate: 18 → 22` (que dé gusto microgestionarlo).
- Rama de mando: `gen_b2` además de buff, **aura visible**: círculo tenue `buffRadius` alrededor
  del General cuando tiene `gen_b2` (2D Graphics, alpha 0.08 + borde 0.25, color `0x3a8bff`) —
  hoy el buff es invisible y nadie lo entiende. En cliente: el buff no viaja; añadir flag
  `hasCmdAura` al array `gen` del snapshot (posición 6) y dibujarla en `renderRemote`.
- Tier 3: `gen_a3` "Andanada" (`requires: 'gen_a2'`, `cost: 180`, `damage: 1.3`, dispara 2
  proyectiles — implementar en `General.js` como `volley: 2` si existe el hook de disparo; si no,
  solo stats) y `gen_b3` "Logística" (`requires: 'gen_b2'`, `cost: 180`, `collectRate: 1.4`,
  `speed: 1.15`).
- `Hud.vue` lee las ramas por `forRole: 'general'` dinámicamente — verificar que los tiers nuevos
  aparecen sin tocar el HUD (getUpgradesFor ya filtra por `requires`).

### 10.4 Criterio
Partida en normal: ambas ramas de láser son elecciones defendibles (medir: tiempo de despeje de la
oleada 6 similar ±20%); el General con rama B se nota (aura visible, economía más rápida).

---

## 11. Presupuesto de rendimiento y reglas de calidad

- **60 fps con 200 enemigos** en GPU integrada. Medios: geometrías/materiales compartidos por tipo,
  `THREE.Points` para partículas (nunca 1 mesh por chispa), pools para beams/explosiones (reciclar
  en vez de crear/dispose por disparo — con láseres a 500 ms de cooldown × 30 torretas, crear
  mallas por beam sin pool genera GC hitching: hacer pool desde el principio).
- `dispose()` de `ThreeLayer` debe liberar todo lo nuevo (beams, ships, structures): ampliar el
  método existente; fugas de GPU al reiniciar partida son bug bloqueante (la escena se recrea en
  cada `restart`).
- Additive blending + `depthWrite:false` en TODO lo emisivo (patrón ya establecido en el archivo).
- Nada de postprocesado (EffectComposer/bloom real) en esta fase: el "bloom" se finge con sprites
  glow — mantiene el presupuesto y evita otro sistema.
- Cada sub-fase termina con `npm run build` limpio y una pasada manual en `npm run dev`
  (host single-player) + una partida host+cliente en dos pestañas para 9B/9C/9G.

## 12. Orden de implementación y checklist final

| # | Fase | Riesgo | Depende de |
|---|------|--------|------------|
| 1 | 9A explosiones (hecho, verificar) | — | — |
| 2 | 9B paridad snapshot | bajo | — |
| 3 | 9E enjambre | bajo | — |
| 4 | 9F IA + nodriza (datos) | bajo | — |
| 5 | 9G spawn + panel oleada | medio | 9B (snapshot) |
| 6 | 9H mapa grande | medio | — |
| 7 | 9J tuning ramas/comandante | bajo | — |
| 8 | 9D fondo galáctico | medio | — |
| 9 | 9C remaster 3D naves/torretas/láseres/explosiones | **alto** | 9B, 9D |
| 10 | 9I red de nodos | medio | — |

Checklist de cierre:
- [ ] `npm run build` limpio.
- [ ] Sin dobles dibujados 2D/3D (flag `THREE_DRAWS` permite comparar).
- [ ] Host y cliente indistinguibles en una oleada completa.
- [ ] `resetGameState()` espeja todos los campos nuevos (`nextWave`, …).
- [ ] `validateRegistry()` pasa (consola limpia en boot).
- [ ] Reiniciar partida 3 veces seguidas sin fuga de memoria GPU (DevTools → Performance monitor).
- [ ] 60 fps en oleada 8 con zoom mínimo.
