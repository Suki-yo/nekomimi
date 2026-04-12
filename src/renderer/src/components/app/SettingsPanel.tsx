import { useState, type JSX } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RunnerStatusPanel } from './RunnerStatusPanel'
import { SystemHealthPanel } from './SystemHealthPanel'
import type { AppConfig } from '@shared/types/config'
import type { TwintailImportOptions, TwintailImportResult, TwintailImportStatus } from '@shared/types/twintail'

interface SettingsPanelProps {
  config: AppConfig | null
  configLoading: boolean
  createProgressBar: (percent: number, width?: number) => string
  installedRunner: { name: string; path: string; wine: string } | null
  onOpenSystemPath: (path: string) => void
  onRunnerDownload: () => Promise<void>
  onSystemStateRefresh: () => Promise<void>
  onSteamRuntimeInstall: () => Promise<void>
  onUpdateConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>
  runnerDownloading: boolean
  runnerError: string | null
  runnerProgress: number
  steamrtDownloading: boolean
  steamrtError: string | null
  steamrtProgress: number
  steamrtStatus: { installed: boolean; path: string | null } | null
}

export function SettingsPanel({
  config,
  configLoading,
  createProgressBar,
  installedRunner,
  onOpenSystemPath,
  onRunnerDownload,
  onSystemStateRefresh,
  onSteamRuntimeInstall,
  onUpdateConfig,
  runnerDownloading,
  runnerError,
  runnerProgress,
  steamrtDownloading,
  steamrtError,
  steamrtProgress,
  steamrtStatus,
}: SettingsPanelProps): JSX.Element {
  const [twintailDialogOpen, setTwintailDialogOpen] = useState(false)
  const [twintailLoading, setTwintailLoading] = useState(false)
  const [twintailImporting, setTwintailImporting] = useState(false)
  const [twintailStatus, setTwintailStatus] = useState<TwintailImportStatus | null>(null)
  const [twintailOptions, setTwintailOptions] = useState<TwintailImportOptions>({
    importWuwaPrefix: false,
    importRunners: false,
    importXxmi: false,
  })
  const [twintailResult, setTwintailResult] = useState<TwintailImportResult | null>(null)

  if (configLoading || !config) {
    return <div className="tui-terminal-panel tui-terminal-full">loading settings...</div>
  }

  const openTwintailWizard = async () => {
    setTwintailLoading(true)
    setTwintailResult(null)
    try {
      const status = await window.api.invoke('twintail:detect')
      setTwintailStatus(status)
      setTwintailOptions({
        importWuwaPrefix: !!status.wuwaPrefixPath,
        importRunners: !!status.runnersPath,
        importXxmi: !!status.xxmiPath,
      })
      setTwintailDialogOpen(true)
    } finally {
      setTwintailLoading(false)
    }
  }

  const handleTwintailImport = async () => {
    setTwintailImporting(true)
    try {
      const result = await window.api.invoke('twintail:import', twintailOptions)
      setTwintailResult(result)
      if (result.ok) {
        await onSystemStateRefresh()
      }
    } finally {
      setTwintailImporting(false)
    }
  }

  return (
    <div className="tui-terminal-panel tui-terminal-full">
      <div className="tui-terminal-header">&gt; SETTINGS</div>

      <SystemHealthPanel />

      <div className="tui-settings-section tui-home-section">
        <div className="tui-config-title">migration</div>
        <div className="tui-meta-line">
          Import runners, WuWa prefixes, or XXMI files from an existing TwintailLauncher install.
        </div>
        <div className="tui-action-row">
          <button className="tui-command" onClick={() => void openTwintailWizard()} disabled={twintailLoading} type="button">
            [{twintailLoading ? 'CHECKING...' : 'IMPORT FROM TWINTAILLAUNCHER'}]
          </button>
        </div>
      </div>

      <div className="tui-settings-section tui-home-section">
        <div className="tui-config-title">runners</div>
        <div className="tui-kv-list">
          <div><span>default runner</span><span>{config.runner.defaultType}</span></div>
          <div><span>auto update checks</span><span>{config.runner.autoUpdate ? 'enabled' : 'disabled'}</span></div>
          <div><span>installed proton-ge</span><span>{installedRunner?.name ?? 'not installed'}</span></div>
        </div>
        <div className="tui-action-row">
          <button
            className="tui-command"
            onClick={() => void onUpdateConfig('runner', { ...config.runner, autoUpdate: !config.runner.autoUpdate })}
            type="button"
          >
            [{config.runner.autoUpdate ? 'DISABLE AUTO CHECKS' : 'ENABLE AUTO CHECKS'}]
          </button>
        </div>
      </div>

      <RunnerStatusPanel onUpdated={onSystemStateRefresh} />

      <div className="tui-settings-section tui-home-section">
        <div className="tui-config-title">appearance</div>
        <div className="tui-form-grid">
          <label className="tui-field">
            <span>theme</span>
            <select
              className="tui-select"
              value={config.ui.theme}
              onChange={(event) =>
                void onUpdateConfig('ui', { ...config.ui, theme: event.target.value as AppConfig['ui']['theme'] })
              }
            >
              <option value="auto">auto</option>
              <option value="dark">dark</option>
              <option value="light">light</option>
            </select>
          </label>
          <label className="tui-field">
            <span>view mode</span>
            <select
              className="tui-select"
              value={config.ui.viewMode}
              onChange={(event) =>
                void onUpdateConfig('ui', { ...config.ui, viewMode: event.target.value as AppConfig['ui']['viewMode'] })
              }
            >
              <option value="grid">grid</option>
              <option value="list">list</option>
            </select>
          </label>
        </div>
        <div className="tui-kv-list">
          <div>
            <span>close behavior</span>
            <span>{config.ui.minimizeToTray ? 'minimize to tray' : 'quit app'}</span>
          </div>
        </div>
        <div className="tui-action-row">
          <button
            className="tui-command"
            onClick={() => void onUpdateConfig('ui', { ...config.ui, minimizeToTray: !config.ui.minimizeToTray })}
            type="button"
          >
            [{config.ui.minimizeToTray ? 'DISABLE TRAY MINIMIZE' : 'ENABLE TRAY MINIMIZE'}]
          </button>
        </div>
      </div>

      <div className="tui-settings-section tui-home-section">
        <div className="tui-config-title">steam runtime</div>
        <div className="tui-kv-list">
          <div><span>status</span><span>{steamrtStatus?.installed ? steamrtStatus.path ?? 'installed' : 'not installed'}</span></div>
        </div>
        {steamrtDownloading && (
          <div className="tui-progress-block">
            <div className="tui-progress-line">[{createProgressBar(steamrtProgress)}] {steamrtProgress}%</div>
          </div>
        )}
        {steamrtError && <div className="tui-meta-line tui-error">{steamrtError}</div>}
        <div className="tui-action-row">
          <button className="tui-command" onClick={() => void onSteamRuntimeInstall()} disabled={steamrtDownloading} type="button">
            [{steamrtDownloading ? `${steamrtProgress}%` : steamrtStatus?.installed ? 'REINSTALL STEAMRT' : 'DOWNLOAD STEAMRT'}]
          </button>
        </div>
      </div>

      <div className="tui-settings-section tui-home-section">
        <div className="tui-config-title">data</div>
        <div className="tui-kv-list">
          <div><span>library path</span><span className="tui-truncate">{config.paths.base}</span></div>
        </div>
        <div className="tui-action-row">
          <button className="tui-command" onClick={() => onOpenSystemPath(config.paths.base)} type="button">
            [OPEN DATA FOLDER]
          </button>
        </div>
      </div>

      <Dialog open={twintailDialogOpen} onOpenChange={setTwintailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from TwintailLauncher</DialogTitle>
            <DialogDescription>
              Copy selected data out of TwintailLauncher into nekomimi-managed storage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {!twintailStatus?.twintailInstalled && (
              <div className="rounded border border-white/10 px-3 py-2">
                TwintailLauncher not detected. There is nothing to import on this machine.
              </div>
            )}

            {twintailStatus?.twintailInstalled && (
              <>
                <label className="flex items-start gap-3">
                  <input
                    checked={twintailOptions.importRunners}
                    disabled={!twintailStatus.runnersPath || twintailImporting}
                    onChange={(event) => setTwintailOptions((current) => ({ ...current, importRunners: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>
                    <span className="font-medium">Runners</span>
                    <span className="mt-1 block text-xs opacity-70">{twintailStatus.runnersPath ?? 'Not found'}</span>
                  </span>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    checked={twintailOptions.importWuwaPrefix}
                    disabled={!twintailStatus.wuwaPrefixPath || twintailImporting}
                    onChange={(event) => setTwintailOptions((current) => ({ ...current, importWuwaPrefix: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>
                    <span className="font-medium">WuWa prefix</span>
                    <span className="mt-1 block text-xs opacity-70">{twintailStatus.wuwaPrefixPath ?? 'Not found'}</span>
                  </span>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    checked={twintailOptions.importXxmi}
                    disabled={!twintailStatus.xxmiPath || twintailImporting}
                    onChange={(event) => setTwintailOptions((current) => ({ ...current, importXxmi: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>
                    <span className="font-medium">XXMI files</span>
                    <span className="mt-1 block text-xs opacity-70">{twintailStatus.xxmiPath ?? 'Not found'}</span>
                  </span>
                </label>
              </>
            )}

            {twintailResult && (
              <div className="rounded border border-white/10 px-3 py-2 text-xs">
                <div>status: {twintailResult.ok ? 'completed' : 'failed'}</div>
                <div>imported: {twintailResult.imported.length > 0 ? twintailResult.imported.join(', ') : 'nothing'}</div>
                <div>skipped: {twintailResult.skipped.length > 0 ? twintailResult.skipped.join(', ') : 'nothing'}</div>
                {twintailResult.error && <div className="tui-error mt-1">{twintailResult.error}</div>}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="tui-command" onClick={() => setTwintailDialogOpen(false)} type="button">
                [CLOSE]
              </button>
              <button
                className="tui-command"
                disabled={
                  twintailImporting
                  || !twintailStatus?.twintailInstalled
                  || (!twintailOptions.importRunners && !twintailOptions.importWuwaPrefix && !twintailOptions.importXxmi)
                }
                onClick={() => void handleTwintailImport()}
                type="button"
              >
                [{twintailImporting ? 'IMPORTING...' : 'IMPORT'}]
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
