import { app, BrowserWindow, Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import * as path from 'path'
import { getGames, type GameRow } from './database'

let tray: Tray | null = null
let trayWindow: BrowserWindow | null = null

const FALLBACK_TRAY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAQAAACp7R7MAAAAVUlEQVR4AWNABaM4c+bMfwY0wMiAB0D8j4GB4T8Dwy+GvQxYwGgYGBj+Y2Bg+I+BgWEJQ0MDRhQGhkYGRgYmBiYGJiYGBmYGRkYGLAwMDAxMDAx8DEgYAJRrH2g7q9xRAAAAAElFTkSuQmCC'

function getTrayIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'tray-icon.png')
  }

  return path.join(__dirname, '../../../resources/tray-icon.png')
}

function loadTrayIcon() {
  const iconPath = getTrayIconPath()
  const icon = nativeImage.createFromPath(iconPath)

  if (!icon.isEmpty()) {
    return icon.resize({ width: 22, height: 22 })
  }

  console.warn(`[tray] Failed to load tray icon from ${iconPath}, using fallback icon`)
  return nativeImage.createFromDataURL(FALLBACK_TRAY_ICON).resize({ width: 22, height: 22 })
}

function getTopInstalledGames(limit = 5): GameRow[] {
  return getGames()
    .filter((game) => game.installed === 1)
    .sort((left, right) => {
      if (right.playtime !== left.playtime) {
        return right.playtime - left.playtime
      }

      return left.name.localeCompare(right.name)
    })
    .slice(0, limit)
}

function showMainWindow(): void {
  if (!trayWindow || trayWindow.isDestroyed()) {
    return
  }

  if (trayWindow.isMinimized()) {
    trayWindow.restore()
  }

  trayWindow.show()
  trayWindow.focus()
}

function toggleMainWindow(): void {
  if (!trayWindow || trayWindow.isDestroyed()) {
    return
  }

  if (!trayWindow.isVisible() || trayWindow.isMinimized()) {
    showMainWindow()
    return
  }

  if (trayWindow.isFocused()) {
    trayWindow.hide()
    return
  }

  trayWindow.focus()
}

function launchFromTray(gameId: string): void {
  try {
    const { launchGame } = require('./game-launcher') as typeof import('./game-launcher')
    void launchGame(gameId)
      .then((result) => {
        if (!result.success) {
          console.error(`[tray] Failed to launch game ${gameId}: ${result.error ?? 'unknown error'}`)
        }
      })
      .catch((error: unknown) => {
        console.error(`[tray] Unexpected error launching game ${gameId}:`, error)
      })
  } catch (error) {
    console.error(`[tray] Failed to resolve game launcher for ${gameId}:`, error)
  }
}

export function initTray(mainWindow: BrowserWindow): void {
  trayWindow = mainWindow

  if (tray) {
    return
  }

  try {
    tray = new Tray(loadTrayIcon())
    tray.setToolTip('Nekomimi')
    tray.on('click', toggleMainWindow)
    rebuildTrayMenu()
  } catch (error) {
    tray = null
    console.error('[tray] Failed to initialize tray:', error)
  }
}

export function isTrayReady(): boolean {
  return tray !== null
}

export function rebuildTrayMenu(): void {
  if (!tray) {
    return
  }

  const games = getTopInstalledGames()
  const template: MenuItemConstructorOptions[] = games.map((game) => ({
    label: game.name,
    click: () => launchFromTray(game.id),
  }))

  if (template.length > 0) {
    template.push({ type: 'separator' })
  }

  template.push({
    label: 'Quit',
    click: () => {
      app.quit()
    },
  })

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

export function destroyTray(): void {
  trayWindow = null

  if (!tray) {
    return
  }

  tray.destroy()
  tray = null
}
