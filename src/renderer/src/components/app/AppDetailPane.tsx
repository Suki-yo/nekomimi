import type { Dispatch, JSX, SetStateAction } from 'react'
import { findCatalogEntryForGame, findInstalledCatalogGame, type CatalogDetails, type CatalogEntry, type CatalogFormState, type CatalogId } from '@/data/catalog'
import type { GameConfigDraft } from '@/hooks/useGameConfig'
import type { LaunchPreparationState } from '@/hooks/useGameLaunch'
import type { ManualGameForm } from '@/lib/app-shell'
import type { Selection } from '@/types/app-shell'
import type { AppConfig } from '@shared/types/config'
import type { DownloadProgress } from '@shared/types/download'
import type { DetectedRunner, Game, Mod } from '@shared/types/game'
import { AddGamePanel } from './AddGamePanel'
import { CatalogPanel } from './CatalogPanel'
import { GameConfigPanel } from './GameConfigPanel'
import { GameDetailPanel } from './GameDetailPanel'
import { GameModsPanel } from './GameModsPanel'
import { HomePanel } from './HomePanel'
import { SettingsPanel } from './SettingsPanel'

interface AppDetailPaneProps {
  catalogDetails: Record<CatalogId, CatalogDetails>
  catalogForms: Record<CatalogId, CatalogFormState>
  configDraft: GameConfigDraft | null
  configLoaded: boolean
  configLoading: boolean
  continueGame: Game | null
  createProgressBar: (percent: number, width?: number) => string
  describeProgress: (progress: DownloadProgress) => string
  downloadProgresses: Record<string, DownloadProgress>
  formatHomeDate: (value?: string) => string
  games: Game[]
  gamesError: string | null
  gamesLoading: boolean
  genshinFpsUnlockOptions: readonly string[]
  getGameImporter: (game: Game) => string | null
  getPlaceholderLabel: (name: string) => string
  handleAddManualGame: () => Promise<void>
  handleAddMod: (game: Game, mode: 'file' | 'directory') => Promise<void>
  handleBrowseManualExecutable: () => Promise<void>
  handleCatalogBrowse: (entry: CatalogEntry) => Promise<void>
  handleCatalogCancel: (entry: CatalogEntry) => Promise<void>
  handleCatalogLocateBrowse: (entry: CatalogEntry) => Promise<void>
  handleCatalogLocateConfirm: (entry: CatalogEntry) => Promise<void>
  handleCatalogStart: (entry: CatalogEntry) => Promise<void>
  handleChangeCoverImage: () => Promise<void>
  handleDeleteGame: (game: Game) => Promise<void>
  handleEnableAllMods: (game: Game, enabled: boolean) => Promise<void>
  handleLaunchGame: (game: Game) => Promise<void>
  handleOpenModsFolder: (importer: string) => Promise<void>
  handleRenameMod: (game: Game, mod: Mod, customName: string) => Promise<void>
  handleRunnerDownload: () => Promise<void>
  handleSaveConfig: () => Promise<void>
  handleSteamRuntimeInstall: () => Promise<void>
  handleToggleMod: (game: Game, mod: Mod) => Promise<void>
  handleUpdateConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>
  installedRunner: { name: string; path: string; wine: string } | null
  installedRunnerName: string | null
  isGenshinGame: (game: Pick<Game, 'slug' | 'executable'>) => boolean
  launchPreparation: LaunchPreparationState
  loadGames: () => Promise<void>
  manualGameForm: ManualGameForm
  modsByGame: Record<string, Mod[]>
  config: AppConfig | null
  onOpenSystemPath: (path: string) => void
  onSelectNode: (selection: Selection) => void
  quickPicks: Game[]
  runners: DetectedRunner[]
  runnerDownloading: boolean
  runnerError: string | null
  runnerProgress: number
  runningGames: Set<string>
  savingConfig: boolean
  selectedCatalog: CatalogEntry | null
  selectedGame: Game | null
  selectedNode: Selection
  setCatalogForms: Dispatch<SetStateAction<Record<CatalogId, CatalogFormState>>>
  setConfigDraft: Dispatch<SetStateAction<GameConfigDraft | null>>
  setManualGameForm: Dispatch<SetStateAction<ManualGameForm>>
  steamrtDownloading: boolean
  steamrtError: string | null
  steamrtProgress: number
  steamrtStatus: { installed?: boolean } | null
}

