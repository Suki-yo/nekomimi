import { useState, useEffect } from 'react'
import { X, Puzzle, Settings, Image as ImageIcon, Gamepad2 } from 'lucide-react'
import type { Game, Mod, DetectedRunner } from '../../../shared/types/game'
import { getXXMIImporter } from '../utils/mods'

interface GameConfigModalProps {
  game: Game | null
  open: boolean
  onClose: () => void
  onUpdate: (game: Game) => void
  runners: DetectedRunner[]
}

type Tab = 'general' | 'mods'

// Component to load and display cover image
function CoverImage({ imagePath, alt }: { imagePath: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoadError(null)
    setSrc(null)

    window.api.invoke('image:read', { imagePath })
      .then((url) => {
        if (mounted) {
          if (url) {
            setSrc(url)
          } else {
            setLoadError('No data')
          }
        }
      })
      .catch((err) => {
        if (mounted) setLoadError(String(err))
      })

    return () => { mounted = false }
  }, [imagePath])

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full">
        <ImageIcon className="h-6 w-6 text-muted-foreground" />
        <span className="text-xs text-red-500 mt-1">{loadError}</span>
      </div>
    )
  }

  if (!src) {
    return <ImageIcon className="h-8 w-8 text-muted-foreground" />
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
    />
  )
}

