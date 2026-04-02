import type { JSX } from 'react'
import type { AppConfig } from '@shared/types/config'

interface SettingsPanelProps {
  config: AppConfig | null
  configLoading: boolean
  createProgressBar: (percent: number, width?: number) => string
  installedRunner: { name: string; path: string; wine: string } | null
  onOpenSystemPath: (path: string) => void
  onRunnerDownload: () => Promise<void>
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
  if (configLoading || !config) {
    return <div className="tui-terminal-panel tui-terminal-full">loading settings...</div>
  }

  return (
    <div className="tui-terminal-panel tui-terminal-full">
      <div className="tui-terminal-header">&gt; SETTINGS</div>

      <div className="tui-settings-section tui-home-section">
        <div className="tui-config-title">runners</div>
        <div className="tui-kv-list">
          <div><span>default runner</span><span>{config.runner.defaultType}</span></div>
          <div><span>installed proton-ge</span><span>{installedRunner?.name ?? 'not installed'}</span></div>
        </div>
        {runnerDownloading && (
          <div className="tui-progress-block">
            <div className="tui-progress-line">[{createProgressBar(runnerProgress)}] {runnerProgress}%</div>
          </div>
        )}
        {runnerError && <div className="tui-meta-line tui-error">{runnerError}</div>}
        <div className="tui-action-row">
          <button className="tui-command" onClick={() => void onRunnerDownload()} disabled={runnerDownloading} type="button">
            [{runnerDownloading ? `${runnerProgress}%` : installedRunner ? 'UPDATE RUNNER' : 'DOWNLOAD RUNNER'}]
          </button>
        </div>
      </div>

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
    </div>
  )
}
