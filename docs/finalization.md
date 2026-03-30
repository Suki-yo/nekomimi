# Finalization: Plans 06-09 Closeout

Date: March 29, 2026  
Repo: `/home/jyq/dev/suki-yo/nekomimi`

This document captures the remaining closeout work after the 9-plan refactor. Plans 01-05 are complete. Plans 06-09 have residual cleanup or follow-up work, but the situation is no longer "everything here is untouched" and should be tracked accurately.

## Status Snapshot

| Plan | Status | Current reality |
|------|--------|-----------------|
| 06. Game Launcher Split | Mostly complete | `game-launcher.ts` was split successfully; one duplicate tilde-expansion helper remains in `games.handler.ts`. |
| 07. Config Migration Trim | Partially complete | Path migration was extracted and validation caches were added, but validation is still multi-pass and cache invalidation is missing. |
| 08. RAR File Dialog Fix | Not started | File dialog still only shows archive filters, and missing-`7z` failures still surface as raw spawn errors. |
| 09. AI Code Smell Reduction | Partially complete | Some incidental cleanup landed, but banner comments, repeated error-string code, silent catches, and unnecessary `return await` remain. |

## Plan 06: Game Launcher Split

### What is already done

- `process-monitor.ts` exists and owns process discovery / exit tracking.
- `game-launch-hooks.ts` exists and holds game-specific launch preparation.
- `expandHome()` already exists in `src/main/services/paths.ts` and is used by other launcher/download paths.

### Remaining work

`src/main/ipc/games.handler.ts` still defines a local:

```ts
const expandTilde = (p: string) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)
```

That wrapper duplicates behavior already centralized in `expandHome()`.

Finish this by:

- Importing `expandHome` from `src/main/services/paths.ts`
- Replacing all `expandTilde()` call sites in `game:add`
- Removing now-unused `os` / `path` imports if they become unnecessary
- Leaving the default generated prefix behavior intact

### Acceptance criteria

- No local tilde-expansion helper remains in `src/main/ipc/games.handler.ts`
- `game:add` still accepts `~/...` inputs for directory, executable, runner path, and prefix
- Path normalization logic lives in one shared helper only

## Plan 07: Config Migration Trim

### What is already done

- Migration work was moved out of the hot path into `src/main/services/game-config-migration.ts`
- `src/main/services/config.ts` now has:
  - `protonRunnerResolutionCache`
  - `protonPrefixResolutionCache`
- Repeated loads of the same broken/valid runner or prefix can now reuse an in-memory resolution

### Remaining work

The current implementation still does more filesystem work than necessary on first resolution:

- `resolveValidProtonRunner()` inspects the current runner, then `findReplacementProtonRunner()` scans the runners directory again and re-inspects candidates
- `resolveValidProtonPrefix()` normalizes the prefix, inspects it, then `findReplacementProtonPrefix()` scans sibling prefixes and re-inspects candidates

The cache also never clears when config data is rewritten.

Finish this by:

- Refactoring runner validation into a single directory pass that collects the candidate metadata once, then chooses the best replacement from that in-memory result
- Refactoring prefix validation the same way
- Clearing the runner/prefix resolution caches on explicit config writes that can change those paths, primarily `saveGameConfig()`
- Preserving the current replacement behavior:
  - prefer same-family Proton runner matches when possible
  - prefer the newest valid sibling prefix by `mtimeMs`

### Notes

The existing caches are still useful and should not be removed. The remaining gap is first-load cost and stale cache lifetime, not absence of caching.

### Acceptance criteria

- A broken runner or prefix is resolved with one directory enumeration per candidate pool, not repeated inspect-then-rescan logic
- Saving a game config invalidates cached resolutions that could now be stale
- Existing migration behavior stays unchanged for valid paths and remapped managed paths

## Plan 08: RAR File Dialog Fix

### Current problem

The mod import dialog in `src/main/ipc/dialog.handler.ts` only exposes:

```ts
[{ name: "Archives", extensions: ["zip", "7z", "rar"] }]
```

On some desktop/file-picker combinations this makes `.rar` selection unreliable or invisible unless the user changes filters manually.

