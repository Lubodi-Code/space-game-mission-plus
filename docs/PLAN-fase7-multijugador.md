# Fase 7 — Multijugador (plan, no implementar entero de golpe)

> Es la fase más grande y la única que puede romper el single-player. Se hace **por capas** y se
> **valida el transporte (7a) antes** de tocar la simulación. Cada capa es un prompt aparte; no
> generes 7b/7c hasta que 7a funcione con dos navegadores.

## Decisiones (las mínimas que funcionan)
- **Transporte: PeerJS (WebRTC).** Usa el broker público gratis solo para emparejar; los datos van
  P2P. **Sin servidor que desplegar.** Es la única dependencia nueva justificada (WebRTC a pelo es 10×
  más código). // ponytail: dep que ahorra cientos de líneas; ver rung 5.
  - **Deploy: Vercel (estático).** El build de Vite se despliega sin config; PeerJS encaja porque no
    necesita backend. **NO** hostear el broker `peerjs-server` en Vercel (serverless no mantiene WS):
    usar el broker público, o uno privado en host always-on (Render/Railway) si algún día hace falta.
    Probar en local con dos pestañas / dos dispositivos por IP de LAN.
- **Co-op host-autoritativo.** El **host corre TODA la simulación** (su `GameScene` actual, intacto) y
  **emite snapshots**. Los clientes **no simulan**: mandan intents (construir, mover general, mejorar,
  velocidad) y **renderizan** lo que llega. Evita lockstep determinista (frágil con 200 naves y floats).
- **Compartido:** nexo, estructuras, economía, oleadas. **Por jugador:** su propio General.
- **Snapshots a ~12 Hz** (no 60), el cliente **interpola** posiciones de enemigos. Mantiene el ancho
  de banda manejable. // ponytail: techo conocido; subir Hz o delta-comprimir si hace falta.

## Reparto host/cliente
| | Host | Cliente |
|---|---|---|
| Simulación (enemigos, combate, economía, red) | sí | no |
| Render | sí | sí (desde snapshots) |
| Input propio (construir/general/mejoras) | aplica directo | manda intent al host |
| `gameState` (HUD) | fuente | se rellena desde snapshots |

---

## 7a — SPIKE: conexión + lobby (PRIMER PROMPT, lo único a hacer ahora)
**Meta:** dos navegadores se conectan por un código de sala y se pasan un evento de prueba. **Cero
sincronización de juego todavía.** Si esto no es sólido, lo demás no importa.

- `npm i peerjs`.
- Nuevo `src/game/net.js`: envoltorio mínimo sobre PeerJS.
  ```js
  import Peer from 'peerjs'
  const ROOM = (code) => 'spacegame-' + code

  export const net = {
    peer: null, conn: null, isHost: false,
    onData: () => {}, onOpen: () => {},

    host(code) {
      this.isHost = true
      this.peer = new Peer(ROOM(code))
      this.peer.on('connection', (c) => this._bind(c))
    },
    join(code) {
      this.isHost = false
      this.peer = new Peer()
      this.peer.on('open', () => this._bind(this.peer.connect(ROOM(code))))
    },
    _bind(c) {
      this.conn = c
      c.on('open', () => this.onOpen())
      c.on('data', (d) => this.onData(d))
    },
    send(obj) { if (this.conn && this.conn.open) this.conn.send(obj) },
  }
  ```
- `Lobby.vue`: dos botones — "Crear partida" (pide/genera código, llama `net.host(code)`) y "Unirse"
  (input de código, `net.join(code)`). Mostrar estado: "Esperando…", "Conectado".
- Prueba de humedad: al conectar, host y cliente se mandan `{t:'ping'}` y muestran "ping recibido".
- `appState`: añade `mp: { role: 'solo'|'host'|'client', connected: false, code: null }`.

**Aceptación 7a:** en dos pestañas/equipos, uno crea sala, el otro entra con el código, ambos ven
"conectado" y el ping llega. Nada más. Single-player intacto (sigue habiendo modo solo).

---

## 7b — Sincronización (SEGUNDO PROMPT, solo tras 7a)
- **Host → cliente, ~12 Hz** (no cada frame): un snapshot serializable:
  - enemigos: `[id, type, x, y, hp]` (solo lo que se renderiza/interpola)
  - estructuras: `[id, key, x, y, hp, powered, building, upgrades, fireMode]` (mandar al cambiar +
    cada N para corregir)
  - `core.hp`, economía (`minerals, energy, ...`), `wave/nextWaveIn/enemiesAlive`
  - generales: `[playerId, x, y, hp, alive]`
- **Cliente → host:** intents `{t:'build', key, x, y}`, `{t:'general', x, y}`, `{t:'upgrade', ...}`,
  `{t:'fireMode', ...}`, `{t:'speed', v}`. El host los aplica a su `tryPlace`/`general`/etc.
- IDs estables: estructuras ya tienen `id`; enemigos necesitan `id` (añadir un contador).
- **Aislar el netcode del sim:** el host no cambia su `GameScene`; solo añade un `if (net.isHost)`
  que serializa y emite. El cliente corre una escena de **render** que aplica snapshots (no instancia
  `Enemy`/`Structure` reales; dibuja sprites desde los datos). // ponytail: render tonto separado =
  no tocas el sim que funciona.

## 7c — Render del cliente + interpolación + pulido (TERCER PROMPT)
- Interpolar posición de enemigos entre los dos últimos snapshots.
- HUD del cliente desde snapshots; su General lo mueve localmente y manda intent (con corrección del
  host).
- Reconexión / "host se fue" → volver a lobby. Manejo de errores de PeerJS.

---

## Riesgos / techos (sé consciente)
- Ancho de banda: 200 enemigos × ~12 Hz. Si pesa, baja Hz, recorta campos o delta-encode. (7c)
- Solo **1 cliente** en este plan (host + 1). Para N>2, el host emite a todas las `conn` (lista en
  vez de una). // ponytail: 1v1 co-op primero; lista de conns cuando se pida.
- PeerJS broker público: ocasionalmente lento/caído. Para producción, broker propio (después).

## Alternativa mucho más barata (si "jugar con un amigo" admite misma PC)
**Hotseat local:** dos generales en la misma pantalla, segundo set de teclas. **Cero netcode.** Si te
vale, es 1 día en vez de 2 semanas. Dilo y te lo planteo en su lugar.

---

## Recomendación
Haz **solo 7a** ahora. Si la conexión P2P es estable y te convence, seguimos con 7b. Si lo que quieres
de verdad es jugar con alguien al lado, el **hotseat** te ahorra casi todo el riesgo.
