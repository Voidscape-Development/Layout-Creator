/**
 * TournamentStreamHelper discovery and live data.
 *
 * TSH has no registry entry or manifest, so detection is a search of the
 * places it actually gets installed, validated by the one file every install
 * has: `layout/include/globals.js`.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import type {
  DiscoveredLayout,
  ImportedLayoutFiles,
  LiveStatus,
  TshInstall,
} from '@shared/ipc';

/** The file that proves a folder really is a TSH install. */
const MARKER = join('layout', 'include', 'globals.js');

function candidateRoots(): string[] {
  const home = homedir();
  const roots: string[] = [];

  if (platform() === 'win32') {
    const drives = ['C:', 'D:', 'E:'];
    for (const drive of drives) {
      roots.push(
        join(drive, '\\', 'TournamentStreamHelper'),
        join(drive, '\\', 'TSH'),
        join(drive, '\\', 'Program Files', 'TournamentStreamHelper'),
      );
    }
    roots.push(
      join(home, 'Documents', 'TournamentStreamHelper'),
      join(home, 'Downloads', 'TournamentStreamHelper'),
      join(home, 'Desktop', 'TournamentStreamHelper'),
    );
  } else if (platform() === 'darwin') {
    roots.push(
      join('/Applications', 'TournamentStreamHelper'),
      join(home, 'Applications', 'TournamentStreamHelper'),
      join(home, 'Documents', 'TournamentStreamHelper'),
    );
  } else {
    roots.push(
      join(home, 'TournamentStreamHelper'),
      join(home, '.local', 'share', 'TournamentStreamHelper'),
      join('/opt', 'TournamentStreamHelper'),
    );
  }

  return roots;
}

export function inspectInstall(root: string): TshInstall {
  const layoutDir = join(root, 'layout');
  return {
    root,
    layoutDir,
    valid: existsSync(join(root, MARKER)),
  };
}

export async function detectTsh(): Promise<TshInstall | undefined> {
  for (const root of candidateRoots()) {
    const install = inspectInstall(root);
    if (install.valid) {
      install.version = await readVersion(root);
      return install;
    }
  }
  return undefined;
}

async function readVersion(root: string): Promise<string | undefined> {
  // TSH ships a plain-text version file in most builds; absence is fine.
  for (const name of ['version.txt', 'VERSION']) {
    try {
      const contents = await readFile(join(root, name), 'utf8');
      const trimmed = contents.trim();
      if (trimmed) return trimmed;
    } catch {
      // Not present — try the next candidate.
    }
  }
  return undefined;
}

/**
 * Layout folders inside a TSH install, for the import picker. Folders without
 * any HTML are skipped, as are the shared asset directories.
 */
const NON_LAYOUT_DIRS = new Set([
  'include',
  'fonts',
  'icons',
  'game_screenshots',
  '_packs',
]);

export async function listLayouts(layoutDir: string): Promise<DiscoveredLayout[]> {
  let entries: string[];
  try {
    entries = await readdir(layoutDir);
  } catch {
    return [];
  }

  const layouts: DiscoveredLayout[] = [];
  for (const name of entries) {
    if (NON_LAYOUT_DIRS.has(name) || name.startsWith('.')) continue;
    const path = join(layoutDir, name);
    try {
      if (!(await stat(path)).isDirectory()) continue;
      const files = await readdir(path);
      const htmlFiles = files.filter((f) => f.toLowerCase().endsWith('.html'));
      if (!htmlFiles.length) continue;
      const preview = files.find((f) => /_preview\.png$/i.test(f));
      layouts.push({
        folderName: name,
        path,
        htmlFiles,
        hasCss: files.includes('index.css'),
        hasJs: files.includes('index.js'),
        previewImage: preview ? join(path, preview) : undefined,
      });
    } catch {
      // Unreadable folder — skip rather than fail the whole listing.
    }
  }
  return layouts.sort((a, b) => a.folderName.localeCompare(b.folderName));
}

