// IPC handlers for config operations

import { ipcMain } from 'electron'
import { loadAppConfig, saveAppConfig } from '../services/config'
import type { AppConfig } from '../../shared/types'

export const registerConfigHandlers = () => {
  // Get current app config
  ipcMain.handle('config:get', (): AppConfig => {
    return loadAppConfig()
  })

  // Update app config (partial update)
  ipcMain.handle('config:update', (_event, updates: Partial<AppConfig>): AppConfig => {
    const current = loadAppConfig()
    const merged = deepMerge(current, updates)
    saveAppConfig(merged)
    return merged
  })
}

// Deep merge utility for nested config updates
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deepMerge = (base: any, updates: any): any => {
  const result = { ...base }

  for (const key in updates) {
    const updateValue = updates[key]
    const baseValue = base[key]

    if (
      typeof updateValue === 'object' &&
      updateValue !== null &&
      !Array.isArray(updateValue) &&
      typeof baseValue === 'object' &&
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMerge(baseValue, updateValue)
    } else if (updateValue !== undefined) {
      result[key] = updateValue
    }
  }

  return result
}
