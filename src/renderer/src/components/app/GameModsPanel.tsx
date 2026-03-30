import { useState, type JSX, type KeyboardEvent } from 'react'
import type { ModImportMode } from '@/hooks/useModManager'
import type { Game, Mod } from '@shared/types/game'

interface GameModsPanelProps {
  game: Game
  importer: string | null
  inline?: boolean
  mods: Mod[]
  onAddMod: (game: Game, mode: ModImportMode) => Promise<void>
  onEnableAllMods: (game: Game, enabled: boolean) => Promise<void>
  onOpenModsFolder: (importer: string) => Promise<void>
  onRenameMod: (game: Game, mod: Mod, customName: string) => Promise<void>
  onToggleMod: (game: Game, mod: Mod) => Promise<void>
}

export function GameModsPanel({
  game,
  importer,
  inline = false,
  mods,
  onAddMod,
  onEnableAllMods,
  onOpenModsFolder,
  onRenameMod,
  onToggleMod,
}: GameModsPanelProps): JSX.Element {
  const [editingModPath, setEditingModPath] = useState<string | null>(null)
  const [editingModName, setEditingModName] = useState('')
  const [importMenuOpen, setImportMenuOpen] = useState(false)

  const closeRename = () => {
    setEditingModPath(null)
    setEditingModName('')
  }

  const submitRename = async (mod: Mod) => {
    await onRenameMod(game, mod, editingModName)
    closeRename()
  }

  return (
    <div className={inline ? 'tui-subpanel tui-subpanel-scroll' : 'tui-terminal-panel tui-terminal-full'}>
      <div className="tui-terminal-header">{`> ${game.name.toUpperCase()} / MODS`}</div>
      {!importer && <div className="tui-meta-line">mods are not supported for this title</div>}
      {importer && (
        <>
          <div className="tui-mod-list-shell">
            <div className="tui-mod-list">
              {mods.length === 0 && <div className="tui-meta-line">no mods detected</div>}
              {mods.map((mod) => (
                <div key={mod.path} className="tui-mod-row">
                  <button className="tui-tree-checkbox" onClick={() => void onToggleMod(game, mod)} type="button">
                    {mod.enabled ? '[✓]' : '[✗]'}
                  </button>
                  {editingModPath === mod.path ? (
                    <input
                      className="tui-input tui-input-inline"
                      value={editingModName}
                      onBlur={() => void submitRename(mod)}
                      onChange={(event) => setEditingModName(event.target.value)}
                      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                        if (event.key === 'Enter') {
                          void submitRename(mod)
                        }
                        if (event.key === 'Escape') {
                          closeRename()
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      className="tui-mod-name"
                      onDoubleClick={() => {
                        setEditingModPath(mod.path)
                        setEditingModName(mod.name)
                      }}
                      type="button"
                    >
                      {mod.name}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="tui-divider" />

          <div className="tui-action-row">
            <button className="tui-command" onClick={() => void onEnableAllMods(game, true)} type="button">
              [ENABLE ALL]
            </button>
            <button className="tui-command" onClick={() => void onEnableAllMods(game, false)} type="button">
              [DISABLE ALL]
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
              [OPEN MODS FOLDER]
            </button>
            <div className="tui-menu-group">
              <button
                className={`tui-command ${importMenuOpen ? 'is-selected' : ''}`}
                onClick={() => setImportMenuOpen((current) => !current)}
                type="button"
              >
                {importMenuOpen ? '[ADD MOD ▾]' : '[ADD MOD ▴]'}
              </button>
              {importMenuOpen && (
                <div className="tui-menu-list">
                  <button
                    className="tui-menu-item"
                    onClick={() => {
                      setImportMenuOpen(false)
                      void onAddMod(game, 'file')
                    }}
                    type="button"
                  >
                    import archive
                  </button>
                  <button
                    className="tui-menu-item"
                    onClick={() => {
                      setImportMenuOpen(false)
                      void onAddMod(game, 'directory')
                    }}
                    type="button"
                  >
                    import folder
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
