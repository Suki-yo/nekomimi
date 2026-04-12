import { useRunnerStatus } from '@/hooks/useRunnerStatus'
import type { RunnerKind } from '@shared/types/runner'

const RUNNER_ORDER: RunnerKind[] = ['proton-ge', 'wine-ge', 'steam-runtime', 'xxmi-libs']

interface RunnerStatusPanelProps {
  onUpdated?: () => Promise<void>
}

export function RunnerStatusPanel({ onUpdated }: RunnerStatusPanelProps) {
  const {
    busy,
    error,
    install,
    progress,
    reload,
    runners,
    updates,
  } = useRunnerStatus(onUpdated)

  const runnerByKind = new Map(runners.map((runner) => [runner.kind, runner]))
  const updateByKind = new Map(updates.map((update) => [update.kind, update]))

  return (
    <div className="tui-settings-section tui-home-section">
      <div className="tui-config-title">managed runners</div>
      <div className="tui-action-row">
        <button className="tui-command" onClick={() => void reload()} type="button">
          [REFRESH RUNNER STATUS]
        </button>
      </div>
      <div className="tui-kv-list">
        {RUNNER_ORDER.map((kind) => {
          const runner = runnerByKind.get(kind)
          const update = updateByKind.get(kind)
          const installed = runner?.installedVersions[0] ?? 'not installed'
          const remote = update?.remoteLatest ?? 'unknown'
          const upToDate = update?.upToDate ?? false
          const canInstall = !upToDate || !runner?.installedVersions.length

          return (
            <div key={kind} className="!block space-y-2 py-2">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div>{runner?.displayName ?? kind}</div>
                  <div className="tui-meta-line">installed: {installed}</div>
                  <div className="tui-meta-line">latest: {remote}</div>
                </div>
                <button
                  className="tui-command"
                  disabled={!canInstall || busy === kind}
                  onClick={() => void install(kind)}
                  type="button"
                >
                  [{busy === kind ? `INSTALLING ${progress}%` : canInstall ? 'INSTALL / UPDATE' : 'UP TO DATE'}]
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {error && <div className="tui-meta-line tui-error">{error}</div>}
    </div>
  )
}
