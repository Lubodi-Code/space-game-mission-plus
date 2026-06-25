# 📋 Spec — Expansión del Mapa (Mundo + Cámara)
**Proyecto:** Space Game Mission Plus
**Para:** implementación por IA (OpenCode).

---

## 1. Objetivo y alcance

**Objetivo:** convertir el "mundo = pantalla" actual en un **mundo fijo grande con cámara** que el jugador puede desplazar (pan) y acercar/alejar (zoom), manteciendo el Núcleo en el centro del mundo.

**Sí incluye:**
- Mundo fijo (p. ej. 2400×1600) con límites de cámara.
- Pan (arrastrar / teclado) y zoom (rueda / pinch).
- Migración de TODA la lógica de input a **coordenadas de mundo** (`worldX/worldY`).
- Meteoritos repartidos por el mundo y enemigos spawneando en el perímetro del mundo.
- Parallax del starfield vía cámara.
- (Opcional) Minimapa en una esquina.

**NO incluye:** cambios de arte/sprites, nuevos enemigos/estructuras, balance.

---

## 2. Contexto del código actual

- **`src/game/createGame.js`** — Phaser con `Scale.RESIZE`. Se mantiene RESIZE.
- **`src/game/scenes/GameScene.js`** — toda la lógica.
- **`src/game/balance.js`** — constantes centralizadas.
- **`src/components/Hud.vue`** — overlay Vue (no se toca, salvo minimapa).
- **Handles DEV:** `window.__PHASER_GAME__`, `window.__GAMESTATE__`.

---

## 3. Decisiones de diseño

- **Mundo fijo:** `WORLD = { width: 2400, height: 1600 }`.
- **Cámara** arranca centrada en el Núcleo, `zoom = 1`, límites = bordes del mundo.
- **Construir solo con tap/clic limpio** (sin arrastre). Arrastrar = pan.
- Mantener `Scale.RESIZE`.
- Respetar el **delta escalado por velocidad** (`d = delta * this.speed`).

---

## 4. Nuevas constantes — `src/game/balance.js`

```js
export const WORLD = { width: 2400, height: 1600 }

export const CAMERA = {
  minZoom: 0.5,
  maxZoom: 1.4,
  startZoom: 1,
  zoomStep: 0.1,
  keyPanSpeed: 700,
  dragThreshold: 6,
}
```

Ajustar METEOR:
```js
export const METEOR = { count: 34, minDist: 220, maxDist: 1000, amountMin: 450, amountMax: 750 }
```

---

## 5. Cámara y límites — `GameScene.create()`

1. `this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)`
2. `this.cameras.main.setZoom(CAMERA.startZoom)`
3. Núcleo en `WORLD.width/2, WORLD.height/2`
4. `this.cameras.main.centerOn(core.x, core.y)`
5. `this.cam = this.cameras.main`
6. Recentrar con Espacio

---

## 6. Migración a coordenadas de mundo

### 6.1 Input — usar `p.worldX/p.worldY`
### 6.2 Meteoritos — repartir en todo el mundo
### 6.3 Spawn de enemigos — perímetro del mundo
### 6.4 `handleResize` — ya no reposiciona estructuras

---

## 7. Controles de cámara

### 7.1 Pan por arrastre + tap-vs-drag
### 7.2 Zoom (rueda + pinch)
### 7.3 Teclado WASD/flechas

---

## 8. Starfield con parallax

Baseline: estrellas en coordenadas de mundo con `scrollFactor 1`, quitar drift manual.

---

## 9. Minimapa (OPCIONAL)

Segunda cámara en esquina inferior izquierda.

---

## 10. Orden de implementación

1. Constantes + cámara fija
2. Migrar input a `worldX/worldY`
3. Pan por arrastre + tap-vs-drag
4. Zoom (rueda + pinch)
5. Meteoritos y spawns por el mundo
6. Starfield baseline
7. (Opcional) parallax / minimapa
8. `handleResize` simplificado + recentrar

---

## 11. Checklist de aceptación

- Build limpio tras cada paso
- Núcleo centrado, cámara clamp en bordes
- Construcción exacta bajo el cursor en cualquier zoom/posición
- Arrastrar = pan, tap = construir, clic derecho = cancelar
- Zoom rueda y pinch en `[0.5, 1.4]`
- Enemigos desde el perímetro del mundo
- Meteoritos repartidos por el mundo
- Pausa congela simulación, pan/zoom disponibles
- `scene.restart()` recentra cámara

---

## 12. Riesgos / NO romper

- Coordenadas pantalla vs mundo
- Tap-vs-drag sin romper modo construcción continuo
- Delta escalado en pan por teclado
- Fugas de objetos en SHUTDOWN
- Handles DEV intactos
