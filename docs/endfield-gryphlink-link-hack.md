# Endfield Gryphlink Path Link Hack

Workaround for Gryphlink's broken settings/install-path UI under Wine/Proton.

## Problem

Gryphlink expects Endfield at:

```text
C:\Program Files\GRYPHLINK\games\EndField Game
```

Under Linux, the actual game install lives at:

```text
/home/jyq/Games/Endfield
```

The intended launcher flow is to change Gryphlink's install path to:

```text
Z:\home\jyq\Games\Endfield
```

but the settings UI can render incorrectly under Wine/Proton, making the path
picker unusable. If the user presses Install before changing the path, Gryphlink
creates a tiny stub folder in the fake `C:` path and then treats that as the
official install location.

## Current Hack

Replace Gryphlink's default game directory inside the prefix with a symlink to
the real Linux install:

```text
/home/jyq/Games/prefixes/endfield/pfx/drive_c/Program Files/GRYPHLINK/games/EndField Game
-> /home/jyq/Games/Endfield
```

This makes Gryphlink believe its default `C:` install path contains the actual
game, so Verify / Repair / Update act on the real files without needing the UI
path selector.

## Safe Procedure

1. Ensure Gryphlink is fully closed.
2. Inspect the fake install path:

```bash
find '/home/jyq/Games/prefixes/endfield/pfx/drive_c/Program Files/GRYPHLINK/games/EndField Game' -maxdepth 3 -mindepth 1
```

3. If it is only a stub, move it aside and create the symlink:

```bash
mv '/home/jyq/Games/prefixes/endfield/pfx/drive_c/Program Files/GRYPHLINK/games/EndField Game' \
  '/home/jyq/Games/prefixes/endfield/pfx/drive_c/Program Files/GRYPHLINK/games/EndField Game.stub-backup'

ln -s '/home/jyq/Games/Endfield' \
  '/home/jyq/Games/prefixes/endfield/pfx/drive_c/Program Files/GRYPHLINK/games/EndField Game'
```

4. Relaunch Gryphlink in the same prefix.
5. Gryphlink should now see the existing install at its default path and offer
   patching / verification instead of a fresh install.

## Notes

- Do not do this if `EndField Game` already contains real downloaded game files.
- Keep the launcher and the game on the same prefix every time; the launcher's
  metadata is stored in the prefix under `AppData/LocalLow/Gryphline/`.
- This is a launcher compatibility workaround, not a proper install-management
  flow.

## Future Nekomimi Fix

Nekomimi should eventually handle this automatically instead of relying on a
manual symlink hack.

Desired behavior:

1. Detect Gryphlink-managed Endfield installs in an existing Proton prefix.
2. If Gryphlink is pinned to the fake `C:` path but the real game exists
   elsewhere, offer a repair/import flow.
3. Create and manage the path mapping in a controlled way, with validation.
4. Surface the launcher-managed update flow directly in the UI.
5. Remove the need to interact with Gryphlink's broken settings page at all.
