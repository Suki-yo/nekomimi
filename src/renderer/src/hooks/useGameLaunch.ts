import { useEffect, useState } from 'react'
import type { Selection } from '@/types/app-shell'
import type { Game } from '@shared/types/game'

type LaunchPrepPhase = 'xxmi' | 'runner' | 'complete' | 'error'

export interface LaunchPreparationState {
  active: boolean
  pendingGameId: string | null
  phase: LaunchPrepPhase
  progress: number
  error: string | null
}

interface UseGameLaunchOptions {
  games: Game[]
  runningGames: Set<string>
  reportStatus: (message: string, selection?: Selection) => void
  setStatusLine: (message: string) => void
  setRunnerProgress: (value: number) => void
  loadRunnerInfo: () => Promise<void>
}

interface UseGameLaunchResult {
  handleLaunchGame: (game: Game) => Promise<void>
  launchPreparation: LaunchPreparationState
  launchingGameId: string | null
  launchStatus: string | null
}

export function useGameLaunch({
  games,
  runningGames,
  reportStatus,
  setStatusLine,
  setRunnerProgress,
  loadRunnerInfo,
}: UseGameLaunchOptions): UseGameLaunchResult {
  const [launchingGameId, setLaunchingGameId] = useState<string | null>(null)
  const [launchStatus, setLaunchStatus] = useState<string | null>(null)
  const [launchPreparation, setLaunchPreparation] = useState<LaunchPreparationState>({
    active: false,
    pendingGameId: null,
    phase: 'xxmi',
    progress: 0,
    error: null,
  })

  useEffect(() => {
    const unsubLaunchProgress = window.api.on('game:launch-progress', (data) => {
      const payload = data as { step: string; percent: number }
      const text = `${payload.step} (${payload.percent}%)`
      setLaunchStatus(text)
      setStatusLine(`> ${text.toLowerCase()}`)
    })

    const unsubRunner = window.api.on('mods:runner-progress', (percent) => {
      const value = percent as number
      setRunnerProgress(value)
      setLaunchPreparation((current) =>
        current.active && current.phase === 'runner'
          ? { ...current, progress: value }
          : current,
      )
    })

    const unsubXXMI = window.api.on('mods:xxmi-progress', (percent) => {
      const value = percent as number
      setLaunchPreparation((current) =>
        current.active && current.phase === 'xxmi'
          ? { ...current, progress: value }
          : current,
      )
    })

    return () => {
      unsubLaunchProgress()
      unsubRunner()
      unsubXXMI()
    }
  }, [setRunnerProgress, setStatusLine])

  async function handleLaunchGame(game: Game): Promise<void> {
    if (runningGames.has(game.id)) {
      reportStatus(`${game.name.toLowerCase()} is already running`, { type: 'game', gameId: game.id })
      return
    }

    const status = await window.api.invoke('mods:xxmi-status', undefined)
    if (!status.xxmiInstalled || !status.runnerInstalled) {
      setLaunchPreparation({
        active: true,
        pendingGameId: game.id,
        phase: !status.xxmiInstalled ? 'xxmi' : 'runner',
        progress: 0,
        error: null,
      })

      if (!status.xxmiInstalled) {
        reportStatus('downloading xxmi prerequisites...', { type: 'game', gameId: game.id })
        const xxmiResult = await window.api.invoke('mods:xxmi-download')
        if (!xxmiResult.success) {
          setLaunchPreparation({
            active: true,
            pendingGameId: game.id,
            phase: 'error',
            progress: 0,
            error: xxmiResult.error || 'XXMI download failed',
          })
          reportStatus(`xxmi failed: ${xxmiResult.error || 'download failed'}`, { type: 'game', gameId: game.id })
          return
        }
      }

      if (!status.runnerInstalled) {
        setLaunchPreparation((current) => ({ ...current, phase: 'runner', progress: 0 }))
        reportStatus('downloading proton-ge prerequisite...', { type: 'game', gameId: game.id })
        const runnerResult = await window.api.invoke('mods:runner-download')
        if (!runnerResult.success) {
          setLaunchPreparation({
            active: true,
            pendingGameId: game.id,
            phase: 'error',
            progress: 0,
            error: runnerResult.error || 'Runner download failed',
          })
          reportStatus(`runner failed: ${runnerResult.error || 'download failed'}`, { type: 'game', gameId: game.id })
          return
        }
        await loadRunnerInfo()
      }

      setLaunchPreparation({
        active: false,
        pendingGameId: null,
        phase: 'complete',
        progress: 100,
        error: null,
      })
    }

    setLaunchingGameId(game.id)
    reportStatus(`launching ${game.name.toLowerCase()}...`, { type: 'game', gameId: game.id })
    const result = await window.api.invoke('game:launch', { id: game.id })
    setLaunchingGameId(null)
    setLaunchStatus(null)

    if (!result.success) {
      reportStatus(`launch failed: ${result.error || 'unknown error'}`, { type: 'game', gameId: game.id })
      return
    }

    reportStatus(`${game.name.toLowerCase()} launched`, { type: 'game', gameId: game.id })
  }

  return {
    handleLaunchGame,
    launchPreparation,
    launchingGameId,
    launchStatus,
  }
}
