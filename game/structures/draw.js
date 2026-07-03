import Phaser from 'phaser'

export function darken(color) {
  const c = Phaser.Display.Color.IntegerToColor(color)
  return Phaser.Display.Color.GetColor(c.red * 0.18, c.green * 0.18, c.blue * 0.22)
}

export function drawPolygon(g, cx, cy, radius, sides, color, lineWidth, alpha = 1, fillColor = null) {
  const points = []
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2
    points.push(new Phaser.Geom.Point(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius))
  }
  if (fillColor !== null) {
    g.fillStyle(fillColor, 0.85)
    g.beginPath()
    g.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y)
    g.closePath()
    g.fillPath()
  }
  g.lineStyle(lineWidth, color, alpha)
  g.beginPath()
  g.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y)
  g.closePath()
  g.strokePath()
}
