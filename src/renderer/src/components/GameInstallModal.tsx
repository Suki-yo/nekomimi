import { useEffect, useState, type JSX } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  formatBytes,
  formatTime,
  getInstallDialogDescription,
  getInstallDialogTitle,
  getInstallModeButtonClass,
  getParentDirectory,
  type InstallMode,
  type InstallStatus,
} from '@/components/install-modal-utils'
import { Download, FolderOpen, Search, X } from 'lucide-react'
import type { DownloadProgress } from '../../../shared/types/download'
import type { Game, LaunchConfig, ModConfig } from '../../../shared/types/game'
import type { GameAddRequest, IPCRequest } from '../../../shared/types/ipc'

type DownloadStartChannel = 'download:start' | 'download:start-endfield' | 'download:start-wuwa'

interface InstallDetectionResult {
  directory: string
  prefix: string | null
}

export interface InstallConfig<K extends DownloadStartChannel = DownloadStartChannel> {
  gameId: string
  slug: string
  name: string
  latestVersion: string
  defaultInstallDir: string
  defaultPrefix: string
  executable: string
  launch: LaunchConfig
  mods: ModConfig
  startChannel: K
  buildDownloadArgs: (destDir: string) => IPCRequest<K>
  downloadDetails?: string
  installDirPlaceholder?: string
  locateExePlaceholder?: string
  buildLocateGameOverrides?: (directory: string) => Promise<Partial<GameAddRequest> | void>
  buildAutoAddOverrides?: (directory: string) => Promise<Partial<GameAddRequest> | void>
}

interface GameInstallModalProps {
  open: boolean
  onClose: () => void
  config: InstallConfig | null
  onGameAdded?: () => void
  onNavigateToRunners?: () => void
}

