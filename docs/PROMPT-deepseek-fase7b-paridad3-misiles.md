# PROMPT PARA DEEPSEEK — Paridad cliente↔host (3): quitar el lag de los misiles

> Pega este documento completo en DeepSeek. Autocontenido. Phaser/Vue/Vite, JS/ESM, comentarios en
> español. **Requiere paridad 7b-2 ya hecha** (el cliente ya pinta misiles como sprites reales:
> `missile_rod` para el jugador y `star` para los enemigos, agrupados en pools por índice
> `this.pMissiles` / `this.eMissiles`, posicionados dentro de `applySnapshot`). `npm run build` limpio.
> **No toques single-player ni el render del host fuera de lo indicado.**

## PROBLEMA
Los misiles del cliente **van con lag y a saltos**. Causa raíz:
1. Se posicionan **solo cuando llega un snapshot** (~12 Hz, cada ~80 ms) → entre snapshots quedan
   congelados y luego saltan. El host los mueve **cada frame**, así que el cliente siempre va por detrás.
2. El pool es **por índice** (`pMissiles[i]`): el sprite `i` puede ser un misil distinto en el siguiente
   snapshot, así que no se puede interpolar sin que los sprites "salten" entre misiles.

## SOLUCIÓN
Dar a cada misil un **id estable** y una **velocidad** (px/s) en el snapshot. El cliente guarda los
sprites en **Maps por id** y hace **dead-reckoning**: extrapola la posición por velocidad cada frame y,
al recibir un snapshot, **reconcilia** (corrige suavemente hacia la posición autoritativa). Así el misil
se mueve fluido a 60 fps y compensa la latencia en vez de arrastrarse por detrás.

---

## ESTRUCTURA DE DATOS (snapshot)
Cambia las tuplas de misiles. **Antes** (paridad 7b-2):
```
missiles:  [x, y, color, rot]        // jugador (rot = rotación del sprite rod)
emissiles: [x, y, color]             // enemigos
```
**Ahora** (con id + velocidad; la rotación del rod se deriva de la velocidad en el cliente):
```
missiles:  [id, x, y, color, vx, vy] // jugador  (vx, vy en px/s)
emissiles: [id, x, y, color, vx, vy] // enemigos (vx, vy en px/s)
```
- `id`: entero único y estable mientras el misil vive (contador en la escena, compartido).
- `vx, vy`: componentes de velocidad en **píxeles por segundo** (mismo sistema que `p.speed`, que ya es px/s).

---

## 1) HOST — id + velocidad en cada misil

### 1.1 `MissileTurret.fireMissile` (`src/game/structures/MissileTurret.js`)
Al crear el proyectil, añade `id` y la velocidad inicial (a partir del `_dir` que ya calcula):
```js
scene.projectiles.push({
  x: this.x, y: this.y, tx: predX, ty: predY, target,
  speed: this.projSpeed, damage: this.missileDamage, splash: this.splash, color: this.def.color, sprite,
  _dir: { x: dx / d, y: dy / d },
  id: (scene._missileSeq = (scene._missileSeq || 0) + 1),   // id estable
  vx: (dx / d) * this.projSpeed, vy: (dy / d) * this.projSpeed, // velocidad inicial (px/s)
})
```

### 1.2 `GameScene.updateProjectiles` (`src/game/scenes/GameScene.js`)
Tras calcular `newDir` y antes/después de mover el sprite, guarda la velocidad real del frame:
```js
p._dir = newDir
p.vx = newDir.x * p.speed
p.vy = newDir.y * p.speed
p.x += newDir.x * step
p.y += newDir.y * step
```

### 1.3 `EnemyProjectileSystem.spawnMissile` (`src/game/enemies/EnemyProjectiles.js`)
Igual que el jugador: id + velocidad inicial.
```js
this.projectiles.push({
  x, y, tx: predX, ty: predY,
  target, speed: speed || 160,
  damage, splash: splash || 0, color,
  sprite, alive: true,
  _dir: { x: dx / d, y: dy / d },
  id: (this.scene._missileSeq = (this.scene._missileSeq || 0) + 1),
  vx: (dx / d) * (speed || 160), vy: (dy / d) * (speed || 160),
})
```
Y en `EnemyProjectileSystem.update`, donde calcula `newDir`, guarda la velocidad:
```js
this.projectiles[i]._dir = newDir
p.vx = newDir.x * p.speed
p.vy = newDir.y * p.speed
p.x += newDir.x * step
p.y += newDir.y * step
```

