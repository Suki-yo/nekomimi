# Known Issues

## Running Game Tracking Is Unreliable

The app does not consistently detect which game is currently being played.
This shows up in the `HOME` view and library state as games incorrectly
appearing idle or missing from the running list even while they are open.

**Current state:** Process tracking is still unreliable across different launch
paths, especially for games launched through Proton/XXMI wrappers where the
launcher process and the real game process do not have a stable one-to-one
mapping.

**TODO:** Rework running-game detection so it tracks the actual game process
instead of relying on launcher PID lifetime or executable-name heuristics.

## Steamrt Required for Genshin (XXMI/umu-run path)

Genshin Impact will not launch without Steam Runtime (pressure-vessel/sniper) explicitly
installed, even when going through the XXMI → umu-run path.

**umu-run does NOT auto-install steamrt.** The steamrt at `~/.local/share/umu/steamrt3`
must already be present.

**Current state:** Our steamrt auto-install in `game-launcher.ts` only covers the vanilla
proton path (mods disabled). The XXMI path bypasses that check entirely and hands off to
`umu-run`, which will silently fail if steamrt is missing.

**TODO:** Extend steamrt presence check to the XXMI launch path — if `findSteamrt()`
returns null, auto-download before calling `launchGameWithXXMI`.
