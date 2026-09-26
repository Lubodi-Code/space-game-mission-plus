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

  // ================= Fase 10: desbloqueos GRATIS por progreso =================
  // unlock: { level } nivel de comandante · { sector } sector ganado · { wins } victorias ·
  //         { kills } bajas totales · { runs } partidas jugadas. Se reclaman solos (meta/cosmetics.js).

  // ---- Rayos del comandante
  { id: 'beam_mint', slot: 'beam', name: 'Menta', rarity: 'common', color: 0x7dffd0, core: 0xeafff6, unlock: { level: 2 } },
  { id: 'beam_sky', slot: 'beam', name: 'Cielo', rarity: 'common', color: 0x6cc8ff, core: 0xe6f6ff, unlock: { runs: 3 } },
  { id: 'beam_rose', slot: 'beam', name: 'Rosa neón', rarity: 'rare', color: 0xff7ad9, core: 0xffe6f7, unlock: { level: 4 } },
  { id: 'beam_lime', slot: 'beam', name: 'Lima', rarity: 'rare', color: 0xc6ff3d, core: 0xf6ffd8, unlock: { kills: 1500 } },
  { id: 'beam_sun', slot: 'beam', name: 'Amanecer', rarity: 'rare', color: 0xffb02e, core: 0xfff0c8, unlock: { sector: 2 } },
  { id: 'beam_abyss', slot: 'beam', name: 'Abismo', rarity: 'epic', color: 0x3a6bff, core: 0xc8d8ff, unlock: { level: 8 } },
  { id: 'beam_blood', slot: 'beam', name: 'Luna roja', rarity: 'epic', color: 0xff2d4d, core: 0xffc8d0, unlock: { sector: 4 } },
  { id: 'beam_aurora', slot: 'beam', name: 'Aurora', rarity: 'epic', color: 0x3dffa0, core: 0xffffff, anim: 'hue', unlock: { wins: 10 } },
  { id: 'beam_void', slot: 'beam', name: 'Vacío', rarity: 'legendary', color: 0xa855ff, core: 0x1a0a2e, unlock: { sector: 7 } },
  { id: 'beam_nova', slot: 'beam', name: 'Supernova', rarity: 'legendary', color: 0xfff6c8, core: 0xffffff, unlock: { sector: 10 } },

  // ---- Naves del comandante
  { id: 'hull_mint', slot: 'hull', name: 'Menta', rarity: 'common', tint: 0x7dffd0, unlock: { level: 2 } },
  { id: 'hull_sky', slot: 'hull', name: 'Patrulla', rarity: 'common', tint: 0x6cc8ff, unlock: { runs: 2 } },
  { id: 'hull_rust', slot: 'hull', name: 'Óxido', rarity: 'common', tint: 0xd2691e, unlock: { level: 3 } },
  { id: 'hull_crimson', slot: 'hull', name: 'Carmesí', rarity: 'rare', tint: 0xff3355, unlock: { sector: 2 } },
  { id: 'hull_ice', slot: 'hull', name: 'Glaciar', rarity: 'rare', tint: 0xbff6ff, unlock: { sector: 3 } },
  { id: 'hull_hive', slot: 'hull', name: 'Colmena', rarity: 'rare', tint: 0x9bff3d, unlock: { sector: 4 } },
  { id: 'hull_amber', slot: 'hull', name: 'Frente ámbar', rarity: 'epic', tint: 0xffb02e, unlock: { sector: 5 } },
  { id: 'hull_ring', slot: 'hull', name: 'Anillo roto', rarity: 'epic', tint: 0x2de0c8, unlock: { sector: 6 } },
  { id: 'hull_ace', slot: 'hull', name: 'As', rarity: 'epic', tint: 0xffffff, unlock: { wins: 5 } },
  { id: 'hull_veteran', slot: 'hull', name: 'Veterano', rarity: 'legendary', tint: 0xc8a2ff, unlock: { level: 15 } },
  { id: 'hull_swarm', slot: 'hull', name: 'Rey del enjambre', rarity: 'legendary', tint: 0xff5ad9, unlock: { sector: 10 } },

  // ---- Estelas
  { id: 'trail_mint', slot: 'trail', name: 'Brisa', rarity: 'common', color: 0x7dffd0, style: 'spark', unlock: { level: 3 } },
  { id: 'trail_ember', slot: 'trail', name: 'Brasas', rarity: 'rare', color: 0xff8a3d, style: 'comet', unlock: { kills: 800 } },
  { id: 'trail_frost', slot: 'trail', name: 'Escarcha', rarity: 'rare', color: 0xbff6ff, style: 'spark', unlock: { sector: 3 } },
  { id: 'trail_toxic', slot: 'trail', name: 'Esporas', rarity: 'epic', color: 0x9bff3d, style: 'pixel', unlock: { sector: 4 } },
  { id: 'trail_gold', slot: 'trail', name: 'Polvo de oro', rarity: 'epic', color: 0xffd24a, style: 'spark', unlock: { level: 10 } },
  { id: 'trail_void', slot: 'trail', name: 'Rastro del vacío', rarity: 'legendary', color: 0xa855ff, style: 'comet', unlock: { sector: 8 } },

  // ---- Diseños de nave del comandante (forma 3D; ver game/three/shipModel.js SHIP_DESIGNS)
  { id: 'design_falcon', slot: 'design', name: 'Falcon', rarity: 'common', design: 'falcon', price: null },
  { id: 'design_interceptor', slot: 'design', name: 'Interceptor', rarity: 'rare', design: 'interceptor', unlock: { level: 3 } },
  { id: 'design_manta', slot: 'design', name: 'Manta', rarity: 'rare', design: 'manta', unlock: { sector: 2 } },
  { id: 'design_wasp', slot: 'design', name: 'Avispa', rarity: 'rare', design: 'wasp', unlock: { kills: 1200 } },
  { id: 'design_bulwark', slot: 'design', name: 'Baluarte', rarity: 'epic', design: 'bulwark', unlock: { wins: 2 } },
  { id: 'design_phantom', slot: 'design', name: 'Fantasma', rarity: 'epic', design: 'phantom', unlock: { level: 9 } },
  { id: 'design_twin', slot: 'design', name: 'Gemela', rarity: 'legendary', design: 'twin', unlock: { sector: 5 } },
  { id: 'design_crown', slot: 'design', name: 'Corona', rarity: 'legendary', design: 'crown', price: { crystals: 350 } },

  // ---- Explosiones (bajas enemigas)
  { id: 'boom_default', slot: 'explosion', name: 'Según la nave', rarity: 'common', price: null },
  { id: 'boom_fire', slot: 'explosion', name: 'Fuego', rarity: 'common', color: 0xff8a3d, unlock: { level: 2 } },
  { id: 'boom_plasma', slot: 'explosion', name: 'Plasma', rarity: 'rare', color: 0x8be9fd, unlock: { level: 5 } },
  { id: 'boom_toxic', slot: 'explosion', name: 'Tóxica', rarity: 'rare', color: 0x9bff3d, unlock: { kills: 2500 } },
  { id: 'boom_pink', slot: 'explosion', name: 'Confeti neón', rarity: 'epic', color: 0xff7ad9, unlock: { wins: 3 } },
  { id: 'boom_gold', slot: 'explosion', name: 'Oro', rarity: 'epic', color: 0xffd24a, unlock: { level: 12 } },
  { id: 'boom_void', slot: 'explosion', name: 'Singularidad', rarity: 'legendary', color: 0xa855ff, unlock: { sector: 9 } },
  { id: 'boom_prism', slot: 'explosion', name: 'Prisma', rarity: 'legendary', color: 0xffffff, anim: 'hue', price: { crystals: 180 } },

  // ---- Núcleo (Nexo)
  { id: 'nexus_default', slot: 'nexus', name: 'Cian', rarity: 'common', price: null },
  { id: 'nexus_rose', slot: 'nexus', name: 'Rosa', rarity: 'common', color: 0xff7ad9, unlock: { level: 3 } },
  { id: 'nexus_mint', slot: 'nexus', name: 'Menta', rarity: 'common', color: 0x7dffd0, unlock: { runs: 5 } },
  { id: 'nexus_amber', slot: 'nexus', name: 'Ámbar', rarity: 'rare', color: 0xffb02e, unlock: { level: 6 } },
  { id: 'nexus_crimson', slot: 'nexus', name: 'Carmesí', rarity: 'rare', color: 0xff3355, unlock: { sector: 3 } },
  { id: 'nexus_violet', slot: 'nexus', name: 'Violeta', rarity: 'epic', color: 0xa855ff, unlock: { wins: 7 } },
  { id: 'nexus_white', slot: 'nexus', name: 'Estrella blanca', rarity: 'epic', color: 0xf0f6ff, unlock: { sector: 8 } },
  { id: 'nexus_gold', slot: 'nexus', name: 'Corona', rarity: 'legendary', color: 0xffd24a, unlock: { level: 20 } },
  { id: 'nexus_prism', slot: 'nexus', name: 'Prisma', rarity: 'legendary', color: 0xff7ad9, anim: 'hue', price: { crystals: 220 } },

  // ---- Rayos de torretas láser
  { id: 'turret_default', slot: 'turret', name: 'Según la mejora', rarity: 'common', price: null },
  { id: 'turret_mint', slot: 'turret', name: 'Menta', rarity: 'common', color: 0x7dffd0, unlock: { level: 4 } },
  { id: 'turret_sky', slot: 'turret', name: 'Celeste', rarity: 'common', color: 0x6cc8ff, unlock: { runs: 8 } },
  { id: 'turret_rose', slot: 'turret', name: 'Rosa', rarity: 'rare', color: 0xff7ad9, unlock: { level: 7 } },
  { id: 'turret_gold', slot: 'turret', name: 'Oro', rarity: 'rare', color: 0xffd24a, unlock: { sector: 5 } },
  { id: 'turret_red', slot: 'turret', name: 'Láser rojo', rarity: 'epic', color: 0xff2d4d, unlock: { kills: 5000 } },
  { id: 'turret_void', slot: 'turret', name: 'Vacío', rarity: 'epic', color: 0xa855ff, unlock: { level: 18 } },
  { id: 'turret_prism', slot: 'turret', name: 'Prisma', rarity: 'legendary', color: 0xff7ad9, anim: 'hue', unlock: { wins: 20 } },
]


// Precio en Cristales de un cosmético premium (null si no se compra con Cristales).
export function crystalPrice(itemId) {
  return COSMETICS.find((c) => c.id === itemId)?.price?.crystals ?? null
}
