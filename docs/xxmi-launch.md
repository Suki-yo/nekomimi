# XXMI Launch Notes

## Importer Auto-Install (TODO)

Currently, if an importer (e.g. GIMI for Genshin) is not installed, XXMI shows an
error dialog and fails. The fix should live in `launchGameWithXXMI` in
`src/main/services/mod-manager.ts`, mirroring the existing XXMI auto-download logic:

```typescript
// Around line 388 — after XXMI itself is checked:
if (!isImporterInstalled(importer)) {
  // Run XXMI in GUI mode once to trigger auto-download of the importer
  // OR: download the importer package directly from GitHub
}
```

`isImporterInstalled(importer)` should check that the importer directory has its
critical file (e.g. `GIMI/d3dx.ini`, `SRMI/d3dx.ini`).

Workaround: manually run XXMI Launcher in GUI mode (without `--nogui`) with the
correct env vars — XXMI will auto-download the missing importer on startup.

---

## GIMI Inject Mode (Genshin)

GIMI must use `Inject` mode, not `Hook` mode.

**Why:** Hook mode starts the game and waits up to 30s for its window to appear
before injecting. On Wayland, Genshin's (Unity 2017) window is not detectable by
XXMI's `wait_for_window`, causing a timeout and "Failed to start GenshinImpact.exe".

SRMI (Star Rail / Unreal Engine) works fine with Hook mode — its window is detectable.

**Fix applied in `mod-manager.ts`:**
```typescript
// EFMI and GIMI require Inject mode
const useHookMode = importer !== 'EFMI' && importer !== 'GIMI'
const targetMode = useHookMode ? 'Hook' : 'Inject'
```

---

## Genshin Window Visibility (Wayland)

Genshin Impact (Unity 2017) runs successfully under proton-cachyos but its window
does not appear on Wayland without XXMI/GIMI. The game fully initializes (login,
server select, resource download) but the window is invisible to the compositor.

Star Rail (Unreal Engine) does not have this issue.

Root cause: unknown — likely Unity 2017's X11 window creation is not being surfaced
by the Wayland compositor correctly.

**Working config** (`dev-data/games/genshinimpact.yml`):
```yaml
runner:
  type: proton
  path: dev-data/runners/proton-cachyos
  prefix: /path/to/prefixes/genshin/pfx
launch:
  env:
    STEAM_COMPAT_CONFIG: noxalia
    WINEDLLOVERRIDES: wintrust=b;dbghelp=n,b
    STUB_WINTRUST: "1"
    BLOCK_FIRST_REQ: "1"
  args: -screen-fullscreen 0
mods:
  enabled: true
  importer: GIMI
```

**Required:** Genshin game directory must contain a patched `dbghelp.dll` that stubs
`wine_get_version`, stubs wintrust, and blocks the first network request. The existing
`dbghelp.dll` shipped with the game install handles this.

Note: Twintail manifest (`hk4e_global.json`) sets `stub_wintrust: false` and
`block_first_req: false` — those compat_overrides apply at the Twintail layer, not
the DLL layer. The DLL reads `STUB_WINTRUST`/`BLOCK_FIRST_REQ` env vars directly.
