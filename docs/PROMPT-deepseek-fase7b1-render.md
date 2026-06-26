# PROMPT PARA DEEPSEEK — Fase 7b-1: el cliente VE la partida del host (snapshots → render)

> Pega este documento completo en DeepSeek. Autocontenido. Phaser/Vue/Vite, JS/ESM, comentarios en
> español. **Requiere 7a hecho** (`net.js` con PeerJS, lobby conecta + ping). `npm run build` limpio.
> **No rompas el single-player ni 7a.** Esta capa es **solo render**: el cliente no controla nada
> todavía (eso es 7b-2). Co-op "todo compartido": el cliente verá el mundo del host.

## MODELO
Host-autoritativo. El **host** corre su `GameScene` tal cual (sim intacta) y **emite un snapshot ~12
Hz**. El **cliente** entra a `GameScene` en **modo remoto**: NO simula; crea/mueve sprites desde el
snapshot e interpola. // ponytail: render tonto separado por una bandera → no tocas la sim que funciona.

---

## 1) HOST — emitir snapshot (`GameScene.js`)

### 1.1 IDs de enemigo
En `create()`: `this._enemySeq = 0`. En `spawnEnemy(type)`, tras crear el enemigo:
`enemy.id = ++this._enemySeq`.

### 1.2 Emitir en `update()` (al final, tras `drawFx(d)`)
```js
import { net } from '../net.js'   // arriba del archivo
// ...
if (net.isHost && net.conn) {
  this._snapAccum = (this._snapAccum || 0) + d
  if (this._snapAccum >= 80) {     // ~12 Hz
    this._snapAccum = 0
    net.send(this.buildSnapshot())
  }
}
```

### 1.3 `buildSnapshot()`
Arrays compactos (índices, no objetos) para ahorrar ancho de banda. // ponytail: manda todo cada snap;
delta-encode solo si pesa.
```js
buildSnapshot() {
  return {
    t: 'snap',
    eco: {
      minerals: Math.round(gameState.minerals), mineralsCap: gameState.mineralsCap,
      energy: Math.round(gameState.energy), energyMax: gameState.energyMax,
      coreHp: gameState.coreHp, coreHpMax: gameState.coreHpMax,
      wave: gameState.wave, waveTotal: gameState.waveTotal, nextWaveIn: gameState.nextWaveIn,
      enemiesAlive: gameState.enemiesAlive, status: gameState.status, bossWave: gameState.bossWave,
    },
    enemies: this.enemies.map((e) => [e.id, e.type, Math.round(e.x), Math.round(e.y), Math.round(e.hp), Math.round(e.maxHp)]),
    structs: this.structures.map((s) => [s.id, s.key, Math.round(s.x), Math.round(s.y), Math.round(s.hp), Math.round(s.maxHp), s.powered ? 1 : 0, s.building ? 1 : 0]),
    gen: [[0, Math.round(this.general.x), Math.round(this.general.y), Math.round(this.general.hp), this.general.alive ? 1 : 0]],
  }
}
```
(El núcleo va dentro de `structs` con `key:'core'`. Solo va el general del host; el del cliente entra en 7b-2.)

---

## 2) CLIENTE — entrar a la partida al llegar el primer snapshot (`Lobby.vue`)
En `joinGame()`, amplía `net.onData` para cambiar a la vista de juego cuando el host empiece a emitir:
```js
net.onData = (d) => {
  if (d.t === 'ping') { appState.mp.ping = true; net.send({ t: 'pong' }) }
  else if (d.t === 'snap') { appState.mp.connected = true; appState.view = 'game' } // entra una vez
}
```
(No pasa nada si llega más de un snap antes de montar la escena; el siguiente sirve.)

---

## 3) CLIENTE — `GameScene` en modo remoto (`GameScene.js`)
La clave: una bandera `this.remote` que apaga TODA la simulación y enciende el render por snapshot.
**El single-player y el host NO usan `remote`** (queda en false).

### 3.1 En `create()`, lo antes posible:
```js
this.remote = !net.isHost && !!net.conn
```
Luego, **si `this.remote`**, monta solo lo visual y sal del resto del `create` normal:
```js
if (this.remote) { this.createRemote(); return }
```
> Coloca ese `return` **después** de crear cámara, `linkGraphics/fxGraphics/enemyBars`, starfield y
> nebulosas (esos sirven igual), y **antes** de `createMeteorites/createCore/recomputeNetwork/initWaves/
> general/world` (sim que el cliente NO hace). Reordena lo mínimo para que sea así, o duplica las 4–5
> líneas de setup visual dentro de `createRemote()` — lo que te resulte más limpio.

