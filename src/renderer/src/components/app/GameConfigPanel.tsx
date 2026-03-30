import type { Dispatch, JSX, SetStateAction } from 'react'
import { type GameConfigDraft } from '@/hooks/useGameConfig'
import type { DetectedRunner, Game } from '@shared/types/game'

interface GameConfigPanelProps {
  configDraft: GameConfigDraft | null
  game: Game
  inline?: boolean
  isGenshinGame: (game: Pick<Game, 'slug' | 'executable'>) => boolean
  onChangeCoverImage: () => Promise<void>
  onOpenSystemPath: (path: string) => void
  onSaveConfig: () => Promise<void>
  runners: DetectedRunner[]
  savingConfig: boolean
  setConfigDraft: Dispatch<SetStateAction<GameConfigDraft | null>>
  genshinFpsUnlockOptions: readonly string[]
}

export function GameConfigPanel({
  configDraft,
  game,
  inline = false,
  isGenshinGame,
  onChangeCoverImage,
  onOpenSystemPath,
  onSaveConfig,
  runners,
  savingConfig,
  setConfigDraft,
  genshinFpsUnlockOptions,
}: GameConfigPanelProps): JSX.Element {
  if (!configDraft) {
    return <div className={inline ? 'tui-subpanel' : 'tui-terminal-panel tui-terminal-full'}>loading config...</div>
  }

  return (
    <div className={inline ? 'tui-subpanel' : 'tui-terminal-panel tui-terminal-full'}>
      <div className="tui-terminal-header">{`> ${game.name.toUpperCase()} / CONFIG`}</div>

      <div className="tui-form-grid">
        <label className="tui-field">
          <span>name</span>
          <input
            className="tui-input"
            value={configDraft.name}
            onChange={(event) => setConfigDraft((current) => current ? { ...current, name: event.target.value } : current)}
          />
        </label>
        <label className="tui-field">
          <span>runner</span>
          <select
            className="tui-select"
            value={configDraft.runnerPath}
            onChange={(event) => setConfigDraft((current) => current ? { ...current, runnerPath: event.target.value } : current)}
          >
            <option value="">auto</option>
            {runners.map((runner) => (
              <option key={runner.path} value={runner.path}>
                {runner.name} ({runner.type})
              </option>
            ))}
          </select>
        </label>
        <label className="tui-field">
          <span>prefix</span>
          <input
            className="tui-input"
            value={configDraft.prefix}
            onChange={(event) => setConfigDraft((current) => current ? { ...current, prefix: event.target.value } : current)}
          />
        </label>
        <label className="tui-field">
          <span>mods</span>
          <select
            className="tui-select"
            value={configDraft.modsEnabled ? 'enabled' : 'disabled'}
            onChange={(event) => setConfigDraft((current) => current ? { ...current, modsEnabled: event.target.value === 'enabled' } : current)}
          >
            <option value="enabled">enabled</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
        {isGenshinGame(game) && (
          <label className="tui-field">
            <span>fps unlock</span>
            <select
              className="tui-select"
              value={configDraft.genshinFpsUnlock}
              onChange={(event) => setConfigDraft((current) => current ? { ...current, genshinFpsUnlock: event.target.value } : current)}
            >
              {genshinFpsUnlockOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'off' ? 'off' : `${option} fps`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="tui-config-section">
        <div className="tui-config-title">env vars</div>
        <pre className="tui-code-block">
          {Object.keys(game.launch.env).length === 0
            ? '# no custom environment variables'
            : Object.entries(game.launch.env).map(([key, value]) => `${key}=${value}`).join('\n')}
        </pre>
      </div>

      <div className="tui-config-section">
        <div className="tui-config-title">launch args</div>
        <pre className="tui-code-block">{game.launch.args || '# none'}</pre>
      </div>

      <div className="tui-action-row">
        <button className="tui-command" onClick={() => void onSaveConfig()} disabled={savingConfig} type="button">
          {savingConfig ? '[SAVING]' : '[SAVE CFG]'}
        </button>
        <button className="tui-command" onClick={() => void onChangeCoverImage()} type="button">
          [COVER IMG]
        </button>
        <button className="tui-command" onClick={() => onOpenSystemPath(game.directory)} type="button">
          [OPEN GAME DIR]
        </button>
      </div>
    </div>
  )
}
