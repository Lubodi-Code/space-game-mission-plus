# Roadmap de arquitectura — Sistemas v2 (clases, energía, nodos, torretas, enemigos, assets, general, multijugador)

> Documento maestro de arquitectura. Define **qué** construir, **por qué** y **en qué orden**.
> Cada fase se entrega a una IA implementadora (DeepSeek) con su propio prompt autocontenido.
> Proyecto: **Phaser 3.90 + Vue 3 + Vite**, JS / ES modules. HUD en Vue, simulación en Phaser,
> puente reactivo vía [gameState.js](../src/game/gameState.js) y eventos vía [bus.js](../src/game/bus.js).
> Rutas relativas a la raíz del repo.

---

## 0. Estado actual (punto de partida)

| Sistema | Hoy | Archivo |
|---|---|---|
| Estructuras | Objetos planos `{...}` creados en `addStructure`; lógica por `role` dispersa en la escena | [GameScene.js:363](../src/game/scenes/GameScene.js#L363) |
| Red de energía | BFS desde el núcleo; **cualquier** estructura enlaza con cualquier otra dentro de `max(range)` | [GameScene.js:473](../src/game/scenes/GameScene.js#L473) |
| Energía | `gameState.energy / energyMax` **existen pero no se usan** | [gameState.js:11](../src/game/gameState.js#L11) |
| Minería | Recolectores producen solo minerales | [GameScene.js:641](../src/game/scenes/GameScene.js#L641) |
| Batería | Solo suma `capBonus` al tope de minerales | [balance.js:114](../src/game/balance.js#L114) |
| Torretas | `laser` ("Torreta") y `missile` ("Misiles"); disparo continuo; sin ramas ni construcción | [balance.js:147](../src/game/balance.js#L147) |
| Enemigos | Clase `Enemy` data-driven (REGISTRY + comportamientos); **un** objetivo; render SVG | [Enemy.js](../src/game/enemies/Enemy.js), [EnemyType.js](../src/game/enemies/EnemyType.js) |
| Construcción | Instantánea, sin barra de progreso | [GameScene.js:286](../src/game/scenes/GameScene.js#L286) |
| General / jugador | No existe | — |
| Multijugador | No existe | — |

**Lección clave de arquitectura:** los enemigos ya usan un patrón excelente (clase + registro de
datos + comportamientos intercambiables). Las **estructuras NO** lo usan: son objetos planos con
`if (s.role === 'collector')` repartidos por la escena. La Fase 0 lleva las estructuras al mismo
patrón que los enemigos. Todo lo demás se apoya en eso.

---

## 1. Principios de diseño (válidos para todas las fases)

1. **Data-driven primero.** Comportamientos y números viven en registros/definiciones, no en `if`
   esparcidos. Igual que [EnemyType.js](../src/game/enemies/EnemyType.js).
2. **Simulación en Phaser, presentación en Vue.** El HUD nunca toca la escena directamente: lee
   `gameState` reactivo y emite intents por `bus`. Mantener ese límite.
3. **Sin regresiones.** Cada fase termina con `npm run dev` arrancando sin errores y las fases
   anteriores intactas. Criterios de aceptación explícitos por fase.
4. **Rendimiento como requisito, no como adorno.** El objetivo es ~200 enemigos fluidos en PC y
   móvil (Fase 4). Las decisiones de render y de bucle se toman pensando en ese tope.
5. **Cada fase es un prompt.** Autocontenida, con mapa de archivos, cambios exactos y aceptación.

---

## 2. Mapa de fases y dependencias

```
Fase 0  Refactor a sistema de clases de estructuras      (FUNDACIÓN)
          │
          ├─ Fase 1  Economía de energía + batería  ──────┐
          │                                                │
          └─ Fase 2  Red de nodos + señal/radar  ──────────┤
                          │                                 │
                          └─ Fase 3  Torretas láser/misiles + ramas + construcción + autofire
                                          │
Fase 4  Enemigos: doble objetivo + más disparos + render ASCII + 200 unidades
                                          │
Fase 5  Assets / texturas PNG (look dimensional de espacio)
                                          │
Fase 6  Mini-nave "General" (gate de construcción + respawn)
                                          │
Fase 7  Multijugador (co-op, host autoritativo)
```

**Fases 0–3** son el núcleo de "optimizar el sistema" y se entregan juntas en el **primer prompt**
([PROMPT-deepseek-fase0-3-sistemas.md](./PROMPT-deepseek-fase0-3-sistemas.md)).
**Fases 4–7** se especifican aquí a nivel de arquitectura y reciben su propio prompt cuando toque.

---

## 3. FASE 0 — Refactor a sistema de clases de estructuras  *(fundación)*

### Objetivo
Convertir las estructuras de objetos planos a una jerarquía de clases, espejo del patrón de
enemigos. Sin cambios de jugabilidad visibles: es puramente estructural y habilita el resto.

### Arquitectura nueva
```
NUEVOS
  src/game/structures/Structure.js          # clase base: hp, powered, building, hpBar, update()
  src/game/structures/StructureRegistry.js   # defs (migradas de balance.js) + factory create()
  src/game/structures/Core.js                # Núcleo / Nexo
  src/game/structures/Node.js                # Nodo (relay, puertos) — lógica en Fase 2
  src/game/structures/Collector.js           # minería (+ energía en Fase 1)
  src/game/structures/Battery.js             # almacenamiento (energía en Fase 1)
  src/game/structures/Healer.js              # enjambre (mueve la lógica de updateHealers)
  src/game/structures/LaserTurret.js         # torreta láser (ramas en Fase 3)
  src/game/structures/MissileTurret.js       # torreta de misiles (ramas en Fase 3)

MODIFICADOS
  src/game/scenes/GameScene.js               # this.structures = instancias; loop llama s.update()
  src/game/balance.js                        # STRUCTURES se re-exporta desde StructureRegistry
  src/components/Hud.vue                      # sigue leyendo defs para la barra de construcción
```

### Contrato de la clase base `Structure`
- Estado: `x, y, hp, maxHp, powered, building, buildProgress, role, def, container, shape, hpBar`.
- Métodos: `update(dt, world, time)`, `damage(dmg, world)`, `destroy()`, `drawHpBar()`,
  `onBuilt()` (hook al terminar construcción).
- Cada subclase sobreescribe `update()` con su comportamiento (minar, disparar, curar…).
- `StructureRegistry.create(key, x, y, scene)` devuelve la instancia correcta.

GameScene deja de tener `updateMining`/`updateCombat`/`updateHealers` con `if (role===...)`: el
bucle hace `for (const s of this.structures) s.update(dt, world, time)`. La red, la colocación y el
daño quedan en GameScene (o en un `StructureSystem`), pero la **conducta por tipo** vive en la clase.

### Aceptación
- El juego se comporta **idéntico** a hoy (minar, construir, torretas, curar, oleadas).
- GameScene ya no contiene ramas `if (s.role === '...')` para conducta; cada tipo es una clase.

---

## 4. FASE 1 — Economía de energía + batería

### Objetivo (requisitos del usuario)
- Minar da **recursos y energía**; la energía se almacena.
- El **núcleo** mantiene/almacena energía; la **batería** amplía ese almacén.
- Si la energía llega a 0 → el sistema "pierde corriente": los **consumidores dejan de funcionar**
  (torretas no disparan). La batería es clave.
- Mejora de batería: **auto-recargable** (genera algo de energía sola cuando ya no hay meteoritos
  que minar).

### Modelo
Pool global de energía en `gameState.energy / energyMax` (ya existen, hoy sin uso).
- **Producción:** cada `Collector` powered suma `energyRate` (energía/s) además de minerales.
- **Almacén:** `energyMax = CORE.energyCap + Σ batería.energyCap`. Recalcular al construir/destruir.
- **Consumo:** cada consumidor (torreta láser, torreta misiles, enjambre) define `energyDrain`
  (energía/s mientras está operativo / al disparar). El láser drena al disparar; el enjambre, al
  generar esferas.
- **Tick:** `energy = clamp(energy + (producción − consumo)·dt, 0, energyMax)`.
- **Brownout:** un consumidor solo opera si `powered && gameState.energy > 0`. Cuando `energy === 0`
  las torretas no disparan ni drenan; recolectores y núcleo siguen (generan/almacenan) para
  permitir recuperarse. Señal visual: estructuras en brownout parpadean / bajan alfa.
- **Batería auto-recarga (upgrade):** flag por instancia; cuando no haya meteoritos minables
  (`world.meteorites` todos `depleted`), las baterías con el upgrade suman una tasa pequeña de
  energía propia. Conecta con el sistema de mejoras de la Fase 3.

### Archivos
`Collector.js` (+energía), `Battery.js` (energyCap + auto-recarga), `LaserTurret/MissileTurret/Healer`
(energyDrain + gate), `StructureRegistry`/`balance.js` (números: `energyRate`, `energyCap`,
`energyDrain`), `gameState.js` (recálculo de `energyMax`), `Hud.vue` (barra de energía ya existe en
[Hud.vue:137](../src/components/Hud.vue#L137) — pasarla a estado real y añadir aviso de brownout).

### Aceptación
- Minar sube minerales **y** energía. Sin recolectores, la energía baja al disparar y, en 0, las
  torretas dejan de disparar visiblemente. Construir batería sube `energyMax`. Con baterías
  auto-recargables y meteoritos agotados, la energía se mantiene > 0 a baja tasa.

---

## 5. FASE 2 — Red de nodos + señal / radar

### Objetivo (requisitos del usuario)
- Los **nodos son los únicos conectores**: la única forma de unir cosas (p. ej. dos torretas) es a
  través de un nodo. **No** se conecta torreta↔torreta directamente.
- Cada nodo tiene **solo 5 puertos** (máximo 5 enlaces).
- **Señal/radar:** una estructura construida lejos del nexo, sin un nodo (o el núcleo) que la cubra,
  **no tiene señal** → se apaga y deja de funcionar (no dispara, no mina).

### Reglas de enlace (reescritura de `recomputeNetwork`)
Hoy enlaza cualquier par con `d <= max(a.range, b.range)` ([GameScene.js:478](../src/game/scenes/GameScene.js#L478)).
Nuevas reglas:
1. Un enlace es **legal** solo si al menos uno de los extremos es **nodo o núcleo** (los nodos/núcleo
   son *relays*). Enlace no-nodo ↔ no-nodo = ilegal (no se forma).
2. Distancia: `d <= max(rangeRelay, rangeOtro)` como hoy, pero solo entre legales.
3. **Puertos:** núcleo y cada nodo tienen `maxPorts` (núcleo p. ej. 8, nodo 5). Al recomputar, si un
   relay supera sus puertos, conservar los enlaces más cercanos y descartar el resto (los descartados
   pueden dejar a la otra estructura sin energía → brownout).
4. **Flood de potencia (BFS):** desde el núcleo, solo por enlaces legales y dentro de puertos. Una
   estructura sin ruta al núcleo = `powered = false` (= sin señal → apagada). Esto implementa
   "lejos del nexo → sin señal → deja de funcionar" de forma natural.

### Colocación (`canConnectAt`, `tryPlace`)
- Colocar un **nodo**: válido si está en rango de un relay powered (nodo/núcleo) con **puerto libre**.
- Colocar un **no-nodo** (torreta, recolector, batería…): válido si está en rango de un relay powered
  con puerto libre. Si no hay relay cerca → inválido (feedback rojo).
- Vista previa (`updateGhost`): mostrar a qué relay se engancharía y si quedan puertos.

### Archivos
`GameScene.js` (`recomputeNetwork`, `canConnectAt`, `updateGhost`, `drawLinks`), `Node.js`
(`maxPorts`, conteo de puertos), `StructureRegistry`/`balance.js` (`maxPorts` por tipo; quitar
`range` de no-relays o reinterpretarlo como "rango de enganche").

### Aceptación
- Dos torretas juntas **sin** nodo: una/ambas quedan sin energía. Con un nodo entre ellas: ambas
  encendidas. Un nodo con 6 estructuras en rango solo alimenta 5 (la 6.ª queda en brownout). Una
  torreta lejos del nexo sin nodo intermedio: apagada (sin señal).

---

## 6. FASE 3 — Torretas láser/misiles: ramas de mejora + construcción + autofire

### 6.1 Renombrado
`laser` → **"Torreta Láser"**, `missile` → **"Torreta de Misiles"** (label + tooltip).

### 6.2 Sistema de mejoras (data-driven)
`src/game/structures/upgrades.js`: árboles por tipo de torreta. Cada instancia guarda su `path`
(ramas elegidas). Un upgrade aplica *deltas* a stats (`atkRange`, `cooldown`, `damage`, estilo de
proyectil, comportamiento de rayo). UI: seleccionar una torreta abre un panel Vue con las ramas
disponibles; elegir cuesta minerales y reconfigura la instancia.

**Torreta Láser** — base: láser pequeño, recarga **~20 s** (`cooldown: 20000`).
- **Rama A — Rápida/corta:** −radio, −recarga, +cadencia (ráfagas pequeñas rápidas).
  - **A2 (sub-rama):** cambia **todo el estilo** del disparo (p. ej. rayo continuo / dispersión tipo
    escopeta / cadena entre objetivos).
- **Rama B — Radio amplio:** +radio, +recarga (trade-off).
  - **B2 — Anti-grande (progresión):** el rayo **dura más**, **prioriza el objetivo más grande**
    (por `radius`/`maxHp`) y hace **daño progresivo** (poco al inicio, mucho si mantiene el haz sobre
    el mismo blanco grande — *ramp* mientras no cambie de objetivo).

**Torreta de Misiles** — base: tanda de misiles guiados.
- **Rama C — Enjambre corto:** +número de misiles, −alcance.
- **Rama D — Largo alcance:** +alcance/+lejos, −cadencia (recarga más lenta).
- **Rama E — Precisión:** misiles más precisos (menos dispersión, mejor seguimiento/`turnRate`).
- **Rama F — Daño:** +daño de misil.

### 6.3 Tiempo de construcción + barra
Cada def gana `buildTime` (ms). Al colocar, la estructura entra en estado `building`: muestra **barra
de construcción**, no es funcional (no dispara/mina/enlaza con plena potencia) hasta `onBuilt()`.
Reusar el patrón de barra de HP ([GameScene.js:404](../src/game/scenes/GameScene.js#L404)) para la
barra de progreso.

### 6.4 Disparo automático / objetivo fijo
Cada torreta tiene `fireMode`: `auto` (más cercano en rango — actual) o `focus` (bloqueada en un
enemigo concreto). Interacción: seleccionar torreta → botón "modo" en el panel; en `focus`, clic en
un enemigo lo fija como objetivo prioritario mientras viva/esté en rango.

### 6.5 Selección/inspección de estructuras
Nueva interacción: clic (sin estar colocando) sobre una estructura la **selecciona** → emite por
`bus` (`select`, payload con datos de la instancia) → `Hud.vue` muestra panel de mejoras/modo.
Mantener el patrón Vue↔Phaser existente.

### Archivos
`LaserTurret.js`, `MissileTurret.js`, `upgrades.js`, `Structure.js` (estado `building`/selección),
`GameScene.js` (selección por clic, barra de construcción, fireMode), `balance.js` (números base +
`buildTime`), `bus.js` (eventos `select`/`upgrade`/`fireMode`), `Hud.vue` (panel de inspección).

### Aceptación
- Láser base recarga ~20 s; rama A dispara mucho más rápido con menos radio; A2 cambia el estilo;
  B2 hace daño creciente sobre jefes priorizando el más grande. Misiles: C lanza más con menos
  alcance; D llega más lejos más lento; E afina; F pega más. Toda estructura muestra barra de
  construcción y no funciona hasta completarla. Una torreta en `focus` ataca solo a su blanco fijo.

---

## 7. FASE 4 — Enemigos: doble objetivo + más disparos + render ASCII + 200 unidades

### 7.1 Doble objetivo (prioritario + secundario)
Cada tipo en `REGISTRY` gana `targetPriority` y `targetSecondary` (grupos de rol). El targeting elige
el más cercano del grupo prioritario; si no existe ninguno, cae al secundario; si tampoco, al núcleo.
- Añadir grupo de rol `NODE`/`RELAY` y `GENERATOR` (recolectores) a `ROLE_GROUPS`
  ([EnemyType.js:11](../src/game/enemies/EnemyType.js#L11)).
- Ejemplos: GRUNT → prioritario `DEFENSE` (torretas), secundario `CORE`. SABOTEUR/otros → prioritario
  `NODE` o `GENERATOR`, secundario `CORE`.

### 7.2 Más enemigos con disparo
Nuevo ataque `LIGHT_LASER` (bolt rápido o hitscan corto, poco daño). La mayoría de tipos lanzan un
par de láseres pequeños; los BRUTE también; ARTILLERY/SKIRMISHER mantienen misiles. Ampliar
[behaviors/attack.js](../src/game/enemies/behaviors/attack.js).

### 7.3 Render ASCII (rendimiento)
Para sostener ~200 unidades, ruta de render alternativa: cada enemigo es un **glifo ASCII**
(`BitmapText` de un atlas de fuente generado una vez) tinteado por tipo, en vez de sprite SVG +
glow + graphics individuales. Hoy cada `Enemy` crea `sprite + glow + bar (Graphics)`
([Enemy.js:37](../src/game/enemies/Enemy.js#L37)) — eso no escala a 200.

### 7.4 Rendimiento a 200 (PC + móvil)
- **Grid espacial** (hash) para `separate`, targeting y `avoidObstacles` (hoy O(n²) en
  [steering.js](../src/game/enemies/behaviors/steering.js) y targeting).
- **Pooling** de enemigos y proyectiles (no `new`/`destroy` por unidad cada oleada).
- **Una** Graphics compartida para todas las barras de HP (no una por enemigo).
- **Throttle** del recálculo de objetivo (cada N frames, no cada frame).
- Subir topes de oleada en [balance.js `buildWaves`](../src/game/balance.js#L199) hacia ~200 pico.

### Aceptación
- 200 enemigos en pantalla mantienen framerate jugable en PC y en un móvil de gama media. Los
  enemigos eligen objetivo prioritario y caen al secundario cuando no existe. La mayoría dispara
  láseres pequeños; algunos, misiles.

---

## 8. FASE 5 — Assets / texturas PNG (look dimensional de espacio)

### Objetivo
Sustituir el look vectorial/canvas por **PNG / sprite-sheets** con sombreado más "dimensional" y
fondos de espacio (nebulosas) por capas.

### Arquitectura
- `public/assets/` con subcarpetas `structures/`, `enemies/`, `bg/`, `fx/` + un `manifest.json`.
- Carga en [BootScene](../src/game/scenes/BootScene.js) vía `this.load.atlas` / `this.load.spritesheet`.
- Estructuras y enemigos pasan a `Sprite` con animación (idle/disparo/daño) donde aporte.
- Fondo: capas de nebulosa PNG con parallax sobre el starfield actual ([GameScene.js:1096](../src/game/scenes/GameScene.js#L1096)).
- Mantener fallback procedural (texturas canvas actuales) si falta un asset.
- Nota: el render ASCII (Fase 4) y el de sprites coexisten; ASCII es el modo de alto rendimiento.

### Aceptación
- El juego carga atlas PNG; estructuras/enemigos/fondo se ven con volumen y estética de espacio; sin
  caída notable de rendimiento; fallback procedural si falta un asset.

---

## 9. FASE 6 — Mini-nave "General"

### Objetivo (requisitos del usuario)
Una mini-nave controlable = nuestro **general**. **Si el general muere, no se puede construir** hasta
que reaparezca; tiene **tiempo de respawn**.

### Arquitectura
- Nueva entidad `src/game/General.js` (no es Structure ni Enemy): nave del jugador, movimiento por
  WASD/clic, HP, puede ser objetivo de enemigos.
- Gate de construcción: `tryPlace` solo procede si `general.alive` (opcional: solo cerca del general).
- Muerte → `gameState.general.alive = false`, deshabilitar barra de construcción en `Hud.vue`,
  arrancar `respawnTimer`; reaparece en el núcleo al expirar.
- Estado en `gameState` (`general: { alive, hp, respawnIn }`) para el HUD.

### Aceptación
- El general se mueve y recibe daño. Al morir, no se puede colocar nada y el HUD muestra cuenta atrás
  de respawn; al reaparecer, se puede volver a construir.

---

## 10. FASE 7 — Multijugador (co-op, host autoritativo)

### Objetivo
Modo multijugador. Es la fase más grande y arriesgada → va al final, sobre una base ya estable.

### Arquitectura recomendada
- **Co-op** sobre un nexo compartido. **Host autoritativo:** un jugador hospeda y corre la simulación;
  los demás son clientes que **envían inputs** (construir, mover su general, mejorar) y **reciben
  snapshots** de estado para renderizar.
- Transporte **WebRTC P2P** con **PeerJS** para señalización (sin servidor propio) o, si se prefiere
  central, un pequeño relay WebSocket en Node.
- Evitar lockstep determinista: con ~200 enemigos y físicas en float, sincronizar por snapshots del
  host es más robusto.
- Separar **simulación** (solo host) de **render/HUD** (todos). El refactor de clases (Fase 0) y la
  separación Vue/Phaser ya existentes facilitan esto: el cliente aplica snapshots a sus instancias.
- Cada jugador controla su propio General (Fase 6); el nexo y las estructuras son compartidos.

### Aceptación (alto nivel)
- Dos clientes en la misma partida ven el mismo estado; ambos construyen y mueven su general; las
  oleadas y la economía son consistentes en host y clientes.

> Esta fase requiere investigación adicional (PeerJS vs relay, modelo de snapshots, reconexión) y se
> especificará en detalle en su propio prompt cuando las Fases 0–6 estén entregadas.

---

## 11. Resumen de archivos nuevos por fase

| Fase | Nuevos principales |
|---|---|
| 0 | `src/game/structures/{Structure,StructureRegistry,Core,Node,Collector,Battery,Healer,LaserTurret,MissileTurret}.js` |
| 1 | (sin archivos nuevos; lógica de energía en las clases + `gameState`) |
| 2 | (sin archivos nuevos; reescritura de red en `GameScene` + `Node`) |
| 3 | `src/game/structures/upgrades.js` + panel de inspección en `Hud.vue` |
| 4 | grid espacial + atlas de fuente ASCII en `enemies/`; `attack.js` (LIGHT_LASER) |
| 5 | `public/assets/{structures,enemies,bg,fx}/` + `manifest.json` |
| 6 | `src/game/General.js` |
| 7 | `src/game/net/` (PeerJS/relay, snapshots) |

---

## 12. Orden de ejecución global

1. **Prompt 1 → Fases 0–3** (clases + energía + nodos + torretas). Documento:
   [PROMPT-deepseek-fase0-3-sistemas.md](./PROMPT-deepseek-fase0-3-sistemas.md).
2. Prompt 2 → Fase 4 (enemigos + ASCII + 200).
3. Prompt 3 → Fase 5 (assets PNG).
4. Prompt 4 → Fase 6 (general).
5. Prompt 5 → Fase 7 (multijugador).

Cada prompt se genera a partir de la fase correspondiente de este roadmap cuando la anterior esté
verificada.
