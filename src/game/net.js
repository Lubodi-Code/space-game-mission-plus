import Peer from 'peerjs'

const ROOM = (code) => 'spacegame-' + code
const MAX_PLAYERS = 4

// Wrapper de conexión con metadatos locales.
class NetConn {
  constructor(conn, pid, name = '') {
    this.conn = conn
    this.pid = pid
    this.name = name
    this.open = conn.open
    conn.on('open', () => { this.open = true })
    conn.on('close', () => { this.open = false })
  }

  send(obj) {
    if (this.conn && this.conn.open) this.conn.send(obj)
  }
}

export const net = {
  peer: null,
  conns: [], // host: lista de clientes; cliente: [conexión al host]
  isHost: false,
  myName: '',
  nextPid: 1, // el host es 0, los clientes 1+
  onOpen: () => {},
  onData: () => {},
  onError: () => {},
  onDisconnect: () => {},

  host(code, myName = '') {
    this.isHost = true
    this.myName = myName
    this.conns = []
    this.nextPid = 1
    this.peer = new Peer(ROOM(code))
    this.peer.on('connection', (c) => this._accept(c))
    this.peer.on('error', (e) => this.onError(e))
  },

  join(code, myName = '') {
    this.isHost = false
    this.myName = myName
    this.conns = []
    this.peer = new Peer()
    this.peer.on('open', () => {
      const c = this.peer.connect(ROOM(code))
      this._bind(c, 0) // el host remoto siempre es pid 0
    })
    this.peer.on('error', (e) => this.onError(e))
  },

  _accept(c) {
    if (this.conns.length >= MAX_PLAYERS - 1) {
      c.close()
      return
    }
    const pid = this.nextPid++
    const nc = new NetConn(c, pid)
    this.conns.push(nc)
    this._wire(nc)
    c.on('open', () => {
      nc.open = true
      this.onOpen(nc)
    })
  },

  _bind(c, pid) {
    const nc = new NetConn(c, pid)
    this.conns.push(nc)
    this._wire(nc)
    c.on('open', () => {
      nc.open = true
      this.onOpen(nc)
    })
  },

  _wire(nc) {
    nc.conn.on('data', (d) => this.onData(d, nc))
    nc.conn.on('close', () => {
      nc.open = false
      this.conns = this.conns.filter((x) => x !== nc)
      this.onDisconnect(nc)
    })
    nc.conn.on('error', (e) => this.onError(e))
  },

  send(obj) {
    for (const nc of this.conns) nc.send(obj)
  },

  sendTo(pid, obj) {
    const nc = this.conns.find((c) => c.pid === pid)
    if (nc) nc.send(obj)
  },

  close() {
    for (const nc of this.conns) nc.conn.close()
    this.conns = []
    if (this.peer) this.peer.destroy()
    this.peer = null
  },
}
