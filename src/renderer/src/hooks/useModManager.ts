import { useEffect, useState } from 'react'
import type { Selection } from '@/types/app-shell'
import type { Game, Mod } from '@shared/types/game'

export type ModImportMode = 'file' | 'directory'

interface UseModManagerOptions {
  expandedGames: Record<string, boolean>
  games: Game[]
  selectedNode: Selection
  reportStatus: (message: string, selection?: Selection) => void
  getGameImporter: (game: Game) => string | null
}

interface UseModManagerResult {
  modsByGame: Record<string, Mod[]>
  handleAddMod: (game: Game, mode: ModImportMode) => Promise<void>
  handleEnableAllMods: (game: Game, enabled: boolean) => Promise<void>
  handleOpenModsFolder: (importer: string) => Promise<void>
  handleRenameMod: (game: Game, mod: Mod, customName: string) => Promise<void>
  handleToggleMod: (game: Game, mod: Mod) => Promise<void>
}

const EMPTY_MODS: Mod[] = []

export function useModManager({
  expandedGames,
  games,
  selectedNode,
  reportStatus,
  getGameImporter,
}: UseModManagerOptions): UseModManagerResult {
  const [modsByGame, setModsByGame] = useState<Record<string, Mod[]>>({})

  useEffect(() => {
    const targets = games.filter((game) => {
      const selected = selectedNode.type === 'game' || selectedNode.type === 'mods' || selectedNode.type === 'config'
        ? selectedNode.gameId === game.id
        : false
      return expandedGames[game.id] || selected
    })

    for (const game of targets) {
      void ensureModsLoaded(game)
    }
  }, [expandedGames, games, selectedNode])

  useEffect(() => {
    const unsubModsChanged = window.api.on('mods:changed', (data) => {
      const { importer } = data as { importer: string }
      const matchingGames = games.filter((game) => getGameImporter(game) === importer)

      for (const game of matchingGames) {
        void refreshMods(game)
      }
    })

    return () => {
      unsubModsChanged()
    }
  }, [games, getGameImporter])

  async function ensureModsLoaded(game: Game): Promise<void> {
    if (modsByGame[game.id] !== undefined) {
      return
    }

    const importer = getGameImporter(game)
    if (!importer) {
      setModsByGame((current) => ({ ...current, [game.id]: EMPTY_MODS }))
      return
    }

    try {
      const mods = await window.api.invoke('mods:list', { importer })
      setModsByGame((current) => ({ ...current, [game.id]: mods }))
    } catch {
      setModsByGame((current) => ({ ...current, [game.id]: EMPTY_MODS }))
    }
  }

  async function refreshMods(game: Game): Promise<void> {
    const importer = getGameImporter(game)
    if (!importer) {
      setModsByGame((current) => ({ ...current, [game.id]: EMPTY_MODS }))
      return
    }

    const mods = await window.api.invoke('mods:list', { importer })
    setModsByGame((current) => ({ ...current, [game.id]: mods }))
  }

  async function handleToggleMod(game: Game, mod: Mod): Promise<void> {
    await window.api.invoke('mods:toggle', { modPath: mod.path, enabled: !mod.enabled })
    setModsByGame((current) => ({
      ...current,
      [game.id]: (current[game.id] ?? EMPTY_MODS).map((item) =>
        item.path === mod.path ? { ...item, enabled: !item.enabled } : item,
      ),
    }))
    reportStatus(`${mod.name.toLowerCase()} ${mod.enabled ? 'disabled' : 'enabled'}`, { type: 'mods', gameId: game.id })
  }

  async function handleEnableAllMods(game: Game, enabled: boolean): Promise<void> {
    const importer = getGameImporter(game)
    if (!importer) {
      return
    }

    if (enabled) {
      await window.api.invoke('mods:enable-all', { importer })
      reportStatus(`enabled all mods for ${game.name.toLowerCase()}`, { type: 'mods', gameId: game.id })
    } else {
      await window.api.invoke('mods:disable-all', { importer })
      reportStatus(`disabled all mods for ${game.name.toLowerCase()}`, { type: 'mods', gameId: game.id })
    }
    await refreshMods(game)
  }

  async function handleOpenModsFolder(importer: string): Promise<void> {
    const result = await window.api.invoke('mods:open-folder', { importer })
    if (result.success) {
      reportStatus(`opened ${importer.toLowerCase()} mods folder`)
      return
    }

    reportStatus(`failed to open mods folder: ${result.error || 'unknown error'}`)
  }

  async function handleRenameMod(game: Game, mod: Mod, customName: string): Promise<void> {
    const trimmed = customName.trim()
    if (!trimmed || trimmed === mod.name) {
      return
    }

    const result = await window.api.invoke('mods:rename', {
      modPath: mod.path,
      customName: trimmed,
    })

    if (result.success) {
      await refreshMods(game)
      reportStatus(`renamed mod to ${trimmed.toLowerCase()}`, { type: 'mods', gameId: game.id })
    } else {
      reportStatus(`rename failed: ${result.error || 'unknown error'}`)
    }
  }

  async function handleAddMod(game: Game, mode: ModImportMode): Promise<void> {
    const importer = getGameImporter(game)
    if (!importer) {
      reportStatus('mods are not supported for this title')
      return
    }

    try {
      const selectedSource = await window.api.invoke('dialog:openModSource', {
        defaultPath: game.directory,
        mode,
      })
      if (!selectedSource) {
        return
      }

      const result = await window.api.invoke('mods:install', { importer, sourcePath: selectedSource.path })
      if (result.success) {
        await refreshMods(game)
        reportStatus(`added mod from ${selectedSource.path.split(/[/\\]/).pop()?.toLowerCase() ?? 'selection'}`, { type: 'mods', gameId: game.id })
      } else {
        reportStatus(`add mod failed: ${result.error || 'unknown error'}`)
      }
    } catch (error) {
      reportStatus(`add mod failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return {
    modsByGame,
    handleAddMod,
    handleEnableAllMods,
    handleOpenModsFolder,
    handleRenameMod,
    handleToggleMod,
  }
}