export function AppDetailPane({
  catalogDetails,
  catalogForms,
  configDraft,
  configLoaded,
  configLoading,
  continueGame,
  createProgressBar,
  describeProgress,
  downloadProgresses,
  formatHomeDate,
  games,
  gamesError,
  gamesLoading,
  genshinFpsUnlockOptions,
  getGameImporter,
  getPlaceholderLabel,
  handleAddManualGame,
  handleAddMod,
  handleBrowseManualExecutable,
  handleCatalogBrowse,
  handleCatalogCancel,
  handleCatalogLocateBrowse,
  handleCatalogLocateConfirm,
  handleCatalogStart,
  handleChangeCoverImage,
  handleDeleteGame,
  handleEnableAllMods,
  handleLaunchGame,
  handleOpenModsFolder,
  handleRenameMod,
  handleRunnerDownload,
  handleSaveConfig,
  handleSteamRuntimeInstall,
  handleToggleMod,
  handleUpdateConfig,
  installedRunner,
  installedRunnerName,
  isGenshinGame,
  launchPreparation,
  loadGames,
  manualGameForm,
  modsByGame,
  config,
  onOpenSystemPath,
  onSelectNode,
  quickPicks,
  runners,
  runnerDownloading,
  runnerError,
  runnerProgress,
  runningGames,
  savingConfig,
  selectedCatalog,
  selectedGame,
  selectedNode,
  setCatalogForms,
  setConfigDraft,
  setManualGameForm,
  steamrtDownloading,
  steamrtError,
  steamrtProgress,
  steamrtStatus,
}: AppDetailPaneProps): JSX.Element {
  if (gamesLoading || configLoading) {
    return (
      <div className="tui-terminal-panel tui-terminal-full">
        loading nekomimi workspace...
      </div>
    )
  }

  if (gamesError) {
    return (
      <div className="tui-terminal-panel tui-terminal-full">
        <div className="tui-terminal-header">&gt; ERROR</div>
        <div className="tui-meta-line tui-error">{gamesError}</div>
        <div className="tui-action-row">
          <button className="tui-command" onClick={() => void loadGames()} type="button">
            [RETRY]
          </button>
        </div>
      </div>
    )
  }

  if (selectedNode.type === 'home') {
    return (
      <HomePanel
        configLoaded={configLoaded}
        continueGame={continueGame}
        dataFolderPath={config?.paths.base ?? null}
        downloadProgresses={downloadProgresses}
        formatHomeDate={formatHomeDate}
        games={games}
        getGameImporter={getGameImporter}
        installedRunnerName={installedRunnerName}
        modsByGame={modsByGame}
        onLaunchGame={handleLaunchGame}
        onOpenModsFolder={handleOpenModsFolder}
        onOpenSystemPath={onOpenSystemPath}
        onSelectNode={onSelectNode}
        quickPicks={quickPicks}
        runningGames={runningGames}
        steamRuntimeInstalled={!!steamrtStatus?.installed}
      />
    )
  }

  if (selectedNode.type === 'settings') {
    return (
      <SettingsPanel
        config={config}
        configLoading={configLoading}
        createProgressBar={createProgressBar}
        installedRunner={installedRunner}
        onOpenSystemPath={onOpenSystemPath}
        onRunnerDownload={handleRunnerDownload}
        onSteamRuntimeInstall={handleSteamRuntimeInstall}
        onUpdateConfig={handleUpdateConfig}
        runnerDownloading={runnerDownloading}
        runnerError={runnerError}
        runnerProgress={runnerProgress}
        steamrtDownloading={steamrtDownloading}
        steamrtError={steamrtError}
        steamrtProgress={steamrtProgress}
        steamrtStatus={steamrtStatus}
      />
    )
  }

  if (selectedNode.type === 'add-game') {
    return (
      <AddGamePanel
        form={manualGameForm}
        runners={runners}
        onBrowseExecutable={handleBrowseManualExecutable}
        onChange={(updates) => setManualGameForm((current) => ({ ...current, ...updates }))}
        onSubmit={handleAddManualGame}
      />
    )
  }

  if (selectedNode.type === 'catalog' && selectedCatalog) {
    const details = catalogDetails[selectedCatalog.id]
    const form = catalogForms[selectedCatalog.id]
    const progress = downloadProgresses[selectedCatalog.id] ?? null
    const installedGame = findInstalledCatalogGame(games, selectedCatalog)

    return (
      <CatalogPanel
        createProgressBar={createProgressBar}
        describeProgress={describeProgress}
        details={details}
        entry={selectedCatalog}
        form={form}
        installedGame={installedGame}
        onBrowse={() => handleCatalogBrowse(selectedCatalog)}
        onCancel={() => handleCatalogCancel(selectedCatalog)}
        onInstallDirChange={(value) => setCatalogForms((current) => ({
          ...current,
          [selectedCatalog.id]: { ...current[selectedCatalog.id], installDir: value },
        }))}
        onLocateBrowse={() => handleCatalogLocateBrowse(selectedCatalog)}
        onLocateConfirm={() => handleCatalogLocateConfirm(selectedCatalog)}
        onLocatePrefixChange={(value) => setCatalogForms((current) => ({
          ...current,
          [selectedCatalog.id]: { ...current[selectedCatalog.id], locatePrefix: value },
        }))}
        onModeChange={(mode) => setCatalogForms((current) => ({
          ...current,
          [selectedCatalog.id]: { ...current[selectedCatalog.id], mode },
        }))}
        onStart={() => handleCatalogStart(selectedCatalog)}
        progress={progress}
      />
    )
  }

  if (!selectedGame) {
    return (
      <div className="tui-terminal-panel tui-terminal-full">
        select a node from the file tree
      </div>
    )
  }

  const importer = getGameImporter(selectedGame)
  const mods = modsByGame[selectedGame.id] ?? []
  const mappedCatalog = findCatalogEntryForGame(selectedGame) ?? null
  const relatedProgress = mappedCatalog ? downloadProgresses[mappedCatalog.id] : null
  const modsSelected = selectedNode.type === 'mods' && selectedNode.gameId === selectedGame.id
  const configSelected = selectedNode.type === 'config' && selectedNode.gameId === selectedGame.id

  return (
    <GameDetailPanel
      configPanel={
        <GameConfigPanel
          configDraft={configDraft}
          game={selectedGame}
          inline
          isGenshinGame={isGenshinGame}
          onChangeCoverImage={handleChangeCoverImage}
          onOpenSystemPath={onOpenSystemPath}
          onSaveConfig={handleSaveConfig}
          runners={runners}
          savingConfig={savingConfig}
          setConfigDraft={setConfigDraft}
          genshinFpsUnlockOptions={genshinFpsUnlockOptions}
        />
      }
      configSelected={configSelected}
      createProgressBar={createProgressBar}
      describeProgress={describeProgress}
      game={selectedGame}
      getPlaceholderLabel={getPlaceholderLabel}
      importer={importer}
      launchPreparation={launchPreparation}
      mappedCatalog={mappedCatalog}
      mods={mods}
      modsPanel={
        <GameModsPanel
          game={selectedGame}
          importer={importer}
          inline
          mods={mods}
          onAddMod={handleAddMod}
          onEnableAllMods={handleEnableAllMods}
          onOpenModsFolder={handleOpenModsFolder}
          onRenameMod={handleRenameMod}
          onToggleMod={handleToggleMod}
        />
      }
      modsSelected={modsSelected}
      onDeleteGame={handleDeleteGame}
      onLaunchGame={handleLaunchGame}
      onSelectNode={onSelectNode}
      onStartCatalogUpdate={handleCatalogStart}
      relatedProgress={relatedProgress}
      runningGames={runningGames}
    />
  )
}
