import { useEffect, useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import type { AppConfig } from '../../../shared/types/config'
import type { RunnerStatus } from '../../../shared/types/runner'

function getRunnerActionLabel(
  runnerDownloading: boolean,
  runnerProgress: number,
  hasInstalledRunner: boolean,
): string {
  if (runnerDownloading) {
    return `${runnerProgress}%`
  }

  if (hasInstalledRunner) {
    return 'Update'
  }

  return 'Download'
}

function getSteamRuntimeStatusText(status: { installed: boolean; path: string | null } | null): string {
  if (status === null) {
    return 'Checking...'
  }

  if (status.installed) {
    return status.path ?? 'Installed'
  }

  return 'Not installed'
}

function getSteamRuntimeActionLabel(
  steamrtDownloading: boolean,
  steamrtProgress: number,
  isInstalled: boolean,
): string {
  if (steamrtDownloading) {
    return `${steamrtProgress}%`
  }

  if (isInstalled) {
    return 'Reinstall'
  }

  return 'Download'
}

function Settings(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [installedRunner, setInstalledRunner] = useState<{ name: string } | null>(null)
  const [runnerDownloading, setRunnerDownloading] = useState(false)
  const [runnerProgress, setRunnerProgress] = useState(0)
  const [runnerError, setRunnerError] = useState<string | null>(null)
  const [steamrtStatus, setSteamrtStatus] = useState<{ installed: boolean; path: string | null } | null>(null)
  const [steamrtDownloading, setSteamrtDownloading] = useState(false)
  const [steamrtProgress, setSteamrtProgress] = useState(0)
  const [steamrtError, setSteamrtError] = useState<string | null>(null)
  const [version, setVersion] = useState('...')

  const loadRunnerInfo = async () => {
    const statuses = await window.api.invoke('runner:list')
    setInstalledRunner(toInstalledRunner(statuses))
  }

  const loadSteamrtStatus = async () => {
    const status = await window.api.invoke('steamrt:status')
    setSteamrtStatus(status)
  }

  const loadConfig = async () => {
    try {
      setLoading(true)
      const appConfig = await window.api.invoke('config:get')
      setConfig(appConfig)
    } finally {
      setLoading(false)
    }
  }

  const updateConfig = async (updates: Partial<AppConfig>) => {
    const updated = await window.api.invoke('config:update', updates)
    setConfig(updated)
  }

  const handleDownloadRunner = async () => {
    setRunnerDownloading(true)
    setRunnerProgress(0)
    setRunnerError(null)
    const result = await window.api.invoke('runner:install', { kind: 'proton-ge' })
    if (result.ok) {
      await loadRunnerInfo()
    } else {
      setRunnerError(result.error || 'Download failed')
    }
    setRunnerDownloading(false)
  }

  const handleInstallSteamrt = async () => {
    setSteamrtDownloading(true)
    setSteamrtProgress(0)
    setSteamrtError(null)
    const result = await window.api.invoke('steamrt:install')
    if (result.success) {
      await loadSteamrtStatus()
    } else {
      setSteamrtError(result.error || 'Download failed')
    }
    setSteamrtDownloading(false)
  }

  useEffect(() => {
    loadConfig()
    loadRunnerInfo()
    loadSteamrtStatus()
    void window.api.getVersion().then(setVersion)

    const unsubRunner = window.api.on('runner:progress', (percent) => {
      setRunnerProgress(percent)
    })
    const unsubSteamrt = window.api.on('steamrt:progress', (percent) => {
      setSteamrtProgress(percent)
    })
    return () => { unsubRunner(); unsubSteamrt() }
  }, [])

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-zinc-400">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Appearance */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4 text-zinc-300">Appearance</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Theme</span>
            <select
              value={config.ui.theme}
              onChange={(e) =>
                updateConfig({
                  ui: { ...config.ui, theme: e.target.value as 'light' | 'dark' | 'auto' },
                })
              }
              className="bg-zinc-700 rounded px-3 py-1.5"
            >
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span>View Mode</span>
            <select
              value={config.ui.viewMode}
              onChange={(e) =>
                updateConfig({
                  ui: { ...config.ui, viewMode: e.target.value as 'grid' | 'list' },
                })
              }
              className="bg-zinc-700 rounded px-3 py-1.5"
            >
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
          </div>
        </div>
      </section>

      {/* Runner */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4 text-zinc-300">Runner</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Default Runner Type</span>
            <select
              value={config.runner.defaultType}
              onChange={(e) =>
                updateConfig({
                  runner: {
                    ...config.runner,
                    defaultType: e.target.value as 'wine' | 'proton' | 'native',
                  },
                })
              }
              className="bg-zinc-700 rounded px-3 py-1.5"
            >
              <option value="proton">Proton</option>
              <option value="wine">Wine</option>
              <option value="native">Native</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div>Proton-GE</div>
              <div className="text-sm text-zinc-400">
                {installedRunner ? installedRunner.name : 'Not installed'}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadRunner}
              disabled={runnerDownloading}
            >
              {getRunnerActionLabel(runnerDownloading, runnerProgress, installedRunner !== null)}
            </Button>
          </div>

          {runnerDownloading && (
            <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-200"
                style={{ width: `${runnerProgress}%` }}
              />
            </div>
          )}

          {runnerError && (
            <div className="text-sm text-destructive">{runnerError}</div>
          )}
        </div>
      </section>

      {/* Steam Runtime */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4 text-zinc-300">Steam Runtime</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Required for launching Proton games (pressure-vessel container). ~700 MB.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div>Steam Linux Runtime (sniper)</div>
              <div className="text-sm text-zinc-400">
                {getSteamRuntimeStatusText(steamrtStatus)}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallSteamrt}
              disabled={steamrtDownloading}
            >
              {getSteamRuntimeActionLabel(steamrtDownloading, steamrtProgress, steamrtStatus?.installed ?? false)}
            </Button>
          </div>

          {steamrtDownloading && (
            <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-200"
                style={{ width: `${steamrtProgress}%` }}
              />
            </div>
          )}

          {steamrtError && (
            <div className="text-sm text-destructive">{steamrtError}</div>
          )}
        </div>
      </section>

      {/* Info */}
      <section>
        <h2 className="text-lg font-medium mb-4 text-zinc-300">About</h2>
        <div className="text-zinc-400 text-sm space-y-1">
          <p>Nekomimi v{version}</p>
          <p>The anime game launcher for people who simp too hard.</p>
        </div>
      </section>
    </div>
  )
}

export default Settings

function toInstalledRunner(statuses: RunnerStatus[]): { name: string } | null {
  const protonGe = statuses.find((status) => status.kind === 'proton-ge')
  return protonGe?.installedVersions[0] ? { name: protonGe.installedVersions[0] } : null
}
