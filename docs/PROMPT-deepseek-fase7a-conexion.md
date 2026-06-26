# PROMPT PARA DEEPSEEK — Fase 7a: conexión P2P + lobby (SPIKE)

> Pega este documento completo en DeepSeek. Autocontenido. Phaser/Vue/Vite, JS/ESM, comentarios en
> español. **Solo el spike de conexión: NADA de sincronizar el juego todavía.** Si esto no conecta
> de forma estable entre dos navegadores, no seguimos. `npm run build` limpio. No rompas el single-
> player (el botón JUGAR debe seguir funcionando igual).

## OBJETIVO
Dos navegadores se conectan por un **código de sala** vía **PeerJS** (broker público, sin servidor) y
se pasan un **ping/pong** de prueba. El lobby muestra el estado. Nada más.

## 1) Dependencia
`npm i peerjs`

## 2) Nuevo: `src/game/net.js`
Envoltorio mínimo. Sin estado de juego, solo transporte + callbacks.
```js
import Peer from 'peerjs'

const ROOM = (code) => 'spacegame-' + code

export const net = {
  peer: null,
  conn: null,
  isHost: false,
  onOpen: () => {},   // se llama cuando el canal de datos está abierto
  onData: () => {},   // se llama con cada objeto recibido
  onError: () => {},

  host(code) {
    this.isHost = true
    this.peer = new Peer(ROOM(code))
    this.peer.on('connection', (c) => this._bind(c))
    this.peer.on('error', (e) => this.onError(e))
  },

  join(code) {
    this.isHost = false
    this.peer = new Peer()
    this.peer.on('open', () => this._bind(this.peer.connect(ROOM(code))))
    this.peer.on('error', (e) => this.onError(e))
  },

  _bind(c) {
    this.conn = c
    c.on('open', () => this.onOpen())
    c.on('data', (d) => this.onData(d))
  },

  send(obj) {
    if (this.conn && this.conn.open) this.conn.send(obj)
  },

  close() {
    if (this.conn) this.conn.close()
    if (this.peer) this.peer.destroy()
    this.peer = this.conn = null
  },
}
```

## 3) `src/game/appState.js`
Añade al estado reactivo:
```js
mp: { role: 'solo', connected: false, code: null, ping: false }, // role: 'solo'|'host'|'client'
```

## 4) `src/components/Lobby.vue`
Debajo del botón **JUGAR** (single-player intacto), añade una sección de multijugador. Lógica en
`<script setup>`:
```js
import { net } from '../game/net.js'
import { appState } from '../game/appState.js'

const joinCode = ref('')

function hostGame() {
  const code = Math.random().toString(36).slice(2, 6).toUpperCase() // 4 chars
  appState.mp.role = 'host'
  appState.mp.code = code
  net.onOpen = () => { appState.mp.connected = true; net.send({ t: 'ping' }) }
  net.onData = (d) => { if (d.t === 'pong') appState.mp.ping = true }
  net.onError = () => { appState.mp.role = 'solo'; appState.mp.code = null }
  net.host(code)
}

function joinGame() {
  if (!joinCode.value) return
  appState.mp.role = 'client'
  appState.mp.code = joinCode.value.toUpperCase()
  net.onOpen = () => { appState.mp.connected = true }
  net.onData = (d) => { if (d.t === 'ping') { appState.mp.ping = true; net.send({ t: 'pong' }) } }
  net.onError = () => { appState.mp.role = 'solo' }
  net.join(appState.mp.code)
}
```
UI (debajo de JUGAR): un botón **"Crear partida"** (`hostGame`) y un input + botón **"Unirse"**
(`joinGame`). Estado:
- host con código: mostrar `Código: {{ appState.mp.code }} — esperando…`
- `appState.mp.connected`: mostrar **"Conectado"**.
- `appState.mp.ping`: mostrar **"ping OK ✓"** (prueba de canal de datos en ambos sentidos).
Usa las clases existentes (`diff-btn`, `play-btn`, etc.); no hace falta CSS nuevo elaborado.

## ACEPTACIÓN
1. `npm run build` limpio; el botón **JUGAR** (solo) sigue funcionando igual.
2. En dos pestañas/equipos: una crea partida (sale un código), la otra entra con ese código → **ambas
   muestran "Conectado" y "ping OK"**.
3. Funciona en `npm run dev` (localhost, dos pestañas) y desplegado en Vercel (HTTPS).

## FUERA DE ALCANCE (no lo hagas)
Arrancar la partida en red, snapshots, mover generales, sincronizar enemigos/estructuras. Eso es 7b.
El spike termina en "Conectado + ping OK" desde el lobby.
