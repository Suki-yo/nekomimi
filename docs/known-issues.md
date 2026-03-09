# Known Issues

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
