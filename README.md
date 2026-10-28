# Space Game Mission Plus

Remaster web del clásico juego espacial: RTS / Tower Defense / supervivencia en arena.
Expande una red de energía desde tu **Núcleo**, mina meteoritos, construye defensas y
sobrevive a 10 oleadas.

## Stack

- **Nuxt 4 / Vue 3** — UI, lobby, HUD, estado de la app y API de servidor.
- **Phaser 3** — motor del juego (render WebGL, física arcade, input mouse/táctil).
- **Three.js** — modelos 3D.
- **Tailwind CSS 3** — estilos del HUD y menús.
- **PeerJS** — cooperativo (WebRTC).
- **Supabase** — cuentas y persistencia.
- **Electron** — app de escritorio.

## Desarrollo

```bash
npm install
npm run dev      # nuxt dev (http://localhost:3000)
npm run build    # build de producción (salida en .output/)
npm run preview  # previsualizar el build
npm run desktop:generate  # genera la SPA para escritorio
npm run desktop           # genera y abre Electron
npm run desktop:dist      # instalador Windows (release/)
```

## Estructura

```
app.vue               # layout raíz
pages/                # index.vue (portada), jugar.vue (juego)
components/           # Hud.vue, Lobby.vue, Shop.vue, Research.vue, etc.
game/                 # lógica Phaser (appState.js, gameState.js, bus.js, scenes/, systems/, etc.)
server/               # API de Nuxt (pagos, cuentas)
supabase/migrations/  # base de datos
desktop/              # main.cjs (Electron)
scripts/              # scripts de utilidad/CI
docs/                 # documentación técnica
```

## Estado actual

**Juego jugable completo** (Hitos 1–3):

- Starfield parallax, Núcleo neón animado, HUD, modos de juego (Rápido/Clásico), 10 oleadas, 10 sectores.
- Colocación de estructuras con red de energía (flood-fill desde el Núcleo); lo
  desconectado se desactiva. Nodos extienden alcance.
- Recolectores que minan meteoritos; Baterías que suben el cap de minerales.
- Torretas base y del Arsenal (se desbloquean con Chatarra); armas del General equipables.
- Enemigos con resistencias a misiles o a rayos y un director que elige por dónde atacar.
- Tienda de cosméticos, investigación y progreso por sectores.
- Cooperativo vía PeerJS.
- Lanzamiento como App de escritorio (Windows) y web.

## Próximos pasos

Ver `docs/PLAN-*` y el `CHANGELOG.md`.
