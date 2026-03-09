# Terminal UI Overhaul — Design Doc
**Date:** 2026-03-08
**Approach:** New layout shell + reused backend logic (Approach C)

---

## Overview

Complete frontend overhaul of Nekomimi to a terminal/TUI aesthetic. The visual direction is a mix of modern dark hacker and TUI-style (box-drawing characters, panels). All existing UI features are retained; only the presentation layer changes. Backend IPC, download logic, mod management, and game launch all stay untouched.

**Accent color:** Purple/violet
**Font:** Monospace throughout (JetBrains Mono or Fira Code)
**No animations** — terminals don't animate. Instant transitions only.

---

## Section 1: Overall Layout

The window is a single full-screen TUI surface divided into three horizontal bands:

```
┌─────────────────────────────────────────────────────┐
│ NEKOMIMI v0.x.x          [status]         2026-03-08 │  ← top status bar
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  FILE TREE   │         DETAIL PANE                  │
│  (left)      │         (right)                      │
│              │                                      │
│              │                                      │
├──────────────┴──────────────────────────────────────┤
│ > _                                    [idle/running]│  ← bottom bar
└─────────────────────────────────────────────────────┘
```

- **Top bar**: app name + version, global status (e.g. `[DOWNLOADING 42%]`), date/time
- **Left pane**: collapsible file-tree of games + settings nav
- **Right pane**: context-sensitive detail view
- **Bottom bar**: pseudo-command input + current game state

---

## Section 2: Left Pane (File Tree)

```
LIBRARY
├── [▶] Genshin Impact
├── [▼] Honkai: Star Rail
│   ├── mods/
│   │   ├── [✓] SilentNightSound-SRMI
│   │   └── [✗] some-other-mod
│   └── config
├── [▶] Zenless Zone Zero
├── [▶] Wuthering Waves
│
SYSTEM
└── settings
```

- `[▶]` / `[▼]` toggles expand/collapse
- `[✓]` / `[✗]` mod enabled/disabled — clickable directly in the tree
- Selecting any node updates the right pane
- Active node highlighted in purple
- All text monospace, box-drawing chars for tree lines
- Download/update indicator inline: `Genshin Impact [UPDATE]` or `Genshin Impact [52%]`

---

## Section 3: Right Pane — Game Detail View

When a game node is selected, the right pane splits vertically: cover image left, pseudo-terminal panel right.

```
┌─────────────────────────────────────────────────────┐
│  Honkai: Star Rail                                   │
├──────────────────────┬──────────────────────────────┤
│                      │ ┌──────────────────────────┐ │
│   [cover art image]  │ │ > HONKAI: STAR RAIL       │ │
│                      │ │   version  : 3.1.0        │ │
│                      │ │   runner   : proton-ge    │ │
│                      │ │   mods     : 2 active     │ │
│                      │ │   playtime : 42h          │ │
│                      │ │                           │ │
│                      │ │ ──────────────────────    │ │
│                      │ │ [PLAY]  [UPDATE]  [CFG]   │ │
│                      │ └──────────────────────────┘ │
└──────────────────────┴─┴───────────────────────────┘
```

- Cover image fills the full left half
- Right half: game metadata at top, action buttons at bottom styled as terminal commands
- `[PLAY]`, `[UPDATE]`, `[CFG]` highlight in purple on hover
- When `config` sub-node is selected, right pane shows game config (env vars, runner, prefix, etc.)

---

## Section 4: Right Pane — Mods View

When the `mods/` sub-node is selected:

```
┌─────────────────────────────────────────────────────┐
│  Honkai: Star Rail / mods                            │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ > MODS                                          │ │
│ │                                                 │ │
│ │   [✓] SilentNightSound-SRMI                     │ │
│ │   [✗] some-other-mod                            │ │
│ │   [✓] another-mod                               │ │
│ │                                                 │ │
│ │   ─────────────────────────────────────────     │ │
│ │   [OPEN MODS FOLDER]  [ADD MOD]                 │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

- Full right pane used (no cover image — mods is a utility view)
- Clicking `[✓]` / `[✗]` toggles mod (renames folder with `DISABLED_` prefix)
- `[OPEN MODS FOLDER]` opens folder in file manager
- `[ADD MOD]` opens a file picker

---

## Section 5: Right Pane — Settings View

When `settings` is selected in the tree:

```
┌─────────────────────────────────────────────────────┐
│  system / settings                                   │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ > SETTINGS                                      │ │
│ │                                                 │ │
│ │   ── runners ───────────────────────────────    │ │
│ │   default runner : proton-ge-9                  │ │
│ │   [MANAGE RUNNERS]                              │ │
│ │                                                 │ │
│ │   ── appearance ────────────────────────────    │ │
│ │   theme : purple                                │ │
│ │                                                 │ │
│ │   ── data ──────────────────────────────────    │ │
│ │   library path : ~/.local/share/nekomimi        │ │
│ │   [OPEN DATA FOLDER]                            │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Section 6: Visual System

### Typography
- Monospace font throughout: `JetBrains Mono` or `Fira Code` (ligatures off)
- No rounded corners — everything sharp/rectangular
- Box-drawing characters for all borders and dividers: `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼`

### Color Palette
```
background   #0d0d0f   near black
surface      #13131a   panel background
border       #2a2a3d   dim purple-tinted border
accent       #9d4edd   primary purple
accent-dim   #5c2d91   inactive / hover
text         #e0d7f5   off-white with purple tint
text-dim     #6b6480   secondary / metadata text
success      #50fa7b   mod enabled, download complete
error        #ff5555   mod disabled, error state
```

### Motion
- Cursor blink on bottom input bar
- Expand/collapse in tree: instant (no slide animation)
- Action feedback via bottom bar text: `> launching honkai: star rail...`

---

## Section 7: Download & Progress States

```
┌─────────────────────────────────────────────────────┐
│  Genshin Impact                                      │
├──────────────────────┬──────────────────────────────┤
│                      │ ┌──────────────────────────┐ │
│   [cover art image]  │ │ > GENSHIN IMPACT          │ │
│                      │ │   version  : 5.4.0        │ │
│                      │ │   status   : DOWNLOADING  │ │
│                      │ │                           │ │
│                      │ │   [████████░░░░░░░░] 52%  │ │
│                      │ │   1.2 GB / 2.3 GB         │ │
│                      │ │   eta : 4m 12s            │ │
│                      │ │                           │ │
│                      │ │   [PAUSE]  [CANCEL]       │ │
│                      │ └──────────────────────────┘ │
└──────────────────────┴─┴───────────────────────────┘
```

- Progress bar uses block characters (`█ ░`) — no CSS progress bars
- ETA and transfer speed shown as plain text
- Top status bar shows global state: `[DOWNLOADING GENSHIN 52%]`
- Tree node shows inline indicator: `Genshin Impact [52%]`

---

## Implementation Strategy

**Approach C — New layout shell + reused backend logic**

1. Build new TUI primitive components: `StatusBar`, `FileTree`, `DetailPane`, `TerminalPanel`, `BottomBar`
2. Rewire existing IPC hooks and state into the new components
3. Replace modals (install, config) with in-pane views
4. Keep all backend services untouched: `game-launcher.ts`, `mod-manager.ts`, `download/`, IPC handlers

No new IPC channels needed. The backend is not touched.
