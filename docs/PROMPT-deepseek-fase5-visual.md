# PROMPT PARA DEEPSEEK — Fase 5: pulido visual espacial (procedural) + disparos/impactos visibles

> Pega este documento completo en DeepSeek. Es autocontenido.
> Proyecto: **Phaser 3.90 + Vue 3 + Vite**, JS / ES modules, Windows. Comentarios en español.
> **No rompas** estructuras, energía, red, oleadas, enemigos ni controles. `npm run build` debe pasar
> limpio. **Sin dependencias nuevas y SIN assets externos**: todo se genera por código (texturas
> canvas + partículas + dibujo). Hay una sección 5e **opcional** para PNG reales más adelante.

---

## OBJETIVO
Que el juego **se vea más dimensional y espacial** y que el **combate sea legible**: hoy los disparos
láser se ven como líneas finas y planas, y las explosiones son un simple círculo. Sin cambiar el
diseño de naves SVG ni de estructuras, añadimos: fondo de **nebulosas con parallax**, **explosiones
con partículas**, y **rayos con brillo + destello de impacto y fogonazo** (prioridad: que el jugador
vea claramente cada disparo y dónde pega).

---

## CONTEXTO DEL CÓDIGO ACTUAL (léelo antes de tocar)
- **BootScene** [src/game/scenes/BootScene.js](../src/game/scenes/BootScene.js): genera texturas canvas
  `star` (punto suave), `glow` (resplandor radial), `missile_rod`. Carga los SVG de naves. **Reusa
  `star`/`glow` como texturas de partículas.**
- **GameScene** [src/game/scenes/GameScene.js](../src/game/scenes/GameScene.js):
  - `createStarfield()` (~988): 3 capas de estrellas con parallax (`scrollFactor: 1`, depth −30/−20/−10).
  - `explosion(x, y, color, radius)` (~936): un círculo que crece y se desvanece (poco vistoso).
  - `drawFx(delta)` (~952): dibuja los **láseres del jugador** (`this.lasers`) sobre `this.fxGraphics`
    (líneas planas) y llama `this.epSystem.draw(g)`.
  - `this.fxGraphics = this.add.graphics().setDepth(30)` se crea en `create()`.
- **Rayos enemigos** [src/game/enemies/EnemyProjectiles.js](../src/game/enemies/EnemyProjectiles.js):
  `draw(graphics)` dibuja cada beam como **una sola línea** (`lineStyle(width,color,a)`), `width` por
  defecto pequeño.
- **Ataque LIGHT_LASER** [behaviors/attack.js](../src/game/enemies/behaviors/attack.js): dispara con
  `world.fireEnemyBeam({ ..., width: 1.5 })` (fino).

> **Rendimiento:** con ~200 enemigos disparando, **NO** crees un game object por disparo/impacto (sería
> un vendaval de GC). Los rayos, su brillo, el impacto y el fogonazo se dibujan **sobre `fxGraphics`**
> (coste casi nulo). Las **partículas** se usan solo en eventos poco frecuentes (muertes/explosiones).

**Implementa en orden 5a → 5d. 5e es opcional.**

---

## 5a — Fondo de nebulosas con parallax

### 5a.1 Texturas de nebulosa (`BootScene.js`)
Añade un generador y créalas en `create()` (antes de `scene.start`):
```js
makeNebulaTexture(key, r, g, b) {
  const size = 256
  const canvas = this.textures.createCanvas(key, size, size)
  const ctx = canvas.getContext()
  for (let i = 0; i < 6; i++) {
    const cx = Phaser.Math.Between(60, size - 60)
    const cy = Phaser.Math.Between(60, size - 60)
    const rad = Phaser.Math.Between(50, 110)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
    grad.addColorStop(0, `rgba(${r},${g},${b},0.18)`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
  }
  canvas.refresh()
}
```
En `create()`:
```js
this.makeNebulaTexture('nebula_p', 140, 90, 200) // púrpura
this.makeNebulaTexture('nebula_b', 80, 140, 220) // azul
this.makeNebulaTexture('nebula_t', 60, 180, 170) // turquesa
```

