// IPC handler registry - imports and registers all handlers

import { registerConfigHandlers } from './config.handler'
import { registerGamesHandlers } from './games.handler'

// Register all IPC handlers - call this in main process setup
export const registerAllHandlers = () => {
  registerConfigHandlers()
  registerGamesHandlers()

  // TODO: Add these when services are ready
  // registerRunnersHandlers()
  // registerLibraryHandlers()
}
