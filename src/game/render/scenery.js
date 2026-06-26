import Phaser from 'phaser'
import { WORLD, STARFIELD } from '../balance.js'

// Fondo decorativo (sin gameplay). Cada función guarda sus objetos en la escena.

export function createNebula(scene) {
  const keys = ['nebula_p', 'nebula_b', 'nebula_t']
  scene.nebulae = []
  for (let i = 0; i < 12; i++) {
    const neb = scene.add.image(
      Phaser.Math.Between(0, WORLD.width),
      Phaser.Math.Between(0, WORLD.height),
      Phaser.Math.RND.pick(keys),
    )
      .setScrollFactor(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(Phaser.Math.FloatBetween(0.25, 0.5))
      .setScale(Phaser.Math.FloatBetween(4, 8))
      .setDepth(-40)
    scene.nebulae.push(neb)
    scene.tweens.add({
      targets: neb, alpha: neb.alpha * 0.5,
      duration: Phaser.Math.Between(6000, 12000),
      yoyo: true, repeat: -1, ease: 'Sine.inOut',
    })
  }
}

export function createStarfield(scene) {
  const layerSpecs = STARFIELD.layers

  for (const spec of layerSpecs) {
    const layer = scene.add.container(0, 0).setDepth(spec.depth)
    for (let i = 0; i < spec.count; i++) {
      const star = scene.add.image(
        Phaser.Math.Between(0, WORLD.width),
        Phaser.Math.Between(0, WORLD.height),
        'star'
      ).setScrollFactor(1)
      star.setScale(Phaser.Math.FloatBetween(spec.scale[0], spec.scale[1])).setAlpha(spec.alpha)
      scene.tweens.add({
        targets: star,
        alpha: spec.alpha * 0.35,
        duration: Phaser.Math.Between(1200, 3200),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 2000),
      })
      layer.add(star)
    }
    scene.starLayers.push(layer)
  }
}
