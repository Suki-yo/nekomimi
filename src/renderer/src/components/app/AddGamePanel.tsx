import type { JSX } from 'react'
import type { ManualGameForm } from '@/lib/app-shell'
import type { DetectedRunner } from '@shared/types/game'

interface AddGamePanelProps {
  form: ManualGameForm
  runners: DetectedRunner[]
  onBrowseExecutable: () => Promise<void>
  onChange: (updates: Partial<ManualGameForm>) => void
  onSubmit: () => Promise<void>
}

export function AddGamePanel({
  form,
  runners,
  onBrowseExecutable,
  onChange,
  onSubmit,
}: AddGamePanelProps): JSX.Element {
  return (
    <div className="tui-terminal-panel tui-terminal-full">
      <div className="tui-terminal-header">&gt; ADD LOCAL GAME</div>
      <div className="tui-form-grid">
        <label className="tui-field tui-field-span">
          <span>executable</span>
          <div className="tui-inline-field">
            <input
              className="tui-input"
              value={form.executable}
              onChange={(event) => onChange({ executable: event.target.value })}
            />
            <button className="tui-command" onClick={() => void onBrowseExecutable()} disabled={form.detecting} type="button">
              [{form.detecting ? 'DETECTING' : 'BROWSE'}]
            </button>
          </div>
        </label>
        <label className="tui-field">
          <span>name</span>
          <input
            className="tui-input"
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label className="tui-field">
          <span>directory</span>
          <input
            className="tui-input"
            value={form.directory}
            onChange={(event) => onChange({ directory: event.target.value })}
          />
        </label>
        <label className="tui-field">
          <span>prefix</span>
          <input
            className="tui-input"
            value={form.prefix}
            onChange={(event) => onChange({ prefix: event.target.value })}
          />
        </label>
        <label className="tui-field">
          <span>runner</span>
          <select
            className="tui-select"
            value={form.runnerPath}
            onChange={(event) => onChange({ runnerPath: event.target.value })}
          >
            <option value="">auto</option>
            {runners.map((runner) => (
              <option key={runner.path} value={runner.path}>
                {runner.name} ({runner.type})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="tui-divider" />

      <div className="tui-action-row">
        <button className="tui-command" onClick={() => void onSubmit()} type="button">
          [ADD GAME]
        </button>
      </div>
    </div>
  )
}
