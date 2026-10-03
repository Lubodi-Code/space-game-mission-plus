const { app, BrowserWindow, net, protocol, shell } = require('electron')
const { statSync } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let window

  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  app.whenReady().then(() => {
    const root = app.getAppPath()
    // Empaquetado, el SPA va en resources/web (extraResources): dentro del asar electron-builder
    // descarta los .obj de los modelos 3D por tomarlos como archivos objeto.
    const publicRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'web')
      : path.join(root, '.output', 'public')
    const isFile = (file) => statSync(file, { throwIfNoEntry: false })?.isFile()
    const fallback = isFile(path.join(publicRoot, '200.html')) ? '200.html' : 'index.html'

    protocol.handle('app', (request) => {
      const url = new URL(request.url)
      if (url.host !== 'game') return new Response('Not found', { status: 404 })

      if (url.pathname.startsWith('/api/')) {
        return net.fetch('https://space-game-mission-plus.vercel.app' + url.pathname + url.search, {
          method: request.method,
          headers: request.headers,
          body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
          duplex: 'half',
        })
      }

      let pathname
      try {
        pathname = decodeURIComponent(url.pathname)
      } catch {
        return new Response('Bad path', { status: 400 })
      }
      let file = path.resolve(publicRoot, '.' + pathname)
      const relative = path.relative(publicRoot, file)
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        return new Response('Forbidden', { status: 403 })
      }
      if (!isFile(file)) {
        const index = path.join(file, 'index.html')
        file = isFile(index) ? index : path.join(publicRoot, fallback)
      }
      return net.fetch(pathToFileURL(file).toString())
    })

    window = new BrowserWindow({
      width: 1600,
      height: 900,
      minWidth: 1024,
      minHeight: 640,
      backgroundColor: '#05070f',
      autoHideMenuBar: true,
      title: 'Space Game Mission Plus',
      icon: path.join(root, 'public/assets/icon/Gemini_Generated_Image_wh42b6wh42b6wh42.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    })

    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F11') {
        event.preventDefault()
        window.setFullScreen(!window.isFullScreen())
      }
    })
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('app://game/')) return
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    })
    window.loadURL('app://game/')
  })

  app.on('window-all-closed', () => app.quit())
}
