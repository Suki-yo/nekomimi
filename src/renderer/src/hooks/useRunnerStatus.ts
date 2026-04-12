import { useCallback, useEffect, useState } from 'react'
import type { RunnerKind, RunnerStatus, RunnerUpdateInfo } from '@shared/types/runner'

export function useRunnerStatus(onUpdated?: () => Promise<void>) {
  const [runners, setRunners] = useState<RunnerStatus[]>([])
  const [updates, setUpdates] = useState<RunnerUpdateInfo[]>([])
  const [busy, setBusy] = useState<RunnerKind | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [runnerList, updateList] = await Promise.all([
      window.api.invoke('runner:list'),
      window.api.invoke('runner:check-updates'),
    ])

    setRunners(runnerList)
    setUpdates(updateList)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return window.api.on('runner:progress', (percent) => {
      setProgress(percent)
    })
  }, [])

  const install = useCallback(async (kind: RunnerKind) => {
    setBusy(kind)
    setProgress(0)
    setError(null)

    try {
      const result = await window.api.invoke('runner:install', { kind })
      if (!result.ok) {
        throw new Error(result.error ?? `Failed to install ${kind}`)
      }
      await reload()
      await onUpdated?.()
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError))
    } finally {
      setBusy(null)
    }
  }, [onUpdated, reload])

  return {
    busy,
    error,
    install,
    progress,
    reload,
    runners,
    updates,
  }
}
