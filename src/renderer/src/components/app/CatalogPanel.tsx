import type { JSX } from 'react'
import { formatBytes } from '@/components/install-modal-utils'
import type { DownloadProgress } from '@shared/types/download'
import type { Game } from '@shared/types/game'
import type { CatalogDetails, CatalogEntry, CatalogFormState } from '@/data/catalog'

interface CatalogPanelProps {
  createProgressBar: (percent: number, width?: number) => string
  describeProgress: (progress: DownloadProgress) => string
  details: CatalogDetails
  entry: CatalogEntry
  form: CatalogFormState
  installedGame?: Game
  onBrowse: () => Promise<void>
  onCancel: () => Promise<void>
  onInstallDirChange: (value: string) => void
  onLocateBrowse: () => Promise<void>
  onLocateConfirm: () => Promise<void>
  onLocatePrefixChange: (value: string) => void
  onModeChange: (mode: CatalogFormState['mode']) => void
  onStart: () => Promise<void>
  progress: DownloadProgress | null
}

export function CatalogPanel({
  createProgressBar,
  describeProgress,
  details,
  entry,
  form,
  installedGame,
  onBrowse,
  onCancel,
  onInstallDirChange,
  onLocateBrowse,
  onLocateConfirm,
  onLocatePrefixChange,
  onModeChange,
  onStart,
  progress,
}: CatalogPanelProps): JSX.Element {
  const installed = !!installedGame
  const active = !!progress && ['downloading', 'verifying', 'extracting'].includes(progress.status)
  const canUpdate = installedGame?.download?.status === 'update_available'
  const isPreloadUpdate = canUpdate && installedGame?.download?.updateChannel === 'preload'
  const downloadLabel =
    canUpdate && installedGame?.download?.totalBytes
      ? `${isPreloadUpdate ? 'preload patch' : 'update'} ${formatBytes(installedGame.download.totalBytes)}`
      : details.sizeLabel
  const installedStatus =
    installedGame?.download?.status === 'update_available'
      ? isPreloadUpdate ? 'PRELOAD AVAILABLE' : 'UPDATE AVAILABLE'
      : installed
        ? 'INSTALLED'
        : active && progress
          ? progress.status.toUpperCase()
          : 'READY'

  return (
    <div className="tui-detail-split">
      <div className="tui-cover-panel tui-cover-panel-alt">
        <div className="tui-cover-catalog" style={{ color: entry.accent, borderColor: entry.accent }}>
          {entry.coverLabel}
        </div>
      </div>

      <div className="tui-terminal-panel">
        <div className="tui-terminal-header">{`> ${entry.name.toUpperCase()}`}</div>
        <div className="tui-kv-list">
          <div><span>vendor</span><span>{entry.vendor}</span></div>
          <div><span>version</span><span>{details.versionLabel ?? details.version ?? 'unknown'}</span></div>
          <div><span>download</span><span>{downloadLabel}</span></div>
          {details.installedSizeLabel && <div><span>installed</span><span>{details.installedSizeLabel}</span></div>}
          <div><span>status</span><span>{installedStatus}</span></div>
        </div>

        {details.error && <div className="tui-meta-line tui-error">{details.error}</div>}

        {active && progress ? (
          <div className="tui-progress-block">
            <div className="tui-progress-line">[{createProgressBar(progress.percent)}] {progress.percent}%</div>
            <div className="tui-meta-line">{describeProgress(progress)}</div>
          </div>
        ) : (
          <>
            <div className="tui-action-row tui-mode-row">
              <button
                className={`tui-command ${form.mode === 'download' ? 'is-selected' : ''}`}
                onClick={() => onModeChange('download')}
                type="button"
              >
                [DOWNLOAD]
              </button>
              <button
                className={`tui-command ${form.mode === 'locate' ? 'is-selected' : ''}`}
                onClick={() => onModeChange('locate')}
                type="button"
              >
                [LOCATE EXISTING]
              </button>
            </div>

            {form.mode === 'download' ? (
              <div className="tui-form-grid">
                <label className="tui-field tui-field-span">
                  <span>install directory</span>
                  <div className="tui-inline-field">
                    <input
                      className="tui-input"
                      value={form.installDir}
                      onChange={(event) => onInstallDirChange(event.target.value)}
                    />
                    <button className="tui-command" onClick={() => void onBrowse()} type="button">
                      [BROWSE]
                    </button>
                  </div>
                </label>
              </div>
            ) : (
              <div className="tui-form-grid">
                <label className="tui-field tui-field-span">
                  <span>executable</span>
                  <div className="tui-inline-field">
                    <input className="tui-input" value={form.locateExePath} readOnly />
                    <button className="tui-command" onClick={() => void onLocateBrowse()} type="button">
                      [BROWSE EXE]
                    </button>
                  </div>
                </label>
                <label className="tui-field">
                  <span>directory</span>
                  <input className="tui-input" value={form.locateDirectory} readOnly />
                </label>
                <label className="tui-field">
                  <span>prefix</span>
                  <input
                    className="tui-input"
                    value={form.locatePrefix}
                    onChange={(event) => onLocatePrefixChange(event.target.value)}
                  />
                </label>
                {form.locateError && <div className="tui-meta-line tui-error">{form.locateError}</div>}
              </div>
            )}
          </>
        )}

        <div className="tui-divider" />

        <div className="tui-action-row">
          {active ? (
            <button className="tui-command tui-command-danger" onClick={() => void onCancel()} type="button">
              [CANCEL]
            </button>
          ) : form.mode === 'download' ? (
            <button
              className="tui-command"
              onClick={() => void onStart()}
              disabled={(!canUpdate && installed) || !details.version}
              type="button"
            >
              [{canUpdate ? (isPreloadUpdate ? 'PRELOAD' : 'UPDATE') : 'INSTALL'}]
            </button>
          ) : (
            <button className="tui-command" onClick={() => void onLocateConfirm()} type="button">
              [REGISTER]
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
