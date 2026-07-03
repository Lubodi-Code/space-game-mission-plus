export class SpatialGrid {
  constructor(cellSize) {
    this.cell = cellSize
    this.map = new Map()
  }
  _key(cx, cy) { return cx * 73856093 ^ cy * 19349663 }
  clear() { this.map.clear() }
  insert(item) {
    const cx = Math.floor(item.x / this.cell)
    const cy = Math.floor(item.y / this.cell)
    const k = this._key(cx, cy)
    let arr = this.map.get(k)
    if (!arr) { arr = []; this.map.set(k, arr) }
    arr.push(item)
  }
  forEachNear(x, y, radius, cb) {
    const minx = Math.floor((x - radius) / this.cell)
    const maxx = Math.floor((x + radius) / this.cell)
    const miny = Math.floor((y - radius) / this.cell)
    const maxy = Math.floor((y + radius) / this.cell)
    for (let cx = minx; cx <= maxx; cx++) {
      for (let cy = miny; cy <= maxy; cy++) {
        const arr = this.map.get(this._key(cx, cy))
        if (!arr) continue
        for (let i = 0; i < arr.length; i++) cb(arr[i])
      }
    }
  }
}
