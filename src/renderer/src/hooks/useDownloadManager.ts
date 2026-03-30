import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { CATALOG_ENTRIES, findInstalledCatalogGame, type CatalogEntry, type CatalogId } from '@/data/catalog'
import type { Selection } from '@/types/app-shell'
import type { DownloadProgress } from '@shared/types/download'
import type { Game } from '@shared/types/game'

interface UseDownloadManagerOptions {
  games: Game[]
  reportStatus: (message: string, selection?: Selection) => void
  setStatusLine: (message: string) => void
  autoAddCatalogGame: (entry: CatalogEntry) => Promise<void>
  refreshSingleHoyoGame: (game: Game) => Promise<Game>
  refreshSingleWuwaGame: (game: Game) => Promise<Game>
}

interface UseDownloadManagerResult {
  downloadProgresses: Record<string, DownloadProgress>
  setDownloadProgresses: Dispatch<SetStateAction<Record<string, DownloadProgress>>>
  activeDownload: DownloadProgress | null
}

export function useDownloadManager({
  games,
  reportStatus,
  setStatusLine,
  autoAddCatalogGame,
  refreshSingleHoyoGame,
  refreshSingleWuwaGame,
}: UseDownloadManagerOptions): UseDownloadManagerResult {
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, DownloadProgress>>({})
  const activeDownload = useMemo(
    () =>
      Object.values(downloadProgresses).find((progress) =>
        ['downloading', 'verifying', 'extracting'].includes(progress.status),
      ) ?? null,
    [downloadProgresses],
  )

  const gamesRef = useRef(games)
  const reportStatusRef = useRef(reportStatus)
  const setStatusLineRef = useRef(setStatusLine)
  const autoAddCatalogGameRef = useRef(autoAddCatalogGame)
  const refreshSingleHoyoGameRef = useRef(refreshSingleHoyoGame)
  const refreshSingleWuwaGameRef = useRef(refreshSingleWuwaGame)

  useEffect(() => {
    gamesRef.current = games
  }, [games])

  useEffect(() => {
    reportStatusRef.current = reportStatus
  }, [reportStatus])

  useEffect(() => {
    setStatusLineRef.current = setStatusLine
  }, [setStatusLine])

  useEffect(() => {
    autoAddCatalogGameRef.current = autoAddCatalogGame
  }, [autoAddCatalogGame])

  useEffect(() => {
    refreshSingleHoyoGameRef.current = refreshSingleHoyoGame
  }, [refreshSingleHoyoGame])

  useEffect(() => {
    refreshSingleWuwaGameRef.current = refreshSingleWuwaGame
  }, [refreshSingleWuwaGame])

  useEffect(() => {
    const unsubDownloadProgress = window.api.on('download:progress', (data) => {
      const progress = data as DownloadProgress
      setDownloadProgresses((current) => ({ ...current, [progress.gameId]: progress }))
      setStatusLineRef.current(`> ${progress.gameId} ${progress.status} ${progress.percent}%`)
    })

    const unsubDownloadComplete = window.api.on('download:complete', (data) => {
      const { gameId } = data as { gameId: string }
      reportStatusRef.current(`${gameId} installation complete`, { type: 'catalog', catalogId: gameId as CatalogId })
      setDownloadProgresses((current) => {
        const existing = current[gameId]
        if (!existing) {
          return current
        }
        return {
          ...current,
          [gameId]: { ...existing, percent: 100, status: 'installed' },
        }
      })
      const entry = CATALOG_ENTRIES.find((item) => item.id === gameId)
      if (entry) {
        const existingGame = findInstalledCatalogGame(gamesRef.current, entry)

        if (entry.kind === 'hoyo' && existingGame) {
          void refreshSingleHoyoGameRef.current(existingGame)
        } else if (entry.id === 'wuwa' && existingGame) {
          void refreshSingleWuwaGameRef.current(existingGame)
        } else {
          void autoAddCatalogGameRef.current(entry)
        }
      }
    })

    const unsubDownloadError = window.api.on('download:error', (data) => {
      const { gameId, error } = data as { gameId: string; error: string }
      reportStatusRef.current(`${gameId} failed: ${error}`, { type: 'catalog', catalogId: gameId as CatalogId })
      setDownloadProgresses((current) => {
        const existing = current[gameId]
        if (!existing) {
          return current
        }
        return {
          ...current,
          [gameId]: { ...existing, status: 'error', error },
        }
      })
    })

    return () => {
      unsubDownloadProgress()
      unsubDownloadComplete()
      unsubDownloadError()
    }
  }, [])

  return {
    downloadProgresses,
    setDownloadProgresses,
    activeDownload,
  }
}