### 5a.2 Colocar nebulosas (`GameScene.js`)
Nuevo método `createNebula()` llamado en `create()` **antes** de `createStarfield()`:
```js
createNebula() {
  const keys = ['nebula_p', 'nebula_b', 'nebula_t']
  for (let i = 0; i < 12; i++) {
    const neb = this.add.image(
      Phaser.Math.Between(0, WORLD.width),
      Phaser.Math.Between(0, WORLD.height),
      Phaser.Math.RND.pick(keys),
    )
      .setScrollFactor(0.5)            // se mueve más lento que el mundo → sensación de lejanía
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(Phaser.Math.FloatBetween(0.25, 0.5))
      .setScale(Phaser.Math.FloatBetween(4, 8))
      .setDepth(-40)                   // detrás del starfield (−30/−20/−10)
    this.tweens.add({                  // deriva muy lenta para que “respire”
      targets: neb, alpha: neb.alpha * 0.5,
      duration: Phaser.Math.Between(6000, 12000),
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
    })
  }
}
```

**Aceptación 5a:** el fondo muestra manchas de nebulosa de colores suaves, más lentas que las
estrellas al desplazar la cámara (profundidad). Sin impacto de rendimiento.

---

## 5b — Explosiones con partículas

Reemplaza `explosion(x, y, color, radius)` por un **flash + ráfaga de partículas** (reusa la textura
`star`, que se tinta):
```js
explosion(x, y, color, radius) {
  // 1) Flash/anillo (lo de ahora, rápido)
  const ring = this.add.graphics().setDepth(28).setBlendMode(Phaser.BlendModes.ADD)
  ring.fillStyle(color, 0.5).fillCircle(x, y, radius * 0.6)
  ring.lineStyle(2, color, 0.9).strokeCircle(x, y, radius * 0.6)
  this.tweens.add({
    targets: ring, scale: 2.2, alpha: 0,
    duration: FX.explosionMs, ease: 'Quad.out',
    onComplete: () => ring.destroy(),
  })

  // 2) Ráfaga de chispas (additive). Se autodestruye.
  const burst = this.add.particles(x, y, 'star', {
    speed: { min: 40, max: 40 + radius * 6 },
    angle: { min: 0, max: 360 },
    lifespan: 380,
    scale: { start: Math.max(0.5, radius / 24), end: 0 },
    alpha: { start: 1, end: 0 },
    blendMode: 'ADD',
    tint: color,
    quantity: Math.min(24, 8 + Math.round(radius / 3)),
    emitting: false,
  }).setDepth(29)
  burst.explode()
  this.time.delayedCall(450, () => burst.destroy())
}
```
(Phaser 3.90: `this.add.particles(x, y, texture, config)` + `.explode()`.)

**Aceptación 5b:** al morir enemigos/estructuras salta un destello con chispas que vuelan y se apagan;
sin fugas (los emisores se destruyen).

---

## 5c — Rayos con brillo + IMPACTO + fogonazo (el detalle clave)

**Meta:** que cada disparo láser se **vea** (brillo neón) y muestre **dónde pega** (impacto) y **de
dónde sale** (fogonazo). Todo dibujado sobre `fxGraphics` → coste casi nulo aunque disparen 200.

### 5c.1 `fxGraphics` en modo aditivo (`GameScene.create`)
Donde se crea `this.fxGraphics`, añade el blend aditivo para que las líneas brillen:
```js
this.fxGraphics = this.add.graphics().setDepth(30).setBlendMode(Phaser.BlendModes.ADD)
```

### 5c.2 Función de dibujo de rayo reutilizable
Define un helper (en GameScene, o como función exportada que ambos sitios usen) que pinta **halo +
núcleo + impacto + fogonazo** de un rayo con alfa `a`:
```js
// Dibuja un rayo “con cuerpo”: halo ancho tenue, núcleo brillante, y puntos de
// impacto (extremo destino) y fogonazo (extremo origen).
drawBeam(g, x1, y1, x2, y2, color, width, a) {
  g.lineStyle(width * 3, color, a * 0.22); g.lineBetween(x1, y1, x2, y2) // halo
  g.lineStyle(width, color, a);            g.lineBetween(x1, y1, x2, y2) // núcleo
  g.fillStyle(color, a * 0.9); g.fillCircle(x2, y2, width * 2.2)         // impacto
  g.fillStyle(color, a * 0.6); g.fillCircle(x1, y1, width * 1.4)         // fogonazo
}
```

