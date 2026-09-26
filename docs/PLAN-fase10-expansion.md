# Fase 10 — Expansión (progresión, tienda, móvil, SEO, pagos)

Rama: `expansion-fase10`. Orden pensado para que cada bloque se pueda jugar y verificar solo.

## 10A — Ritmo, progresión y combate (en curso)
- **Modos**: `quick` (Rápido, 10 oleadas, meta 5–10 min) y `classic` (Clásico, 10 oleadas, 10–15 min).
  La duración se acota con `waveBudgetMs`: si una oleada no se limpió a tiempo, la siguiente entra
  igual (los enemigos se acumulan). El intermedio se puede saltar ("¡Oleada ya!") por minerales extra.
- **Sectores** (`game/meta/sectors.js`): nivel de campaña 1..10. Cada sector escala HP/daño/cantidad
  y habilita enemigos nuevos. Ganar un sector desbloquea el siguiente.
- **Perfil** (`game/meta/profile.js`, localStorage): XP → nivel de comandante, Chatarra (moneda
  blanda que se gana jugando), investigación comprada, cosméticos. Se sincronizará con cuenta en 10E.
- **Investigación** (`game/meta/research.js`): árbol de progreso entre partidas; desbloquea el nivel 3
  de cada edificio, habilidades del comandante y bonos iniciales.
- **Árbol por edificio** (`components/UpgradeTree.vue`): cada edificio muestra su propio árbol
  (ramas A/B, requisitos, exclusiones, efectos legibles). El General usa el mismo componente.
- **Habilidades del comandante** (`game/abilities.js`): Mega Rayo (apuntado a una unidad), Pulso EMP,
  Reparación de emergencia. Solo host/single-player por ahora.
- **Enemigos nuevos**: kamikaze, warden (escudo), leech (parásito de recolectores), bomber.

## 10B — Cosméticos y tienda
- `game/meta/cosmetics.js`: skins de rayo (General, torretas láser), estelas, skins de nave del General.
  El render lee `profile.equipped` → color/estilo del rayo en `drawBeam` y en el disparo del General.
- `components/Shop.vue`: tienda estilo Fortnite/Fall Guys — rotación destacada, tarjetas por rareza,
  vista previa 3D (Three.js, nave girando sobre pedestal con el rayo equipado).

## 10C — Móvil
- HUD responsivo: barra de construcción en cajón inferior, paneles de inspección como hoja deslizable,
  botones de habilidad grandes, safe-area, orientación horizontal recomendada con aviso en vertical.
- Gestos: tap = seleccionar/colocar, arrastre = pan, pinza = zoom (ya existe), long-press = cancelar.

## 10D — Portada y SEO
- `/` = landing prerenderizada (hero, features, modos, CTA); `/jugar` = juego (client-only).
- `sitemap.xml`, `robots.txt`, JSON-LD `VideoGame`, OG/Twitter con `og.png`, textos en español.

## 10E — Cuentas y pagos (requiere plan mode + decisiones de Luis)
- Proveedor por definir. La clave secreta va en `.env` (nunca en el repo ni en el chat).
- Necesita backend (rutas `server/` de Nuxt en Vercel) + base de datos para el inventario:
  sin eso un cosmético pagado vive solo en localStorage y se pierde o se falsifica.
- Webhook firmado como única fuente de verdad para acreditar compras.

## Arte, 3D y sonido (transversal)
- Codex (image_generation): hero, og, fondo de tienda, tarjetas de modo → `public/assets/art/`.
- Blender MCP: modelos low-poly retro de la nave del General y edificios → `public/assets/3D/`.
- SFX nuevos sintetizados con Web Audio en `game/sound.js` (mega rayo, EMP, UI, subida de nivel).