export async function readLayout(layoutPath: string): Promise<ImportedLayoutFiles> {
  const files = await readdir(layoutPath);
  const html: Record<string, string> = {};

  for (const name of files) {
    if (name.toLowerCase().endsWith('.html')) {
      html[name] = await readFile(join(layoutPath, name), 'utf8');
    }
  }

  const readOptional = async (name: string): Promise<string> => {
    try {
      return await readFile(join(layoutPath, name), 'utf8');
    } catch {
      return '';
    }
  };

  const settings = await readOptional('settings.json');
  // Official layouts ship a preview render; it's the only visual the editor
  // can show for an imported layout, which it cannot draw from a model.
  const preview = files.find((f) => /_preview\.png$/i.test(f));

  return {
    folderName: layoutPath.split(/[\\/]/).pop() ?? '',
    css: await readOptional('index.css'),
    js: await readOptional('index.js'),
    html,
    settings: settings || undefined,
    previewImage: preview ? join(layoutPath, preview) : undefined,
  };
}

/* ── Live data ──────────────────────────────────────────────────────────── */

type LiveHandlers = {
  onData: (state: unknown) => void;
  onStatus: (status: LiveStatus) => void;
};

let socket: { close: () => void } | undefined;

/** One entry of TSH's python deep-diff delta payload. */
interface Delta {
  path: (string | number)[];
  action: string;
  value: unknown;
}

/**
 * Apply a delta in place, mirroring `applyDelta()` in the layouts' globals.js
 * so the preview's copy of the state stays byte-identical to what a real
 * browser source would hold.
 */
function applyDeltas(state: Record<string, unknown>, deltas: Delta[]): void {
  for (const delta of deltas) {
    const pieces = delta.path;
    const last = pieces[pieces.length - 1];
    if (last === undefined) continue;

    let cursor: Record<string, unknown> = state;
    for (let i = 0; i < pieces.length - 1; i += 1) {
      const key = String(pieces[i]);
      if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
      cursor = cursor[key] as Record<string, unknown>;
    }

    if (delta.action === 'dictionary_item_removed') delete cursor[String(last)];
    else cursor[String(last)] = delta.value;
  }
}

/**
 * Connect to a running TSH's socket.io server. TSH sends one full
 * `program_state` on connect and `program_state_update` deltas afterwards, so
 * both must be handled or the preview freezes on the first snapshot.
 */
export async function connectLive(
  url: string,
  handlers: LiveHandlers,
): Promise<LiveStatus> {
  await disconnectLive();

  try {
    const { io } = await import('socket.io-client');
    const client = io(url, {
      transports: ['websocket'],
      timeout: 2000,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
    });

    let state: Record<string, unknown> = {};
    let maxDeltaIdx = -1;

    client.on('connect', () => handlers.onStatus({ connected: true, url }));
    client.on('disconnect', () =>
      handlers.onStatus({ connected: false, url, error: 'Disconnected' }),
    );
    client.on('connect_error', (err: Error) =>
      handlers.onStatus({ connected: false, url, error: err.message }),
    );

    client.on(
      'program_state',
      (message: { state: Record<string, unknown>; delta_index?: number }) => {
        state = message.state ?? {};
        maxDeltaIdx = message.delta_index ?? -1;
        handlers.onData(state);
      },
    );

    client.on(
      'program_state_update',
      (message: { delta_index: number; delta: Delta[] }) => {
        // Out-of-order deltas mean we lost sync; ask for a fresh snapshot
        // rather than applying them onto a state they don't describe.
        if (message.delta_index < maxDeltaIdx) {
          client.emit('program_state', {});
          return;
        }
        try {
          applyDeltas(state, message.delta ?? []);
          maxDeltaIdx = Math.max(message.delta_index, maxDeltaIdx);
          handlers.onData(state);
        } catch {
          client.emit('program_state', {});
        }
      },
    );

    socket = { close: () => client.close() };
    return { connected: false, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { connected: false, url, error: message };
  }
}

export async function disconnectLive(): Promise<void> {
  socket?.close();
  socket = undefined;
}
