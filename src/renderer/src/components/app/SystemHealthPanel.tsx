import type { JSX } from 'react'
import { usePreflight } from '@/hooks/usePreflight'

export function SystemHealthPanel(): JSX.Element {
  const { report, loading, refresh } = usePreflight()

  if (!report) {
    return (
      <div className="tui-settings-section tui-home-section">
        <div className="tui-config-title">system health</div>
        <div className="tui-meta-line">checking system dependencies...</div>
      </div>
    )
  }

  const missingRequired = report.checks.filter((check) => check.severity === 'required' && !check.ok)

  return (
    <div className="tui-settings-section tui-home-section">
      <div className="tui-config-title">system health</div>
      <div className="tui-meta-line">
        {missingRequired.length === 0
          ? 'all required dependencies are available'
          : `${missingRequired.length} required dependencies missing`}
      </div>

      <div className="mt-3 space-y-3">
        {report.checks.map((check) => (
          <div key={check.name} className="rounded border border-white/10 px-3 py-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-mono">
                {check.ok ? '[OK]' : '[MISSING]'} {check.name} ({check.severity})
              </span>
              <span className="opacity-70">{check.foundAt ?? 'not found'}</span>
            </div>
            <div className="mt-1 text-xs opacity-80">{check.purpose}</div>
            {!check.ok && (
              <div className="mt-1 text-xs">
                install: <code>{check.installHint}</code>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="tui-action-row">
        <button className="tui-command" disabled={loading} onClick={() => void refresh()} type="button">
          [{loading ? 'CHECKING...' : 'RE-CHECK'}]
        </button>
      </div>
    </div>
  )
}
