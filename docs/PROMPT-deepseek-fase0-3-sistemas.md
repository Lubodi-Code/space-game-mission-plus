# PROMPT PARA DEEPSEEK — Fases 0–3: clases, energía, nodos y torretas

> **Pega este documento completo en DeepSeek como tarea de implementación.**
> Es autocontenido: incluye contexto, reglas, mapa de archivos y criterios de aceptación.
> No requiere leer el roadmap, pero existe como referencia en
> `docs/PLAN-sistemas-v2-roadmap.md`.

---

## ROL Y REGLAS DE TRABAJO

Eres una IA implementadora trabajando en el repo **space-game-mission-plus**
(**Phaser 3.90 + Vue 3 + Vite**, JavaScript / ES modules, Windows).

Reglas:
1. Implementa **en orden** las cuatro fases (0 → 1 → 2 → 3). **No saltes de fase**: termina y deja
   compilando cada una antes de la siguiente.
2. Tras cada fase, ejecuta `npm run dev` mentalmente: no debe haber errores de import ni de runtime.
   Respeta los **criterios de aceptación** de cada fase antes de avanzar.
3. **No rompas lo existente:** oleadas, minería, curación (enjambre), cámara/minimapa, controles
   táctiles y comentarios en español deben seguir funcionando.
4. Mantén el límite **simulación (Phaser) ↔ presentación (Vue)**: el HUD solo lee `gameState`
   reactivo y emite intents por `bus`; nunca llama a la escena directamente.
5. Sigue el estilo del repo: comentarios en español, mismas convenciones de nombres, sin
   dependencias nuevas (salvo que se indique; en estas fases **no** hace falta ninguna).
6. Idioma del código/comentarios: **español**, como el resto del proyecto.

---

## CONTEXTO DEL CÓDIGO ACTUAL (lee antes de tocar nada)

- **Estado reactivo** [src/game/gameState.js](../src/game/gameState.js): `minerals, mineralsCap,
  energy, energyMax, wave, coreHp, status, activeBuild, …`. **OJO:** `energy/energyMax` ya existen
  pero **nadie los usa todavía** — los activaremos en la Fase 1.
- **Defs de estructuras** [src/game/balance.js](../src/game/balance.js): `STRUCTURES` (array) y
  `CORE`. Tipos: `node` (Nodo, relay), `collector` (Recolector), `battery` (Batería), `healer`
  (Enjambre), `laser` (Torreta), `missile` (Misiles).
- **Escena principal** [src/game/scenes/GameScene.js](../src/game/scenes/GameScene.js):
  - `addStructure(def, x, y, isCore)` crea un **objeto plano** con todos los campos y lo mete en
    `this.structures` (línea ~363).
  - `recomputeNetwork()` (~473): construye enlaces si `d <= max(a.range, b.range)` entre **cualquier**
    par, hace BFS de potencia desde el núcleo y pinta líneas.
  - `updateMining` (~641), `updateCombat` (~842), `updateHealers` (~974): lógica por `role` con `if`.
  - `tryPlace` (~286), `canConnectAt` (~278), `overlapsExisting`, `updateGhost` (~545): colocación.
  - `update(time, delta)` (~607): bucle maestro.
- **Enemigos** (patrón a imitar): clase [Enemy.js](../src/game/enemies/Enemy.js) + registro
  [EnemyType.js](../src/game/enemies/EnemyType.js) + comportamientos en `behaviors/`. **Las
  estructuras deben acabar igual de limpias.**
- **HUD** [src/components/Hud.vue](../src/components/Hud.vue): barra de construcción inferior (lee
  `STRUCTURES`), recursos arriba-derecha (ya pinta `energy/energyMax`, hoy estáticos), tooltips.
- **Bus** [src/game/bus.js](../src/game/bus.js): `on/off/emit`. Eventos actuales: `build, cancel,
  restart, speed`.

---

## FASE 0 — Refactor a sistema de clases de estructuras

