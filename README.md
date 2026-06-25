# Space Game Mission Plus

Remaster web del clásico juego espacial: RTS / Tower Defense / supervivencia en arena.
Expande una red de energía desde tu **Núcleo**, mina meteoritos, construye defensas y
sobrevive a 10 oleadas.

## Stack

- **Vue 3 + Vite** — UI, lobby, HUD y estado de la app.
- **Phaser 3** — motor del juego (render WebGL, física arcade, input mouse/táctil).
- **Tailwind CSS v4** — estilos del HUD y menús.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producción en /dist
npm run preview  # previsualizar el build
```

## Estructura

```
src/
  main.js                 # bootstrap de Vue
  App.vue                 # layout raíz (canvas + HUD)
  style.css               # estilos globales + Tailwind
  components/
    GameCanvas.vue        # monta/desmonta el juego Phaser
    Hud.vue               # overlay de UI (barra superior + barra de construcción)
  game/
    createGame.js         # configuración e instancia de Phaser
    gameState.js          # estado reactivo compartido Phaser <-> Vue
    scenes/
      BootScene.js        # genera texturas (estrellas, glow) procedurales
      GameScene.js        # starfield parallax + Núcleo (Nave Principal)
```

## Estado actual

**Juego jugable completo** (Hitos 1–3):

- Starfield parallax, Núcleo neón animado, HUD.
- Colocación de estructuras con red de energía (flood-fill desde el Núcleo); lo
  desconectado se desactiva. Nodos extienden alcance.
- Recolectores que minan meteoritos; Baterías que suben el cap de minerales.
- 10 oleadas de enemigos pixel-art (verde básico, amarillo rápido, rojo tanque,
  morado jefe) con enjambre y ataque a estructuras.
- Torretas láser y Lanzamisiles (homing + AoE); HP por estructura; Enjambre
  Sanador que repara. Game Over al perder el Núcleo, Victoria al limpiar la ola 10.

## Próximos pasos

1. Lobby / pantalla de inicio (menú, dificultad, instrucciones).
2. Controles de velocidad funcionales (Pausa/Lenta/Normal/Rápida) y sonido.
3. Balanceo de economía y curva de dificultad; persistencia de récords.
