// IPC handlers for image operations

import { ipcMain } from 'electron'
import * as fs from 'fs'

export const registerImageHandlers = () => {
  // Return local:// URL for images
  ipcMain.handle('image:read', async (_event, { imagePath }: { imagePath: string }): Promise<string | null> => {
    console.log('[image:read] Called with:', imagePath)
    try {
      if (!fs.existsSync(imagePath)) {
        console.error('[image:read] File not found:', imagePath)
        return null
      }

      // Return local:// URL with encoded path
      const encodedPath = encodeURIComponent(imagePath)
      const localUrl = `local://${encodedPath}`
      console.log('[image:read] Returning local URL:', localUrl)
      return localUrl
    } catch (error) {
      console.error('[image:read] Failed to read image:', error)
      return null
    }
  })
}
