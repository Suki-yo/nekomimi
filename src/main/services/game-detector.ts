import * as path from "path";
import * as fs from "fs";
import { getPaths } from "./paths";

export interface DetectedGameInfo {
  name: string;
  executable: string;
  directory: string;
  prefix: string | null;
}

export interface DetectedRunner {
  name: string;
  type: "wine" | "proton";
  path: string;
}

// Walk up from exe path to find Wine prefix
function detectPrefix(exePath: string): string | null {
  let current = path.dirname(exePath);
  const root = path.parse(current).root;

  while (current !== root) {
    // Check for Wine prefix indicators
    const driveC = path.join(current, "drive_c");
    const dosdevices = path.join(current, "dosdevices");
    const pfx = path.join(current, "pfx");

    const hasDriveC = fs.existsSync(driveC);
    const hasDosdevices = fs.existsSync(dosdevices);
    const hasPfx = fs.existsSync(pfx);

    // Check if we're already inside a drive_c directory
    // (e.g., /prefix/drive_c/Program Files/Game) - if so, skip this level
    // because some games have their own fake drive_c/dosdevices inside
    const insideDriveC = current.includes("/drive_c/");

    if (!insideDriveC && hasDriveC && hasDosdevices) {
      return current;
    }
    // Proton-style: prefix is inside pfx folder
    if (!insideDriveC && hasPfx && fs.existsSync(path.join(pfx, "drive_c"))) {
      return pfx;
    }

    current = path.dirname(current);
  }

  return null;
}

export function detectGame(exePath: string): DetectedGameInfo {
  // Get game name from exe filename (without .exe)
  const name = path.basename(exePath, ".exe");

  // Detect prefix by walking up directories
  const prefix = detectPrefix(exePath);

  // Directory is where the exe lives
  const directory = path.dirname(exePath);

  return {
    name,
    executable: exePath,
    directory,
    prefix,
  };
}

// Proton directories to scan
const PROTON_DIRS = [
  "~/.steam/steam/compatibilitytools.d",
  "~/.local/share/Steam/compatibilitytools.d",
];

export function detectRunners(): DetectedRunner[] {
  const runners: DetectedRunner[] = [];
  const home = process.env.HOME || "";
  const paths = getPaths();

  // Scan for Proton versions
  for (const dir of PROTON_DIRS) {
    const protonDir = dir.replace("~", home);
    if (fs.existsSync(protonDir)) {
      for (const name of fs.readdirSync(protonDir)) {
        const protonPath = path.join(protonDir, name);
        const wineBin = path.join(protonPath, "files/bin/wine");
        if (fs.existsSync(wineBin)) {
          runners.push({ name, type: "proton", path: protonPath });
        }
      }
    }
  }

  // Scan our runners directory
  const ourRunnersDir = path.join(paths.base, "runners");
  if (fs.existsSync(ourRunnersDir)) {
    for (const name of fs.readdirSync(ourRunnersDir)) {
      const runnerPath = path.join(ourRunnersDir, name);
      const wineBin = path.join(runnerPath, "files/bin/wine");
      if (fs.existsSync(wineBin)) {
        runners.push({ name, type: "proton", path: runnerPath });
      }
    }
  }

  // Check for system Wine
  const systemWine = "/usr/bin/wine";
  if (fs.existsSync(systemWine)) {
    runners.push({ name: "System Wine", type: "wine", path: systemWine });
  }

  return runners;
}
