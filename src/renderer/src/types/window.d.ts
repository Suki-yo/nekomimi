// Type declaration for window.api exposed by preload script

import type { IPCChannels, IPCRequest, IPCResponse } from '../../../shared/types/ipc'

interface NekomimiAPI {
  invoke: <K extends keyof IPCChannels>(
    channel: K,
    request?: IPCRequest<K>
  ) => Promise<IPCResponse<K>>
  openFile: () => Promise<string | null>
  platform: NodeJS.Platform
  version: string
}

declare global {
  interface Window {
    api: NekomimiAPI
  }
}

export {}
