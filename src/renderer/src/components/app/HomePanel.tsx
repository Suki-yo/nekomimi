import type { JSX } from 'react'
import { formatPlaytimeHours } from '@/lib/utils'
import type { Selection } from '@/types/app-shell'
import type { DownloadProgress } from '@shared/types/download'
import type { Game, Mod } from '@shared/types/game'

interface HomePanelProps {
  configLoaded: boolean
  dataFolderPath: string | null
  downloadProgresses: Record<string, DownloadProgress>
  games: Game[]
  getGameImporter: (game: Game) => string | null
  installedRunnerName: string | null
  onLaunchGame: (game: Game) => Promise<void>
  onOpenModsFolder: (importer: string) => Promise<void>
  onOpenSystemPath: (path: string) => void
  onSelectNode: (selection: Selection) => void
  quickPicks: Game[]
  runningGames: Set<string>
  steamRuntimeInstalled: boolean
  continueGame: Game | null
  formatHomeDate: (value?: string) => string
  modsByGame: Record<string, Mod[]>
}

const EMPTY_MODS: Mod[] = []

export function HomePanel({
  configLoaded,
  dataFolderPath,
  downloadProgresses,
  games,
  getGameImporter,
  installedRunnerName,
  onLaunchGame,
  onOpenModsFolder,
  onOpenSystemPath,
  onSelectNode,
  quickPicks,
  runningGames,
  steamRuntimeInstalled,
  continueGame,
  formatHomeDate,
  modsByGame,
}: HomePanelProps): JSX.Element {
  const runningList = games.filter((game) => runningGames.has(game.id))
  const queueList = Object.values(downloadProgresses).filter((progress) =>
    ['downloading', 'verifying', 'extracting'].includes(progress.status),
  )
  const issues: string[] = []

  if (!installedRunnerName) {
    issues.push('runner missing')
  }
  if (!steamRuntimeInstalled) {
    issues.push('steamrt missing')
  }

  return (
    <div className="tui-terminal-panel tui-terminal-full">
      <div className="tui-terminal-header">&gt; HOME</div>

      <div className="tui-home-status-strip">
        <div className="tui-home-status-card">
          <span>running</span>
          <strong>{runningList.length > 0 ? runningList.map((game) => game.name).join(', ') : 'none'}</strong>
        </div>
        <div className="tui-home-status-card">
          <span>downloads</span>
          <strong>{queueList.length}</strong>
        </div>
        <div className="tui-home-status-card">
          <span>library</span>
          <strong>{games.length}</strong>
        </div>
      </div>

      <div className="tui-settings-section tui-home-section">
        <div className="tui-config-title">continue playing</div>
        {continueGame ? (
          <>
            <div className="tui-kv-list">
              <div><span>game</span><span>{continueGame.name}</span></div>
              <div><span>last played</span><span>{formatHomeDate(continueGame.lastPlayed)}</span></div>
              <div><span>playtime</span><span>{formatPlaytimeHours(continueGame.playtime)}</span></div>
              <div><span>status</span><span>{runningGames.has(continueGame.id) ? 'RUNNING' : 'IDLE'}</span></div>
            </div>
            <div className="tui-action-row">
              <button className="tui-command" onClick={() => void onLaunchGame(continueGame)} type="button">
                [PLAY]
              </button>
              <button className="tui-command" onClick={() => onSelectNode({ type: 'mods', gameId: continueGame.id })} type="button">
                [MODS]
              </button>
              <button className="tui-command" onClick={() => onSelectNode({ type: 'config', gameId: continueGame.id })} type="button">
                [CFG]
              </button>
            </div>
          </>
        ) : (
          <div className="tui-meta-line">no games in library yet</div>
        )}
      </div>

      <div className="tui-settings-section">
        <div className="tui-config-title">system health</div>
        <div className="tui-kv-list">
          <div><span>xxmi</span><span>{configLoaded ? 'ready' : 'loading'}</span></div>
          <div><span>runner</span><span>{installedRunnerName ?? 'missing'}</span></div>
          <div><span>steamrt</span><span>{steamRuntimeInstalled ? 'ready' : 'missing'}</span></div>
          <div><span>issues</span><span>{issues.length > 0 ? issues.join(', ') : 'none'}</span></div>
        </div>
        <div className="tui-action-row">
          <button className="tui-command" onClick={() => onSelectNode({ type: 'settings' })} type="button">
            [SETTINGS]
          </button>
          {dataFolderPath && (
            <button className="tui-command" onClick={() => onOpenSystemPath(dataFolderPath)} type="button">
              [OPEN DATA FOLDER]
            </button>
          )}
        </div>
      </div>

      <div className="tui-settings-section">
        <div className="tui-config-title">quick picks</div>
        {quickPicks.length > 0 ? (
          <div className="tui-mod-list">
            {quickPicks.map((game) => {
              const mods = modsByGame[game.id] ?? EMPTY_MODS
              const importer = getGameImporter(game)

              return (
                <div key={game.id} className="tui-config-section">
                  <div className="tui-kv-list">
                    <div><span>game</span><span>{game.name}</span></div>
                    <div><span>last played</span><span>{formatHomeDate(game.lastPlayed)}</span></div>
                    <div><span>summary</span><span>{`${formatPlaytimeHours(game.playtime)} • ${mods.filter((mod) => mod.enabled).length} mods active`}</span></div>
                  </div>
                  <div className="tui-action-row">
                    <button className="tui-command" onClick={() => void onLaunchGame(game)} type="button">
                      [PLAY]
                    </button>
                    <button className="tui-command" onClick={() => onSelectNode({ type: 'mods', gameId: game.id })} type="button">
                      [MODS]
                    </button>
                    <button className="tui-command" onClick={() => onSelectNode({ type: 'config', gameId: game.id })} type="button">
                      [CFG]
                    </button>
                    <button
                      className="tui-command"
                      onClick={() => {
                        if (importer) {
                          void onOpenModsFolder(importer)
                        }
                      }}
                      disabled={!importer}
                      type="button"
                    >
                      [OPEN MODS]
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="tui-meta-line">add a game to populate quick picks</div>
        )}
      </div>
    </div>
  )
}
