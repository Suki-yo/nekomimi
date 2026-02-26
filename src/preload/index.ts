// Preload script - safely exposes IPC to renderer via contextBridge
// This is the ONLY way renderer can communicate with main process

import { contextBridge, ipcRenderer } from 'electron'
import type { IPCChannels, IPCRequest, IPCResponse } from '../shared/types/ipc'

// Type-safe IPC invoke function
export const api = {
  invoke: async <K extends keyof IPCChannels>(
    channel: K,
    request?: IPCRequest<K>
  ): Promise<IPCResponse<K>> => {
    return ipcRenderer.invoke(channel, request)
  },

  // File dialog
  openFile: async (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:openFile')
  },

  // Platform info (useful for OS-specific UI)
  platform: process.platform,

  // App version
  version: process.env.npm_package_version || '0.0.0',
}

// Expose to renderer as window.api
contextBridge.exposeInMainWorld('api', api)

// Type declaration for renderer (makes TypeScript happy)
declare global {
  interface Window {
    api: typeof api
  }
}
