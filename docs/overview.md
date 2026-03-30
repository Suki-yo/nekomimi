# Refactoring Overview

Summary of the 9-plan refactoring effort to reduce duplication, improve modularity, and clean up the nekomimi codebase.

## Plan 01: HTTP Utility Consolidation — COMPLETE

Consolidated ~200 lines of duplicate HTTP code (4 `fetchJSON()` implementations, 5 `followRedirect()` implementations, duplicated constants) into shared utilities in `download/utils.ts`. All API files now import `fetchJSON`, `downloadStream`, `REQUEST_TIMEOUT_MS`, and `USER_AGENT` from one place.

## Plan 02: Install Modal Unification — COMPLETE

Merged 3 near-identical install modal components (~1200 lines total) into a single generic `GameInstallModal.tsx` (~450 lines) driven by an `InstallConfig` prop. Deleted `WuwaInstallModal.tsx` and `EndfieldInstallModal.tsx`.

## Plan 03: Download Handler Deduplication — COMPLETE

Replaced 3 copy-pasted download handler blocks with a `registerDownloadStartHandler()` factory. Each game's handler is now a one-liner. `expandHome()` extracted to `paths.ts`.

## Plan 04: App.tsx Decomposition — COMPLETE

Broke the 2679-line monolithic `App.tsx` into focused modules. Game catalog data moved to `data/catalog.ts`. State/logic extracted into custom hooks (`useGameLaunch`, `useDownloadManager`, `useModManager`, `useGameConfig`, `useStatusBar`, etc.). App.tsx is now ~499 lines — a shell that wires hooks to components.

## Plan 05: Mod Manager Cleanup — COMPLETE

Replaced 4 separate mapping objects with a unified `GAME_MOD_REGISTRY` in `game-registry.ts`. WuWa-specific logic (~200 lines) extracted to `wuwa-mod-config.ts`. Adding a new game is now one registry entry. `mod-manager.ts` reduced from 1366 to ~1172 lines.

## Plan 06: Game Launcher Split — 85%

Extracted process monitor to `process-monitor.ts` (~200 lines). Game-specific launch hooks moved to `game-launch-hooks.ts`. Hardcoded dev path removed. `game-launcher.ts` reduced from 718 to ~375 lines. Remaining: `expandTilde()` in `games.handler.ts` still duplicates `expandHome()`.

## Plan 07: Config Migration Trim — 50%

Migration code extracted to `game-config-migration.ts` and removed from the hot path. Remaining: validation chains still make ~20 filesystem calls per config load; no caching of runner/prefix validation.

## Plan 08: RAR File Dialog Fix — NOT STARTED

No changes made. Needs: "All Files" fallback filter in file dialog, actionable error message for missing `7z` binary.

## Plan 09: AI Code Smell Reduction — 30%

Some cleanup done incidentally by earlier plans. Remaining: banner comments, repeated `err instanceof Error ? err.message : String(err)` pattern (~8 sites), silent catches not audited/documented, duplicate `expandTilde()` wrapper, unnecessary `return await`.
