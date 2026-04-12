// IPC handler registry - imports and registers all handlers

import { registerAppHandlers } from './app.handler'
import { registerConfigHandlers } from './config.handler'
import { registerDialogHandlers } from './dialog.handler'
import { registerGamesHandlers } from './games.handler'
import { registerModsHandlers } from './mods.handler'
import { registerImageHandlers } from './image.handler'
import { registerDownloadHandlers } from './download.handler'
import { registerPreflightHandlers } from './preflight.handler'
import { registerRunnerHandlers } from './runner.handler'
import { registerSteamrtHandlers } from './steamrt.handler'
import { registerTwintailHandlers } from './twintail.handler'

// Register all IPC handlers - call this in main process setup
export const registerAllHandlers = () => {
  registerAppHandlers()
  registerConfigHandlers()
  registerDialogHandlers()
  registerGamesHandlers()
  registerModsHandlers()
  registerImageHandlers()
  registerDownloadHandlers()
  registerPreflightHandlers()
  registerRunnerHandlers()
  registerSteamrtHandlers()
  registerTwintailHandlers()
}
