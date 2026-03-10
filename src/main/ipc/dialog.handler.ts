import { ipcMain, dialog } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function findPreferredFolder(startDir: string, names: string[]): string | null {
  const normalizedNames = names.map((name) => name.toLowerCase())

  const checkForNamedSubfolder = (dir: string): string | null => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && normalizedNames.includes(entry.name.toLowerCase())) {
          return path.join(dir, entry.name);
        }
      }
    } catch {
      // Ignore errors
    }
    return null;
  };

  // Traverse up looking for pictures folder
  let currentDir = startDir;
  for (let i = 0; i < 10; i++) { // Max 10 levels up
    const found = checkForNamedSubfolder(currentDir);
    if (found) return found;

    const parent = path.dirname(currentDir);
    if (parent === currentDir) break; // Reached root
    currentDir = parent;
  }

  // Traverse down from startDir (1 level deep)
  try {
    const entries = fs.readdirSync(startDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = checkForNamedSubfolder(path.join(startDir, entry.name));
        if (found) return found;
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

export function registerDialogHandlers() {
  let lastModSourcePath: string | null = null;

  ipcMain.handle("dialog:openFile", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Executables", extensions: ["exe", "sh", "bin"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("dialog:openImage", async (_event, { defaultPath }: { defaultPath?: string }): Promise<string | null> => {
    let startDir = defaultPath || process.env.HOME || '/';
    const picturesFolder = findPreferredFolder(startDir, ['Pictures', 'Images', 'Photos', 'Wallpapers']);

    const result = await dialog.showOpenDialog({
      defaultPath: picturesFolder || startDir,
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"] }
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("dialog:openModSource", async (_event, { defaultPath, mode }: { defaultPath?: string; mode: 'file' | 'directory' }): Promise<{ path: string; kind: 'file' | 'directory' } | null> => {
    const homeDir = process.env.HOME || os.homedir() || '/';
    const startDir = defaultPath || homeDir;
    const downloadsFolder =
      findPreferredFolder(homeDir, ['Downloads', 'Download', 'downloads', 'download']) ||
      findPreferredFolder(startDir, ['Downloads', 'Download', 'downloads', 'download']);
    const pickerRoot = lastModSourcePath || downloadsFolder || homeDir;

    const result = await dialog.showOpenDialog({
      defaultPath: pickerRoot,
      properties: mode === 'directory' ? ["openDirectory"] : ["openFile"],
      filters: mode === 'directory' ? undefined : [{ name: "Archives", extensions: ["zip", "7z"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedPath = result.filePaths[0];
    const stat = fs.statSync(selectedPath);
    lastModSourcePath = stat.isDirectory() ? selectedPath : path.dirname(selectedPath);
    return {
      path: selectedPath,
      kind: stat.isDirectory() ? 'directory' : 'file',
    };
  });
}
