# PROMPT PARA DEEPSEEK — Paridad cliente↔host (2): misiles, barra de construcción, impactos, game over

> Pega este documento completo en DeepSeek. Autocontenido. Phaser/Vue/Vite, JS/ESM, comentarios en
> español. **Requiere multijugador 7b ya hecho** (host emite `buildSnapshot()` con `eco/structs/links/
> meteors/fx/gen`; el cliente renderiza en modo `this.remote` reusando `createStructure/createMeteorite/
> drawLinks/explosion`; ya hay `_beamQueue`/`_explQueue` y rumbo de enemigos). `npm run build` limpio.
> **No toques single-player ni host fuera de lo indicado.**

## LO QUE FALTA EN EL CLIENTE
1. **Misiles** (torreta de misiles del jugador y misiles enemigos) no se ven (son sprites que se mueven,
   no van en el snapshot).
2. **Barra de construcción** de estructuras (mientras se levantan) no aparece.
3. **Impacto/flash** cuando un enemigo daña una estructura no se ve.
4. **Game over / Victoria** no aparece en el cliente. **Bug de raíz:** en `update()`, el host hace
   `if (gameState.status !== 'playing') return` **antes** de enviar el snapshot → al morir el núcleo
   deja de emitir y el cliente nunca recibe `status:'gameover'`.
5. El haz de minería del cliente no **pulsa** como el del host (detalle).

---

## 1) HOST — `GameScene.js`

### 1.1 ARREGLO game over: enviar snapshot aunque no sea 'playing'
Mueve el bloque de envío `if (net.isHost && net.conn) { this._snapAccum += d; ... net.send(this.buildSnapshot()) }`
a **antes** del guard `if (gameState.status !== 'playing' || d === 0) return`, justo tras calcular `d`
y el paneo de cámara. Así sigue emitiendo en game over/victoria (el snapshot ya lleva `eco.status`).
> Con `d === 0` (pausa) `_snapAccum` no crece → no spamea. OK.

### 1.2 Misiles en el snapshot (jugador + enemigos)
En `buildSnapshot()` añade:
```js
missiles: [
  ...this.projectiles.map((p) => [Math.round(p.x), Math.round(p.y), p.color]),
  ...this.epSystem.projectiles.map((p) => [Math.round(p.x), Math.round(p.y), p.color]),
],
```

### 1.3 Fracción de construcción por estructura
En el `structs:` del snapshot añade una columna al final con el progreso (0..1):
```js
structs: this.structures.map((s) => [s.id, s.key, Math.round(s.x), Math.round(s.y),
  Math.round(s.hp), Math.round(s.maxHp), s.powered ? 1 : 0, s.building ? 1 : 0,
  s.building && s.buildTime ? Math.round((s.buildProgress / s.buildTime) * 100) / 100 : 1]),
```

---

## 2) CLIENTE — `GameScene.js` (modo remoto)

### 2.1 Barra de construcción + flash de impacto (en `applySnapshot`, bucle de `structs`)
Las estructuras del cliente ya son instancias reales (`createStructure`), así que reusa
`drawBuildBar()` y dispara un flash cuando baja el `hp`. Ajusta el `for` para leer `building` y `frac`:
```js
for (const [id, key, x, y, hp, maxHp, powered, building, frac] of snap.structs) {
  seenS.add(id)
  let s = this.sById.get(id)
  const isNew = !s
  if (isNew) { s = createStructure(key, x, y, this); this.sById.set(id, s) }
  if (!isNew && hp < s.hp) this.hitFlash(x, y)   // recibió daño → impacto
  s.hp = hp; s.maxHp = maxHp
  s.setPowered(!!powered)
  s.building = !!building
  s.buildProgress = (frac ?? 1) * s.buildTime
  s.drawBuildBar()                                // reusa la barra de carga del host
  if (building) s.container.setAlpha(0.6)
  s.drawHpBar()
}
```
Y un helper (reusa el flash de daño de estructuras del host — el mismo de Fase 5):
```js
hitFlash(x, y) {
  const fl = this.add.image(x, y, 'glow').setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD)
    .setScale(0.25).setDepth(20)
  this.tweens.add({ targets: fl, alpha: 0, scale: 0.6, duration: 160, onComplete: () => fl.destroy() })
}
```

### 2.2 Misiles: dibujarlos en el bucle remoto de `update()`
Junto al dibujo de rayos sobre `fxGraphics` (aditivo), añade los misiles del último snapshot:
```js
for (const [x, y, color] of (this._snap?.missiles || [])) {
  fg.fillStyle(color, 0.9); fg.fillCircle(x, y, 3)
  fg.fillStyle(color, 0.4); fg.fillCircle(x, y, 6)
}
```
> ponytail: puntos aditivos desde el snapshot (12 Hz → saltan un poco; los misiles son rápidos y breves).
> Interpolar/poolear con id si se nota feo.

### 2.3 Pulso del haz de minería
Donde dibujas `fx.mining` sobre `beamGraphics`, usa un alfa pulsante como el host:
```js
const pulse = 0.45 + 0.3 * Math.sin(time * 0.012)
for (const [sx, sy, mx, my] of (this._fx?.mining || [])) {
  bg.lineStyle(3, 0x49e07a, pulse); bg.lineBetween(sx, sy, mx, my)
  bg.fillStyle(0x49e07a, pulse); bg.fillCircle(mx, my, 4)
}
```

---

## ACEPTACIÓN
1. `npm run build` limpio. Single-player y host intactos.
2. En red, el cliente ve: **misiles** (de su torreta de misiles y de los enemigos) volando, la **barra
   de construcción** llenándose mientras se levanta una estructura, un **flash** en la estructura cuando
   un enemigo la golpea, y la **pantalla de "NÚCLEO DESTRUIDO" / "VICTORIA"** cuando corresponde.
3. El haz de minería pulsa igual que en el host. Sin fugas (flashes y misiles no acumulan game objects).

## NOTA
Si tras esto el "neón/color" aún se ve distinto en algo concreto, indica **qué** elemento (p. ej. el
glow del núcleo, el color de tal torreta) y se ajusta puntual; el cliente ya reusa el mismo render, así
que cualquier diferencia restante es un dato que falta en el snapshot, no estilo distinto.
