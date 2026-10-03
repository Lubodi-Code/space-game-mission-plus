# Versiones y releases

Usá `version` de `package.json` como única versión del producto para todas las
plataformas. Seguí SemVer: `patch` para correcciones compatibles, `minor` para
funciones compatibles y `major` para cambios incompatibles.

## Sacá un release

1. Pasá los cambios de `[Sin publicar]` a una sección con la nueva versión y fecha
   en `CHANGELOG.md`. Dejá `[Sin publicar]` para los próximos cambios.
2. Commiteá los cambios con un mensaje en español y dejá el árbol limpio.
3. Ejecutá uno de estos comandos (elegí el incremento que corresponda):

   ```bash
   npm version patch -m "Publicar versión %s"
   npm version minor -m "Publicar versión %s"
   npm version major -m "Publicar versión %s"
   ```

   `npm version <patch|minor|major>` actualiza la versión y el lockfile, crea un
   commit y agrega el tag `vX.Y.Z`.
4. Ejecutá `git push --follow-tags` para enviar el commit y el tag.

## Automatización y plataformas

CI corre en cada push a una rama y en cada pull request: usa Ubuntu, Node 22 y
caché de npm, instala con `npm ci`, genera `public/version.json`, compila la web
y genera la SPA de escritorio. Cancela corridas anteriores de la misma rama.

| Plataforma | Compilación y publicación |
| --- | --- |
| Web (Vercel) | CI verifica `npm run build`; Vercel despliega mediante su integración con el repo. |
| Escritorio (Windows) | El tag `v*.*.*` activa el job `desktop`: verifica la versión, genera la SPA y publica el instalador NSIS en GitHub Releases con Electron Builder. |
| Móvil (Android) | Pendiente: Capacitor. El job queda comentado hasta configurar el proyecto Android y su compilación. |

El release falla si el tag sin `v` no coincide con `package.json`. GitHub aporta
`GITHUB_TOKEN` al job de publicación; no guardés tokens en el repo. Electron
Builder usa el repositorio GitHub como destino de publicación.

El script `node scripts/version-info.mjs` escribe versión, commit y fecha ISO de
compilación; usa `dev` si Git falla y siempre termina con código 0. Para incluir
estos datos en Vercel, configurá su comando de build como
`node scripts/version-info.mjs && npm run build`.

## Compatibilidad

Subí `PROTOCOL_VERSION` en `game/net/protocol.js` cuando cambie el multijugador.
Versioná también el esquema del perfil guardado: al cambiarlo, incrementá su
versión y definí cómo migrar o rechazar perfiles anteriores.
