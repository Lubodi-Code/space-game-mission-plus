import Phaser from 'phaser'

// Blend aditivo que suma SOLO el RGB y deja intacto el alpha del canvas.
//
// Por qué: el canvas de Phaser es `transparent: true` y se compone sobre la capa Three.js. El ADD
// normal de Phaser (func [ONE, ONE]) acumula también el canal alpha. Al componer el canvas
// premultiplicado sobre Three.js, ese alpha atenúa el fondo dentro del cuadro del sprite del glow:
// se ve un cuadrado tintado alrededor de cada estructura y los resplandores no se combinan (se
// "superponen"). Sumando solo RGB (alpha destino = ONE, alpha origen = ZERO) cada glow añade luz
// pura sobre el fondo y dos glows que se solapan se suman → se combinan sin cuadros.
//
// Fallback a BlendModes.ADD si no hay WebGL (renderer Canvas).
let glowBlendMode = Phaser.BlendModes.ADD

export function registerGlowBlend(renderer) {
  const gl = renderer && renderer.gl
  if (gl) {
    glowBlendMode = renderer.addBlendMode([gl.ONE, gl.ONE, gl.ZERO, gl.ONE], gl.FUNC_ADD)
  }
  return glowBlendMode
}

export function glowBlend() {
  return glowBlendMode
}
