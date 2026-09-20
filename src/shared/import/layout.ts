/**
 * Building a Layout from a hand-written TSH layout folder.
 *
 * The result sits in the `imported` tier: its original files are kept verbatim
 * in `importedSource`, and the editor is limited to value substitutions that
 * can be re-applied to that pristine source. Nothing here attempts to reverse
 * a stylesheet into the element model — that is the boundary we drew, and it
 * is what stops an import from quietly mangling someone's work.
 */

import type { ImportedLayoutFiles } from '../ipc';
import type { AssetSettings, Layout, Variant } from '../model/pack';
import {
  defaultImportedEdits,
  defaultLayoutSettings,
  newId,
  sanitizeFolderName,
} from '../model/pack';
import { defaultAnimation } from '../model/animation';
import { analyzeCss, bodyClassOf, hashSource } from './css';
import type { CssAnalysis } from './css';

/** Canvas size, read from the stylesheet's `body` rule where it states one. */
function detectCanvas(css: string): { width: number; height: number } {
  const bodyRule = /body\s*\{([^}]*)\}/.exec(css);
  const fallback = { width: 1920, height: 1080 };
  if (!bodyRule?.[1]) return fallback;

  const width = /(?:^|[;\s])width\s*:\s*(\d+)px/.exec(bodyRule[1]);
  const height = /(?:^|[;\s])height\s*:\s*(\d+)px/.exec(bodyRule[1]);
  if (!width?.[1] || !height?.[1]) return fallback;

  return { width: Number(width[1]), height: Number(height[1]) };
}

/**
 * Each HTML file becomes a variant. Body classes are read from the source, so
 * `scoreboard/`'s ssbu / fgc / sf6_online skins import as real variants rather
 * than as unrelated files.
 */
function buildVariants(html: Record<string, string>): Variant[] {
  const names = Object.keys(html).sort((a, b) => {
    // index.html is the layout's default and must come first.
    if (a === 'index.html') return -1;
    if (b === 'index.html') return 1;
    return a.localeCompare(b);
  });

  if (!names.length) {
    return [
      {
        id: newId(),
        name: 'Default',
        fileName: 'index.html',
        bodyClass: '',
        tokenOverrides: {},
        styleOverrides: {},
        hiddenNodeIds: [],
      },
    ];
  }

  return names.map((fileName) => ({
    id: newId(),
    name: prettifyName(fileName.replace(/\.html?$/i, '')),
    fileName,
    bodyClass: bodyClassOf(html[fileName] ?? ''),
    tokenOverrides: {},
    styleOverrides: {},
    hiddenNodeIds: [],
  }));
}

/** `sf6_online` -> `Sf6 online`, `index` -> `Default`. */
function prettifyName(base: string): string {
  if (base === 'index') return 'Default';
  const words = base.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function parseSettings(raw: string | undefined): AssetSettings | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const assets = (parsed as { assets?: unknown }).assets;
    if (typeof assets !== 'object' || assets === null) return undefined;
    return assets as AssetSettings;
  } catch {
    // A malformed settings.json shouldn't block the import; the original file
    // is preserved regardless.
    return undefined;
  }
}

export interface ImportResult {
  layout: Layout;
  analysis: CssAnalysis;
  notes: string[];
}

export function importLayout(
  files: ImportedLayoutFiles,
  displayName?: string,
): ImportResult {
  const analysis = analyzeCss(files.css);
  const notes: string[] = [];

  const tokenOverrides: Record<string, string> = {};
  for (const token of analysis.tokens) tokenOverrides[token.name] = token.value;

  if (!analysis.tokens.length) {
    notes.push(
      'This layout declares no CSS variables, so there are no tokens to edit directly. Promote its colours to tokens below to make it themeable.',
    );
  }
  if (!files.css) {
    notes.push('No index.css was found, so there is nothing to restyle.');
  }
  if (!files.js) {
    notes.push('No index.js was found; this layout may not display live data.');
  }

  const settings = parseSettings(files.settings);

  const layout: Layout = {
    id: newId(),
    name: displayName?.trim() || prettifyName(files.folderName),
    folderName: sanitizeFolderName(files.folderName),
    tier: 'imported',
    canvas: detectCanvas(files.css),
    tokenOverrides,
    // The imported tier never renders from the model tree, so the root stays
    // empty rather than pretending to describe the real markup.
    root: {
      id: newId(),
      name: 'Imported layout',
      type: 'container',
      classes: [],
      layoutMode: 'free',
      stack: {
        direction: 'row',
        gap: 0,
        align: 'center',
        justify: 'start',
        wrap: false,
        collapseEmpty: false,
      },
      children: [],
      style: {
        box: {},
        text: {},
        free: { x: 0, y: 0 },
        stackItem: { grow: 0, shrink: 1, basis: 'auto' },
      },
    },
    variants: buildVariants(files.html),
    animation: defaultAnimation(),
    settings: settings ? { assets: settings } : defaultLayoutSettings(),
    importedFrom: files.folderName,
    importedSource: {
      css: files.css,
      js: files.js,
      html: files.html,
      hash: hashSource(files.css, files.js, ...Object.values(files.html)),
      previewImage: files.previewImage,
    },
    importedEdits: defaultImportedEdits(),
  };

  return { layout, analysis, notes };
}

/** Re-analysis of a layout already in the pack, for the editing panels. */
export function analyzeImported(layout: Layout): CssAnalysis | undefined {
  if (layout.tier !== 'imported' || !layout.importedSource) return undefined;
  return analyzeCss(layout.importedSource.css);
}
