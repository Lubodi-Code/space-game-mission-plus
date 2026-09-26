// Catálogo compartido cliente/servidor: datos puros, sin Vue ni navegador.
// El SERVIDOR es quien decide precios al cobrar o canjear; el cliente solo los muestra.

// Paquetes de Cristales (lo único que se vende con dinero real). priceCRC en colones enteros;
// la conversión a la unidad de ONVO vive en server/utils/onvo.ts (toOnvoAmount).
export const CRYSTAL_PACKS = [
  { id: 'pack_s', crystals: 120, bonus: 0, priceCRC: 1000, label: 'Bolsa de Cristales' },
  { id: 'pack_m', crystals: 300, bonus: 30, priceCRC: 2200, label: 'Cofre de Cristales', tag: 'Popular' },
  { id: 'pack_l', crystals: 700, bonus: 100, priceCRC: 4500, label: 'Bóveda de Cristales', tag: 'Mejor valor' },
]

export function packById(id) {
  return CRYSTAL_PACKS.find((p) => p.id === id) || null
}

export const RARITY = {
  common: { label: 'Común', css: '#8aa4c8' },
  rare: { label: 'Raro', css: '#4fc3ff' },
  epic: { label: 'Épico', css: '#c77dff' },
  legendary: { label: 'Legendario', css: '#ffb02e' },
}

export const COSMETICS = [
  // ---- Rayos
  { id: 'beam_default', slot: 'beam', name: 'Estándar', rarity: 'common', color: 0x8be9fd, core: 0xffffff, price: null },
  { id: 'beam_ice', slot: 'beam', name: 'Criogénico', rarity: 'rare', color: 0x9ae8ff, core: 0xe8fbff, price: { scrap: 250 } },
  { id: 'beam_ember', slot: 'beam', name: 'Brasa', rarity: 'rare', color: 0xff8a3d, core: 0xffe0b0, price: { scrap: 300 } },
  { id: 'beam_toxic', slot: 'beam', name: 'Tóxico', rarity: 'rare', color: 0x9bff3d, core: 0xeaffd0, price: { scrap: 300 } },
  { id: 'beam_violet', slot: 'beam', name: 'Vacío violeta', rarity: 'epic', color: 0xb06bff, core: 0xf0e0ff, price: { scrap: 650 } },
  { id: 'beam_crimson', slot: 'beam', name: 'Carmesí', rarity: 'epic', color: 0xff3355, core: 0xffd0d8, price: { crystals: 120 } },
  { id: 'beam_gold', slot: 'beam', name: 'Oro solar', rarity: 'legendary', color: 0xffd24a, core: 0xfff6c8, price: { crystals: 250 } },
  { id: 'beam_prism', slot: 'beam', name: 'Prisma', rarity: 'legendary', color: 0xff7ad9, core: 0xffffff, anim: 'hue', price: { crystals: 400 } },

  // ---- Naves (tinte del comandante)
  { id: 'hull_default', slot: 'hull', name: 'Comandante', rarity: 'common', tint: 0xffaa44, price: null },
  { id: 'hull_ghost', slot: 'hull', name: 'Fantasma', rarity: 'rare', tint: 0xcfe8ff, price: { scrap: 350 } },
  { id: 'hull_emerald', slot: 'hull', name: 'Esmeralda', rarity: 'rare', tint: 0x49e07a, price: { scrap: 350 } },
  { id: 'hull_neon', slot: 'hull', name: 'Neón rosa', rarity: 'epic', tint: 0xff7ad9, price: { scrap: 700 } },
  { id: 'hull_obsidian', slot: 'hull', name: 'Obsidiana', rarity: 'epic', tint: 0x6a5cff, price: { crystals: 150 } },
  { id: 'hull_solar', slot: 'hull', name: 'Corona solar', rarity: 'legendary', tint: 0xffd24a, price: { crystals: 300 } },

  // ---- Estelas
  { id: 'trail_none', slot: 'trail', name: 'Sin estela', rarity: 'common', price: null },
  { id: 'trail_spark', slot: 'trail', name: 'Chispas', rarity: 'rare', color: 0x8be9fd, style: 'spark', price: { scrap: 400 } },
  { id: 'trail_comet', slot: 'trail', name: 'Cometa', rarity: 'epic', color: 0xff8a3d, style: 'comet', price: { scrap: 800 } },
  { id: 'trail_pixel', slot: 'trail', name: 'Pixel retro', rarity: 'legendary', color: 0xff7ad9, style: 'pixel', price: { crystals: 200 } },
]


// Precio en Cristales de un cosmético premium (null si no se compra con Cristales).
export function crystalPrice(itemId) {
  return COSMETICS.find((c) => c.id === itemId)?.price?.crystals ?? null
}
