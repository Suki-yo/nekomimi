import { useEffect, useState } from 'react'
import { Plus, Gamepad2, Trash2, FolderOpen, Puzzle, Play, Settings, Download, Cloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DownloadModal } from '@/components/DownloadModal'
import { GameInstallModal } from '@/components/GameInstallModal'
import { EndfieldInstallModal } from '@/components/EndfieldInstallModal'
import { WuwaInstallModal } from '@/components/WuwaInstallModal'
import GameConfigModal from '@/components/GameConfigModal'
import CoverImage from '@/components/CoverImage'
import type { Game, DetectedRunner } from '../../../shared/types/game'
import type { HoyoVersionInfo, WuwaVersionInfo } from '../../../shared/types/download'

const DEFAULT_LAUNCH = {
  env: {},
  preLaunch: [],
  postLaunch: [],
  args: '',
}

const DEFAULT_MODS = {
  enabled: false,
}

// Supported HoYoverse games for the Explore tab
const HOYO_GAMES = [
  {
    biz: 'genshin' as const,
    name: 'Genshin Impact',
    coverUrl: 'https://upload.wikimedia.org/wikipedia/en/4/44/Genshin_Impact_logo.svg',
    color: '#00a0e9',
    estimatedSize: '80 GB',
  },
  {
    biz: 'starrail' as const,
    name: 'Honkai Star Rail',
    coverUrl: 'https://upload.wikimedia.org/wikipedia/en/7/7f/Honkai-Star-Rail-Logo.png',
    color: '#6b5ce7',
    estimatedSize: '40 GB',
  },
  {
    biz: 'zzz' as const,
    name: 'Zenless Zone Zero',
    coverUrl: 'https://upload.wikimedia.org/wikipedia/en/7/7a/Zenless_Zone_Zero_logo.png',
    color: '#ff6b35',
    estimatedSize: '60 GB',
  },
]

type LibraryTab = 'my-games' | 'explore'

