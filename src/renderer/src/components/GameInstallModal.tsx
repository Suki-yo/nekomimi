import { useEffect, useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen, X, Download, Search } from 'lucide-react'
import type { DownloadProgress } from '../../../shared/types/download'

type InstallMode = 'download' | 'locate'

const BIZ_CONFIG = {
  genshin: {
    slug: 'genshinimpact',
    exe: 'GenshinImpact.exe',
    env: {
      STEAM_COMPAT_CONFIG: 'noxalia',
      WINEDLLOVERRIDES: 'lsteamclient=d;KRSDKExternal.exe=d',
    },
    mods: { enabled: true, importer: 'GIMI' },
    args: '',
  },
  starrail: {
    slug: 'starrail',
    exe: 'StarRail.exe',
    env: {
      STEAM_COMPAT_CONFIG: 'noxalia',
      WINEDLLOVERRIDES: 'wintrust=b;dbghelp=n,b',
      STUB_WINTRUST: '1',
      BLOCK_FIRST_REQ: '1',
    },
    mods: { enabled: true, importer: 'SRMI' },
    args: '',
  },
  zzz: {
    slug: 'zenlesszonezero',
    exe: 'ZenlessZoneZero.exe',
    env: {
      STEAM_COMPAT_CONFIG: 'noxalia,gamedrive',
      WINEDLLOVERRIDES: 'lsteamclient=d;KRSDKExternal.exe=d;jsproxy=n,b',
    },
    mods: { enabled: true, importer: 'ZZMI' },
    args: '',
  },
} as const

interface GameInstallModalProps {
  open: boolean
  onClose: () => void
  gameName: string
  gameBiz: 'genshin' | 'starrail' | 'zzz'
  latestVersion: string
  downloadSize?: string
  onGameAdded?: () => void
}

