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
import { FolderOpen, Download, Search } from 'lucide-react'
import type { DownloadProgress } from '../../../shared/types/download'

type InstallMode = 'download' | 'locate'

interface WuwaInstallModalProps {
  open: boolean
  onClose: () => void
  latestVersion: string
  totalSize: number
  onGameAdded?: () => void
}

export function WuwaInstallModal({
  open,
  onClose,
  latestVersion,
  totalSize,
  onGameAdded,
}: WuwaInstallModalProps) {
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

  // Reset state when modal opens
  useEffect(() => {
    if (!open) return
    window.api.invoke('download:status', { gameId: 'wuwa' }).then((result: { inProgress: boolean }) => {
      if (result.inProgress) {
        setMode('download')
        setStatus('downloading')
        hasStartedRef.current = true
      } else {
        setMode('download')
        setStatus('idle')
        setProgress(null)
        hasStartedRef.current = false
        setInstallDir('~/Games/WutheringWaves')
        setLocateExePath('')
        setLocateDetected(null)
        setLocateError(null)
      }
    })
  }, [open])

  // Listen for download progress
  useEffect(() => {
    const unsubProgress = window.api.on('download:progress', (data) => {
      const p = data as DownloadProgress
      if (p.gameId === 'wuwa') {
        setProgress(p)
        if (p.status === 'downloading' || p.status === 'verifying') {
          setStatus('downloading')
        }
      }
    })

    const unsubComplete = window.api.on('download:complete', (data) => {
      if ((data as { gameId: string }).gameId === 'wuwa') {
        setStatus('complete')
        setProgress((prev) => prev ? { ...prev, percent: 100, status: 'installed' } : null)
        handleAutoAdd()
      }
    })

    const unsubError = window.api.on('download:error', (data) => {
      if ((data as { gameId: string }).gameId === 'wuwa') {
        setStatus('error')
        setProgress((prev) => prev ? { ...prev, error: (data as { error: string }).error } : null)
      }
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [locateExePath])

  const handleBrowse = async () => {
    const filePath = await window.api.openFile()
    if (filePath) {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'))
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
    try {
      await window.api.invoke('game:add', {
        name: 'Wuthering Waves',
        slug: 'wuwa',
        installed: true,
        directory: locateDetected.directory,
        executable: locateExePath,
        runner: {
          type: 'proton' as const,
          path: '',
          prefix: locateDetected.prefix || '',
        },
        launch: { env: {}, preLaunch: [], postLaunch: [], args: '' },
        mods: { enabled: false },
      })
      onGameAdded?.()
      onClose()
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : 'Failed to add game')
    } finally {
      setLocating(false)
    }
  }

  const handleStartDownload = async () => {
    if (!installDir) return

    hasStartedRef.current = true
    setStatus('downloading')

    const result = await window.api.invoke('download:start-wuwa', {
      gameId: 'wuwa',
      destDir: installDir,
    })

    if (!result.success) {
      setStatus('error')
      setProgress((prev) => prev ? { ...prev, error: result.error } : null)
    }
  }

  const handleCancel = async () => {
    await window.api.invoke('download:cancel', { gameId: 'wuwa' })
    setStatus('idle')
    setProgress(null)
  }

  const handleAutoAdd = async () => {
    try {
      await window.api.invoke('game:add', {
        name: 'Wuthering Waves',
        slug: 'wuwa',
        installed: true,
        directory: installDir,
        executable: `${installDir}/Client/Binaries/Win64/Client-Win64-Shipping.exe`,
        runner: { type: 'proton' as const, path: '', prefix: '' },
        launch: { env: {}, preLaunch: [], postLaunch: [], args: '' },
        mods: { enabled: false },
      })
      onGameAdded?.()
    } catch (err) {
      console.error('Failed to auto-add game:', err)
    }
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {status === 'idle' && 'Install Wuthering Waves'}
            {status === 'downloading' && 'Downloading Wuthering Waves'}
            {status === 'complete' && 'Installation Complete!'}
            {status === 'error' && 'Download Failed'}
          </DialogTitle>
          <DialogDescription>
            {status === 'idle' && `Version ${latestVersion}`}
            {status === 'downloading' && `Installing to ${installDir}`}
            {status === 'complete' && 'Wuthering Waves is ready to play'}
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
                        placeholder="/home/user/Games/WutheringWaves"
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" onClick={handleBrowse}>
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Download: ~{formatBytes(totalSize)}
                  </div>

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
                        placeholder="Browse to Client-Win64-Shipping.exe..."
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
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{progress.currentFile ? progress.currentFile.split('/').pop() : progress.status}</span>
                  <span>{formatTime(progress.timeRemaining)}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.bytesTotal)}</span>
                  <span>{progress.percent.toFixed(1)}%</span>
                </div>
                {progress.downloadSpeed > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(progress.downloadSpeed)}/s
                  </div>
                )}
              </div>
              <Button type="button" variant="outline" onClick={handleCancel} className="w-full">
                Cancel
              </Button>
            </>
          )}

          {status === 'complete' && (
            <>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Installation completed successfully.</p>
                <p>Wuthering Waves has been added to your library and is ready to play!</p>
              </div>
              <Button type="button" onClick={onClose} className="w-full">
                Done
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-sm text-destructive">
                {progress?.error || 'An error occurred during installation'}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => setStatus('idle')}>
                  Retry
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