Separately, missing `7z` currently bubbles up as a raw spawn error. That affects more than one path:

- `src/main/services/mod-manager.ts` for `.7z` / `.rar` mod imports
- `src/main/services/download/index.ts` for archive extraction during downloads

### Remaining work

#### 8a. Add an escape-hatch filter

Change the mod-source picker to:

```ts
filters: mode === 'directory'
  ? undefined
  : [
      { name: 'Archives', extensions: ['zip', '7z', 'rar'] },
      { name: 'All Files', extensions: ['*'] },
    ]
```

#### 8b. Make missing `7z` actionable

Detect `ENOENT` / command-not-found from the extractor process and return a useful message instead of the raw spawn failure.

Recommended wording:

- Mod import path: `7z is required to extract .7z and .rar archives. Install p7zip or 7zip.`
- Download extraction path: similar wording is acceptable, but it should still explicitly tell the user to install `p7zip` or `7zip`

### Acceptance criteria

- Users can select `.rar` files even when the archive filter is not honored well by the system picker
- Missing `7z` produces an actionable installation message instead of `spawn 7z ENOENT`
- Both mod import and download extraction paths are covered

## Plan 09: AI Code Smell Reduction

This plan is now a cleanup sweep, not a major refactor. It should be done last so it does not create noise during behavior changes.

### 9a. Remove banner / narrating comments

Still present in multiple files, including:

- `src/main/ipc/config.handler.ts`
- `src/main/ipc/download.handler.ts`
- `src/main/ipc/games.handler.ts`
- `src/main/ipc/image.handler.ts`
- `src/main/services/config.ts`
- `src/main/services/download/index.ts`
- `src/main/services/download/wuwa-download.ts`
- `src/main/services/steamrt.ts`

Remove comments that only restate the next line or the filename/section name.

### 9b. Add a shared error-message helper

There is still no shared helper for the repeated pattern:

```ts
err instanceof Error ? err.message : String(err)
```

Introduce one small renderer-safe shared helper and replace the obvious duplicates first. Representative call sites currently include:

- `src/main/services/mod-manager.ts`
- `src/main/services/download/index.ts`
- `src/main/services/download/wuwa-download.ts`
- `src/main/services/steamrt.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/pages/Library.tsx`

This will likely also clean up several API helpers under `src/main/services/download/`.

### 9c. Audit silent catches

Empty catches still exist in the key files originally called out:

- `src/main/services/mod-manager.ts`
- `src/main/ipc/dialog.handler.ts`
- `src/main/services/config.ts`
- `src/main/services/process-monitor.ts`
- `src/main/services/twintail-import.ts`

Intentional best-effort examples should be marked as such:

- folder probing in `dialog.handler.ts`
- unreadable/binary replacement targets in `twintail-import.ts`
- `ps` or PID liveness probes in `process-monitor.ts`
- optional file existence probes in `config.ts` / `mod-manager.ts`

User-triggered operations should not silently swallow failures without at least logging them.

### 9d. Remove unnecessary `return await`

The original primary target is still open in `src/main/ipc/download.handler.ts`.

There are also additional candidates in the current tree, including:

- `src/main/services/download/index.ts`
- `src/main/services/download/hoyo-api.ts`

Only remove `return await` where there is no `try` / `catch` / `finally` behavior relying on it.

### Acceptance criteria

- Low-value comments are removed without harming readability
- Common error-string formatting is centralized
- Every empty catch is either documented as best-effort or replaced with logging / surfaced failure
- Unnecessary `return await` usage is trimmed without changing control flow

## Recommended Execution Order

1. Plan 08 first, because it fixes an immediate user-facing import failure path.
2. Plan 06 next, because it is trivial and removes leftover duplication.
3. Plan 07 after that, because it changes validation internals and should be done with focused review.
4. Plan 09 last, because it is mostly cleanup and should not obscure behavior changes in review.

## Done Definition

This closeout is complete when:

- `docs/overview.md` can be updated to mark Plans 06-09 complete
- No item in this file still describes known remaining work
- The user-facing behavior changes in Plan 08 are manually verified
- The refactor leftovers in Plans 06, 07, and 09 no longer show up as obvious follow-up notes during code review