### 5c.3 Láseres del jugador (`drawFx`)
Sustituye el `lineStyle/strokePath` actual de cada `this.lasers` por:
```js
this.drawBeam(g, l.x1, l.y1, l.x2, l.y2, l.color, l.width ?? 2.5, a)
```
(mantén el resto del bucle: `l.ttl -= delta`, el `splice`, etc.)

### 5c.4 Rayos enemigos (`EnemyProjectiles.draw`)
Reescribe `draw(graphics)` para usar el mismo cuerpo halo+núcleo+impacto+fogonazo (replica el helper
aquí, o expórtalo desde un módulo compartido y úsalo en ambos sitios):
```js
draw(graphics) {
  for (const b of this.beams) {
    const a = Math.max(0, b.ttl / 120)
    const w = b.width
    graphics.lineStyle(w * 3, b.color, a * 0.22); graphics.lineBetween(b.x1, b.y1, b.x2, b.y2)
    graphics.lineStyle(w, b.color, a);            graphics.lineBetween(b.x1, b.y1, b.x2, b.y2)
    graphics.fillStyle(b.color, a * 0.9); graphics.fillCircle(b.x2, b.y2, w * 2.2)
    graphics.fillStyle(b.color, a * 0.6); graphics.fillCircle(b.x1, b.y1, w * 1.4)
  }
}
```

### 5c.5 Subir el grosor del láser pequeño (`behaviors/attack.js`)
En `LIGHT_LASER`, cambia `width: 1.5` por `width: 2.5` (más visible). Deja los demás beams como están
(saboteur 3, nodriza 8) — ya se beneficiarán del halo/impacto.

**Aceptación 5c:** los disparos de grunts/brutes se ven como rayos neón con un **punto de impacto**
claro en el objetivo y un fogonazo en el origen; los rayos de saboteur/nodriza brillan más; legible
incluso con la cámara alejada y muchos enemigos; sin caída de FPS.

---

## 5d — Flash de daño en estructuras (juice, ligero)

Cuando una estructura recibe daño, un destello rápido (las estructuras son **pocas**, aquí sí vale un
game object con tween). En `src/game/structures/Structure.js`, dentro de `damage(dmg)`, antes de
comprobar la muerte, añade un destello aditivo:
```js
const fl = this.scene.add.image(this.x, this.y, 'glow')
  .setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD)
  .setScale(0.25).setDepth(20)
this.scene.tweens.add({
  targets: fl, alpha: 0, scale: 0.5, duration: 160,
  onComplete: () => fl.destroy(),
})
```

**Aceptación 5d:** golpear una estructura produce un parpadeo breve; sin fugas.

---

## 5e — (OPCIONAL, para más adelante) Pipeline de assets PNG

Solo si en el futuro hay arte real. **No** es necesario para esta fase. Cuando se quiera:
- `public/assets/{enemies,structures,fx,bg}/` + un `manifest.json`.
- Cargar en `BootScene.preload()` con `this.load.atlas(...)` / `this.load.spritesheet(...)`.
- Sustituir las texturas de naves/estructuras/fx por las del atlas, **manteniendo el camino
  procedural como fallback** si falta un asset (`this.textures.exists(key) ? key : 'fallback'`).
Déjalo documentado pero **sin implementar** ahora.

---

## CRITERIOS DE ACEPTACIÓN GLOBALES
1. `npm run build` limpio; el juego arranca sin errores.
2. Fondo con nebulosas y parallax; ambiente más “espacial y con profundidad”.
3. **Cada disparo láser es claramente visible**, con brillo, **impacto** en el objetivo y fogonazo.
4. Explosiones con partículas; flash al dañar estructuras.
5. **Rendimiento intacto con ~200 enemigos** (rayos/impactos dibujados en `fxGraphics`, no game
   objects por disparo). Sin fugas de memoria.
6. Sin regresiones en jugabilidad (estructuras, energía, red, oleadas, enemigos, controles).

## ENTREGABLE
Resumen de archivos cambiados por bloque (5a–5d). No incluyas Fase 6 (nave “General”) ni Fase 7
(multijugador): tienen su propio prompt.