### 1.4 `GameScene.buildSnapshot`
Cambia las dos líneas de misiles para incluir id + velocidad (redondeadas):
```js
missiles: this.projectiles.map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.color, Math.round(p.vx || 0), Math.round(p.vy || 0)]),
emissiles: this.epSystem.projectiles.map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.color, Math.round(p.vx || 0), Math.round(p.vy || 0)]),
```

---

## 2) CLIENTE — Maps por id + dead-reckoning

### 2.1 `createRemote`: los pools pasan de arrays a Maps
```js
this.pMissiles = new Map() // id -> sprite 'missile_rod' (jugador)
this.eMissiles = new Map() // id -> sprite 'star' (misiles enemigos)
```
Y en el `SHUTDOWN`, recórrelos como Map:
```js
for (const s of this.pMissiles.values()) s.destroy()
for (const s of this.eMissiles.values()) s.destroy()
```

### 2.2 `applySnapshot`: reemplaza el bloque de pools por índice por reconciliación por id
Sustituye los dos `for` de misiles (los que usaban `pm[i]` / `em[i]`) por esto. La idea: crear el sprite
si es nuevo, guardar `vx/vy` para extrapolar, y **corregir suavemente** la posición hacia la autoritativa
(no teletransportar). Borra los que ya no estén en el snapshot.
```js
// --- misiles del jugador (sprite 'missile_rod', orientado) ---
const seenP = new Set()
for (const [id, x, y, color, vx, vy] of (snap.missiles || [])) {
  seenP.add(id)
  let s = this.pMissiles.get(id)
  if (!s) { // nuevo: aparece directamente en la posición autoritativa
    s = this.add.image(x, y, 'missile_rod').setScale(0.55).setDepth(20).setTint(color)
    this.pMissiles.set(id, s)
  } else {  // reconciliar: acercar a la posición autoritativa sin saltar
    s.x += (x - s.x) * 0.5
    s.y += (y - s.y) * 0.5
  }
  s.vx = vx; s.vy = vy
}
for (const [id, s] of this.pMissiles) if (!seenP.has(id)) { s.destroy(); this.pMissiles.delete(id) }

// --- misiles enemigos (sprite 'star', aditivo, sin rotación) ---
const seenE = new Set()
for (const [id, x, y, color, vx, vy] of (snap.emissiles || [])) {
  seenE.add(id)
  let s = this.eMissiles.get(id)
  if (!s) {
    s = this.add.image(x, y, 'star').setScale(0.8).setBlendMode(Phaser.BlendModes.ADD).setDepth(20).setTint(color)
    this.eMissiles.set(id, s)
  } else {
    s.x += (x - s.x) * 0.5
    s.y += (y - s.y) * 0.5
  }
  s.vx = vx; s.vy = vy
}
for (const [id, s] of this.eMissiles) if (!seenE.has(id)) { s.destroy(); this.eMissiles.delete(id) }
```
> No hace falta dibujar la explosión al destruir: el host ya manda los impactos en `fx.expl` y el cliente
> los reproduce con `explosion()`. El sprite simplemente desaparece y la explosión coincide.

### 2.3 `update` (rama `if (this.remote)`): extrapolar por velocidad cada frame
Dentro del bloque remoto (junto a la interpolación de enemigos/generales), avanza cada misil por su
velocidad. Esto es lo que da el movimiento fluido a 60 fps y quita el lag:
```js
const mdt = delta / 1000
for (const s of this.pMissiles.values()) {
  s.x += s.vx * mdt; s.y += s.vy * mdt
  s.setPosition(s.x, s.y)
  if (s.vx || s.vy) s.setRotation(Math.atan2(s.vy, s.vx) + Math.PI / 2) // rod orientado como el host
}
for (const s of this.eMissiles.values()) {
  s.x += s.vx * mdt; s.y += s.vy * mdt
  s.setPosition(s.x, s.y)
}
```

---

## ACEPTACIÓN
1. `npm run build` limpio. Single-player y host intactos.
2. En red, los misiles del cliente (torreta de misiles del jugador y misiles enemigos) se mueven
   **fluidos y sin lag perceptible**, sin saltos entre snapshots, orientados igual que en el host.
3. Al impactar, el misil desaparece y la explosión coincide con la del host. Sin fugas: al morir un misil
   su sprite se destruye y sale del Map (los Maps no crecen sin parar).

## NOTA
Si aún se nota un pequeño "tirón" al reconciliar, ajusta el factor `0.5` (más bajo = más suave pero más
laggy; más alto = más fiel pero con más saltos). Si los misiles muy rápidos se "pasan" del objetivo entre
snapshots, es esperable (el host autoritativo los corrige en el siguiente snapshot); no añadas predicción
de impacto en el cliente.
