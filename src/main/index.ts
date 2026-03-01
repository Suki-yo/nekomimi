 import { app, BrowserWindow, shell, protocol } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { initDatabase, closeDatabase } from './services/database'
import { loadAppConfig } from './services/config'
import { initPaths } from './services/paths'
import { registerAllHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
const isDev = !app.isPackaged

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
  initPaths()
  initDatabase()
  loadAppConfig()
  registerAllHandlers()

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
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  })

  mainWindow.setMenu(null)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
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