**Meta:** mover las estructuras de objetos planos a una jerarquía de clases (espejo de `Enemy`), **sin
cambiar la jugabilidad**. Es la base de las fases siguientes.

### 0.1 Archivos nuevos
```
src/game/structures/Structure.js          # clase base
src/game/structures/StructureRegistry.js  # defs + factory create()
src/game/structures/Core.js
src/game/structures/Node.js
src/game/structures/Collector.js
src/game/structures/Battery.js
src/game/structures/Healer.js
src/game/structures/LaserTurret.js
src/game/structures/MissileTurret.js
```

### 0.2 `Structure.js` (clase base)
Encapsula lo común que hoy hace `addStructure` + `updateHpBar` + `destroyStructure`:
- **Constructor** `(def, x, y, scene, isCore=false)`: crea el `container`, el `glow`, el `shape`
  (polígono) y el `hpBar` exactamente como en
  [GameScene.addStructure](../src/game/scenes/GameScene.js#L363) y guarda
  `key, role, def, x, y, range, radius, hp, maxHp, powered, isCore, container, shape, hpBar, barY`.
- **Estado para subclases:** `target=null, acc=0, fireTimer=0, spawnTimer=def.healInterval||0`.
- **Métodos base:**
  - `update(dt, world, time) {}` — vacío; cada subclase lo sobreescribe.
  - `drawHpBar()` — el cuerpo actual de `updateHpBar(s)`.
  - `damage(dmg, world)` — el cuerpo de `damageStructure(s, dmg)` (incluye caso núcleo → gameOver).
  - `destroy(world)` — el cuerpo de `destroyStructure(s)` (explosión, splice, recompute).
- Mueve los helpers de dibujo `drawPolygon` y `darken` a un util compartido
  (`src/game/structures/draw.js`) o impórtalos; deben seguir disponibles para el ghost en GameScene.

### 0.3 Subclases (una por tipo) — mover la conducta desde la escena
- `Core.js`: detalles animados del núcleo (hoy en `createCore`, [GameScene.js:346](../src/game/scenes/GameScene.js#L346)).
- `Collector.js`: `update()` = cuerpo del bucle de minería por recolector de `updateMining`.
- `Healer.js`: `update()` = lógica de generación/movimiento de esferas de `updateHealers` (las esferas
  pueden seguir gestionadas por la escena, pero el *spawn* y los parámetros salen de aquí).
- `LaserTurret.js` / `MissileTurret.js`: `update()` = la parte de `updateCombat` de su rol
  (`fireLaser` / volley de `fireMissile`).
- `Node.js` / `Battery.js`: por ahora solo heredan; su lógica llega en Fases 1–2.

### 0.4 `StructureRegistry.js`
- Re-exporta las defs (puede importar `STRUCTURES`/`CORE` de `balance.js` y exponer
  `structureByKey`), y añade `create(key, x, y, scene)` que devuelve la **instancia de la subclase
  correcta** (`{ node: Node, collector: Collector, … }`).
- `balance.js` sigue siendo la fuente de números; `STRUCTURES` se mantiene exportado para el HUD.

### 0.5 Integrar en `GameScene`
- `this.structures` pasa a contener **instancias** de `Structure`.
- `addStructure` → `StructureRegistry.create(...)` (o un fino wrapper); `createCore` usa `new Core`.
- El bucle `update()` llama, para cada estructura, `s.update(d, this.world, this.time.now)` y deja de
  tener `updateMining/updateCombat/updateHealers` con ramas por `role` (la conducta vive en clases).
  La **red**, **colocación**, **oleadas**, **proyectiles** y **fx** se quedan en GameScene.
- `damageStructure`/`destroyStructure` delegan en `s.damage()/s.destroy()` (o se mueven). Mantén
  `this.world.damageStructure` funcionando para los enemigos.

### 0.6 Aceptación Fase 0
- El juego se ve y se juega **idéntico** a antes (minar, construir, torretas, enjambre, oleadas).
- `GameScene` ya no tiene `if (s.role === 'collector'|'turret'|'missile'|'healer')` para conducta.
- `npm run dev` sin errores.

---

## FASE 1 — Economía de energía + batería

**Meta:** minar da minerales **y energía**; núcleo/baterías almacenan energía; sin energía las torretas
dejan de disparar; mejora de batería auto-recargable.

### 1.1 Números (en `balance.js`)
Añade a las defs:
- `CORE`: `energyCap: 100` (almacén base).
- `collector`: `energyRate: 4` (energía/s mientras powered y minando).
- `battery`: `energyCap: 80` (suma al almacén global). Mantén o ajusta `capBonus` de minerales.
- `laser`: `energyDrain: 6` (energía por disparo). `missile`: `energyDrain: 14` (por tanda).
- `healer`: `energyDrain: 3` (por esfera generada).
- Constante nueva `ENERGY = { batterySelfChargeRate: 3 }` (auto-recarga cuando no hay meteoritos).

### 1.2 Pool global de energía
- `energyMax = CORE.energyCap + Σ (batería viva).energyCap`. Recalcular en `recomputeNetwork()` (o
  al construir/destruir batería). Reflejar en `gameState.energyMax`.
- **Producción/consumo por tick** (en `GameScene.update`, nuevo método `updateEnergy(d)`):
  - Producción: Σ `collector.energyRate` de recolectores powered que estén minando.
  - Consumo: lo que drenen los consumidores al actuar (ver 1.3).
  - `gameState.energy = clamp(gameState.energy + (prod − cons)·dt, 0, gameState.energyMax)`.
- Alternativa válida y más simple: que cada consumidor reste `energyDrain` directamente de
  `gameState.energy` al disparar, y `updateEnergy` solo sume producción y recargas. Elige una y sé
  consistente.

### 1.3 Brownout (sin energía → consumidores apagados)
- Un consumidor (`LaserTurret`, `MissileTurret`, `Healer`) solo actúa si
  `this.powered && gameState.energy > 0`. Si va a disparar/generar, comprueba que hay energía para su
  `energyDrain`; si no, **no dispara** y no drena.
- Señal visual de brownout: estructuras consumidoras sin energía bajan alfa o parpadean (reusa el
  alfa de `powered`).

### 1.4 Batería auto-recargable (engancha con Fase 3)
- `Battery` lleva flag `selfCharge` (por defecto `false`; se activará vía upgrade en Fase 3, pero deja
  ya el camino).
- En `updateEnergy`: si **todos** los `world.meteorites` están `depleted` (o no quedan minables),
  cada batería con `selfCharge` aporta `ENERGY.batterySelfChargeRate` energía/s.

### 1.5 HUD
- [Hud.vue](../src/components/Hud.vue#L137) ya pinta `energy / energyMax`: ahora son reales.
- Añade aviso de **brownout** (texto/pulso) cuando `gameState.energy <= 0`.

### 1.6 Aceptación Fase 1
- Minar sube minerales **y** energía. Disparar baja energía. Sin recolectores, la energía llega a 0
  y las torretas dejan de disparar visiblemente; al reconstruir producción, vuelven. Construir batería
  sube `energyMax`. Con baterías auto-recargables y meteoritos agotados, la energía se sostiene a
  baja tasa.

---

## FASE 2 — Red de nodos + señal / radar

**Meta:** los **nodos son los únicos conectores**; **5 puertos** por nodo; sin nodo/núcleo que cubra
una estructura → **sin señal** → apagada. Prohibido torreta↔torreta directo.

### 2.1 Puertos (en `balance.js`)
- `CORE.maxPorts = 8`, `node.maxPorts = 5`. (El resto de tipos no son relays → no tienen puertos.)
- Define un helper `isRelay(s)` = `s.isCore || s.role === 'relay'` (el nodo tiene `role: 'relay'`).

### 2.2 Reescritura de `recomputeNetwork()`
Sustituye la formación de enlaces actual ([GameScene.js:478](../src/game/scenes/GameScene.js#L478)):
1. Un par `(a,b)` solo puede enlazar si **al menos uno es relay** (`isRelay(a) || isRelay(b)`). Si
   ninguno es relay → **no hay enlace** (esto prohíbe torreta↔torreta, recolector↔recolector, etc.).
2. Distancia: `d <= max(a.range, b.range)` (igual que hoy) pero solo entre legales.
3. **Puertos:** tras listar enlaces candidatos, para cada relay ordena sus enlaces por distancia y
   **conserva solo los `maxPorts` más cercanos**; descarta el resto. Un enlace sobrevive solo si
   **ambos** extremos lo conservan (si un nodo está lleno, el enlace cae aunque el otro lado tuviera
   puerto). Implementa con un grafo: cuenta de puertos usados por relay y poda determinista.
4. **BFS de potencia** desde el núcleo por los enlaces supervivientes (igual que hoy). `powered=false`
   = sin ruta al núcleo = **sin señal** = apagada (no dispara/mina; alfa atenuado, ya existe).

### 2.3 Colocación
- `canConnectAt(x, y, def)` ([GameScene.js:278](../src/game/scenes/GameScene.js#L278)): válido solo si
  hay un **relay powered** (nodo/núcleo) a distancia `<= max(def.range, relay.range)` **con al menos un
  puerto libre**. (Para colocar un **no-relay**, el enganche es contra un relay; para colocar un
  **nodo**, también contra un relay con puerto libre.)
- `updateGhost` ([GameScene.js:545](../src/game/scenes/GameScene.js#L545)): el ghost se pinta verde
  solo si hay relay powered con puerto libre en rango; opcional: dibujar una línea al relay objetivo.

### 2.4 Aceptación Fase 2
- Dos torretas pegadas **sin** nodo: quedan sin energía (no enlazan entre sí). Pon un nodo en medio:
  ambas encienden. Un nodo rodeado de 6 estructuras en rango solo alimenta 5; la 6.ª queda apagada.
  Una torreta lejos del nexo, sin nodo intermedio, está apagada (sin señal).

---

## FASE 3 — Torretas láser/misiles: ramas + construcción + autofire

### 3.1 Renombrar
En `balance.js`: `laser.label = 'Torreta Láser'`, `missile.label = 'Torreta de Misiles'`. Ajusta
tooltips en `Hud.vue` si hace falta.

### 3.2 Tiempo de construcción + barra (aplica a TODAS las estructuras)
- Añade `buildTime` (ms) a cada def (p. ej. nodo 1500, recolector 2500, batería 3000, enjambre 4000,
  torretas 5000).
- En `Structure`: estado `building=true, buildProgress=0` al crear (salvo el núcleo). En `update`,
  mientras `building`, sube `buildProgress += dt`; al alcanzar `buildTime` → `building=false` y
  `onBuilt()`. Mientras `building`: **no** dispara/mina/cuenta como relay con plena potencia (puede
  enlazar visualmente, pero no produce/dispara), y muestra **barra de construcción** (reusa el estilo
  de `drawHpBar`, color distinto, p. ej. cian).
- Pensar el flood de red: una estructura en construcción puede contar como nodo a medias o no; decide
  y documenta (recomendado: **no** provee energía/relay hasta `onBuilt`).

### 3.3 Sistema de mejoras (`src/game/structures/upgrades.js`, NUEVO)
Define árboles **data-driven**. Cada upgrade tiene `{ id, label, cost, apply(turret) }` que muta los
stats de la instancia (`atkRange, cooldown, damage, fireMode, style, …`). Cada torreta guarda
`this.upgrades = []` (ids elegidos) y `this.branch` (rama tomada) para limitar opciones.

**Torreta Láser** (base: `cooldown: 20000`, láser pequeño de un objetivo):
- **A — Rápida/corta:** `atkRange *= 0.6`, `cooldown *= 0.15` (~3 s), `damage *= 0.6`.
  - **A2 (sub-rama de A):** cambia el **estilo** a uno nuevo (`style: 'beam'` rayo continuo, o
    `'spread'` 3 rayos, o `'chain'` salta a 2 enemigos cercanos). Implementa al menos uno y deja el
    `style` legible en `fireLaser`.
- **B — Radio amplio:** `atkRange *= 1.6`, `cooldown *= 1.4`.
  - **B2 — Anti-grande (progresión):** `style: 'bigbeam'`. El disparo **dura más**, **prioriza el
    objetivo de mayor tamaño** (`radius`/`maxHp`) en rango, y hace **daño progresivo**: mientras el
    haz se mantenga sobre el **mismo** blanco, `damage` por tick sube con una rampa (p. ej. ×1 → ×4);
    si cambia de blanco, la rampa se reinicia.

**Torreta de Misiles** (base: tanda guiada, ver `fireMissile`/volley en `updateCombat`):
- **C — Enjambre corto:** `volley += 4` (más misiles), `atkRange *= 0.5`.
- **D — Largo alcance:** `atkRange *= 1.8`, `cooldown *= 1.5` (recarga más lenta).
- **E — Precisión:** menos dispersión (`spread` de `fireMissile` ↓) y mejor `turnRate`/`projSpeed`.
- **F — Daño:** `damage *= 1.4`.

(C/D/E/F pueden combinarse o estructurarse en ramas; mantenlo data-driven y con costes en minerales.)

### 3.4 Modo de disparo (autofire / objetivo fijo)
- Cada torreta: `fireMode = 'auto'` (más cercano en rango, comportamiento actual) o `'focus'`
  (bloqueada en un enemigo concreto `this.focusTarget`).
- En `update`/combate: en `'focus'`, dispara solo a `focusTarget` mientras viva y esté en rango; si
  muere/sale, vuelve a `auto` o queda a la espera (decide y documenta).

### 3.5 Selección / inspección de estructuras (Vue ↔ Phaser)
- Nueva interacción en `GameScene`: clic (cuando **no** estás colocando) sobre una estructura la
  **selecciona**. Emite `bus.emit('select', payload)` con `{ key, role, upgrades disponibles, fireMode,
  stats }`. Clic en vacío / Esc → `bus.emit('select', null)`.
- `Hud.vue`: panel lateral de **inspección** que, ante `select`, muestra: nombre, stats, botones de
  **mejora** disponibles (emite `bus.emit('upgrade', { structureId, upgradeId })`) y toggle de
  **fireMode** (`bus.emit('fireMode', { structureId, mode })`). En `'focus'`, el siguiente clic sobre
  un enemigo fija `focusTarget`.
- `GameScene` se suscribe a `upgrade`/`fireMode` y aplica sobre la instancia seleccionada. Necesitas un
  `id` estable por instancia (añade `this.id = ++scene._structSeq` en el constructor de `Structure`).
- Sigue el patrón existente de `busOff` para limpiar listeners en `SHUTDOWN`.

### 3.6 Aceptación Fase 3
- `Torreta Láser` base recarga ~20 s. Rama A dispara mucho más rápido con menos radio. A2 cambia el
  estilo de disparo de forma visible. B2 prioriza al enemigo más grande y su daño **crece** mientras
  mantiene el haz. Misiles: C lanza más con menos alcance; D llega más lejos y recarga más lento; E
  afina la puntería; F pega más. **Toda** estructura muestra barra de construcción y no funciona hasta
  terminarla. Seleccionar una torreta abre el panel; cambiar a `focus` y clicar un enemigo lo fija como
  blanco. `npm run dev` sin errores y sin regresiones en oleadas/economía.

---

## ENTREGABLE FINAL

- Código compilando con las 4 fases. Resumen breve de qué archivos creaste/cambiaste por fase y
  cómo verificar cada criterio de aceptación. No incluyas las Fases 4–7 (enemigos/ASCII, assets PNG,
  general, multijugador): tienen sus propios prompts.
