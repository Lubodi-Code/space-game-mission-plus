# PROMPT PARA DEEPSEEK — Paridad visual cliente↔host (animaciones, disparos, general)

> Pega este documento completo en DeepSeek. Autocontenido. Phaser/Vue/Vite, JS/ESM, comentarios en
> español. **Requiere 7b-1/7b-2 ya hechos** (host emite snapshot con `eco/structs/links/meteors/fx/
> gen`; el cliente renderiza en modo `this.remote` reusando `createStructure/createMeteorite/drawLinks/
> explosion`). `npm run build` limpio. **No toques single-player ni host fuera de lo indicado.**

## PROBLEMA
El cliente ya ve estructuras, enlaces, meteoritos y explosiones, pero **le faltan animaciones que el
host calcula en la simulación**:
1. Las naves enemigas **no rotan** hacia su rumbo y **no tienen el halo/glow** (se ven planas).
2. **Faltan disparos:** el snapshot manda solo los rayos *vivos en ese instante* (~12 Hz), así que los
   disparos rápidos entre snapshots se pierden. Hay que mandar **cada rayo disparado** como evento.
3. El **general** del cliente se mueve a tirones (12 Hz) y no rota hacia su dirección.

Arréglalo para que el cliente se vea **igual** que el host.

---

## 1) HOST — más datos en el snapshot (`GameScene.js`)

### 1.1 Cola de rayos (cada disparo, no solo los vivos)
- En `create()`: `this._beamQueue = []` y `this.netHost = net.isHost`.
- En `buildSnapshot()`, **sustituye** el `beams:` actual (que mapeaba `this.lasers`/`epSystem.beams`)
  por la cola capturada-y-vaciada, igual que ya haces con `expl`:
  ```js
  const beams = this._beamQueue
  this._beamQueue = []
  // ...dentro de fx:
  beams,   // cada rayo disparado en este intervalo: [x1,y1,x2,y2,color,width]
  ```
- En la entrada de enemigos del snapshot, añade el **rumbo** (para rotar en el cliente):
  ```js
  enemies: this.enemies.map((e) => [e.id, e.type, Math.round(e.x), Math.round(e.y),
    Math.round(e.hp), Math.round(e.maxHp), Math.round((e.heading || 0) * 100) / 100]),
  ```

### 1.2 Encolar cada rayo en su origen
- `src/game/structures/LaserTurret.js`, dentro de `pushBeam(x2, y2, big)` (tras hacer
  `this.scene.lasers.push(...)`):
  ```js
  if (this.scene.netHost) this.scene._beamQueue.push(
    [Math.round(this.x), Math.round(this.y), Math.round(x2), Math.round(y2), this.def.color, big ? 5 : 2.5])
  ```
- `src/game/enemies/EnemyProjectiles.js`, dentro de `fireBeam(opts)` (tras `this.beams.push(...)`):
  ```js
  if (this.scene.netHost) this.scene._beamQueue.push(
    [Math.round(from.x), Math.round(from.y), Math.round(to.x), Math.round(to.y), color, width || 3])
  ```
  (`from`, `to`, `color`, `width` ya están desestructurados de `opts`.)

> `mining` y `expl` del `fx` se quedan igual. // ponytail: minería es estado continuo; explosiones y
> ahora rayos son eventos.

---

## 2) CLIENTE — animaciones (`GameScene.js`, modo remoto)

### 2.1 Glow + rumbo de enemigos
Al crear el sprite de un enemigo en `applySnapshot` (donde haces `this.add.image(...).setDepth(15)`),
crea también su **glow** (igual que `Enemy` en el host) y guarda el rumbo:
```js
spr = this.add.image(x, y, REGISTRY[type].textureKey).setDepth(15)
spr.glow = this.add.image(x, y, REGISTRY[type].textureKey)
  .setScale(1.3).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(14)
spr.tx = x; spr.ty = y
```
Guarda el rumbo recibido: tras leerlo del snapshot, `spr.heading = h` (la 7ª columna).
Al **destruir** un enemigo, destruye también `spr.glow`:
```js
for (const [id, spr] of this.eById) if (!seenE.has(id)) { spr.glow.destroy(); spr.destroy(); this.eById.delete(id) }
```
(actualiza la firma del `for...of snap.enemies` para incluir el rumbo: `[id, type, x, y, hp, maxHp, h]`).

