import { useEffect, useState } from 'react'
import { Plus, Gamepad2, Trash2 } from 'lucide-react'
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
import type { Game } from '../../../shared/types/game'

// Default configs for new games
const defaultRunner = {
  type: 'proton' as const,
  path: '',
  prefix: '',
}

const defaultLaunch = {
  env: {},
  preLaunch: [],
  postLaunch: [],
  args: '',
}

const defaultMods = {}

function Library() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [gameToDelete, setGameToDelete] = useState<Game | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDirectory, setFormDirectory] = useState('')
  const [formExecutable, setFormExecutable] = useState('')

  useEffect(() => {
    loadGames()
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

    try {
      setSubmitting(true)

      const newGame = await window.api.invoke('game:add', {
        name: formName,
        slug: generateSlug(formName),
        installed: true,
        directory: formDirectory,
        executable: formExecutable,
        runner: defaultRunner,
        launch: defaultLaunch,
        mods: defaultMods,
      })

      setGames((prev) => [...prev, newGame])

      setFormName('')
      setFormDirectory('')
      setFormExecutable('')
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
    const result = await window.api.invoke('game:launch', { id })
    if (!result.success) {
      alert(`Failed to launch: ${result.error}`)
    }
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
              Add a game manually by providing its details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
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
              <Label htmlFor="executable">Executable</Label>
              <Input
                id="executable"
                placeholder="GenshinImpact.exe"
                value={formExecutable}
                onChange={(e) => setFormExecutable(e.target.value)}
              />
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
              onClick={() => launchGame(game.id)}
            >
              <div className="aspect-[3/4] bg-muted flex items-center justify-center relative">
                <Gamepad2 className="h-12 w-12 text-muted-foreground" />
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
