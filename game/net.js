import Peer from 'peerjs'
import { appState } from './appState.js'
import {
  parseIntent, parseHostMessage, createRateLimiter, MAX_INTENT_BYTES,
  HEARTBEAT_MS, TIMEOUT_MS, newSessionToken, PROTOCOL_VERSION,
} from './net/protocol.js'

const ROOM = (code) => 'spacegame-' + code
const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]
const RETRY_DELAYS = [1000, 2000, 4000, 4000, 4000]
const REJOIN_MS = 60000
const TOKEN_KEY = 'sgmp_net_token'

async function iceServers() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    try {
      const response = await fetch('/api/net/ice', { signal: controller.signal })
      if (!response.ok) throw new Error('ICE unavailable')
      const data = await response.json()
      if (!Array.isArray(data.iceServers) || !data.iceServers.length) throw new Error('Invalid ICE response')
      return data.iceServers
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return STUN
  }
}

function savedToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
}

class NetConn {
  constructor(conn, pid = 0) {
    this.conn = conn
    this.pid = pid
    this.name = ''
    this.open = !!conn.open
    this.lastReceived = performance.now()
    this.timer = null
    this.done = false
  }

  send(obj) {
    if (this.open && this.conn.open) this.conn.send(obj)
  }
}

export const net = {
  peer: null,
  conns: [],
  isHost: false,
  myName: '',
  myEquipped: {},
  myPid: null,
  token: null,
  onOpen: () => {},
  onData: () => {},
  onDisconnect: () => {},
  onError: () => {},
  onReconnecting: () => {},
  onReconnected: () => {},
  onHostLost: () => {},
  onSolo: () => {},

  async host(code, name = '') {
    this.close(false)
    const generation = this._generation
    this.isHost = true
    this.myName = name
    this._sessions = new Map()
    this._hadGuest = false
    this._limiter = createRateLimiter()
    const servers = await iceServers()
    if (generation !== this._generation) return
    const peer = new Peer(ROOM(code), { config: { iceServers: servers } })
    this.peer = peer
    peer.on('connection', (conn) => {
      if (this.peer !== peer) { conn.close(); return }
      this._accept(conn)
    })
    peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) peer.reconnect() })
    peer.on('error', (err) => { if (this.peer === peer) this.onError(err) })
  },

  async join(code, name = '') {
    this.close(false)
    const generation = this._generation
    this.isHost = false
    this.myName = name
    this.myPid = null
    this.token = savedToken()
    this._room = ROOM(code)
    this._attempt = 0
    this._reconnecting = false
    const servers = await iceServers()
    if (generation !== this._generation) return
    const peer = new Peer({ config: { iceServers: servers } })
    this.peer = peer
    peer.on('open', () => { if (this.peer === peer) this._connect() })
    peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) peer.reconnect() })
    peer.on('error', () => {
      if (this.peer !== peer) return
      const nc = this.conns[0]
      if (nc) { nc.conn.close(); this._closed(nc) }
      else this._retry()
    })
  },

  _accept(conn) {
    if (this.conns.length >= 3) { conn.close(); return }
    const nc = new NetConn(conn)
    this.conns.push(nc)
    this._wire(nc)
    this._openWatchdog(nc)
    conn.on('open', () => {
      if (nc.done) return
      nc.open = true
      clearTimeout(nc.openTimer)
      this._heartbeat(nc)
    })
  },

  _connect() {
    if (!this.peer || this.peer.destroyed || this.conns.length) return
    const conn = this.peer.connect(this._room)
    const nc = new NetConn(conn, 0)
    this.conns.push(nc)
    this._wire(nc)
    this._openWatchdog(nc)
    conn.on('open', () => {
      if (nc.done) return
      nc.open = true
      clearTimeout(nc.openTimer)
      this._heartbeat(nc)
      nc.send({ t: 'hello', name: this.myName, equipped: this.myEquipped || {}, token: this.token })
    })
  },

  _openWatchdog(nc) {
    nc.openTimer = setTimeout(() => {
      nc.conn.close()
      this._closed(nc)
    }, TIMEOUT_MS)
  },

  _heartbeat(nc) {
    nc.lastReceived = performance.now()
    nc.timer = setInterval(() => {
      if (performance.now() - nc.lastReceived >= TIMEOUT_MS) {
        nc.conn.close()
        this._closed(nc)
      } else {
        nc.send({ t: 'heartbeat' })
      }
    }, HEARTBEAT_MS)
  },

  _wire(nc) {
    nc.conn.on('data', (raw) => {
      if (nc.done) return
      nc.lastReceived = performance.now()
      if (this.isHost) {
        let size
        try { size = JSON.stringify(raw).length } catch { return }
        if (size > MAX_INTENT_BYTES) return
        const msg = parseIntent(raw)
        if (!msg || !this._limiter.allow(nc.pid, msg.t, performance.now())) return
        if (msg.t === 'heartbeat') return
        if (msg.t === 'bye') { nc.intentional = true; nc.conn.close(); this._closed(nc); return }
        if (!nc.authenticated) {
          if (msg.t !== 'hello') return
          this._hello(nc, msg)
          return
        }
        if (msg.t === 'hello') return
        this.onData(msg, nc)
      } else {
        const msg = parseHostMessage(raw)
        if (!msg || msg.t === 'heartbeat') return
        if (msg.t === 'bye') { this._hostLost('left'); return }
        if (msg.t === 'welcome') {
          if (nc.welcomed) return
          nc.welcomed = true
          this.myPid = msg.pid
          this.token = msg.token
          try { if (msg.token) sessionStorage.setItem(TOKEN_KEY, msg.token) } catch { /* storage disabled */ }
          if (this._reconnecting) {
            this._reconnecting = false
            this._attempt = 0
            clearTimeout(this._retryTimer)
            this._retryTimer = null
            this.onReconnected()
          } else {
            this.onOpen(nc)
          }
        } else if (!nc.welcomed) {
          return
        }
        this.onData(msg, nc)
      }
    })
    nc.conn.on('close', () => this._closed(nc))
    nc.conn.on('error', (err) => {
      if (this.isHost) this.onError(err)
      nc.conn.close()
      this._closed(nc)
    })
  },

  _hello(nc, msg) {
    const now = performance.now()
    for (const [pid, session] of this._sessions) {
      if (session.disconnectedAt && now - session.disconnectedAt >= REJOIN_MS) {
        this._sessions.delete(pid)
        this._limiter.forget(pid)
      }
    }
    let pid = null
    for (const [id, session] of this._sessions) {
      if (msg.token && session.token === msg.token && session.disconnectedAt && now - session.disconnectedAt < REJOIN_MS) {
        pid = id
        break
      }
    }
    nc.rejoined = pid != null
    if (pid == null) {
      pid = [1, 2, 3].find((id) => !this._sessions.has(id))
      if (pid == null) { nc.conn.close(); return }
      this._sessions.set(pid, { token: newSessionToken(), name: msg.name, disconnectedAt: 0 })
    }
    const session = this._sessions.get(pid)
    session.disconnectedAt = 0
    nc.pid = pid
    nc.name = session.name || msg.name
    nc.authenticated = true
    this._hadGuest = true
    clearTimeout(this._emptyTimer)
    this._emptyTimer = null
    nc.send({ t: 'welcome', pid, token: session.token, v: PROTOCOL_VERSION })
    this.onData({ ...msg, name: nc.name }, nc)
    this.onOpen(nc)
  },

  _closed(nc) {
    if (nc.done) return
    nc.done = true
    nc.open = false
    clearTimeout(nc.openTimer)
    clearInterval(nc.timer)
    this.conns = this.conns.filter((item) => item !== nc)
    if (this._closing) return
    if (this.isHost) {
      if (!nc.authenticated) return
      const session = this._sessions.get(nc.pid)
      if (nc.intentional) {
        this._sessions.delete(nc.pid)
        this._limiter.forget(nc.pid)
      } else if (session) {
        session.disconnectedAt = performance.now()
      }
      this.onDisconnect(nc)
      this._finishHostIfEmpty()
    } else {
      this.onDisconnect(nc)
      this._retry()
    }
  },

  _retry() {
    if (this._closing || this._retryTimer || this.conns.length) return
    if (this._attempt >= RETRY_DELAYS.length) { this._hostLost('timeout'); return }
    this._reconnecting = true
    const attempt = ++this._attempt
    this.onReconnecting(attempt)
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null
      if (this._closing) return
      if (this.peer?.disconnected) this.peer.reconnect()
      if (this.peer?.open) this._connect()
      else this._retry()
    }, RETRY_DELAYS[attempt - 1])
  },

  _hostLost(reason) {
    const onHostLost = this.onHostLost
    this.close()
    onHostLost(reason)
  },

  _finishHostIfEmpty() {
    if (!this.isHost || !this._hadGuest || appState.view !== 'game' ||
        this.conns.some((nc) => nc.authenticated && !nc.done)) return
    clearTimeout(this._emptyTimer)
    const now = performance.now()
    const grace = Math.max(0, ...[...this._sessions.values()]
      .map((session) => session.disconnectedAt ? REJOIN_MS - (now - session.disconnectedAt) : 0))
    if (grace > 0) {
      this._emptyTimer = setTimeout(() => this._finishHostIfEmpty(), grace)
      return
    }
    const onSolo = this.onSolo
    this.close()
    onSolo()
  },

  send(obj) { for (const nc of this.conns) nc.send(obj) },
  sendTo(pid, obj) { this.conns.find((nc) => nc.pid === pid)?.send(obj) },
  leave() { this.send({ t: 'bye' }); this.close() },
  close(resetHandlers = true) {
    this._closing = true
    this._generation = (this._generation || 0) + 1
    clearTimeout(this._retryTimer)
    clearTimeout(this._emptyTimer)
    this._retryTimer = null
    this._emptyTimer = null
    for (const nc of this.conns) {
      nc.done = true
      clearTimeout(nc.openTimer)
      clearInterval(nc.timer)
      nc.conn.close()
    }
    this.conns = []
    this.peer?.destroy()
    this.peer = null
    this.isHost = false
    this._reconnecting = false
    this._attempt = 0
    this._sessions = null
    this._limiter = null
    this._hadGuest = false
    this._closing = false
    if (resetHandlers) {
      for (const key of ['onOpen', 'onData', 'onDisconnect', 'onError', 'onReconnecting', 'onReconnected', 'onHostLost', 'onSolo']) {
        this[key] = () => {}
      }
    }
  },
}

if (typeof window !== 'undefined') {
  const leaveOnPageExit = () => net.leave()
  window.addEventListener('pagehide', leaveOnPageExit)
  window.addEventListener('beforeunload', leaveOnPageExit)
}
