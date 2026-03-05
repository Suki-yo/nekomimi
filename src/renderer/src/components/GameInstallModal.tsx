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
import { FolderOpen, X } from 'lucide-react'
import type { DownloadProgress } from '../../../shared/types/download'

interface GameInstallModalProps {
  open: boolean
  onClose: () => void
  gameName: string
  gameBiz: 'genshin' | 'starrail' | 'zzz'
  latestVersion: string
  downloadSize?: string
}

export function GameInstallModal({
  open,
  onClose,
  gameName,
  gameBiz,
  latestVersion,
  downloadSize,
}: GameInstallModalProps) {
  const [installDir, setInstallDir] = useState('')
  const [status, setStatus] = useState<'idle' | 'downloading' | 'complete' | 'error'>('idle')
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const hasStartedRef = useRef(false)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStatus('idle')
      setProgress(null)
      hasStartedRef.current = false
      // Default install directory placeholder - user can browse to change
      setInstallDir(`~/Games/${gameName.replace(/\s+/g, '')}`)
    }
  }, [open, gameName])

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
      // Get directory from file path
      const dir = path.substring(0, path.lastIndexOf('/'))
      setInstallDir(dir)
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
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
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

          {status === 'downloading' && progress && (
            <>
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
              {progress.currentFile && (
                <div className="text-xs text-muted-foreground truncate">
                  {progress.currentFile}
                </div>
              )}

              {/* Cancel button */}
              <div className="flex justify-end">
                <Button type="button" variant="destructive" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel Download
                </Button>
              </div>
            </>
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
