# Tablero inclinado (vista 3D ligera)

Objetivo: el tablero de juego (meteoritos, estructuras, naves, enlaces, rayos, barras, fantasma de
construcción) se ve inclinado ~30° en lugar de cenital puro. El FONDO (bgScene de ThreeLayer) no
cambia.

## Arquitectura

1. **Cámara ortográfica inclinada** (game/three/tilt.js): la cámara del juego en ThreeLayer deja de
   mirar recto hacia -Z y se inclina `TILT_DEG` alrededor del eje X de pantalla. Ortográfica: la escala
   horizontal es uniforme y el volumen de las piezas (paredes laterales) se ve. El suelo del juego es el
   plano z = 0 en coordenadas de MUNDO de Phaser (x derecha, y hacia ABAJO en pantalla; convención
   actual de ThreeLayer: frustum con top < bottom = Y invertida).
   - Con la inclinación, la franja de suelo visible es un rectángulo de ancho `W` (igual que hoy) y alto
     `H / cos(TILT)` (más alto que la pantalla).
2. **Phaser como textura** (ThreeLayer + createGame): el canvas de Phaser deja de mostrarse (opacity 0,
   sigue en el DOM para recibir input). Su contenido (enlaces, rayos, barras, textos, fantasma) se sube
   cada frame como `CanvasTexture` a un quad que cubre exactamente el `worldView` de Phaser sobre el
   plano z = 0, dentro de la escena inclinada. Así todo lo 2D se inclina junto con lo 3D sin reescribirlo.
   - Para que el quad cubra todo el suelo visible, el canvas de Phaser mide `alto_pantalla / cos(TILT)`
     (en píxeles de juego) y se estira por CSS al alto de la pantalla (invisible).
   - El quad se dibuja DESPUÉS de los modelos 3D, sin depthTest, con blending premultiplicado (el canvas
     de Phaser es transparente).
3. **Input** (game/input/tiltInput.js): se parchea `game.input.transformPointer` para que la posición del
   puntero en pantalla se convierta: pantalla → rayo de la cámara inclinada → punto del suelo (mundo) →
   píxel del canvas de Phaser. Con eso `pointer.worldX/worldY` vuelven a ser correctos y TODO el código
   de juego (construir, seleccionar, habilidades, arrastre, pinza, rueda) queda igual.

## Contrato de game/three/tilt.js (tarea 1)

```js
export const TILT_DEG = 30
export const TILT = TILT_DEG * Math.PI / 180
// Alto del canvas de Phaser en píxeles de juego para un viewport de alto h (px de juego).
export function phaserHeightFor(h)            // → Math.ceil(h / Math.cos(TILT))
// Configura una OrthographicCamera de Three para que:
//  - el punto del suelo (view.x + view.width/2, view.y + view.height/2) quede en el centro de pantalla,
//  - el ancho de suelo visible en pantalla sea view.width,
//  - todo el rectángulo view (el worldView de Phaser, ya con el alto extendido) quede exactamente
//    cubierto de borde superior a inferior de la pantalla,
//  - Y de mundo hacia ABAJO en pantalla, "lejos" = arriba.
export function updateTiltCamera(camera, view /* {x,y,width,height} */, viewportPx /* {w,h} */)
// Pantalla (px dentro del viewport, 0..w, 0..h) → punto del suelo z=0 en mundo.
export function screenToGround(camera, sx, sy, viewportPx) // → { x, y }
// Mundo (x,y,z=0 por defecto) → pantalla px.
export function groundToScreen(camera, x, y, viewportPx, z = 0) // → { x, y }
```

## Tareas (Codex)

- T1: game/three/tilt.js + scripts/check-tilt.mjs (matemática pura, verificable en node).
- T2: game/three/ThreeLayer.js + game/createGame.js (cámara inclinada, quad con la textura de Phaser,
  canvas de Phaser invisible y más alto).
- T3: game/input/tiltInput.js + instalarlo desde game/scenes/GameScene.js (parche de transformPointer).