En el bucle remoto de `update()`, donde interpolas posición, **rota y mueve el glow + pulso**:
```js
for (const [, spr] of this.eById) {
  spr.x += (spr.tx - spr.x) * 0.3
  spr.y += (spr.ty - spr.y) * 0.3
  spr.setRotation(spr.heading || 0)
  spr.glow.setPosition(spr.x, spr.y).setRotation(spr.heading || 0)
  spr.glow.setAlpha(0.3 + Math.sin(time * 0.008 + (spr.heading || 0)) * 0.15)
  // ...(barras de HP como ya están)
}
```

### 2.2 Disparos: lista local con vida propia (capta TODOS)
- En `createRemote()`: `this.rbeams = []`.
- En `applySnapshot`, **en vez** de guardar `this._fx.beams` para dibujar el set actual, **acumula**
  cada evento con su ttl:
  ```js
  for (const b of (snap.fx?.beams || [])) this.rbeams.push([...b, 120]) // [x1,y1,x2,y2,color,width,ttl]
  ```
  (deja `this._fx = snap.fx` solo para `mining`.)
- En el bucle remoto de `update()`, dibuja y caduca los rayos (reusa el estilo halo+núcleo+impacto):
  ```js
  const fg = this.fxGraphics; fg.clear()
  for (let i = this.rbeams.length - 1; i >= 0; i--) {
    const r = this.rbeams[i]
    r[6] -= delta
    if (r[6] <= 0) { this.rbeams.splice(i, 1); continue }
    const a = r[6] / 120, [x1, y1, x2, y2, color, w] = r
    fg.lineStyle(w * 3, color, a * 0.22); fg.lineBetween(x1, y1, x2, y2)
    fg.lineStyle(w, color, a);            fg.lineBetween(x1, y1, x2, y2)
    fg.fillStyle(color, a * 0.8);         fg.fillCircle(x2, y2, w * 2.2)
  }
  ```
  (Deja el dibujo de `mining` sobre `beamGraphics` como está.)

### 2.3 General: movimiento suave + rotación
En `applySnapshot`, al crear/actualizar cada general guarda destino en vez de teletransportar:
```js
if (!g) { g = this.add.image(x, y, 'enemy_skirmisher').setTint(pid === 0 ? 0xffaa44 : 0x8be9fd).setScale(1.3).setDepth(17); g.tx = x; g.ty = y; this.genSprites.set(pid, g) }
g.tx = x; g.ty = y; g.setVisible(!!alive)
```
En el bucle remoto de `update()`, interpola y rota:
```js
for (const [, g] of this.genSprites) {
  const dx = g.tx - g.x, dy = g.ty - g.y
  g.x += dx * 0.3; g.y += dy * 0.3
  if (Math.hypot(dx, dy) > 1) g.setRotation(Math.atan2(dy, dx))
}
```

---

## ACEPTACIÓN
1. `npm run build` limpio. Single-player y host intactos.
2. En la partida en red, el **cliente** ve: naves enemigas **rotando hacia su rumbo y con halo**, **todos
   los disparos** (no solo unos pocos) apareciendo y apagándose suavemente, y los **generales moviéndose
   suave** y orientados. Debe verse prácticamente **igual** que el host.
3. Sin fugas (glows de enemigos destruidos se liberan; rayos caducan y se quitan de `rbeams`).

## OPCIONAL (si sobra tiempo; si no, déjalo)
- Flash blanco al recibir daño (deriva de que el `hp` del snapshot baje).
- Predicción local del general propio del cliente (moverlo al instante al hacer clic y reconciliar).
No imprescindible para la paridad básica.
