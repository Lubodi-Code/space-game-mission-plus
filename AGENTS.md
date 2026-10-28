# AGENTS.md

## Code Mentor

Luis usa otro chat como tutor. Antes de trabajar, leé `.mentor/CONTEXTO.md` y
`.mentor/ESTADO.md`. Si el objetivo del cambio todavía no está acordado, preguntá
antes de modificar el juego; cuando se acuerde, actualizá el objetivo y el resultado
observable en CONTEXTO.

Después de cada avance significativo y antes de responder al usuario, agregá una
entrada a `.mentor/ESTADO.md`, incluso si solo investigaste. Usá el siguiente número
después del mayor `## Secuencia N` existente; empezá en 1. No borres ni reescribas
entradas anteriores. Registrá solo trabajo propio comprobable; no inventes avances
anteriores ni atribuyas cambios ajenos a tu sesión.

Formato de cada entrada, en español y con frases cortas:

```markdown
## Secuencia N
- Objetivo y motivo: qué se buscaba y para qué.
- Trabajo realizado: qué revisaste o cambiaste. Si solo investigaste, decí que no modificaste el juego.
- Archivos: rutas relativas exactas de los archivos leídos o modificados y qué encontraste o cambiaste en cada uno.
- Antes / después: comportamiento anterior y actual; si no hubo cambio, indicá que sigue igual.
- Prueba: pendiente (no ejecutada), o comando/acción ejecutada y resultado real, incluidos fallos y límites.
- Siguiente paso: qué falta o si el pedido terminó.
```