function GameConfigModal({ game, open, onClose, onUpdate, runners }: GameConfigModalProps) {
  const [tab, setTab] = useState<Tab>('general')
  const [mods, setMods] = useState<Mod[]>([])
  const [loadingMods, setLoadingMods] = useState(false)

  // Form state for general tab
  const [name, setName] = useState('')
  const [runnerPath, setRunnerPath] = useState('')
  const [coverImage, setCoverImage] = useState<string | undefined>()

  // Mod rename state
  const [editingModPath, setEditingModPath] = useState<string | null>(null)
  const [editingModName, setEditingModName] = useState('')

  // Load game data when modal opens
  useEffect(() => {
    if (game) {
      setName(game.name)
      setRunnerPath(game.runner?.path || '')
      setCoverImage(game.coverImage)
    }
  }, [game])

  // Load mods when modal opens and game supports mods
  useEffect(() => {
    if (game && open) {
      const importer = getXXMIImporter(game.executable)
      if (importer) {
        setLoadingMods(true)
        window.api.invoke('mods:list', { importer })
          .then(setMods)
          .catch(() => setMods([]))
          .finally(() => setLoadingMods(false))
      } else {
        setMods([])
      }
    }
  }, [game, open])

  if (!open || !game) return null

  const importer = getXXMIImporter(game.executable)
  const supportsMods = importer !== null

  // Auto-save handlers
  const handleNameChange = async (newName: string) => {
    setName(newName)
    if (newName.trim()) {
      const updated = await window.api.invoke('game:update', {
        id: game.id,
        updates: { name: newName.trim() }
      })
      onUpdate(updated)
    }
  }

  const handleRunnerChange = async (newRunnerPath: string) => {
    setRunnerPath(newRunnerPath)
    const selectedRunner = runners.find(r => r.path === newRunnerPath)
    const updated = await window.api.invoke('game:update', {
      id: game.id,
      updates: {
        runner: {
          ...game.runner,
          type: selectedRunner?.type || game.runner.type,
          path: newRunnerPath,
        }
      }
    })
    onUpdate(updated)
  }

  const handleCoverImageChange = async () => {
    const imagePath = await window.api.openImage(game.directory)
    if (imagePath) {
      setCoverImage(imagePath)
      const updated = await window.api.invoke('game:update', {
        id: game.id,
        updates: { coverImage: imagePath }
      })
      onUpdate(updated)
    }
  }

  const handleModSupportToggle = async (enabled: boolean) => {
    const updated = await window.api.invoke('game:update', {
      id: game.id,
      updates: {
        mods: {
          ...game.mods,
          enabled,
          importer: importer || undefined,
        }
      }
    })
    onUpdate(updated)
  }

  const handleModToggle = async (mod: Mod) => {
    await window.api.invoke('mods:toggle', { modPath: mod.path, enabled: !mod.enabled })
    setMods(prev => prev.map(m =>
      m.path === mod.path ? { ...m, enabled: !m.enabled } : m
    ))
  }

  const handleEnableAllMods = async () => {
    if (!importer) return
    await window.api.invoke('mods:enable-all', { importer })
    setMods(prev => prev.map(m => ({ ...m, enabled: true })))
  }

  const handleDisableAllMods = async () => {
    if (!importer) return
    await window.api.invoke('mods:disable-all', { importer })
    setMods(prev => prev.map(m => ({ ...m, enabled: false })))
  }

  // Mod rename handlers
  const handleModDoubleClick = (mod: Mod) => {
    setEditingModPath(mod.path)
    setEditingModName(mod.name)
  }

  const handleModRename = async (mod: Mod) => {
    if (editingModName.trim() && editingModName !== mod.name) {
      const result = await window.api.invoke('mods:rename', {
        modPath: mod.path,
        customName: editingModName.trim()
      })
      if (result.success) {
        // Update mod in list with new path
        setMods(prev => prev.map(m => {
          if (m.path === mod.path) {
            return {
              ...m,
              name: editingModName.trim(),
              path: result.newPath || m.path,
              folder: result.newPath ? result.newPath.split('/').pop() || m.folder : m.folder
            }
          }
          return m
        }))
      }
    }
    setEditingModPath(null)
    setEditingModName('')
  }

  const handleModNameKeyDown = (e: React.KeyboardEvent, mod: Mod) => {
    if (e.key === 'Enter') {
      handleModRename(mod)
    } else if (e.key === 'Escape') {
      setEditingModPath(null)
      setEditingModName('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-lg max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold">{game.name}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setTab('general')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition ${
              tab === 'general'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Settings className="h-4 w-4" />
            General
          </button>
          {supportsMods && (
            <button
              onClick={() => setTab('mods')}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition ${
                tab === 'mods'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Puzzle className="h-4 w-4" />
              Mods
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {tab === 'general' && (
            <div className="space-y-4">
              {/* Cover Image */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-32 h-44 bg-muted rounded flex items-center justify-center overflow-hidden">
                  {coverImage ? (
                    <CoverImage imagePath={coverImage} alt={game.name} />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <button
                  onClick={handleCoverImageChange}
                  className="text-sm text-muted-foreground hover:text-foreground transition"
                >
                  Change Image
                </button>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded bg-background"
                />
              </div>

              {/* Runner */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Runner</label>
                <select
                  value={runnerPath}
                  onChange={(e) => handleRunnerChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded bg-background"
                >
                  {runners.map((runner) => (
                    <option key={runner.path} value={runner.path}>
                      {runner.name} ({runner.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Read-only info */}
              <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
                <p><strong>Playtime:</strong> {Math.round(game.playtime)} hours</p>
                <p><strong>Last played:</strong> {game.lastPlayed
                  ? new Date(game.lastPlayed).toLocaleDateString()
                  : 'Never'}</p>
                <p><strong>Directory:</strong> <span className="font-mono text-xs">{game.directory}</span></p>
              </div>
            </div>
          )}

          {tab === 'mods' && (
            <div className="space-y-4">
              {/* Mod Support Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Mod Support</p>
                  <p className="text-sm text-muted-foreground">
                    {game.mods?.enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={game.mods?.enabled ?? false}
                    onChange={(e) => handleModSupportToggle(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-purple-500 transition" />
                  <div className="absolute left-1 top-0.5 w-5 h-5 bg-white rounded-full border border-gray-400 peer-checked:translate-x-4 peer-checked:border-purple-600 transition-all" />
                </label>
              </div>

              {/* Mod List */}
              {game.mods?.enabled && (
                <>
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium">Installed Mods</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleEnableAllMods}
                          className="text-xs text-muted-foreground hover:text-foreground transition"
                        >
                          Enable All
                        </button>
                        <span className="text-muted-foreground">|</span>
                        <button
                          onClick={handleDisableAllMods}
                          className="text-xs text-muted-foreground hover:text-foreground transition"
                        >
                          Disable All
                        </button>
                      </div>
                    </div>

                    {loadingMods ? (
                      <p className="text-sm text-muted-foreground">Loading mods...</p>
                    ) : mods.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No mods installed</p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-2">Double-click name to rename</p>
                        <div className="space-y-1">
                          {mods.map((mod) => (
                            <div
                              key={mod.path}
                              className="flex items-center justify-between p-2 bg-muted/50 rounded"
                            >
                              <span
                                className={`text-sm flex-1 ${!mod.enabled ? 'text-muted-foreground' : ''} cursor-pointer`}
                                onDoubleClick={() => handleModDoubleClick(mod)}
                              >
                                {editingModPath === mod.path ? (
                                  <input
                                    type="text"
                                    value={editingModName}
                                    onChange={(e) => setEditingModName(e.target.value)}
                                    onBlur={() => handleModRename(mod)}
                                    onKeyDown={(e) => handleModNameKeyDown(e, mod)}
                                    className="text-sm px-1 py-0.5 bg-background border rounded w-full"
                                    autoFocus
                                  />
                                ) : (
                                  mod.name
                                )}
                              </span>
                              <label className="relative inline-flex cursor-pointer ml-2">
                                <input
                                  type="checkbox"
                                  checked={mod.enabled}
                                  onChange={() => handleModToggle(mod)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-purple-500 transition" />
                                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full border border-gray-400 peer-checked:translate-x-4 peer-checked:border-purple-600 transition-all" />
                              </label>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <p className="text-xs text-muted-foreground mt-2">
                      {mods.filter(m => m.enabled).length} of {mods.length} mods active
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GameConfigModal
