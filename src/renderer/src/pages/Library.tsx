import { useEffect, useState } from 'react'
import { Plus, Gamepad2, Trash2, FolderOpen } from 'lucide-react'
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
import type { Game, DetectedRunner } from '../../../shared/types/game'

// Default configs for new games
const defaultLaunch = {
  env: {},
  preLaunch: [],
  postLaunch: [],
  args: '',
}

const defaultMods = {}

function Library() {
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

  const showToast = (message: string, type: 'info' | 'warning' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Form state
  const [formName, setFormName] = useState('')
  const [formDirectory, setFormDirectory] = useState('')
  const [formExecutable, setFormExecutable] = useState('')
  const [formPrefix, setFormPrefix] = useState('')
  const [formRunnerPath, setFormRunnerPath] = useState('')

  useEffect(() => {
    loadGames()
    loadRunners()
  }, [])

  // Poll for running games
  useEffect(() => {
    const pollRunning = async () => {
      const running = await window.api.invoke('game:running')
      if (running) {
        setRunningGames(new Set(running.map((g) => g.id)))
      }
    }

    pollRunning() // Initial check
    const interval = setInterval(pollRunning, 3000) // Poll every 3s

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
      // Select first runner by default
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

      // Detect game info from executable
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
        launch: defaultLaunch,
        mods: defaultMods,
      })

      setGames((prev) => [...prev, newGame])

      // Reset form
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
    e.stopPropagation() // Prevent card click (launch)
    setGameToDelete(game)
    setDeleteDialogOpen(true)
  }

  const launchGame = async (id: string) => {
    if (runningGames.has(id)) {
      showToast('Game is already running', 'warning')
      return
    }
    const result = await window.api.invoke('game:launch', { id })
    if (!result.success) {
      showToast(`Failed to launch: ${result.error}`, 'warning')
    }
  }

  // Single click handler (placeholder for game details)
  const handleGameClick = (game: Game) => {
    // TODO: Navigate to game details page
    console.log('Game details coming soon:', game.name)
  }

  // Double click handler (launch game)
  const handleGameDoubleClick = (game: Game) => {
    launchGame(game.id)
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
        <Button onClick={loadGames} variant="outline">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg ${
          toast.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
        } text-white`}>
          {toast.message}
        </div>
      )}
      {/* Add Game Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Library</h1>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">{games.length} games</span>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add Game
              </Button>
            </DialogTrigger>
          </div>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBrowseExecutable}
                  disabled={detecting}
                >
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAddGame} disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Game'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Delete Game</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{gameToDelete?.name}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteGame}
              disabled={submitting}
            >
              {submitting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {games.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Gamepad2 className="h-16 w-16 mb-4 opacity-50" />
          <p className="text-lg mb-2">No games yet</p>
          <p className="text-sm">Click "Add Game" to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {games.map((game) => (
            <Card
              key={game.id}
              className="cursor-pointer hover:ring-2 hover:ring-ring transition overflow-hidden group"
              onClick={() => handleGameClick(game)}
              onDoubleClick={() => handleGameDoubleClick(game)}
            >
              <div className="aspect-[3/4] bg-muted flex items-center justify-center relative">
                <Gamepad2 className="h-12 w-12 text-muted-foreground" />
                {/* Running indicator */}
                {runningGames.has(game.id) && (
                  <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                    Running
                  </div>
                )}
                {/* Delete button - shows on hover */}
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
                <h3 className="font-medium truncate">{game.name}</h3>
                <div className="flex items-center justify-between mt-1 text-sm text-muted-foreground">
                  <span>
                    {game.installed ? (
                      <span className="text-green-500">Installed</span>
                    ) : (
                      <span>Not installed</span>
                    )}
                  </span>
                  <span>{Math.round(game.playtime)}h</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default Library
