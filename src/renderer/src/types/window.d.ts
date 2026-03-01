// Type declaration for window.api exposed by preload script

import type { IPCChannels, IPCRequest, IPCResponse } from '../../../shared/types/ipc'

interface NekomimiAPI {
  invoke: <K extends keyof IPCChannels>(
    channel: K,
    request?: IPCRequest<K>
  ) => Promise<IPCResponse<K>>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  openFile: () => Promise<string | null>
  openImage: (defaultPath?: string) => Promise<string | null>
  platform: NodeJS.Platform
  version: string
}

declare global {
  interface Window {
    api: NekomimiAPI
  }
}

export {}
