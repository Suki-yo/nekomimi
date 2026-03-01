import { ipcMain, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";

// Find a pictures folder by traversing up and down from a starting directory
function findPicturesFolder(startDir: string): string | null {
  const picturesNames = ['pictures', 'Images', 'images', 'Photos', 'photos', 'Wallpapers', 'wallpapers'];

  // Check if current directory has a pictures subfolder
  const checkForPicturesSubfolder = (dir: string): string | null => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && picturesNames.some(name => entry.name.toLowerCase() === name.toLowerCase())) {
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
    const found = checkForPicturesSubfolder(currentDir);
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
        const found = checkForPicturesSubfolder(path.join(startDir, entry.name));
        if (found) return found;
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

export function registerDialogHandlers() {
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
    // Try to find a pictures folder
    let startDir = defaultPath || process.env.HOME || '/';
    const picturesFolder = findPicturesFolder(startDir);

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
}
