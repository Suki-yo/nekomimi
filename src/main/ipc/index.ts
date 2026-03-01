// IPC handler registry - imports and registers all handlers

import { registerConfigHandlers } from './config.handler'
import { registerDialogHandlers } from './dialog.handler'
import { registerGamesHandlers } from './games.handler'
import { registerModsHandlers } from './mods.handler'
import { registerImageHandlers } from './image.handler'

// Register all IPC handlers - call this in main process setup
export const registerAllHandlers = () => {
  registerConfigHandlers()
  registerDialogHandlers()
  registerGamesHandlers()
  registerModsHandlers()
  registerImageHandlers()

  // TODO: Add these when services are ready
  // registerRunnersHandlers()
}
