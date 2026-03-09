// IPC handler registry - imports and registers all handlers

import { registerConfigHandlers } from './config.handler'
import { registerDialogHandlers } from './dialog.handler'
import { registerGamesHandlers } from './games.handler'
import { registerModsHandlers } from './mods.handler'
import { registerImageHandlers } from './image.handler'
import { registerDownloadHandlers } from './download.handler'
import { registerSteamrtHandlers } from './steamrt.handler'

// Register all IPC handlers - call this in main process setup
export const registerAllHandlers = () => {
  registerConfigHandlers()
  registerDialogHandlers()
  registerGamesHandlers()
  registerModsHandlers()
  registerImageHandlers()
  registerDownloadHandlers()
  registerSteamrtHandlers()
}
