/**
 * Preload bridge.
 *
 * Exposes exactly the methods in `CreatorApi` on `window.creator` and nothing
 * else. No raw `ipcRenderer`, no Node primitives — the renderer can only do
 * what this file names.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { CreatorApi, LiveStatus } from '@shared/ipc';
import { CHANNELS } from '@shared/ipc';

/** Wraps a push channel so callers get an unsubscribe function. */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: CreatorApi = {
  openPack: () => ipcRenderer.invoke(CHANNELS.openPack),
  openPackAt: (path) => ipcRenderer.invoke(CHANNELS.openPackAt, path),
  savePack: (path, pack) => ipcRenderer.invoke(CHANNELS.savePack, path, pack),
  recentPacks: () => ipcRenderer.invoke(CHANNELS.recentPacks),

  detectTsh: () => ipcRenderer.invoke(CHANNELS.detectTsh),
  chooseTshFolder: () => ipcRenderer.invoke(CHANNELS.chooseTshFolder),
  listLayouts: (layoutDir) => ipcRenderer.invoke(CHANNELS.listLayouts, layoutDir),
  readLayout: (layoutPath) => ipcRenderer.invoke(CHANNELS.readLayout, layoutPath),

  writeFiles: (request) => ipcRenderer.invoke(CHANNELS.writeFiles, request),
  exportZip: (pack, files) => ipcRenderer.invoke(CHANNELS.exportZip, pack, files),

  connectLive: (url) => ipcRenderer.invoke(CHANNELS.connectLive, url),
  disconnectLive: () => ipcRenderer.invoke(CHANNELS.disconnectLive),
  onLiveData: (handler) => subscribe<unknown>(CHANNELS.liveData, handler),
  onLiveStatus: (handler) => subscribe<LiveStatus>(CHANNELS.liveStatus, handler),

  revealInFolder: (path) => ipcRenderer.invoke(CHANNELS.revealInFolder, path),
  appVersion: () => ipcRenderer.invoke(CHANNELS.appVersion),
};

contextBridge.exposeInMainWorld('creator', api);
