import { useEffect, useMemo, useState, type JSX } from 'react'
import { AppDetailPane } from '@/components/app/AppDetailPane'
import { SidebarTree } from '@/components/app/SidebarTree'
import { formatBytes } from '@/components/install-modal-utils'
import { CATALOG_ENTRIES } from '@/data/catalog'
import { useCatalogManager } from '@/hooks/useCatalogManager'
import { useDownloadManager } from '@/hooks/useDownloadManager'
import { useGameLaunch } from '@/hooks/useGameLaunch'
import { useGameConfig } from '@/hooks/useGameConfig'
import { useModManager } from '@/hooks/useModManager'
import { useClock } from '@/hooks/useClock'
import { useRunningGames } from '@/hooks/useRunningGames'
import { useStatusBar } from '@/hooks/useStatusBar'
import { useSystemState } from '@/hooks/useSystemState'
import {
  buildHoyoDownloadState,
  buildWuwaDownloadState,
  createManualGameForm,
  createProgressBar,
  DEFAULT_LAUNCH,
  DEFAULT_MODS,
  describeProgress,
  formatHomeDate,
  formatStamp,
  GENSHIN_FPS_UNLOCK_OPTIONS,
  getGenshinFpsUnlockDraftValue,
  getTopStatus,
  isGenshinGame,
  isSelectionValid,
  openSystemPath,
  placeholderLabel,
  type ManualGameForm,
  upsertGameList,
} from '@/lib/app-shell'
import { INITIAL_SECTIONS, INITIAL_SELECTION, type SectionState, type Selection } from '@/types/app-shell'
import { getXXMIImporter } from './utils/mods'
import { APP_NAME, APP_VERSION } from '../../shared/constants'
import type { Game } from '../../shared/types/game'

function getGameImporter(game: Game): string | null { return game.mods.importer ?? getXXMIImporter(game.executable) }