export function GameInstallModal({
  open,
  onClose,
  config,
  onGameAdded,
  onNavigateToRunners,
}: GameInstallModalProps): JSX.Element {
  const [mode, setMode] = useState<InstallMode>('download')
  const [installDir, setInstallDir] = useState('')
  const [status, setStatus] = useState<InstallStatus>('idle')
  const [progress, setProgress] = useState<DownloadProgress | null>(null)

  const [locateExePath, setLocateExePath] = useState('')
  const [locateDetected, setLocateDetected] = useState<InstallDetectionResult | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [runnerPath, setRunnerPath] = useState<string | null>(null)
  const [runnerError, setRunnerError] = useState<string | null>(null)

  const setDownloadError = (gameId: string, error: string | undefined) => {
    if (!error) return

    setProgress((prev) => prev ? { ...prev, error } : {
      gameId,
      status: 'error',
      percent: 0,
      bytesDownloaded: 0,
      bytesTotal: 0,
      downloadSpeed: 0,
      timeRemaining: 0,
      error,
    })
  }

  useEffect(() => {
    if (!open || !config) return

    window.api.invoke('download:status', { gameId: config.gameId }).then((result) => {
      if (result.inProgress) {
        setMode('download')
        setStatus('downloading')
        return
      }

      setMode('download')
      setInstallDir(config.defaultInstallDir)
      setStatus('idle')
      setProgress(null)
      setLocateExePath('')
      setLocateDetected(null)
      setLocateError(null)
      setRunnerError(null)
    })

    window.api.invoke('game:runners').then((runners) => {
      setRunnerPath(runners[0]?.path ?? null)
    })
  }, [open, config])

  useEffect(() => {
    if (!config) return

    const unsubProgress = window.api.on('download:progress', (data) => {
      const nextProgress = data as DownloadProgress
      if (nextProgress.gameId === config.gameId) {
        setProgress(nextProgress)
      }
    })

    const unsubComplete = window.api.on('download:complete', (data) => {
      if ((data as { gameId: string }).gameId === config.gameId) {
        setStatus('complete')
        setProgress((prev) => prev ? { ...prev, percent: 100, status: 'installed' } : null)
        void handleAutoAdd(config)
      }
    })

    const unsubError = window.api.on('download:error', (data) => {
      if ((data as { gameId: string; error: string }).gameId === config.gameId) {
        setStatus('error')
        setDownloadError(config.gameId, (data as { error: string }).error)
      }
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [config, installDir, onGameAdded])

  const buildGamePayload = async ({
    config,
    directory,
    executable,
    runnerPath,
    prefix,
    overrides,
  }: {
    config: InstallConfig
    directory: string
    executable: string
    runnerPath: string
    prefix: string
    overrides?: Partial<AddGameRequest> | void
  }): Promise<GameAddRequest> => {
    return {
      name: config.name,
      slug: config.slug,
      installed: true,
      directory,
      executable,
      runner: {
        type: 'proton',
        path: runnerPath,
        prefix,
      },
      launch: config.launch,
      mods: config.mods,
      ...overrides,
    }
  }

  const handleBrowse = async () => {
    const path = await window.api.openFile()
    if (path) {
      setInstallDir(getParentDirectory(path))
    }
  }

  const handleBrowseLocate = async () => {
    const exePath = await window.api.openFile()
    if (!exePath) return

    setLocateExePath(exePath)
    setLocateDetected(null)
    setLocateError(null)
    setLocating(true)

    try {
      const detected = await window.api.invoke('game:detect', { exePath })
      setLocateDetected({ directory: detected.directory, prefix: detected.prefix })
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : 'Failed to detect game')
    } finally {
      setLocating(false)
    }
  }

  const handleLocateConfirm = async () => {
    if (!config || !locateDetected) return

    setLocating(true)

    try {
      const activeRunnerPath = await ensureRunnerPath()
      if (!activeRunnerPath) {
        return
      }

      const overrides = await config.buildLocateGameOverrides?.(locateDetected.directory)
      const payload = await buildGamePayload({
        config,
        directory: locateDetected.directory,
        executable: locateExePath,
        runnerPath: activeRunnerPath,
        prefix: locateDetected.prefix || config.defaultPrefix,
        overrides,
      })

      await window.api.invoke('game:add', payload)
      onGameAdded?.()
      onClose()
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : 'Failed to add game')
    } finally {
      setLocating(false)
    }
  }

  const handleAutoAdd = async (activeConfig: InstallConfig) => {
    try {
      const activeRunnerPath = await ensureRunnerPath()
      if (!activeRunnerPath) {
        return
      }

      const overrides = await activeConfig.buildAutoAddOverrides?.(installDir)
      const payload = await buildGamePayload({
        config: activeConfig,
        directory: installDir,
        executable: `${installDir}/${activeConfig.executable}`,
        runnerPath: activeRunnerPath,
        prefix: activeConfig.defaultPrefix,
        overrides,
      })

      await window.api.invoke('game:add', payload)
      onGameAdded?.()
    } catch (err) {
      console.error('Failed to auto-add game:', err)
    }
  }

  const ensureRunnerPath = async (): Promise<string | null> => {
    if (runnerPath) {
      setRunnerError(null)
      return runnerPath
    }

    const runners = await window.api.invoke('game:runners')
    const nextRunnerPath = runners[0]?.path ?? null
    setRunnerPath(nextRunnerPath)

    if (!nextRunnerPath) {
      setRunnerError('Install a Proton runner from Settings -> Runners before adding a game.')
      return null
    }

    setRunnerError(null)
    return nextRunnerPath
  }

  const startDownload = async <K extends DownloadStartChannel>(activeConfig: InstallConfig<K>) => {
    const result = await window.api.invoke(activeConfig.startChannel, activeConfig.buildDownloadArgs(installDir))
    if (!result.success) {
      setStatus('error')
      setDownloadError(activeConfig.gameId, result.error)
    }
  }

  const handleStartDownload = async () => {
    if (!config || !installDir) return

    const activeRunnerPath = await ensureRunnerPath()
    if (!activeRunnerPath) {
      return
    }

    setStatus('downloading')
    await startDownload(config)
  }

  const handleCancel = async () => {
    if (!config) return

    await window.api.invoke('download:cancel', { gameId: config.gameId })
    setStatus('idle')
    setProgress(null)
  }

  const gameName = config?.name ?? ''
  const latestVersion = config?.latestVersion ?? ''

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getInstallDialogTitle(status, gameName)}</DialogTitle>
          <DialogDescription>
            {getInstallDialogDescription(status, latestVersion, installDir, gameName, progress?.error)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {status === 'idle' && config && (
            <>
              {runnerError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <div>{runnerError}</div>
                  {onNavigateToRunners && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          onClose()
                          onNavigateToRunners()
                        }}
                      >
                        Go to Runners
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <button
                  className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${getInstallModeButtonClass(mode === 'download')}`}
                  onClick={() => setMode('download')}
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
                <button
                  className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${getInstallModeButtonClass(mode === 'locate')}`}
                  onClick={() => setMode('locate')}
                >
                  <Search className="h-4 w-4" />
                  Locate Existing
                </button>
              </div>

              {mode === 'download' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="install-dir">Install Directory</Label>
                    <div className="flex gap-2">
                      <Input
                        id="install-dir"
                        value={installDir}
                        onChange={(event) => setInstallDir(event.target.value)}
                        placeholder={config.installDirPlaceholder ?? '/home/user/Games/GameName'}
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" onClick={handleBrowse}>
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {config.downloadDetails && (
                    <div className="text-sm text-muted-foreground">{config.downloadDetails}</div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleStartDownload} disabled={!installDir}>
                      Install
                    </Button>
                  </div>
                </>
              )}

              {mode === 'locate' && (
                <>
                  <div className="space-y-2">
                    <Label>Game Executable</Label>
                    <div className="flex gap-2">
                      <Input
                        value={locateExePath}
                        readOnly
                        placeholder={config.locateExePlaceholder ?? 'Browse to the game .exe file...'}
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" onClick={handleBrowseLocate} disabled={locating}>
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {locating && (
                    <div className="text-sm text-muted-foreground">Detecting game...</div>
                  )}

                  {locateDetected && (
                    <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Directory: </span>
                        <span className="break-all font-mono text-xs">{locateDetected.directory}</span>
                      </div>
                      {locateDetected.prefix && (
                        <div>
                          <span className="text-muted-foreground">Prefix: </span>
                          <span className="break-all font-mono text-xs">{locateDetected.prefix}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {locateError && (
                    <div className="text-sm text-destructive">{locateError}</div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleLocateConfirm} disabled={!locateDetected || locating}>
                      Add to Library
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {status === 'downloading' && progress && (
            <div className="flex min-h-[160px] flex-col gap-4">
              <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Progress: </span>
                  <span className="font-medium">{progress.percent}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Speed: </span>
                  <span className="font-medium">{formatBytes(progress.downloadSpeed)}/s</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Downloaded: </span>
                  <span className="font-medium">
                    {formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.bytesTotal)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Time left: </span>
                  <span className="font-medium">{formatTime(progress.timeRemaining)}</span>
                </div>
              </div>

              <div className="min-w-0 truncate text-xs text-muted-foreground">
                {progress.currentFile || <>&nbsp;</>}
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="destructive" onClick={handleCancel}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel Download
                </Button>
              </div>
            </div>
          )}

          {status === 'complete' && (
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button type="button" onClick={handleStartDownload}>
                Retry
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
