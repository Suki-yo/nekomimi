import { useEffect, useState } from 'react'
import type { Selection } from '@/types/app-shell'
import type { AppConfig } from '@shared/types/config'
import type { DetectedRunner } from '@shared/types/game'
import type { RunnerStatus } from '@shared/types/runner'

interface UseSystemStateOptions {
  reportStatus: (message: string, selection?: Selection) => void
  onRunnersLoaded?: (runners: DetectedRunner[]) => void
}

interface UseSystemStateResult {
  config: AppConfig | null
  configLoading: boolean
  handleRunnerDownload: () => Promise<void>
  handleSteamRuntimeInstall: () => Promise<void>
  handleUpdateConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>
  installedRunner: { name: string; path: string; wine: string } | null
  loadRunnerInfo: () => Promise<void>
  loadSystemState: () => Promise<void>
  runnerDownloading: boolean
  runnerError: string | null
  runnerProgress: number
  runners: DetectedRunner[]
  setRunnerProgress: (value: number) => void
  steamrtDownloading: boolean
  steamrtError: string | null
  steamrtProgress: number
  steamrtStatus: { installed: boolean; path: string | null } | null
}

export function useSystemState({
  reportStatus,
  onRunnersLoaded,
}: UseSystemStateOptions): UseSystemStateResult {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [runners, setRunners] = useState<DetectedRunner[]>([])
  const [runnerDownloading, setRunnerDownloading] = useState(false)
  const [runnerProgress, setRunnerProgress] = useState(0)
  const [runnerError, setRunnerError] = useState<string | null>(null)
  const [installedRunner, setInstalledRunner] = useState<{ name: string; path: string; wine: string } | null>(null)
  const [steamrtStatus, setSteamrtStatus] = useState<{ installed: boolean; path: string | null } | null>(null)
  const [steamrtDownloading, setSteamrtDownloading] = useState(false)
  const [steamrtProgress, setSteamrtProgress] = useState(0)
  const [steamrtError, setSteamrtError] = useState<string | null>(null)

  useEffect(() => {
    const unsubRunner = window.api.on('runner:progress', (percent) => {
      setRunnerProgress(percent)
    })
    const unsubSteamrt = window.api.on('steamrt:progress', (percent) => {
      setSteamrtProgress(percent)
    })

    return () => {
      unsubRunner()
      unsubSteamrt()
    }
  }, [])

  async function loadConfig(): Promise<void> {
    try {
      setConfigLoading(true)
      const nextConfig = await window.api.invoke('config:get')
      setConfig(nextConfig)
    } finally {
      setConfigLoading(false)
    }
  }

  async function loadRunners(): Promise<void> {
    const nextRunners = await window.api.invoke('game:runners')
    setRunners(nextRunners)
    onRunnersLoaded?.(nextRunners)
  }

  async function loadRunnerInfo(): Promise<void> {
    const statuses = await window.api.invoke('runner:list')
    setInstalledRunner(toInstalledRunner(statuses))
  }

  async function loadSteamRuntimeStatus(): Promise<void> {
    const status = await window.api.invoke('steamrt:status')
    setSteamrtStatus(status)
  }

  async function loadSystemState(): Promise<void> {
    await Promise.all([
      loadConfig(),
      loadRunners(),
      loadRunnerInfo(),
      loadSteamRuntimeStatus(),
    ])
  }

  async function handleUpdateConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
    if (!config) {
      return
    }

    const updated = await window.api.invoke('config:update', { [key]: value } as Partial<AppConfig>)
    setConfig(updated)
    reportStatus(`updated ${String(key)} settings`, { type: 'settings' })
  }

  async function handleRunnerDownload(): Promise<void> {
    setRunnerDownloading(true)
    setRunnerProgress(0)
    setRunnerError(null)
    reportStatus('downloading proton-ge...', { type: 'settings' })
    const result = await window.api.invoke('runner:install', { kind: 'proton-ge' })
    if (result.ok) {
      await Promise.all([loadRunnerInfo(), loadRunners()])
      reportStatus('proton-ge ready', { type: 'settings' })
    } else {
      setRunnerError(result.error || 'Download failed')
      reportStatus(`proton-ge failed: ${result.error || 'download failed'}`, { type: 'settings' })
    }
    setRunnerDownloading(false)
  }

  async function handleSteamRuntimeInstall(): Promise<void> {
    setSteamrtDownloading(true)
    setSteamrtProgress(0)
    setSteamrtError(null)
    reportStatus('installing steam runtime...', { type: 'settings' })
    const result = await window.api.invoke('steamrt:install')
    if (result.success) {
      await loadSteamRuntimeStatus()
      reportStatus('steam runtime ready', { type: 'settings' })
    } else {
      setSteamrtError(result.error || 'Download failed')
      reportStatus(`steam runtime failed: ${result.error || 'download failed'}`, { type: 'settings' })
    }
    setSteamrtDownloading(false)
  }

  return {
    config,
    configLoading,
    handleRunnerDownload,
    handleSteamRuntimeInstall,
    handleUpdateConfig,
    installedRunner,
    loadRunnerInfo,
    loadSystemState,
    runnerDownloading,
    runnerError,
    runnerProgress,
    runners,
    setRunnerProgress,
    steamrtDownloading,
    steamrtError,
    steamrtProgress,
    steamrtStatus,
  }
}

function toInstalledRunner(statuses: RunnerStatus[]): { name: string; path: string; wine: string } | null {
  const protonGe = statuses.find((status) => status.kind === 'proton-ge')
  if (!protonGe?.path || !protonGe.installedVersions[0]) {
    return null
  }

  return {
    name: protonGe.installedVersions[0],
    path: protonGe.path,
    wine: `${protonGe.path}/files/bin/wine64`,
  }
}
