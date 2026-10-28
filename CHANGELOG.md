# Registro de cambios

Los cambios relevantes de este proyecto se documentan acá, siguiendo el formato
Keep a Changelog y el versionado semántico (SemVer).

## [Sin publicar]

### Agregado

- Infraestructura de integración continua, releases de Windows e información de versión.
- Arma del General equipable en la tienda antes de la partida: Láser, Misiles o Sunrae láser. Cada una tiene su daño, cadencia y alcance.
- Nave Sunrei (se compra con Chatarra): trae el Sunrae láser, un abanico de 5 rayos de menos daño a blancos distintos.
- Resistencias por tipo de daño: Brute, Bombardero y Guardián aguantan más los misiles; Skirmisher, Sanguijuela y Nave Madre aguantan más los rayos. La ficha de la oleada lo indica.
- Director de oleadas: reparte la oleada entre varios lados según dónde hay menos defensa o más economía expuesta, sin agregar naves.
- Música según la situación: tema de jefe y calma entre oleadas.
- Sonido de metralleta para la torreta Flak e impacto desintegrador para el cañón de riel.
- Vercel Web Analytics en la versión web.
- Descarga de escritorio en la portada.

### Cambiado

- El arma del General ya no se cambia con la tecla T durante la partida.
- Nave Nodriza: una por oleada desde la oleada 5, mucho más lenta, aparece más cerca y no la retira el seguro anti-atasco.
- Artillería un poco más rápida.
- Armas enemigas con diseño propio: cohete fino del Saboteador, ráfaga rápida del Skirmisher, obús de la Artillería, bomba del Bombardero, rayo grueso del Brute y cañones gemelos del Prisma y el Guardián.
- Audio optimizado sin estática ni chasquidos (rampas de volumen y limitador).
- CI y releases versionados.

## [0.1.0]

### Agregado

- Juego base con Phaser y Three.
- Lobby para configurar y comenzar partidas.
- Modos de juego.
- Sectores para explorar y jugar.
- Tienda del juego.
- Aplicación de escritorio con Electron e instalador Windows NSIS.
- Audio con bancos Kenney.
