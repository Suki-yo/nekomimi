import { useEffect, useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type DownloadPhase = 'xxmi' | 'runner' | 'complete' | 'error'

interface DownloadModalProps {
  open: boolean
  onClose: () => void
  onComplete: () => void
  needsXXMI: boolean
  needsRunner: boolean
}

export function DownloadModal({ open, onClose, onComplete, needsXXMI, needsRunner }: DownloadModalProps) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<DownloadPhase>('xxmi')
  const [status, setStatus] = useState<'downloading' | 'complete' | 'error'>('downloading')
  const [error, setError] = useState<string | null>(null)
  const hasStartedRef = useRef(false)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setProgress(0)
      setPhase(needsXXMI ? 'xxmi' : 'runner')
      setStatus('downloading')
      setError(null)
      hasStartedRef.current = false
    }
  }, [open, needsXXMI])

  useEffect(() => {
    if (!open || hasStartedRef.current) return

    // Mark as started to prevent retries
    hasStartedRef.current = true

    const downloadAll = async () => {
      try {
        // Download XXMI if needed
        if (needsXXMI) {
          setStatus('downloading')
          setPhase('xxmi')
          setProgress(0)

          const xxmiResult = await window.api.invoke('mods:xxmi-download')
          if (!xxmiResult.success) {
            setStatus('error')
            setError(`XXMI: ${xxmiResult.error || 'Download failed'}`)
            return
          }
        }

        // Download runner if needed
        if (needsRunner) {
          setStatus('downloading')
          setPhase('runner')
          setProgress(0)

          const runnerResult = await window.api.invoke('mods:runner-download')
          if (!runnerResult.success) {
            setStatus('error')
            setError(`Runner: ${runnerResult.error || 'Download failed'}`)
            return
          }
        }

        // All downloads complete
        setStatus('complete')
        setProgress(100)
        setTimeout(() => {
          onComplete()
          onClose()
        }, 500)
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Download failed')
      }
    }

    // Listen for progress updates
    const unsubXXMI = window.api.on('mods:xxmi-progress', (percent) => {
      if (phase === 'xxmi') {
        setProgress(percent as number)
      }
    })
    const unsubRunner = window.api.on('mods:runner-progress', (percent) => {
      if (phase === 'runner') {
        setProgress(percent as number)
      }
    })

    downloadAll()

    return () => {
      unsubXXMI()
      unsubRunner()
    }
  }, [open, needsXXMI, needsRunner, onComplete, onClose, phase])

  const getPhaseLabel = () => {
    if (status === 'complete') return 'Download Complete!'
    if (phase === 'xxmi') return 'Downloading XXMI...'
    if (phase === 'runner') return 'Downloading Proton-GE...'
    return 'Downloading...'
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {status === 'error' ? 'Download Failed' : getPhaseLabel()}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {status === 'error' ? (
            <div className="text-destructive">{error}</div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-center text-sm text-muted-foreground mt-2">
                {status === 'complete' ? 'Ready to launch!' : `${progress}%`}
              </div>
              {/* Phase indicators */}
              {(needsXXMI && needsRunner) && (
                <div className="flex justify-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className={phase === 'xxmi' || status === 'complete' ? 'text-primary' : ''}>
                    XXMI {phase !== 'xxmi' && status !== 'complete' ? '✓' : ''}
                  </span>
                  <span className={phase === 'runner' || status === 'complete' ? 'text-primary' : ''}>
                    Proton-GE {status === 'complete' ? '✓' : ''}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
