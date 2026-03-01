// Electron main process entry point

import { app, BrowserWindow, shell, protocol } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { initDatabase, closeDatabase } from './services/database'
import { loadAppConfig } from './services/config'
import { initPaths } from './services/paths'
import { registerAllHandlers } from './ipc'

// Keep reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null

// Check if running in development
const isDev = !app.isPackaged

// Register custom protocol for serving local images (must be called before app ready)
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

// Create the main browser window
const createWindow = async () => {
  // Initialize paths first (other services may depend on it)
  initPaths()

  // Initialize services
  initDatabase()
  loadAppConfig() // Ensures config exists

  // Register IPC handlers
  registerAllHandlers()

  // Register the local:// protocol handler
  protocol.handle('local', (request) => {
    const filePath = decodeURIComponent(request.url.slice(8)) // Remove 'local://' prefix
    console.log('[local protocol] Loading:', filePath)

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
      console.log('[local protocol] Serving', data.length, 'bytes')
      return new Response(data, {
        headers: { 'Content-Type': mimeType },
      })
    } catch (error) {
      console.error('[local protocol] Error:', error)
      return new Response('Not found', { status: 404 })
    }
  })

  // Create browser window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Nekomimi',
    show: false, // Show when ready (prevents white flash)
    autoHideMenuBar: true, // Hide menu bar (Alt to show temporarily)
    webPreferences: {
      // Security: context isolation enabled by default
      contextIsolation: true,
      // No node integration in renderer - use preload instead
      nodeIntegration: false,
      // Preload script for safe IPC exposure
      preload: path.join(__dirname, '../preload/index.js'),
    },
  })

  // Remove the default menu bar completely
  mainWindow.setMenu(null)

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Open external links in default browser (not in app)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load the frontend
  if (isDev) {
    // Development: load from Vite dev server
    await mainWindow.loadURL('http://localhost:5173')
  } else {
    // Production: load built files
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow()

  // macOS: recreate window when clicking dock icon
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Cleanup on quit
app.on('will-quit', () => {
  closeDatabase()
})

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})
