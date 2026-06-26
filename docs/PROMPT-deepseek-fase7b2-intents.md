# PROMPT PARA DEEPSEEK — Fase 7b-2: el cliente CONTROLA (intents → host)

> Pega este documento completo en DeepSeek. Autocontenido. Phaser/Vue/Vite, JS/ESM, comentarios en
> español. **Requiere 7a (net.js/lobby) y 7b-1 (el cliente ya VE la partida del host por snapshots).**
> `npm run build` limpio. **No rompas single-player, host, ni el render remoto de 7b-1.**

## MODELO
El cliente no simula: **manda intents** (construir, mover su general, velocidad) por `net.send`. El
**host los aplica** sobre su simulación con sus funciones existentes; el resultado vuelve en el
siguiente snapshot. Co-op "todo compartido": mismo nexo y economía; **cada jugador su propio General**.

### Alcance (lazy a propósito)
- **SÍ:** el cliente construye, mueve su general y cambia la velocidad.
- **NO (queda para 7b-3):** seleccionar/mejorar/cambiar fireMode de estructuras desde el cliente
  (necesita meter `upgrades`/`fireMode` en el snapshot). // ponytail: construir + general es el 80% del co-op.

---

## 1) HOST — recibir y aplicar intents (`GameScene.js`)

### 1.1 En `create()` (solo host, donde montas la sim)
```js
if (net.isHost) {
  net.onData = (d) => this.onIntent(d)
  // segundo general (del cliente), inactivo hasta que el cliente juegue
  this.clientGeneral = new General(this, this.core.x - 60, this.core.y)
  this.cgActive = false
  this.clientGeneral.sprite.setVisible(false)
  const activate = () => { this.cgActive = true; this.clientGeneral.sprite.setVisible(true) }
  net.onOpen = activate
  if (net.conn && net.conn.open) activate()
}
```

### 1.2 `onIntent(d)`
```js
onIntent(d) {
  if (d.t === 'build') {
    // ponytail: reusa tryPlace intercambiando placementKey; restaura el del host.
    const k = this.placementKey
    this.placementKey = d.key
    this.tryPlace(d.x, d.y)
    this.placementKey = k
  } else if (d.t === 'general') {
    if (!this.cgActive) { this.cgActive = true; this.clientGeneral.sprite.setVisible(true) }
    this.clientGeneral.moveTo(d.x, d.y)
  } else if (d.t === 'speed') {
    this.setSpeed(d.v)
  }
}
```

### 1.3 Simular y enviar el segundo general
- En `update()`, junto a `this.general.update(...)`:
  `if (this.cgActive) this.clientGeneral.update(d / 1000, this.world)`.
- En `buildSnapshot()`, el array `gen` incluye ambos cuando el cliente está activo:
  ```js
  gen: this.cgActive
    ? [[0, Math.round(this.general.x), Math.round(this.general.y), Math.round(this.general.hp), this.general.alive ? 1 : 0],
       [1, Math.round(this.clientGeneral.x), Math.round(this.clientGeneral.y), Math.round(this.clientGeneral.hp), this.clientGeneral.alive ? 1 : 0]]
    : [[0, Math.round(this.general.x), Math.round(this.general.y), Math.round(this.general.hp), this.general.alive ? 1 : 0]],
  ```
- En `SHUTDOWN`, destruye también `this.clientGeneral.sprite` y `.bar` si existen.

> El gate de construcción sigue siendo el general del host (`tryPlace` ya lo comprueba). En co-op, si
> cae el general del host, nadie construye. // ponytail: regla simple compartida; afinar si molesta.

---

## 2) CLIENTE — input que manda intents (`GameScene.js`, modo remoto)

En `createRemote()`, tras montar el render de 7b-1, añade input propio (no reuses `setupInput`, que
toca la sim real): `this.placementKey = null` y `this.setupRemoteInput()`.

### 2.1 `setupRemoteInput()`
```js
setupRemoteInput() {
  this.input.mouse?.disableContextMenu()
  this.cursors = this.input.keyboard?.createCursorKeys()
  this.wasdKeys = this.input.keyboard?.addKeys('W,A,S,D')
  this.ghost = this.add.graphics().setDepth(40).setVisible(false)

  this.input.on('pointerdown', (p) => {
    this._downX = p.x; this._downY = p.y; this._dragging = false
    if (p.rightButtonDown()) { this.placementKey = null; this.ghost.setVisible(false) }
  })
  this.input.on('pointermove', (p) => {
    if (p.isDown) {
      const dist = Math.hypot(p.x - this._downX, p.y - this._downY)
      if (dist > CAMERA.dragThreshold) {
        this._dragging = true
        this.cam.scrollX -= (p.x - p.prevPosition.x) / this.cam.zoom
        this.cam.scrollY -= (p.y - p.prevPosition.y) / this.cam.zoom
      }
    }
    if (this.placementKey) this.drawRemoteGhost(p.worldX, p.worldY)
  })
  this.input.on('pointerup', (p) => {
    if (!this._dragging) {
      if (this.placementKey) {
        net.send({ t: 'build', key: this.placementKey, x: p.worldX, y: p.worldY })
      } else {
        net.send({ t: 'general', x: p.worldX, y: p.worldY })
      }
    }
    this._dragging = false
  })
  this.input.on('wheel', (_p, _o, _dx, dy) => {
    const step = dy > 0 ? -CAMERA.zoomStep : CAMERA.zoomStep
    this.cam.setZoom(Phaser.Math.Clamp(this.cam.zoom + step, CAMERA.minZoom, CAMERA.maxZoom))
  })

  this.busOff = [
    bus.on('build', (key) => { this.placementKey = key; gameState.activeBuild = key }),
    bus.on('cancel', () => { this.placementKey = null; gameState.activeBuild = null; this.ghost.setVisible(false) }),
    bus.on('speed', (v) => net.send({ t: 'speed', v })),
  ]
}

drawRemoteGhost(x, y) {
  const def = structureByKey(this.placementKey)
  this.ghost.setVisible(true).clear()
  this.ghost.lineStyle(1, 0x6cc8ff, 0.4).strokeCircle(x, y, def.range)
  drawPolygon(this.ghost, x, y, def.size, def.sides, 0x6cc8ff, 2, 0.9, darken(0x6cc8ff))
}
```
> El ghost del cliente **no** valida conexión (no tiene structures reales); solo muestra dónde colocará.
> El host decide si es válido al recibir el intent. // ponytail: validación una sola vez, en el host.

### 2.2 Mantén el render de 7b-1
El segundo general (pid `1`) ya se renderiza con el código de generales del snapshot de 7b-1. El propio
del cliente se ve por el snapshot (12 Hz); si quieres respuesta inmediata, mueve su sprite local al
hacer clic — opcional. // ponytail: 12 Hz basta para v1; interpolar/predecir si se siente lento.

---

## ACEPTACIÓN
1. `npm run build` limpio. Single-player, host y render remoto (7b-1) intactos.
2. En la partida en red: el **cliente** elige una estructura del panel, clica el mapa y **se construye**
   (aparece en ambas pantallas, descontando minerales compartidos). Construir lejos del nexo sin nodo
   lo **rechaza el host** (no aparece).
3. El cliente **mueve su general** (clic en suelo) y ambos jugadores ven los dos generales.
4. Cambiar la velocidad desde el cliente afecta a la partida (host autoritativo).
5. El gate de construcción (general del host caído) sigue funcionando.

## FUERA DE ALCANCE (7b-3 / después)
Seleccionar y mejorar estructuras desde el cliente, fireMode remoto, reconexión, N>1 clientes,
predicción local del general. No los implementes.
