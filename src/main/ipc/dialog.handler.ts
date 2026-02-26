import { ipcMain, dialog } from "electron";

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
}