Una herramienta que termina sin error no demuestra que el juego funcione. Separá
observaciones de hipótesis; compilar no equivale a probar una partida. No registres
credenciales, datos personales ni contenido privado. Esta bitácora documenta el
trabajo; no ejecuta tareas ni notifica automáticamente al tutor.

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # nuxt dev (http://localhost:3000)
npm run build    # production build -> .output/ (use this to check compilation; CI-equivalent)
npm run preview  # serve the built .output/
npm run desktop:generate # genera la SPA para escritorio
```

No test runner and no linter are configured. **`npm run build` is the main automated check** (CI also
runs `npm run desktop:generate`) — it catches import/syntax errors but **not runtime logic bugs** (most
bugs here are runtime: order-of-init, wrong dt units, factory key mismatches). Standalone node checks
live in `scripts/` (`check-ship-designs.mjs`, `check-wave-director.mjs`, `check-three-models.mjs`,
`check-net-protocol.mjs`, …). Verify behavior by running `npm run dev`.

## Architecture

Two engines bridged by shared state, not by direct calls:

- **Nuxt 4 / Vue 3** owns the UI (lobby, HUD). It **never calls the Phaser scene directly.** It reads the
  reactive `gameState` and emits intents on a tiny event `bus` (`game/bus.js`).
- **Phaser 3** owns the simulation. Scenes subscribe to `bus` events and mutate `gameState`.
- Respect this boundary when adding features (e.g. the structure-inspection panel: HUD emits
  `bus.emit('upgrade'/'fireMode'/'select')`, `GameScene` listens and applies).

Two separate reactive stores (don't conflate them):
- `appState` (`game/appState.js`): which screen (`lobby`/`game`), `difficulty`, `mode`, multiplayer
  `mp`. Survives a run restart. `mode` indexes `game/modes/index.js` `MODES` (data: `waveCount`,
  `intermissionMs`); `systems/waves.js` reads it in `initWaves`/`updateWaves`. Add a game mode = one
  entry there + (if needed) a new field the consumer reads. The Lobby has the mode selector.
- `gameState` (`game/gameState.js`): per-run state (minerals, energy, wave, coreHp, `general`…).
  `resetGameState()` must mirror every field of the initial object.

Scene flow: `BootScene` (loads enemy SVGs, generates canvas textures `star`/`glow`/`missile_rod`/
nebula, runs `validateRegistry()`) → `GameScene`. `GameScene` is still the largest file — it owns
placement, selection/inspection, the camera/minimap, the host snapshot build/apply, and the per-frame
`update()` loop — but the heavy subsystems have been **extracted into modules it orchestrates**.

### Systems & render modules (extracted from `GameScene`)
The extraction pattern (mirrors `EnemyProjectileSystem`): modules **export plain functions that take
`scene`**; the state still lives on the scene (`scene.structures`, `scene.links`, `scene.wave`, …) and
the functions read/mutate it. `GameScene.update()` is the orchestrator that calls them in order.
- `game/systems/` — gameplay logic: `worldgen.js` (`createMeteorite`/`populateMeteorites`),
  `waves.js` (`initWaves`/`updateWaves`/`startNextWave`/`spawnEnemy` — the wave FSM, **`updateWaves`
  takes `delta` in ms**), `energyNet.js` (`recomputeNetwork`/`recomputeEnergyCap`/`drawLinks` +
  `isRelay`/`portCap`), `projectiles.js` (`updateProjectiles`/`damageEnemy` — player missiles),
  `healers.js` (`updateHealers`/`mostDamagedStructure`), `enemies.js` (`updateEnemies`/
  `nearestStructure`/`killEnemy` — the latter two are repointed in the `world` API closure, not wrappers),
  `placement.js` (`tryPlace`/`updateGhost`/`findAttachRelay`/`startPlacement`/`cancelPlacement`/… — build
  validation + ghost), `selection.js` (`selectStructure`/`applyUpgrade`/`setFireMode` — emits to `bus` for
  the HUD inspection panel). `GameScene` keeps the input handlers/`bus` subscriptions and calls these.
- `game/render/` — pure visuals: `fx.js` (`explosion`/`spawnFloatingText`/`hitFlash`/`drawBeam`/
  `drawFx`), `scenery.js` (`createNebula`/`createStarfield`).
- **Wrapper gotcha:** when an extracted fn is also called as `this.scene.X()` from another file,
  `GameScene` keeps a one-line delegating method so that file is untouched. Currently:
  `recomputeNetwork()` (called by `Structure.js`) and `explosion()` (called by `Structure.js`,
  `General.js`, `EnemyProjectiles.js`). Don't delete those wrappers.

### Structures (`game/structures/`)
Class hierarchy mirroring the enemy pattern: `Structure` base + one subclass per type (`Core`, `Node`,
`Collector`, `Battery`, `Healer`, `LaserTurret`, `MissileTurret`). Per-type behavior lives in each
subclass's `update()`, not in `GameScene`. `createStructure(key,x,y,scene)` is the factory.
- **Gotcha:** the factory's `CLASS_MAP` is keyed by `def.role`, **not** `key`. The Nodo's `key` is
  `'node'` but its `role` is `'relay'` — a mismatch here silently throws at placement.
- `balance.js` `STRUCTURES`/`CORE` are the data (cost, range, hp, `maxPorts`, `buildTime`, energy
  fields). Tuning happens there; `Hud.vue` reads `STRUCTURES` for the build bar.

### Energy & network (`game/systems/energyNet.js`)
- Links form **only if at least one endpoint is a relay** (Core or Nodo). Two non-relays never link
  (no turret↔turret). Relays have limited `maxPorts` (closest links win). Power floods by BFS from the
  Core; no path = unpowered = "no signal" = off.
- Energy is a global pool: Collectors produce, Core+Batteries store (`energyMax`), turrets drain on
  fire. At 0 energy, consumers stop. Re-run `recomputeNetwork()` after any structure add/remove.

### Enemies (`game/enemies/`)
Data-driven: `EnemyType.js` `REGISTRY` (per-type stats + `targetPriority`/`targetSecondary` +
behavior keys) + `ROLE_GROUPS`. The `Enemy` class resolves behavior maps from `behaviors/`
(`targeting` via `resolveTarget` = priority→secondary→core, `movement`, `attack`, `evasion`, `risk`,
`steering`). `validateRegistry()` fails fast on bad keys at boot.
- Performance for ~200 enemies: `SpatialGrid` (rebuilt each frame in `updateEnemies`, exposed as
  `world.enemyGrid`) replaces O(n²) neighbor scans in `separate()`; HP bars are drawn in **one** shared
  `enemyBars` Graphics, not one per enemy; targeting is throttled (`retargetTimer`).
- **Damage types:** `Enemy.hit(dmg, world, type)` with `type` `'beam'` (laser, tesla, cryo, railgun,
  General laser/Sunrae) or `'missile'` (missiles, flak, mortar); abilities and meteors pass no type.
  `def.resist = { beam, missile }` multiplies that damage. New damage sources must pass a type.
- **Wave director** (`game/systems/waveDirector.js`, pure, tested by `scripts/check-wave-director.mjs`):
  `startNextWave` calls `planAttack` with the current structures; it picks up to `maxDirs` sides by
  vulnerability and assigns each ship a side. It never adds ships. Queue entries are `{ type, dir }`.
- **General weapon** (`game/meta/generalWeapons.js`): laser | missile | sunrae, equipped in the shop and
  stored in `profile.cosmetics.equipped.weapon`; fixed for the whole run (no in-game switch).
- The `world` object passed to enemies is GameScene's API surface (`core`, `structures`, `enemies`,
  `meteorites`, `enemyGrid`, `fireEnemyBeam`, `spawnEnemyMissile`, `killEnemy`, `damageStructure`).

### Multiplayer (`game/net.js` transport + `game/net/sync.js` logic)
Host-authoritative co-op over **PeerJS** (WebRTC, public broker, no backend — deploys as a static site
on Vercel). The host simulates and broadcasts snapshots ~12 Hz; the client runs `GameScene` with a
`this.remote` flag that **disables all simulation** and only renders/interpolates from snapshots. Keep
`remote` paths fully isolated so single-player/host code is untouched.
- `net.js` is the thin transport (PeerJS host/join/send). `net/sync.js` is the whole sync layer,
  extracted from `GameScene` as functions taking `scene`: host `buildSnapshot`/`sendSnapshot`/`onIntent`;
  client `createRemote`/`applySnapshot`/`setupRemoteInput`/`drawRemoteGhost`/`renderRemote`. `GameScene`
  just calls `createRemote(this)` / `onIntent(this,d)` / `sendSnapshot(this,d)` / `renderRemote(this,…)`.

## The dt-unit gotcha (read before touching any timer)

`GameScene.update` computes `d = delta * speed` in **milliseconds**. The unit of `dt` then **differs
per subsystem** — mixing them is the single most common bug in this repo:
- **Structures** (`s.update(d)`): `dt` is **ms**. Compare against `cooldown`/`buildTime`/`healInterval`
  (ms) directly; per-second rates need `dt/1000`.
- **Enemies** (`e.update(delta/1000)`) and **`General.update(d/1000)`**: `dt` is **seconds**. Code that
  uses `atkCooldown` (ms) does `timer -= dt*1000`.
- **`EnemyProjectileSystem.update(d/1000)`**: **seconds**.

When reviewing or adding timer code, first identify which convention the subsystem uses.

## Project workflow

Feature work is organized into phases (`docs/PLAN-*` roadmap). The pattern: a per-phase
`docs/PROMPT-deepseek-*.md` is written, an external model (DeepSeek) implements it, then it's reviewed
and fixed here. Recurring review findings: the dt-unit gotcha above, factory `role`-vs-`key` keys, and
init-order bugs in `GameScene.create` (e.g. `busOff` used before assignment).