export function GameInstallModal({
  open,
  onClose,
  gameName,
  gameBiz,
  latestVersion,
  downloadSize,
  onGameAdded,
}: GameInstallModalProps) {
  const [mode, setMode] = useState<InstallMode>('download')
  const [installDir, setInstallDir] = useState('')
  const [status, setStatus] = useState<'idle' | 'downloading' | 'complete' | 'error'>('idle')
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const hasStartedRef = useRef(false)

  // Locate mode state
  const [locateExePath, setLocateExePath] = useState('')
  const [locateDetected, setLocateDetected] = useState<{ directory: string; prefix: string | null } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  // Reset state when modal opens (but preserve downloading state if resuming)
  useEffect(() => {
    if (!open) return
    window.api.invoke('download:status', { gameId: gameBiz }).then((result: { inProgress: boolean }) => {
      if (result.inProgress) {
        setMode('download')
        setStatus('downloading')
        hasStartedRef.current = true
      } else {
        setMode('download')
        setStatus('idle')
        setProgress(null)
        hasStartedRef.current = false
        setInstallDir(`~/Games/${gameName}`)
        setLocateExePath('')
        setLocateDetected(null)
        setLocateError(null)
      }
    })
  }, [open, gameName, gameBiz])

  // Listen for download progress
  useEffect(() => {
    const unsubProgress = window.api.on('download:progress', (data) => {
      const p = data as DownloadProgress
      if (p.gameId === gameBiz) {
        setProgress(p)
      }
    })

    const unsubComplete = window.api.on('download:complete', (data) => {
      if ((data as { gameId: string }).gameId === gameBiz) {
        setStatus('complete')
        setProgress((prev) => prev ? { ...prev, percent: 100, status: 'installed' } : null)
        handleAutoAdd()
      }
    })

    const unsubError = window.api.on('download:error', (data) => {
      if ((data as { gameId: string }).gameId === gameBiz) {
        setStatus('error')
        setProgress((prev) => prev ? { ...prev, error: (data as { error: string }).error } : null)
      }
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [gameBiz])

  const handleBrowse = async () => {
    const path = await window.api.openFile()
    if (path) {
      const dir = path.substring(0, path.lastIndexOf('/'))
      setInstallDir(dir)
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
    if (!locateDetected) return
    setLocating(true)
    const config = BIZ_CONFIG[gameBiz]
    try {
      await window.api.invoke('game:add', {
        name: gameName,
        slug: config.slug,
        installed: true,
        directory: locateDetected.directory,
        executable: locateExePath,
        runner: {
          type: 'proton' as const,
          path: '',
          prefix: locateDetected.prefix || `~/Games/prefixes/${config.slug}/pfx`,
        },
        launch: { env: config.env, preLaunch: [], postLaunch: [], args: config.args },
        mods: config.mods,
      })
      onGameAdded?.()
      onClose()
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : 'Failed to add game')
    } finally {
      setLocating(false)
    }
  }

  const handleAutoAdd = async () => {
    const config = BIZ_CONFIG[gameBiz]
    const runners: { path: string }[] = await window.api.invoke('runner:list')
    const runnerPath = runners.length > 0 ? runners[0].path : ''
    try {
      await window.api.invoke('game:add', {
        name: gameName,
        slug: config.slug,
        installed: true,
        directory: installDir,
        executable: `${installDir}/${config.exe}`,
        runner: {
          type: 'proton' as const,
          path: runnerPath,
          prefix: `~/Games/prefixes/${config.slug}/pfx`,
        },
        launch: { env: config.env, preLaunch: [], postLaunch: [], args: config.args },
        mods: config.mods,
      })
      onGameAdded?.()
    } catch (err) {
      console.error('Failed to auto-add game:', err)
    }
  }

  const handleStartDownload = async () => {
    if (!installDir) return

    hasStartedRef.current = true
    setStatus('downloading')

    const result = await window.api.invoke('download:start', {
      gameId: gameBiz,
      biz: gameBiz,
      destDir: installDir,
      useTwintail: true,
    })

    if (!result.success) {
      setStatus('error')
      setProgress((prev) => prev ? { ...prev, error: result.error } : null)
    }
  }

  const handleCancel = async () => {
    await window.api.invoke('download:cancel', { gameId: gameBiz })
    setStatus('idle')
    setProgress(null)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return '--:--'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {status === 'idle' && `Install ${gameName}`}
            {status === 'downloading' && `Downloading ${gameName}`}
            {status === 'complete' && 'Installation Complete!'}
            {status === 'error' && 'Download Failed'}
          </DialogTitle>
          <DialogDescription>
            {status === 'idle' && `Version ${latestVersion}`}
            {status === 'downloading' && `Installing to ${installDir}`}
            {status === 'complete' && `${gameName} is ready to play`}
            {status === 'error' && progress?.error}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {status === 'idle' && (
            <>
              {/* Mode toggle */}
              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                <button
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    mode === 'download' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setMode('download')}
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
                <button
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    mode === 'locate' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
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
                        onChange={(e) => setInstallDir(e.target.value)}
                        placeholder="/home/user/Games/GameName"
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" onClick={handleBrowse}>
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {downloadSize && (
                    <div className="text-sm text-muted-foreground">
                      Download size: ~{downloadSize}
                    </div>
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
                        placeholder="Browse to the game .exe file..."
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
                    <div className="text-sm space-y-1 p-3 bg-muted rounded-md">
                      <div>
                        <span className="text-muted-foreground">Directory: </span>
                        <span className="font-mono text-xs break-all">{locateDetected.directory}</span>
                      </div>
                      {locateDetected.prefix && (
                        <div>
                          <span className="text-muted-foreground">Prefix: </span>
                          <span className="font-mono text-xs break-all">{locateDetected.prefix}</span>
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
            <div className="min-h-[160px] flex flex-col gap-4">
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              {/* Stats */}
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

              {/* Current file */}
              <div className="min-w-0 text-xs text-muted-foreground truncate">
                {progress.currentFile || <>&nbsp;</>}
              </div>

              {/* Cancel button */}
              <div className="flex justify-end">
                <Button type="button" variant="destructive" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-2" />
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
