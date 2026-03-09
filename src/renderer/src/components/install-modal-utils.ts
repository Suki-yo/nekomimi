export type InstallMode = 'download' | 'locate'
export type InstallStatus = 'idle' | 'downloading' | 'complete' | 'error'

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const unitBase = 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(unitBase))

  return `${parseFloat((bytes / Math.pow(unitBase, unitIndex)).toFixed(2))} ${units[unitIndex]}`
}

export function formatTime(seconds: number): string {
  if (seconds <= 0) return '--:--'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function getParentDirectory(filePath: string): string {
  return filePath.substring(0, filePath.lastIndexOf('/'))
}

export function getInstallModeButtonClass(active: boolean): string {
  if (active) {
    return 'bg-background text-foreground shadow-sm'
  }

  return 'text-muted-foreground hover:text-foreground'
}

export function getInstallDialogTitle(status: InstallStatus, gameName: string): string {
  switch (status) {
    case 'idle':
      return `Install ${gameName}`
    case 'downloading':
      return `Downloading ${gameName}`
    case 'complete':
      return 'Installation Complete!'
    case 'error':
      return 'Download Failed'
  }
}

export function getInstallDialogDescription(
  status: InstallStatus,
  latestVersion: string,
  installDir: string,
  gameName: string,
  error?: string | null,
): string | undefined {
  switch (status) {
    case 'idle':
      return `Version ${latestVersion}`
    case 'downloading':
      return `Installing to ${installDir}`
    case 'complete':
      return `${gameName} is ready to play`
    case 'error':
      return error ?? undefined
  }
}
