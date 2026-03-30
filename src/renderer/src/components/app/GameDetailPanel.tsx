import type { JSX, ReactNode } from 'react'
import CoverImage from '@/components/CoverImage'
import { formatPlaytimeHours } from '@/lib/utils'
import type { LaunchPreparationState } from '@/hooks/useGameLaunch'
import type { CatalogEntry } from '@/data/catalog'
import type { DownloadProgress } from '@shared/types/download'
import type { Game, Mod } from '@shared/types/game'

interface GameDetailPanelProps {
  configPanel?: ReactNode
  configSelected: boolean
  createProgressBar: (percent: number, width?: number) => string
  describeProgress: (progress: DownloadProgress) => string
  game: Game
  getPlaceholderLabel: (name: string) => string
  importer: string | null
  launchPreparation: LaunchPreparationState
  mappedCatalog: CatalogEntry | null
  mods: Mod[]
  modsPanel?: ReactNode
  modsSelected: boolean
  onDeleteGame: (game: Game) => Promise<void>
  onLaunchGame: (game: Game) => Promise<void>
  onSelectNode: (selection: { type: 'mods' | 'config'; gameId: string }) => void
  onStartCatalogUpdate: (entry: CatalogEntry) => Promise<void>
  relatedProgress: DownloadProgress | null
  runningGames: Set<string>
}

export function GameDetailPanel({
  configPanel,
  configSelected,
  createProgressBar,
  describeProgress,
  game,
  getPlaceholderLabel,
  importer,
  launchPreparation,
  mappedCatalog,
  mods,
  modsPanel,
  modsSelected,
  onDeleteGame,
  onLaunchGame,
  onSelectNode,
  onStartCatalogUpdate,
  relatedProgress,
  runningGames,
}: GameDetailPanelProps): JSX.Element {
  const activeMods = mods.filter((mod) => mod.enabled).length
  const isRunning = runningGames.has(game.id)
  const launchBar = launchPreparation.pendingGameId === game.id && launchPreparation.active
  const canUpdate = game.download?.status === 'update_available'
  const versionLabel =
    game.download?.currentVersion && game.download?.latestVersion && game.download.currentVersion !== game.download.latestVersion
      ? `${game.download.currentVersion} -> ${game.download.latestVersion}`
      : game.download?.currentVersion ?? game.update?.currentVersion ?? 'unknown'
  const updateLabel =
    game.download?.status === 'update_available'
      ? 'AVAILABLE'
      : game.download?.latestVersion
        ? 'UP TO DATE'
        : 'UNKNOWN'

  return (
    <div className="tui-detail-split tui-detail-split-game">
      <div className="tui-cover-panel">
        {game.coverImage ? (
          <CoverImage imagePath={game.coverImage} alt={game.name} variant="modal" />
        ) : (
          <div className="tui-cover-fallback">{getPlaceholderLabel(game.name)}</div>
        )}
      </div>

      <div className="tui-terminal-panel tui-game-panel">
        <div className="tui-terminal-header">{`> ${game.name.toUpperCase()}`}</div>
        <div className="tui-kv-list">
          <div><span>version</span><span>{versionLabel}</span></div>
          <div><span>updates</span><span>{updateLabel}</span></div>
          <div><span>runner</span><span>{game.runner.path || game.runner.type}</span></div>
          <div><span>mods</span><span>{importer ? `${activeMods} active` : 'unsupported'}</span></div>
          <div><span>playtime</span><span>{formatPlaytimeHours(game.playtime)}</span></div>
          <div><span>status</span><span>{isRunning ? 'RUNNING' : launchBar ? 'PREPARING' : 'IDLE'}</span></div>
          <div><span>path</span><span className="tui-truncate">{game.directory}</span></div>
        </div>

        {launchBar && (
          <div className="tui-progress-block">
            <div className="tui-progress-line">[{createProgressBar(launchPreparation.progress)}] {launchPreparation.progress}%</div>
            <div className="tui-meta-line">
              {launchPreparation.phase === 'xxmi' ? 'installing xxmi' : 'installing proton-ge'}
            </div>
          </div>
        )}

        {relatedProgress && ['downloading', 'verifying', 'extracting'].includes(relatedProgress.status) && (
          <div className="tui-progress-block">
            <div className="tui-progress-line">[{createProgressBar(relatedProgress.percent)}] {relatedProgress.percent}%</div>
            <div className="tui-meta-line">{describeProgress(relatedProgress)}</div>
          </div>
        )}

        <div className="tui-divider" />

        <div className="tui-action-row">
          <button className="tui-command" onClick={() => void onLaunchGame(game)} type="button">
            [PLAY]
          </button>
          {canUpdate && mappedCatalog && (
            <button className="tui-command" onClick={() => void onStartCatalogUpdate(mappedCatalog)} type="button">
              [UPDATE]
            </button>
          )}
          <button
            className={`tui-command ${modsSelected ? 'is-selected' : ''}`}
            onClick={() => onSelectNode({ type: 'mods', gameId: game.id })}
            type="button"
          >
            [MODS]
          </button>
          <button
            className={`tui-command ${configSelected ? 'is-selected' : ''}`}
            onClick={() => onSelectNode({ type: 'config', gameId: game.id })}
            type="button"
          >
            [CFG]
          </button>
          <button className="tui-command tui-command-danger" onClick={() => void onDeleteGame(game)} type="button">
            [DEL]
          </button>
        </div>

        {(modsSelected || configSelected) && <div className="tui-divider" />}

        {modsSelected && modsPanel}
        {configSelected && configPanel}
      </div>
    </div>
  )
}
