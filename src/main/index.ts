 import { app, BrowserWindow, shell, protocol } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { initDatabase, closeDatabase } from './services/database'
import { loadAppConfig } from './services/config'
import { initPaths } from './services/paths'
import { registerAllHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
const isDev = !app.isPackaged
const DEV_SERVER_URL = 'http://127.0.0.1:5175'

// Register custom protocol before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
])

const createWindow = async (): Promise<void> => {
  console.log('Starting Nekomimi main process', {
    isDev,
    cwd: process.cwd(),
    dirname: __dirname,
    devServerUrl: DEV_SERVER_URL,
  })

  initPaths()
  console.log('Paths initialized')
  initDatabase()
  console.log('Database initialized')
  loadAppConfig()
  console.log('Config loaded')
  registerAllHandlers()
  console.log('IPC handlers registered')

  // Register local:// protocol handler
  protocol.handle('local', (request) => {
    const url = request.url
    console.log('[local protocol] Request URL:', url)

    // Remove 'local://' prefix (8 chars)
    // Browser may normalize local:///path to local://path, so handle both
    let filePath = decodeURIComponent(url.slice(8))

    // Ensure absolute path starts with /
    if (!filePath.startsWith('/')) {
      filePath = '/' + filePath
    }
    console.log('[local protocol] Loading file:', filePath)

    try {
      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'
      console.log('[local protocol] Success, MIME:', mimeType, 'Size:', data.length)
      return new Response(data, {
        headers: { 'Content-Type': mimeType },
      })
    } catch (error) {
      console.error('[local protocol] Error reading file:', error)
      return new Response('Not found', { status: 404 })
    }
  })

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Nekomimi',
    show: isDev,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  })

  mainWindow.setMenu(null)

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show')
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-start-loading', () => {
    console.log('Window started loading')
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window finished loading')
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Window failed to load:', { errorCode, errorDescription, validatedURL })
    mainWindow?.show()
  })

mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    console.log('Loading dev URL', DEV_SERVER_URL)
    await mainWindow.loadURL(DEV_SERVER_URL)
  } else {
    const rendererPath = path.join(__dirname, '../renderer/index.html')
    console.log('Loading renderer file', rendererPath)
    await mainWindow.loadFile(rendererPath)
  }
}

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error('Failed to create window:', error)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        console.error('Failed to recreate window:', error)
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDatabase()
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})