### 3.2 `createRemote()`
```js
createRemote() {
  this.cam.centerOn(WORLD.width / 2, WORLD.height / 2)
  this.eById = new Map()      // id enemigo -> sprite
  this.sById = new Map()      // id estructura -> { container }
  this.genSprites = new Map() // pid -> sprite
  this._snap = null
  net.onData = (d) => { if (d.t === 'snap') this.applySnapshot(d) }
  gameState.status = 'playing'
  // minimapa igual que en el modo normal (cópialo aquí si hizo falta sacarlo del create)
}

applySnapshot(snap) {
  this._snap = snap
  Object.assign(gameState, snap.eco)   // HUD reactivo (minerales, energía, oleada, núcleo...)

  // --- estructuras (incluye núcleo) ---
  const seenS = new Set()
  for (const [id, key, x, y, hp, maxHp, powered, building] of snap.structs) {
    seenS.add(id)
    let s = this.sById.get(id)
    if (!s) {
      const def = key === 'core' ? CORE : structureByKey(key)
      const c = this.add.container(x, y).setDepth(key === 'core' ? 12 : 10)
      const glow = this.add.image(0, 0, 'glow').setTint(def.color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3)
      const shape = this.add.graphics()
      const size = key === 'core' ? 46 : def.size
      drawPolygon(shape, 0, 0, size, key === 'core' ? 6 : def.sides, def.color, 2, 1, darken(def.color))
      c.add([glow, shape])
      s = { container: c }
      this.sById.set(id, s)
    }
    s.container.setPosition(x, y).setAlpha(building ? 0.4 : powered ? 1 : 0.35)
  }
  for (const [id, s] of this.sById) if (!seenS.has(id)) { s.container.destroy(); this.sById.delete(id) }

  // --- enemigos ---
  const seenE = new Set()
  for (const [id, type, x, y] of snap.enemies) {
    seenE.add(id)
    let spr = this.eById.get(id)
    if (!spr) {
      spr = this.add.image(x, y, REGISTRY[type].textureKey).setDepth(15)
      spr.tx = x; spr.ty = y
      this.eById.set(id, spr)
    }
    spr.tx = x; spr.ty = y   // objetivo de interpolación
  }
  for (const [id, spr] of this.eById) if (!seenE.has(id)) { spr.destroy(); this.eById.delete(id) }

  // --- general(es) del host ---
  const seenG = new Set()
  for (const [pid, x, y, hp, alive] of snap.gen) {
    seenG.add(pid)
    let g = this.genSprites.get(pid)
    if (!g) {
      g = this.add.image(x, y, 'enemy_skirmisher').setTint(0xffaa44).setScale(1.3).setDepth(17)
      this.genSprites.set(pid, g)
    }
    g.setPosition(x, y).setVisible(!!alive)
  }
  for (const [pid, g] of this.genSprites) if (!seenG.has(pid)) { g.destroy(); this.genSprites.delete(pid) }
}
```

### 3.3 `update(time, delta)` en modo remoto
Al principio de `update()`, **antes** de la lógica normal:
```js
if (this.remote) {
  // paneo de cámara (reutiliza el bloque WASD/cursores existente si quieres) e interpolación:
  for (const [, spr] of this.eById) {
    spr.x += (spr.tx - spr.x) * 0.3
    spr.y += (spr.ty - spr.y) * 0.3
  }
  return
}
```
(Deja el resto de `update()` intacto para host/solo.)

### 3.4 Limpieza
En el `SHUTDOWN`, si `this.remote`, no hay `epSystem/general` que limpiar de la sim; sí destruye los
sprites de los mapas si quieres (o confía en el shutdown de la escena). Resetea `net.onData` a no-op.

---

## ACEPTACIÓN
1. `npm run build` limpio. Single-player y 7a intactos.
2. Host crea sala, pulsa JUGAR y juega normal. Cliente entra con el código → **ve la partida del host
   en vivo**: enemigos moviéndose (suave, interpolado), estructuras, núcleo, su general, y el HUD
   (minerales/energía/oleada/núcleo) reflejando el estado del host.
3. El cliente **todavía no controla nada** (no construye, no mueve general) — eso es 7b-2.
4. Con muchos enemigos no se desincroniza groseramente (snapshot ~12 Hz + interpolación).

## FUERA DE ALCANCE (es 7b-2)
Intents del cliente (construir, mover su general, mejorar, velocidad), segundo general controlado,
reconexión. No los implementes aquí.