function App(): JSX.Element {
  const [games, setGames] = useState<Game[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [gamesError, setGamesError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<Selection>(INITIAL_SELECTION)
  const [expandedGames, setExpandedGames] = useState<Record<string, boolean>>({})
  const [sections, setSections] = useState<SectionState>(INITIAL_SECTIONS)
  const { runningGames, runningGameStarts } = useRunningGames()
  const { reportStatus, setStatusLine, statusLine } = useStatusBar()
  const clock = useClock()
  const [manualGameForm, setManualGameForm] = useState<ManualGameForm>(createManualGameForm())

  const gamesById = useMemo(
    () => Object.fromEntries(games.map((game) => [game.id, game])) as Record<string, Game>,
    [games],
  )

  const selectedCatalog = useMemo(
    () => (selectedNode.type === 'catalog'
      ? CATALOG_ENTRIES.find((entry) => entry.id === selectedNode.catalogId) ?? null
      : null),
    [selectedNode],
  )

  const {
    config,
    configLoading,
    handleRunnerDownload,
    handleSteamRuntimeInstall,
    handleUpdateConfig,
    installedRunner,
    loadRunnerInfo,
    loadSystemState,
    runnerDownloading,
    runnerError,
    runnerProgress,
    runners,
    setRunnerProgress,
    steamrtDownloading,
    steamrtError,
    steamrtProgress,
    steamrtStatus,
  } = useSystemState({
    reportStatus,
    onRunnersLoaded: (nextRunners) => {
      setManualGameForm((current) => ({
        ...current,
        runnerPath: current.runnerPath || nextRunners[0]?.path || '',
      }))
    },
  })

  const {
    modsByGame,
    handleAddMod,
    handleEnableAllMods,
    handleOpenModsFolder,
    handleRenameMod,
    handleToggleMod,
  } = useModManager({
    expandedGames,
    games,
    selectedNode,
    reportStatus,
    getGameImporter,
  })

  const {
    catalogDetails,
    catalogForms,
    autoAddCatalogGame,
    handleCatalogBrowse,
    handleCatalogCancel,
    handleCatalogLocateBrowse,
    handleCatalogLocateConfirm,
    handleCatalogStart,
    loadCatalogDetails,
    refreshSingleHoyoGame,
    refreshSingleWuwaGame,
    setCatalogForms,
    syncCatalogGames,
  } = useCatalogManager({
    clearDownloadProgress,
    games,
    reportStatus,
    runners,
    onGameAdded: registerGame,
    updateGame,
    buildHoyoDownloadState,
    buildWuwaDownloadState,
    formatBytes,
  })

  const {
    selectedGame,
    configDraft,
    setConfigDraft,
    savingConfig,
    handleChangeCoverImage,
    handleSaveConfig,
  } = useGameConfig({
    games,
    selectedNode,
    runners,
    reportStatus,
    updateGame,
    getGameImporter,
    getGenshinFpsUnlockDraftValue,
    isGenshinGame,
  })

  const {
    downloadProgresses,
    setDownloadProgresses,
    activeDownload,
  } = useDownloadManager({
    games,
    reportStatus,
    setStatusLine,
    autoAddCatalogGame,
    refreshSingleHoyoGame,
    refreshSingleWuwaGame,
  })

  const {
    handleLaunchGame,
    launchPreparation,
    launchingGameId,
    launchStatus,
  } = useGameLaunch({
    games,
    runningGames,
    reportStatus,
    setStatusLine,
    setRunnerProgress,
    loadRunnerInfo,
  })

  const continueGame = useMemo(() => {
    if (games.length === 0) {
      return null
    }

    const activeGames = games.filter((game) => runningGames.has(game.id))
    if (activeGames.length > 0) {
      return [...activeGames].sort(
        (left, right) => (runningGameStarts[right.id] ?? 0) - (runningGameStarts[left.id] ?? 0),
      )[0] ?? null
    }

    const playedGames = games.filter((game) => game.lastPlayed)
    if (playedGames.length === 0) {
      return games[0] ?? null
    }

    return [...playedGames].sort((left, right) =>
      new Date(right.lastPlayed!).getTime() - new Date(left.lastPlayed!).getTime(),
    )[0] ?? null
  }, [games, runningGameStarts, runningGames])

  const quickPicks = useMemo(
    () =>
      [...games]
        .sort((left, right) => {
          const leftPlayed = left.lastPlayed ? new Date(left.lastPlayed).getTime() : 0
          const rightPlayed = right.lastPlayed ? new Date(right.lastPlayed).getTime() : 0
          if (leftPlayed !== rightPlayed) {
            return rightPlayed - leftPlayed
          }
          return right.playtime - left.playtime
        })
        .slice(0, 3),
    [games],
  )

  const activeGameState = selectedGame
    ? runningGames.has(selectedGame.id)
      ? 'RUNNING'
      : launchPreparation.pendingGameId === selectedGame.id
        ? 'PREPARING'
        : 'IDLE'
    : selectedCatalog && activeDownload?.gameId === selectedCatalog.id
      ? activeDownload.status.toUpperCase()
      : 'IDLE'

  useEffect(() => { void loadInitialState() }, [])

  useEffect(() => {
    if (!isSelectionValid(selectedNode, games)) {
      setSelectedNode({ type: 'home' })
    }

    setExpandedGames((current) => {
      const next = { ...current }
      for (const game of games) {
        if (next[game.id] === undefined) {
          next[game.id] = false
        }
      }
      return next
    })
  }, [games, selectedNode])

  async function loadInitialState(): Promise<void> {
    await Promise.all([
      loadGames(),
      loadSystemState(),
      loadCatalogDetails(),
    ])
  }

  async function loadGames(): Promise<void> {
    try {
      setGamesLoading(true)
      const nextGames = await window.api.invoke('game:list')
      const syncedGames = await syncCatalogGames(nextGames)
      setGames(syncedGames)
      setGamesError(null)
    } catch (error) {
      setGamesError(error instanceof Error ? error.message : 'Failed to load games')
    } finally {
      setGamesLoading(false)
    }
  }

  async function updateGame(gameId: string, updates: Partial<Game>): Promise<Game> {
    const updated = await window.api.invoke('game:update', { id: gameId, updates })
    setGames((current) => current.map((game) => (game.id === gameId ? updated : game)))
    return updated
  }

  function registerGame(game: Game): void {
    setGames((current) => upsertGameList(current, game))
    setSelectedNode({ type: 'game', gameId: game.id })
    setExpandedGames((current) => ({ ...current, [game.id]: true }))
  }

  function clearDownloadProgress(gameId: string): void {
    setDownloadProgresses((current) => {
      const next = { ...current }
      delete next[gameId]
      return next
    })
  }

  async function handleDeleteGame(game: Game): Promise<void> {
    if (!window.confirm(`Delete "${game.name}" from the library?`)) {
      return
    }

    await window.api.invoke('game:delete', { id: game.id })
    setGames((current) => current.filter((item) => item.id !== game.id))
    setSelectedNode(games.length > 1 ? { type: 'game', gameId: games.find((item) => item.id !== game.id)?.id ?? '' } : { type: 'catalog', catalogId: 'genshin' })
    reportStatus(`removed ${game.name.toLowerCase()} from library`)
  }

  async function handleBrowseManualExecutable(): Promise<void> {
    try {
      setManualGameForm((current) => ({ ...current, detecting: true }))
      const filePath = await window.api.openFile()
      if (!filePath) {
        return
      }

      const detected = await window.api.invoke('game:detect', { exePath: filePath })
      setManualGameForm((current) => ({
        ...current,
        name: detected.name,
        directory: detected.directory,
        executable: filePath,
        prefix: detected.prefix ?? current.prefix,
      }))
      reportStatus(`detected ${detected.name.toLowerCase()}`)
    } catch (error) {
      reportStatus(`detection failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      setManualGameForm((current) => ({ ...current, detecting: false }))
    }
  }

  async function handleAddManualGame(): Promise<void> {
    if (!manualGameForm.name || !manualGameForm.directory || !manualGameForm.executable) {
      reportStatus('missing executable, name, or directory')
      return
    }

    const selectedRunner = runners.find((runner) => runner.path === manualGameForm.runnerPath)
    const game = await window.api.invoke('game:add', {
      name: manualGameForm.name,
      slug: manualGameForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      installed: true,
      directory: manualGameForm.directory,
      executable: manualGameForm.executable,
      runner: {
        type: selectedRunner?.type ?? 'proton',
        path: manualGameForm.runnerPath,
        prefix: manualGameForm.prefix,
      },
      launch: DEFAULT_LAUNCH,
      mods: DEFAULT_MODS,
    })

    setGames((current) => upsertGameList(current, game))
    setSelectedNode({ type: 'game', gameId: game.id })
    setExpandedGames((current) => ({ ...current, [game.id]: true }))
    setManualGameForm(createManualGameForm(runners[0]?.path ?? ''))
    reportStatus(`added ${game.name.toLowerCase()} to library`, { type: 'game', gameId: game.id })
  }

  function handleSelectGame(selection: Selection): void {
    setSelectedNode(selection)
    if (selection.type === 'game' || selection.type === 'mods' || selection.type === 'config') {
      setExpandedGames((current) => ({ ...current, [selection.gameId]: true }))
    }
  }

  function handleGameLabelClick(gameId: string): void {
    const isCurrentGame =
      (selectedNode.type === 'game' || selectedNode.type === 'mods' || selectedNode.type === 'config') &&
      selectedNode.gameId === gameId

    if (!isCurrentGame) {
      handleSelectGame({ type: 'game', gameId })
      return
    }

    setExpandedGames((current) => ({ ...current, [gameId]: !current[gameId] }))
  }

  function handleToggleGameExpanded(gameId: string): void {
    setExpandedGames((current) => ({ ...current, [gameId]: !current[gameId] }))
  }

  function handleToggleSection(section: keyof SectionState): void {
    setSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const topStatus = getTopStatus({
    activeDownload,
    gamesById,
    launchingGameId,
    launchPreparation,
    runnerDownloading,
    runnerProgress,
    steamrtDownloading,
    steamrtProgress,
  })

  const displayVersion = window.api.version === '0.0.0' ? APP_VERSION : window.api.version

  return (
    <div className="tui-shell">
      <header className="tui-topbar">
        <div>{`${APP_NAME.toUpperCase()} v${displayVersion}`}</div>
        <div>{topStatus}</div>
        <div>{formatStamp(clock)}</div>
      </header>

      <div className="tui-main">
        <aside className="tui-sidebar">
          <SidebarTree
            downloadProgresses={downloadProgresses}
            expandedGames={expandedGames}
            games={games}
            getGameImporter={getGameImporter}
            modsByGame={modsByGame}
            onGameLabelClick={handleGameLabelClick}
            onSelectNode={handleSelectGame}
            onToggleGameExpanded={handleToggleGameExpanded}
            onToggleMod={handleToggleMod}
            onToggleSection={handleToggleSection}
            runningGames={runningGames}
            sections={sections}
            selectedNode={selectedNode}
          />
        </aside>
        <main className="tui-detail">
          <AppDetailPane
            catalogDetails={catalogDetails}
            catalogForms={catalogForms}
            config={config}
            configDraft={configDraft}
            configLoaded={!!config}
            configLoading={configLoading}
            continueGame={continueGame}
            createProgressBar={createProgressBar}
            describeProgress={describeProgress}
            downloadProgresses={downloadProgresses}
            formatHomeDate={formatHomeDate}
            games={games}
            gamesError={gamesError}
            gamesLoading={gamesLoading}
            genshinFpsUnlockOptions={GENSHIN_FPS_UNLOCK_OPTIONS}
            getGameImporter={getGameImporter}
            getPlaceholderLabel={placeholderLabel}
            handleAddManualGame={handleAddManualGame}
            handleAddMod={handleAddMod}
            handleBrowseManualExecutable={handleBrowseManualExecutable}
            handleCatalogBrowse={handleCatalogBrowse}
            handleCatalogCancel={handleCatalogCancel}
            handleCatalogLocateBrowse={handleCatalogLocateBrowse}
            handleCatalogLocateConfirm={handleCatalogLocateConfirm}
            handleCatalogStart={handleCatalogStart}
            handleChangeCoverImage={handleChangeCoverImage}
            handleDeleteGame={handleDeleteGame}
            handleEnableAllMods={handleEnableAllMods}
            handleLaunchGame={handleLaunchGame}
            handleOpenModsFolder={handleOpenModsFolder}
            handleRenameMod={handleRenameMod}
            handleRunnerDownload={handleRunnerDownload}
            handleSaveConfig={handleSaveConfig}
            handleSteamRuntimeInstall={handleSteamRuntimeInstall}
            handleToggleMod={handleToggleMod}
            handleUpdateConfig={handleUpdateConfig}
            installedRunner={installedRunner}
            installedRunnerName={installedRunner?.name ?? null}
            isGenshinGame={isGenshinGame}
            launchPreparation={launchPreparation}
            loadGames={loadGames}
            manualGameForm={manualGameForm}
            modsByGame={modsByGame}
            onOpenSystemPath={openSystemPath}
            onSelectNode={handleSelectGame}
            quickPicks={quickPicks}
            runners={runners}
            runnerDownloading={runnerDownloading}
            runnerError={runnerError}
            runnerProgress={runnerProgress}
            runningGames={runningGames}
            savingConfig={savingConfig}
            selectedCatalog={selectedCatalog}
            selectedGame={selectedGame}
            selectedNode={selectedNode}
            setCatalogForms={setCatalogForms}
            setConfigDraft={setConfigDraft}
            setManualGameForm={setManualGameForm}
            steamrtDownloading={steamrtDownloading}
            steamrtError={steamrtError}
            steamrtProgress={steamrtProgress}
            steamrtStatus={steamrtStatus}
          />
        </main>
      </div>

      <footer className="tui-bottombar">
        <div className="tui-prompt">
          <span>{statusLine}</span>
          <span className="tui-cursor" aria-hidden="true">█</span>
        </div>
        <div className="tui-footer-state">
          {launchStatus ?? activeGameState}
        </div>
      </footer>
    </div>
  )
}

export default App
