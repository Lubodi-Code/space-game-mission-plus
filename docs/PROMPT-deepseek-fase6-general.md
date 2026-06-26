# PROMPT PARA DEEPSEEK — Fase 6: nave "General" (versión mínima)

> Pega este documento completo en DeepSeek. Autocontenido. Phaser 3.90 + Vue 3 + Vite, JS/ESM,
> comentarios en español. `npm run build` limpio. Sin dependencias nuevas. **No te pases de
> ingeniería**: implementa solo lo de abajo, nada de IA de enemigos que persigan al general ni de
> seguimiento de cámara.

## OBJETIVO
Una mini-nave controlable (el "General"). Si **muere → no se puede construir** hasta que **reaparece**
tras un temporizador. Movimiento por **clic en el suelo** (no toques WASD: ya mueve la cámara).

## DECISIONES (mínimas a propósito)
- **Mover con clic en suelo vacío** — reutiliza la rama de `pointerup` que hoy deselecciona. Sin
  teclas nuevas (evita el conflicto con el paneo WASD).
- **El general muere por contacto** con enemigos cercanos (usa el `enemyGrid` que ya existe). Los
  enemigos **no** lo persiguen — eso sería otra fase. // ponytail: contacto basta; IA de caza si se pide.
- Reaparece en el núcleo tras el respawn.

---

## 1) Archivo nuevo: `src/game/General.js`
```js
import Phaser from 'phaser'

const HP = 120, SPEED = 280, RADIUS = 16, CONTACT_DPS = 25, RESPAWN_MS = 8000

export class General {
  constructor(scene, x, y) {
    this.scene = scene
    this.x = x; this.y = y
    this.tx = x; this.ty = y           // destino de movimiento
    this.hp = HP; this.maxHp = HP
    this.radius = RADIUS
    this.alive = true
    this.respawn = 0
    // ponytail: reusa un SVG existente tintado en cian en vez de arte nuevo
    this.sprite = scene.add.image(x, y, 'enemy_skirmisher')
      .setTint(0x8be9fd).setScale(1.3).setDepth(17)
    this.bar = scene.add.graphics().setDepth(18)
  }

  moveTo(x, y) { if (this.alive) { this.tx = x; this.ty = y } }

  // dt en SEGUNDOS (igual que los enemigos).
  update(dt, world) {
    if (!this.alive) {
      this.respawn -= dt * 1000
      if (this.respawn <= 0) this.revive(world.core)
      return
    }
    // mover hacia el destino
    const dx = this.tx - this.x, dy = this.ty - this.y
    const d = Math.hypot(dx, dy)
    if (d > 4) {
      const step = Math.min(SPEED * dt, d)
      this.x += (dx / d) * step; this.y += (dy / d) * step
      this.sprite.setRotation(Math.atan2(dy, dx))
    }
    this.sprite.setPosition(this.x, this.y)

    // daño por contacto con enemigos cercanos
    const grid = world.enemyGrid
    if (grid) {
      let touching = false
      grid.forEachNear(this.x, this.y, this.radius + 24, (e) => {
        if (e.dead) return
        if (Math.hypot(e.x - this.x, e.y - this.y) < this.radius + e.radius) touching = true
      })
      if (touching) this.hp -= CONTACT_DPS * dt
    }
    if (this.hp <= 0) this.die()

    // barra de HP
    const g = this.bar; g.clear()
    if (this.hp < this.maxHp) {
      const w = 24, frac = Math.max(0, this.hp / this.maxHp), by = this.y - 22
      g.fillStyle(0x000000, 0.6).fillRect(this.x - w/2 - 1, by - 1, w + 2, 5)
      g.fillStyle(0x8be9fd, 1).fillRect(this.x - w/2, by, w * frac, 3)
    }
  }

  die() {
    this.alive = false
    this.respawn = RESPAWN_MS
    this.sprite.setVisible(false)
    this.bar.clear()
    this.scene.explosion(this.x, this.y, 0x8be9fd, 40)
  }

  revive(core) {
    this.x = this.tx = core.x; this.y = this.ty = core.y
    this.hp = this.maxHp
    this.alive = true
    this.sprite.setVisible(true).setPosition(this.x, this.y)
  }
}
```

## 2) `gameState.js`
Añade al estado reactivo (y replícalo en `resetGameState`):
```js
general: { alive: true, hp: 120, hpMax: 120, respawnIn: 0 },
```

## 3) `GameScene.js`
- En `create()`, tras crear el núcleo y el grid: `this.general = new General(this, this.core.x + 60, this.core.y)`.
- En `update()` (junto a `updateEnemies`), pasa **segundos**: `this.general.update(d / 1000, this.world)`.
  Luego espeja al HUD:
  ```js
  gameState.general.alive = this.general.alive
  gameState.general.hp = Math.ceil(this.general.hp)
  gameState.general.respawnIn = Math.ceil(this.general.respawn / 1000)
  ```
- En `tryPlace(x, y)`, al principio: `if (!this.general.alive) { this.flashPlacementFeedback(false); return }`.
- En el `pointerup` de selección, en la rama final `else { this.deselectStructure() }` (clic en vacío,
  sin estructura ni foco): añade también `this.general.moveTo(wx, wy)`.
- En el `SHUTDOWN`/restart, destruye `this.general.sprite` y `this.general.bar` si hace falta.

## 4) `Hud.vue`
- Indicador de estado del general (reusa el patrón de la barra del núcleo): HP en cian; si
  `!gameState.general.alive`, muestra `General caído — reaparece en {{ gameState.general.respawnIn }}s`.
- Opcional: atenúa la barra de construcción cuando el general está caído (el bloqueo real ya está en
  `tryPlace`).

## ACEPTACIÓN
1. `npm run build` limpio.
2. El general aparece junto al núcleo; **clic en suelo vacío** lo mueve hacia ahí.
3. Si toca enemigos pierde HP y **muere**; mientras está caído **no se puede construir** y el HUD
   muestra la cuenta atrás; al expirar **reaparece** en el núcleo a vida completa.
4. Sin regresiones (selección de estructuras, paneo WASD, oleadas, energía).

## Fuera de alcance (otra fase si se pide)
Enemigos que persigan al general, seguimiento de cámara, disparo del general. No los implementes.
