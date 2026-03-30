import type { JSX } from 'react'
import type { DownloadProgress } from '@shared/types/download'
import type { Game, Mod } from '@shared/types/game'
import { CATALOG_ENTRIES, findInstalledCatalogGame, getInstallStatus } from '@/data/catalog'
import type { SectionState, Selection } from '@/types/app-shell'

const EMPTY_MODS: Mod[] = []
const SIDEBAR_MOD_PREVIEW_LIMIT = 4

interface SidebarTreeProps {
  downloadProgresses: Record<string, DownloadProgress>
  expandedGames: Record<string, boolean>
  games: Game[]
  getGameImporter: (game: Game) => string | null
  modsByGame: Record<string, Mod[]>
  onGameLabelClick: (gameId: string) => void
  onSelectNode: (selection: Selection) => void
  onToggleGameExpanded: (gameId: string) => void
  onToggleMod: (game: Game, mod: Mod) => Promise<void>
  onToggleSection: (section: keyof SectionState) => void
  runningGames: Set<string>
  sections: SectionState
  selectedNode: Selection
}

export function SidebarTree({
  downloadProgresses,
  expandedGames,
  games,
  getGameImporter,
  modsByGame,
  onGameLabelClick,
  onSelectNode,
  onToggleGameExpanded,
  onToggleMod,
  onToggleSection,
  runningGames,
  sections,
  selectedNode,
}: SidebarTreeProps): JSX.Element {
  return (
    <div className="tui-tree">
      <div className="tui-tree-block">
        <button
          className={`tui-tree-row ${selectedNode.type === 'home' ? 'is-active' : ''}`}
          onClick={() => onSelectNode({ type: 'home' })}
          type="button"
        >
          <span className="tui-tree-prefix">├──</span>
          <span className="tui-tree-label">home</span>
        </button>
      </div>

      <button className="tui-section-title" onClick={() => onToggleSection('library')} type="button">
        {sections.library ? '[-]' : '[+]'} LIBRARY
      </button>
      {sections.library && (
        <div className="tui-tree-block">
          {games.map((game) => {
            const importer = getGameImporter(game)
            const mods = modsByGame[game.id] ?? EMPTY_MODS
            const visibleMods = mods.slice(0, SIDEBAR_MOD_PREVIEW_LIMIT)
            const hasHiddenMods = mods.length > SIDEBAR_MOD_PREVIEW_LIMIT
            const running = runningGames.has(game.id)
            const active =
              (selectedNode.type === 'game' || selectedNode.type === 'mods' || selectedNode.type === 'config') &&
              selectedNode.gameId === game.id

            return (
              <div key={game.id} className="tui-tree-group">
                <div className={`tui-tree-row ${active && selectedNode.type === 'game' ? 'is-active' : ''}`}>
                  <button
                    className="tui-tree-toggle"
                    onClick={() => onToggleGameExpanded(game.id)}
                    type="button"
                  >
                    {expandedGames[game.id] ? '[▼]' : '[▶]'}
                  </button>
                  <button
                    className="tui-tree-label"
                    onClick={() => onGameLabelClick(game.id)}
                    type="button"
                  >
                    {game.name}
                  </button>
                  <span className="tui-inline-status">
                    {running ? '[RUNNING]' : ''}
                  </span>
                </div>

                {expandedGames[game.id] && (
                  <div className="tui-tree-children">
                    <button
                      className={`tui-tree-row ${selectedNode.type === 'mods' && selectedNode.gameId === game.id ? 'is-active' : ''}`}
                      onClick={() => onSelectNode({ type: 'mods', gameId: game.id })}
                      type="button"
                    >
                      <span className="tui-tree-prefix">├──</span>
                      <span className="tui-tree-label">mods/</span>
                      {importer && <span className="tui-inline-status">[{mods.filter((mod) => mod.enabled).length}]</span>}
                    </button>

                    {importer && visibleMods.map((mod) => (
                      <div key={mod.path} className="tui-tree-row tui-tree-mod">
                        <span className="tui-tree-prefix">│   ├──</span>
                        <button
                          className="tui-tree-checkbox"
                          onClick={(event) => {
                            event.stopPropagation()
                            void onToggleMod(game, mod)
                          }}
                          type="button"
                        >
                          {mod.enabled ? '[✓]' : '[✗]'}
                        </button>
                        <button
                          className="tui-tree-label"
                          onClick={() => onSelectNode({ type: 'mods', gameId: game.id })}
                          type="button"
                        >
                          {mod.name}
                        </button>
                      </div>
                    ))}

                    {importer && hasHiddenMods && (
                      <button
                        className="tui-tree-row tui-tree-mod"
                        onClick={() => onSelectNode({ type: 'mods', gameId: game.id })}
                        type="button"
                      >
                        <span className="tui-tree-prefix">│   └──</span>
                        <span className="tui-tree-label">... see all mods</span>
                      </button>
                    )}

                    <button
                      className={`tui-tree-row ${selectedNode.type === 'config' && selectedNode.gameId === game.id ? 'is-active' : ''}`}
                      onClick={() => onSelectNode({ type: 'config', gameId: game.id })}
                      type="button"
                    >
                      <span className="tui-tree-prefix">└──</span>
                      <span className="tui-tree-label">config</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button className="tui-section-title" onClick={() => onToggleSection('catalog')} type="button">
        {sections.catalog ? '[-]' : '[+]'} CATALOG
      </button>
      {sections.catalog && (
        <div className="tui-tree-block">
          {CATALOG_ENTRIES.map((entry) => {
            const progress = downloadProgresses[entry.id] ?? null
            const installedGame = findInstalledCatalogGame(games, entry)
            return (
              <button
                key={entry.id}
                className={`tui-tree-row ${selectedNode.type === 'catalog' && selectedNode.catalogId === entry.id ? 'is-active' : ''}`}
                onClick={() => onSelectNode({ type: 'catalog', catalogId: entry.id })}
                type="button"
              >
                <span className="tui-tree-prefix">├──</span>
                <span className="tui-tree-label">{entry.name}</span>
                <span className="tui-inline-status">{getInstallStatus(entry, progress, installedGame)}</span>
              </button>
            )
          })}
        </div>
      )}

      <button className="tui-section-title" onClick={() => onToggleSection('system')} type="button">
        {sections.system ? '[-]' : '[+]'} SYSTEM
      </button>
      {sections.system && (
        <div className="tui-tree-block">
          <button
            className={`tui-tree-row ${selectedNode.type === 'settings' ? 'is-active' : ''}`}
            onClick={() => onSelectNode({ type: 'settings' })}
            type="button"
          >
            <span className="tui-tree-prefix">├──</span>
            <span className="tui-tree-label">settings</span>
          </button>
          <button
            className={`tui-tree-row ${selectedNode.type === 'add-game' ? 'is-active' : ''}`}
            onClick={() => onSelectNode({ type: 'add-game' })}
            type="button"
          >
            <span className="tui-tree-prefix">└──</span>
            <span className="tui-tree-label">add local game</span>
          </button>
        </div>
      )}
    </div>
  )
}
