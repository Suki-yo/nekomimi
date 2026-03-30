import { useEffect, useState } from 'react'

interface RunningGameInfo {
  id: string
  startTime: number
}

interface UseRunningGamesResult {
  runningGames: Set<string>
  runningGameStarts: Record<string, number>
}

export function useRunningGames(pollMs = 3000): UseRunningGamesResult {
  const [runningGames, setRunningGames] = useState<Set<string>>(new Set())
  const [runningGameStarts, setRunningGameStarts] = useState<Record<string, number>>({})

  useEffect(() => {
    const pollRunning = async () => {
      const running = await window.api.invoke('game:running') as RunningGameInfo[]
      setRunningGames(new Set(running.map((game) => game.id)))
      setRunningGameStarts(
        Object.fromEntries(running.map((game) => [game.id, game.startTime])) as Record<string, number>,
      )
    }

    void pollRunning()
    const interval = window.setInterval(() => {
      void pollRunning()
    }, pollMs)

    return () => window.clearInterval(interval)
  }, [pollMs])

  return {
    runningGames,
    runningGameStarts,
  }
}
