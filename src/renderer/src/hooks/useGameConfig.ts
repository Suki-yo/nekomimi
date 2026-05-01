import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { DEFAULT_GENSHIN_FPS_UNLOCK_FPS } from '@/data/catalog'
import type { Selection } from '@/types/app-shell'
import type { DetectedRunner, Game } from '@shared/types/game'

export interface GameConfigDraft {
  name: string
  runnerPath: string
  prefix: string
  coverImage?: string
  modsEnabled: boolean
  genshinFpsUnlock: string
  frameGeneration: 'off' | 'lsfg-vk'
}

interface UseGameConfigOptions {
  games: Game[]
  selectedNode: Selection
  runners: DetectedRunner[]
  reportStatus: (message: string, selection?: Selection) => void
  updateGame: (gameId: string, updates: Partial<Game>) => Promise<Game>
  getGameImporter: (game: Game) => string | null
  getGenshinFpsUnlockDraftValue: (game: Game) => string
  isGenshinGame: (game: Pick<Game, 'slug' | 'executable'>) => boolean
}

interface UseGameConfigResult {
  selectedGame: Game | null
  configDraft: GameConfigDraft | null
  setConfigDraft: Dispatch<SetStateAction<GameConfigDraft | null>>
  savingConfig: boolean
  handleChangeCoverImage: () => Promise<void>
  handleSaveConfig: () => Promise<void>
}

export function useGameConfig({
  games,
  selectedNode,
  runners,
  reportStatus,
  updateGame,
  getGameImporter,
  getGenshinFpsUnlockDraftValue,
  isGenshinGame,
}: UseGameConfigOptions): UseGameConfigResult {
  const [configDraft, setConfigDraft] = useState<GameConfigDraft | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)

  const gamesById = useMemo(
    () => Object.fromEntries(games.map((game) => [game.id, game])) as Record<string, Game>,
    [games],
  )

  const selectedGame = useMemo(() => {
    if (selectedNode.type === 'game' || selectedNode.type === 'mods' || selectedNode.type === 'config') {
      return gamesById[selectedNode.gameId] ?? null
    }
    return null
  }, [gamesById, selectedNode])

  useEffect(() => {
    if (!selectedGame) {
      setConfigDraft(null)
      return
    }

    setConfigDraft({
      name: selectedGame.name,
      runnerPath: selectedGame.runner.path,
      prefix: selectedGame.runner.prefix,
      coverImage: selectedGame.coverImage,
      modsEnabled: selectedGame.mods.enabled,
      genshinFpsUnlock: getGenshinFpsUnlockDraftValue(selectedGame),
      frameGeneration:
        selectedGame.slug === 'wuwa' && selectedGame.launch.env.NEKOMIMI_FRAMEGEN !== 'off'
          ? 'lsfg-vk'
          : selectedGame.launch.env.NEKOMIMI_FRAMEGEN === 'lsfg-vk'
            ? 'lsfg-vk'
            : 'off',
    })
  }, [getGenshinFpsUnlockDraftValue, selectedGame])

  async function handleChangeCoverImage(): Promise<void> {
    if (!selectedGame || !configDraft) {
      return
    }

    const imagePath = await window.api.openImage(selectedGame.directory)
    if (!imagePath) {
      return
    }

    setConfigDraft((current) => (current ? { ...current, coverImage: imagePath } : current))
    reportStatus('cover image updated in draft', { type: 'config', gameId: selectedGame.id })
  }

  async function handleSaveConfig(): Promise<void> {
    if (!selectedGame || !configDraft) {
      return
    }

    setSavingConfig(true)
    try {
      const runner = runners.find((item) => item.path === configDraft.runnerPath)
      const launchEnv = { ...selectedGame.launch.env }
      if (configDraft.frameGeneration === 'lsfg-vk') {
        launchEnv.NEKOMIMI_FRAMEGEN = 'lsfg-vk'
      } else {
        launchEnv.NEKOMIMI_FRAMEGEN = 'off'
      }
      delete launchEnv.NEKOMIMI_GAMESCOPE_ARGS
      const fpsUnlock =
        isGenshinGame(selectedGame)
          ? {
              enabled: configDraft.genshinFpsUnlock !== 'off',
              fps:
                configDraft.genshinFpsUnlock === 'off'
                  ? selectedGame.mods.fpsUnlock?.fps ?? DEFAULT_GENSHIN_FPS_UNLOCK_FPS
                  : Number(configDraft.genshinFpsUnlock),
            }
          : selectedGame.mods.fpsUnlock
      const updated = await updateGame(selectedGame.id, {
        name: configDraft.name,
        coverImage: configDraft.coverImage,
        runner: {
          ...selectedGame.runner,
          type: runner?.type ?? selectedGame.runner.type,
          path: configDraft.runnerPath,
          prefix: configDraft.prefix,
        },
        launch: {
          ...selectedGame.launch,
          env: launchEnv,
        },
        mods: {
          ...selectedGame.mods,
          enabled: configDraft.modsEnabled,
          importer: getGameImporter(selectedGame) ?? undefined,
          fpsUnlock,
        },
      })
      setConfigDraft({
        name: updated.name,
        runnerPath: updated.runner.path,
        prefix: updated.runner.prefix,
        coverImage: updated.coverImage,
        modsEnabled: updated.mods.enabled,
        genshinFpsUnlock: getGenshinFpsUnlockDraftValue(updated),
        frameGeneration:
          updated.slug === 'wuwa' && updated.launch.env.NEKOMIMI_FRAMEGEN !== 'off'
            ? 'lsfg-vk'
            : updated.launch.env.NEKOMIMI_FRAMEGEN === 'lsfg-vk'
              ? 'lsfg-vk'
              : 'off',
      })
      reportStatus(`saved config for ${updated.name.toLowerCase()}`, { type: 'config', gameId: updated.id })
    } finally {
      setSavingConfig(false)
    }
  }

  return {
    selectedGame,
    configDraft,
    setConfigDraft,
    savingConfig,
    handleChangeCoverImage,
    handleSaveConfig,
  }
}