function Library() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('my-games')
  const [games, setGames] = useState<Game[]>([])
  const [runners, setRunners] = useState<DetectedRunner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [gameToDelete, setGameToDelete] = useState<Game | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [runningGames, setRunningGames] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'warning' } | null>(null)
  const [launchStatus, setLaunchStatus] = useState<string | null>(null)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [pendingGameId, setPendingGameId] = useState<string | null>(null)
  const [needsXXMI, setNeedsXXMI] = useState(false)
  const [needsRunner, setNeedsRunner] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)

  // Explore tab state
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [selectedHoyoGame, setSelectedHoyoGame] = useState<typeof HOYO_GAMES[0] | null>(null)
  const [hoyoVersionInfo, setHoyoVersionInfo] = useState<Record<string, HoyoVersionInfo>>({})
  const [hoyoVersionErrors, setHoyoVersionErrors] = useState<Record<string, string>>({})
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [endfieldInfo, setEndfieldInfo] = useState<{ version: string; totalSize: number; installedSize: number } | null>(null)
  const [endfieldInfoError, setEndfieldInfoError] = useState<string | null>(null)
  const [endfieldInstallOpen, setEndfieldInstallOpen] = useState(false)
  const [wuwaInfo, setWuwaInfo] = useState<WuwaVersionInfo | null>(null)
  const [wuwaInfoError, setWuwaInfoError] = useState<string | null>(null)
  const [wuwaInstallOpen, setWuwaInstallOpen] = useState(false)

  const [formName, setFormName] = useState('')
  const [formDirectory, setFormDirectory] = useState('')
  const [formExecutable, setFormExecutable] = useState('')
  const [formPrefix, setFormPrefix] = useState('')
  const [formRunnerPath, setFormRunnerPath] = useState('')

  const showToast = (message: string, type: 'info' | 'warning' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    loadGames()
    loadRunners()
  }, [])

  // Load HoYoverse version info when Explore tab is active
  useEffect(() => {
    if (activeTab === 'explore' && Object.keys(hoyoVersionInfo).length === 0) {
      loadHoyoVersions()
    }
  }, [activeTab])

  const loadHoyoVersions = async () => {
    setLoadingVersions(true)
    setHoyoVersionErrors({}) // Clear previous errors
    try {
      const versions: Record<string, HoyoVersionInfo> = {}
      const errors: Record<string, string> = {}

      for (const game of HOYO_GAMES) {
        try {
          const info = await window.api.invoke('download:fetch-info', { biz: game.biz })
          if (info) {
            versions[game.biz] = info
          } else {
            errors[game.biz] = 'Unable to fetch version info'
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          errors[game.biz] = message
          console.error(`Failed to load ${game.biz} version:`, err)
        }
      }

      setHoyoVersionInfo(versions)
      setHoyoVersionErrors(errors)

      // Load Endfield info
      try {
        const endfieldData = await window.api.invoke('download:fetch-endfield-info', {})
        if (endfieldData) {
          setEndfieldInfo(endfieldData)
          setEndfieldInfoError(null)
        } else {
          setEndfieldInfoError('Unable to fetch version info')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load Endfield info'
        setEndfieldInfoError(message)
        console.error('Failed to load Endfield version:', err)
      }

      // Load Wuthering Waves info
      try {
        const wuwaData = await window.api.invoke('download:fetch-wuwa-info', {})
        if (wuwaData) {
          setWuwaInfo(wuwaData)
          setWuwaInfoError(null)
        } else {
          setWuwaInfoError('Unable to fetch version info')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load Wuthering Waves info'
        setWuwaInfoError(message)
        console.error('Failed to load Wuthering Waves version:', err)
      }

      // Show warning if all games failed to load
      if (Object.keys(errors).length === HOYO_GAMES.length) {
        showToast('Failed to load game versions. Please check your connection.', 'warning')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load game versions'
      console.error('Failed to load HoYoverse versions:', err)
      showToast(message, 'warning')
    } finally {
      setLoadingVersions(false)
    }
  }

  useEffect(() => {
    const pollRunning = async () => {
      const running = await window.api.invoke('game:running')
      if (running) {
        setRunningGames(new Set(running.map((g) => g.id)))
      }
    }

    pollRunning()
    const interval = setInterval(pollRunning, 3000)
    return () => clearInterval(interval)
  }, [])

  const loadGames = async () => {
    try {
      setLoading(true)
      const gameList = await window.api.invoke('game:list')
      setGames(gameList)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games')
    } finally {
      setLoading(false)
    }
  }

  const loadRunners = async () => {
    try {
      const runnerList = await window.api.invoke('runner:list')
      setRunners(runnerList)
      if (runnerList.length > 0) {
        setFormRunnerPath(runnerList[0].path)
      }
    } catch (err) {
      console.error('Failed to load runners:', err)
    }
  }

  const handleBrowseExecutable = async () => {
    try {
      setDetecting(true)
      const filePath = await window.api.openFile()
      if (!filePath) return

      setFormExecutable(filePath)
      const detected = await window.api.invoke('game:detect', { exePath: filePath })

      setFormName(detected.name)
      setFormDirectory(detected.directory)
      if (detected.prefix) {
        setFormPrefix(detected.prefix)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to detect game')
    } finally {
      setDetecting(false)
    }
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleAddGame = async () => {
    if (!formName || !formDirectory || !formExecutable) {
      alert('Please fill in all fields')
      return
    }

    const selectedRunner = runners.find((r) => r.path === formRunnerPath)

    try {
      setSubmitting(true)

      const newGame = await window.api.invoke('game:add', {
        name: formName,
        slug: generateSlug(formName),
        installed: true,
        directory: formDirectory,
        executable: formExecutable,
        runner: {
          type: selectedRunner?.type || 'proton',
          path: formRunnerPath,
          prefix: formPrefix,
        },
        launch: DEFAULT_LAUNCH,
        mods: DEFAULT_MODS,
      })

      setGames((prev) => [...prev, newGame])
      setFormName('')
      setFormDirectory('')
      setFormExecutable('')
      setFormPrefix('')
      setAddDialogOpen(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add game')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteGame = async () => {
    if (!gameToDelete) return

    try {
      setSubmitting(true)
      await window.api.invoke('game:delete', { id: gameToDelete.id })
      setGames((prev) => prev.filter((g) => g.id !== gameToDelete.id))
      setDeleteDialogOpen(false)
      setGameToDelete(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete game')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = (game: Game, e: React.MouseEvent) => {
    e.stopPropagation()
    setGameToDelete(game)
    setDeleteDialogOpen(true)
  }

  const launchGame = async (id: string) => {
    if (runningGames.has(id)) {
      showToast('Game is already running', 'warning')
      return
    }

    const status = await window.api.invoke('mods:xxmi-status', undefined)
    const needXXMI = !status.xxmiInstalled
    const needRunner = !status.runnerInstalled

    if (needXXMI || needRunner) {
      setPendingGameId(id)
      setNeedsXXMI(needXXMI)
      setNeedsRunner(needRunner)
      setDownloadModalOpen(true)
      return
    }

    const unsubProgress = window.api.on('game:launch-progress', (data) => {
      const p = data as { step: string; percent: number }
      setLaunchStatus(`${p.step} (${p.percent}%)`)
    })

    const result = await window.api.invoke('game:launch', { id })
    unsubProgress()
    setLaunchStatus(null)

    if (!result.success) {
      showToast(`Failed to launch: ${result.error}`, 'warning')
    }
  }

  const handleDownloadComplete = async () => {
    if (pendingGameId) {
      const unsubProgress = window.api.on('game:launch-progress', (data) => {
        const p = data as { step: string; percent: number }
        setLaunchStatus(`${p.step} (${p.percent}%)`)
      })
      const result = await window.api.invoke('game:launch', { id: pendingGameId })
      unsubProgress()
      setLaunchStatus(null)
      if (!result.success) {
        showToast(`Failed to launch: ${result.error}`, 'warning')
      }
      setPendingGameId(null)
    }
  }

  const handleOpenConfig = (game: Game, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedGame(game)
    setConfigModalOpen(true)
  }

  const handleGameUpdate = (updatedGame: Game) => {
    setGames(prev => prev.map(g => g.id === updatedGame.id ? updatedGame : g))
    setSelectedGame(updatedGame)
  }

  const handlePlayClick = (game: Game, e: React.MouseEvent) => {
    e.stopPropagation()
    launchGame(game.id)
  }

  const handleInstallGame = (hoyoGame: typeof HOYO_GAMES[0]) => {
    setSelectedHoyoGame(hoyoGame)
    setInstallModalOpen(true)
  }

  const BIZ_SLUG_HINTS: Record<string, string[]> = {
    genshin: ['genshin'],
    starrail: ['star-rail', 'starrail', 'star rail'],
    zzz: ['zenless'],
    wuwa: ['wuwa', 'wuthering'],
    endfield: ['endfield'],
  }

  const checkGameInstalled = (biz: string) => {
    const hints = BIZ_SLUG_HINTS[biz] ?? [biz]
    return games.some(g =>
      hints.some(h => g.slug.toLowerCase().includes(h) || g.name.toLowerCase().includes(h))
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading library...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-destructive">{error}</div>
        <Button onClick={loadGames} variant="outline">Retry</Button>
      </div>
    )
  }

  return (
    <div className="p-6">
      {launchStatus && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg bg-blue-500 text-white">
          {launchStatus}
        </div>
      )}
      {!launchStatus && toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg ${
          toast.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
        } text-white`}>
          {toast.message}
        </div>
      )}

      <DownloadModal
        open={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
        onComplete={handleDownloadComplete}
        needsXXMI={needsXXMI}
        needsRunner={needsRunner}
      />

      <GameInstallModal
        open={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        gameName={selectedHoyoGame?.name || ''}
        gameBiz={selectedHoyoGame?.biz || 'genshin'}
        latestVersion={hoyoVersionInfo[selectedHoyoGame?.biz || '']?.version || 'Unknown'}
        downloadSize={selectedHoyoGame?.estimatedSize}
        onGameAdded={loadGames}
      />

      <GameConfigModal
        game={selectedGame}
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onUpdate={handleGameUpdate}
        runners={runners}
      />

      {/* Header with tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold">Library</h1>
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            <button
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'my-games'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('my-games')}
            >
              My Games
            </button>
            <button
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'explore'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('explore')}
            >
              <Cloud className="h-4 w-4" />
              Explore
            </button>
          </div>
        </div>

        {activeTab === 'my-games' && (
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">{games.length} games</span>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  Add Game
                </Button>
              </DialogTrigger>
            </div>

            <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Add New Game</DialogTitle>
                <DialogDescription>
                  Select the game executable and we'll auto-detect the rest.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Executable</Label>
                  <div className="flex gap-2">
                    <Input
                      value={formExecutable}
                      onChange={(e) => setFormExecutable(e.target.value)}
                      placeholder="/path/to/game.exe"
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={handleBrowseExecutable} disabled={detecting}>
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Game Name</Label>
                  <Input
                    id="name"
                    placeholder="Genshin Impact"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="directory">Game Directory</Label>
                  <Input
                    id="directory"
                    placeholder="/home/user/Games/Genshin Impact"
                    value={formDirectory}
                    onChange={(e) => setFormDirectory(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="prefix">Wine Prefix</Label>
                  <Input
                    id="prefix"
                    placeholder="/home/user/Games/Genshin Impact/prefix"
                    value={formPrefix}
                    onChange={(e) => setFormPrefix(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="runner">Runner</Label>
                  <select
                    id="runner"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={formRunnerPath}
                    onChange={(e) => setFormRunnerPath(e.target.value)}
                  >
                    {runners.map((runner) => (
                      <option key={runner.path} value={runner.path}>
                        {runner.name} ({runner.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleAddGame} disabled={submitting}>
                  {submitting ? 'Adding...' : 'Add Game'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {activeTab === 'explore' && (
          <Button variant="outline" onClick={loadHoyoVersions} disabled={loadingVersions}>
            {loadingVersions ? 'Refreshing...' : 'Refresh'}
          </Button>
        )}
      </div>

      {/* My Games Tab */}
      {activeTab === 'my-games' && (
        <>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Delete Game</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete "{gameToDelete?.name}"? This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" onClick={handleDeleteGame} disabled={submitting}>
                  {submitting ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {games.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Gamepad2 className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg mb-2">No games yet</p>
              <p className="text-sm">Click "Add Game" to get started or explore HoYoverse games</p>
              <Button variant="outline" className="mt-4" onClick={() => setActiveTab('explore')}>
                <Cloud className="h-4 w-4 mr-2" />
                Explore Games
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {games.map((game) => (
                <Card key={game.id} className="overflow-hidden group">
                  <div className="aspect-[3/4] bg-muted flex items-center justify-center relative overflow-hidden">
                    {game.coverImage ? (
                      <CoverImage imagePath={game.coverImage} alt={game.name} />
                    ) : (
                      <Gamepad2 className="h-12 w-12 text-muted-foreground" />
                    )}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {runningGames.has(game.id) && (
                        <div className="bg-green-500 text-white text-xs px-2 py-1 rounded">Running</div>
                      )}
                      {game.mods?.enabled && (
                        <div className="bg-purple-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                          <Puzzle className="h-3 w-3" />
                          Mods
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition"
                      onClick={(e) => confirmDelete(game, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <CardContent className="p-3">
                    <h3 className="font-medium truncate mb-2">{game.name}</h3>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={(e) => handlePlayClick(game, e)}
                        disabled={runningGames.has(game.id)}
                        className="flex-1"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {runningGames.has(game.id) ? 'Running' : 'Play'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={(e) => handleOpenConfig(game, e)}>
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Explore Tab */}
      {activeTab === 'explore' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {HOYO_GAMES.map((hoyoGame) => {
              const versionInfo = hoyoVersionInfo[hoyoGame.biz]
              const versionError = hoyoVersionErrors[hoyoGame.biz]
              const isInstalled = checkGameInstalled(hoyoGame.biz)

              return (
                <Card key={hoyoGame.biz} className="overflow-hidden flex flex-col">
                  <div
                    className="aspect-video bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative"
                    style={{
                      background: `linear-gradient(135deg, ${hoyoGame.color}20, ${hoyoGame.color}10)`,
                    }}
                  >
                    <div
                      className="text-4xl font-bold opacity-20"
                      style={{ color: hoyoGame.color }}
                    >
                      {hoyoGame.name.split(' ').map(w => w[0]).join('')}
                    </div>

                    {isInstalled && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                        Installed
                      </div>
                    )}
                  </div>

                  <CardContent className="p-4 flex flex-col flex-1">
                    <h3 className="font-semibold text-lg mb-1">{hoyoGame.name}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                      {versionInfo ? (
                        <>
                          <span>v{versionInfo.version}</span>
                          <span>•</span>
                          <span>{hoyoGame.estimatedSize}</span>
                        </>
                      ) : versionError ? (
                        <span className="text-destructive" title={versionError}>
                          Error loading version
                        </span>
                      ) : loadingVersions ? (
                        <span>Loading version info...</span>
                      ) : (
                        <span className="text-muted-foreground">Version unavailable</span>
                      )}
                    </div>

                    {versionError && (
                      <p className="text-xs text-muted-foreground mb-3 truncate" title={versionError}>
                        {versionError}
                      </p>
                    )}

                    <Button
                      className="w-full mt-auto"
                      onClick={() => handleInstallGame(hoyoGame)}
                      disabled={isInstalled || !versionInfo}
                      title={!versionInfo ? 'Version info required to install' : undefined}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {isInstalled ? 'Already Installed' : !versionInfo ? 'Unavailable' : 'Install'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}

          {/* Endfield Card */}
          <Card className="overflow-hidden flex flex-col">
            <div
              className="aspect-video bg-gradient-to-br flex items-center justify-center relative"
              style={{
                background: `linear-gradient(135deg, #00b4cc20, #00b4cc10)`,
              }}
            >
              <div
                className="text-4xl font-bold opacity-20"
                style={{ color: '#00b4cc' }}
              >
                AE
              </div>

              {checkGameInstalled('endfield') && (
                <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                  Installed
                </div>
              )}
            </div>

            <CardContent className="p-4 flex flex-col flex-1">
              <h3 className="font-semibold text-lg mb-1">Arknights: Endfield</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                <span className="text-xs text-muted-foreground">HyperGryph</span>
                {endfieldInfo ? (
                  <>
                    <span>v{endfieldInfo.version}</span>
                    <span>•</span>
                    <span>{formatBytes(endfieldInfo.totalSize)} download</span>
                    <span>•</span>
                    <span>{formatBytes(endfieldInfo.installedSize)} installed</span>
                  </>
                ) : endfieldInfoError ? (
                  <span className="text-destructive text-xs" title={endfieldInfoError}>
                    Error loading version
                  </span>
                ) : loadingVersions ? (
                  <span className="text-xs">Loading version info...</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Version unavailable</span>
                )}
              </div>

              {endfieldInfoError && (
                <p className="text-xs text-muted-foreground mb-3 truncate" title={endfieldInfoError}>
                  {endfieldInfoError}
                </p>
              )}

              <Button
                className="w-full mt-auto"
                onClick={() => setEndfieldInstallOpen(true)}
                disabled={checkGameInstalled('endfield') || !endfieldInfo}
                title={!endfieldInfo ? 'Version info required to install' : undefined}
              >
                <Download className="h-4 w-4 mr-2" />
                {checkGameInstalled('endfield') ? 'Already Installed' : !endfieldInfo ? 'Unavailable' : 'Install'}
              </Button>
            </CardContent>
          </Card>

          {/* Wuthering Waves Card */}
          <Card className="overflow-hidden flex flex-col">
            <div
              className="aspect-video bg-gradient-to-br flex items-center justify-center relative"
              style={{
                background: `linear-gradient(135deg, #3d7ebf20, #3d7ebf10)`,
              }}
            >
              <div
                className="text-4xl font-bold opacity-20"
                style={{ color: '#3d7ebf' }}
              >
                WW
              </div>

              {checkGameInstalled('wuwa') && (
                <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                  Installed
                </div>
              )}
            </div>

            <CardContent className="p-4 flex flex-col flex-1">
              <h3 className="font-semibold text-lg mb-1">Wuthering Waves</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                <span className="text-xs text-muted-foreground">Kuro Games</span>
                {wuwaInfo ? (
                  <>
                    <span>v{wuwaInfo.version}</span>
                    <span>•</span>
                    <span>{formatBytes(wuwaInfo.totalSize)} download</span>
                  </>
                ) : wuwaInfoError ? (
                  <span className="text-destructive text-xs" title={wuwaInfoError}>
                    Error loading version
                  </span>
                ) : loadingVersions ? (
                  <span className="text-xs">Loading version info...</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Version unavailable</span>
                )}
              </div>

              {wuwaInfoError && (
                <p className="text-xs text-muted-foreground mb-3 truncate" title={wuwaInfoError}>
                  {wuwaInfoError}
                </p>
              )}

              <Button
                className="w-full mt-auto"
                onClick={() => setWuwaInstallOpen(true)}
                disabled={checkGameInstalled('wuwa') || !wuwaInfo}
                title={!wuwaInfo ? 'Version info required to install' : undefined}
              >
                <Download className="h-4 w-4 mr-2" />
                {checkGameInstalled('wuwa') ? 'Already Installed' : !wuwaInfo ? 'Unavailable' : 'Install'}
              </Button>
            </CardContent>
          </Card>
          </div>

          {/* Endfield Install Modal */}
          <EndfieldInstallModal
            open={endfieldInstallOpen}
            onClose={() => setEndfieldInstallOpen(false)}
            latestVersion={endfieldInfo?.version ?? ''}
            totalSize={endfieldInfo?.totalSize ?? 0}
            installedSize={endfieldInfo?.installedSize ?? 0}
            onGameAdded={loadGames}
          />

          {/* Wuthering Waves Install Modal */}
          <WuwaInstallModal
            open={wuwaInstallOpen}
            onClose={() => setWuwaInstallOpen(false)}
            latestVersion={wuwaInfo?.version ?? ''}
            totalSize={wuwaInfo?.totalSize ?? 0}
            onGameAdded={loadGames}
          />
        </>
      )}
    </div>
  )
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default Library
