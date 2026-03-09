# XXMI Launch Notes

## Importer Auto-Install — SOLVED

When an importer (e.g. ZZMI) is not installed, XXMI shows a blocking damage/restore dialog
even with `--nogui --xxmi ZZMI`. The fix is to pre-download and extract the importer package
files before launching XXMI, so `d3dx.ini` is already on disk and the damage check passes silently.

**Implementation in `mod-manager.ts` — `downloadImporter(importer, onProgress)`:**

Two GitHub packages are needed per importer:

1. **`{IMPORTER}-Package`** — provides `d3dx.ini`, `Core/`, `Mods/`, `ShaderFixes/`
2. **`XXMI-Libs-Package`** (SpectrumQT) — provides `d3d11.dll`, `d3dcompiler_47.dll`

**Correct GitHub repos** (not all under SpectrumQT):
| Importer | Repo |
|----------|------|
| GIMI | `SilentNightSound/GIMI-Package` |
| SRMI | `SpectrumQT/SRMI-Package` |
| ZZMI | `leotorrez/ZZMI-Package` |
| EFMI | `SpectrumQT/EFMI-Package` |
| HIMI | `leotorrez/HIMI-Package` |
| WWMI | `SpectrumQT/WWMI-Package` |

**Zip structure:** all `{IMPORTER}-Package` zips are **flat** — `d3dx.ini` is at the root with
no `IMPORTER/` wrapper folder. Extract to `xxmiDir/{IMPORTER}/`, not `xxmiDir/`.

**XXMI-Libs zip structure:** DLLs (`d3d11.dll`, `d3dcompiler_47.dll`) are at the root.
Extract to `xxmiDir/{IMPORTER}/`. If another importer is already installed, copy DLLs from
there instead of re-downloading.

**Flow in `launchGameWithXXMI`:**
1. Download XXMI if not installed
2. If `!isImporterInstalled(importer)` (checks for `xxmiDir/{IMPORTER}/d3d11.dll`):
   - Call `downloadImporter(importer)` — Phase 1 (importer package) + Phase 2 (libs)
3. `configureImporterGameFolder` — sets `game_folder`, `process_start_method: 'Shell'`,
   `custom_launch_inject_mode`, and seeds `Importers[importer]` stub if section is missing
4. `ensureLinuxCompatibility` — enforces Shell + Hook/Inject on every launch

**Config stub seeded when importer is freshly installed:**
```json
"Importers": {
  "ZZMI": {
    "Importer": {
      "game_folder": "Z:/path/to/game",
      "process_start_method": "Shell",
      "custom_launch_inject_mode": "Hook"
    }
  }
}
```

---

## GIMI Inject Mode (Genshin)

GIMI must use `Inject` mode, not `Hook` mode.

**Why:** Hook mode starts the game and waits up to 30s for its window to appear
before injecting. On Wayland, Genshin's (Unity 2017) window is not detectable by
XXMI's `wait_for_window`, causing a timeout and "Failed to start GenshinImpact.exe".

SRMI (Star Rail / Unreal Engine) works fine with Hook mode — its window is detectable.

**Fix applied in `mod-manager.ts`:**
```typescript
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
