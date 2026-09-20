/**
 * Electron main process.
 *
 * Owns every privileged operation. The renderer is sandboxed with no Node
 * integration; everything it needs comes through the typed IPC surface in
 * `@shared/ipc`.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pack } from '@shared/model/pack';
import type { EmittedFile, WriteRequest } from '@shared/ipc';
import { CHANNELS } from '@shared/ipc';
import { buildZip, readJsonFile, writeJsonFile } from './files';
import { writeFiles } from './files';
import {
  connectLive,
  detectTsh,
  disconnectLive,
  inspectInstall,
  listLayouts,
  readLayout,
} from './tsh';
import { writeFile } from 'node:fs/promises';

const dirname = fileURLToPath(new URL('.', import.meta.url));

let mainWindow: BrowserWindow | undefined;

/** Small persisted preferences file — recent packs, last TSH path. */
interface Prefs {
  recentPacks: string[];
  tshRoot?: string;
}

function prefsPath(): string {
  return join(app.getPath('userData'), 'prefs.json');
}

async function readPrefs(): Promise<Prefs> {
  try {
    return await readJsonFile<Prefs>(prefsPath());
  } catch {
    return { recentPacks: [] };
  }
}

async function rememberPack(path: string): Promise<void> {
  const prefs = await readPrefs();
  prefs.recentPacks = [path, ...prefs.recentPacks.filter((p) => p !== path)].slice(0, 10);
  await writeJsonFile(prefsPath(), prefs);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#12111c',
    show: false,
    webPreferences: {
      preload: join(dirname, '../preload/index.mjs'),
      // The renderer handles only the model and the editor UI; it has no
      // business touching Node directly.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // External links open in the user's browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (devServer) {
    void mainWindow.loadURL(devServer);
  } else {
    void mainWindow.loadFile(join(dirname, '../renderer/index.html'));
  }
}

function send(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function registerHandlers(): void {
  // ── Pack persistence ───────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.openPack, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open pack',
      filters: [{ name: 'Layout pack', extensions: ['tshpack', 'json'] }],
      properties: ['openFile'],
    });
    const path = result.filePaths[0];
    if (result.canceled || !path) return undefined;
    const pack = await readJsonFile<Pack>(path);
    await rememberPack(path);
    return { path, pack };
  });

  ipcMain.handle(CHANNELS.openPackAt, async (_e, path: string) => {
    const pack = await readJsonFile<Pack>(path);
    await rememberPack(path);
    return pack;
  });

  ipcMain.handle(
    CHANNELS.savePack,
    async (_e, path: string | undefined, pack: Pack) => {
      let target = path;
      if (!target) {
        const result = await dialog.showSaveDialog({
          title: 'Save pack',
          defaultPath: `${pack.name.replace(/[^\w-]+/g, '_')}.tshpack`,
          filters: [{ name: 'Layout pack', extensions: ['tshpack'] }],
        });
        if (result.canceled || !result.filePath) return undefined;
        target = result.filePath;
      }
      await writeJsonFile(target, pack);
      await rememberPack(target);
      return target;
    },
  );

  ipcMain.handle(CHANNELS.recentPacks, async () => (await readPrefs()).recentPacks);

  // ── TSH install ────────────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.detectTsh, async () => {
    const prefs = await readPrefs();
    if (prefs.tshRoot) {
      const remembered = inspectInstall(prefs.tshRoot);
      if (remembered.valid) return remembered;
    }
    return detectTsh();
  });

  ipcMain.handle(CHANNELS.chooseTshFolder, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select your TournamentStreamHelper folder',
      properties: ['openDirectory'],
    });
    const root = result.filePaths[0];
    if (result.canceled || !root) return undefined;

    const install = inspectInstall(root);
    if (install.valid) {
      const prefs = await readPrefs();
      prefs.tshRoot = root;
      await writeJsonFile(prefsPath(), prefs);
    }
    return install;
  });

  ipcMain.handle(CHANNELS.listLayouts, (_e, layoutDir: string) =>
    listLayouts(layoutDir),
  );
  ipcMain.handle(CHANNELS.readLayout, (_e, layoutPath: string) =>
    readLayout(layoutPath),
  );

  // ── Output ─────────────────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.writeFiles, (_e, request: WriteRequest) =>
    writeFiles(request),
  );

  ipcMain.handle(
    CHANNELS.exportZip,
    async (_e, pack: Pack, files: EmittedFile[]) => {
      const result = await dialog.showSaveDialog({
        title: 'Export pack as zip',
        defaultPath: `${pack.name.replace(/[^\w-]+/g, '_')}.zip`,
        filters: [{ name: 'Zip archive', extensions: ['zip'] }],
      });
      if (result.canceled || !result.filePath) return undefined;
      await writeFile(result.filePath, await buildZip(files));
      return result.filePath;
    },
  );

  // ── Live data ──────────────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.connectLive, (_e, url: string) =>
    connectLive(url, {
      onData: (state) => send(CHANNELS.liveData, state),
      onStatus: (status) => send(CHANNELS.liveStatus, status),
    }),
  );
  ipcMain.handle(CHANNELS.disconnectLive, () => disconnectLive());

  // ── Misc ───────────────────────────────────────────────────────────────
  ipcMain.handle(CHANNELS.revealInFolder, (_e, path: string) => {
    shell.showItemInFolder(path);
  });
  ipcMain.handle(CHANNELS.appVersion, () => app.getVersion());
}

app.whenReady().then(() => {
  registerHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void disconnectLive();
  if (process.platform !== 'darwin') app.quit();
});
