import Peer from 'peerjs'

const ROOM = (code) => 'spacegame-' + code

export const net = {
  peer: null,
  conn: null,
  isHost: false,
  onOpen: () => {},
  onData: () => {},
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
