/**
 * Emit orchestration.
 *
 * Turns a Pack into a flat list of files with paths relative to the TSH
 * `/layout/` directory. The main process writes them; the renderer uses the
 * same output to drive the preview, so what you see is literally what ships.
 *
 * Layout on disk:
 *
 *   /layout/
 *     _packs/<pack>/theme.css        shared tokens
 *     _packs/<pack>/components.js    smart-component runtime
 *     _packs/<pack>/fonts/…          user-imported fonts
 *     <layout_folder>/index.html     one per variant
 *     <layout_folder>/index.css
 *     <layout_folder>/index.js
 *     <layout_folder>/settings.json
 *
 * `_packs/` is namespaced with a leading underscore so it can never collide
 * with an official layout folder.
 */

import type { Layout, Pack } from '../model/pack';
import { sanitizeFolderName } from '../model/pack';
import { emitCss } from './css';
import { emitHtml, usesComponents } from './html';
import { emitJs } from './js';
import { COMPONENTS_RUNTIME, UNIMPLEMENTED_COMPONENTS } from './runtime';
import { emitThemeCss } from './theme';
import { walk } from '../model/nodes';

export interface EmittedFile {
  /** Path relative to the TSH `/layout/` directory. */
  path: string;
  contents: string;
  /** Files the user may have hand-edited get a warning before overwrite. */
  kind: 'html' | 'css' | 'js' | 'json';
}

export interface EmitResult {
  files: EmittedFile[];
  warnings: string[];
}

export function packFolder(pack: Pack): string {
  return `_packs/${sanitizeFolderName(pack.name)}`;
}

/** Relative path from a layout folder back to the pack's shared assets. */
function packAssetPath(pack: Pack): string {
  return `../${packFolder(pack)}`;
}

export function emitLayout(pack: Pack, layout: Layout): EmitResult {
  const files: EmittedFile[] = [];
  const warnings: string[] = [];
  const dir = sanitizeFolderName(layout.folderName);

  if (layout.tier === 'imported') {
    // Imported layouts are re-emitted from their original source with only the
    // modelled parts substituted, rather than regenerated from scratch.
    return emitImportedLayout(layout);
  }

  for (const variant of layout.variants) {
    files.push({
      path: `${dir}/${variant.fileName}`,
      contents: emitHtml(pack, layout, variant, {
        packAssetPath: packAssetPath(pack),
      }),
      kind: 'html',
    });
  }

  files.push({ path: `${dir}/index.css`, contents: emitCss(layout), kind: 'css' });
  files.push({ path: `${dir}/index.js`, contents: emitJs(layout), kind: 'js' });
  files.push({
    path: `${dir}/settings.json`,
    contents: `${JSON.stringify(
      { assets: layout.settings.assets, ...(layout.settings.extra ?? {}) },
      null,
      2,
    )}\n`,
    kind: 'json',
  });

  warnings.push(...layoutWarnings(layout));
  return { files, warnings };
}

/**
 * Imported layouts keep their original files. Only the parts the editor
 * genuinely understands are rewritten: the `:root` token block in the CSS.
 * Everything else round-trips byte-for-byte, which is the promise the
 * imported tier makes.
 */
function emitImportedLayout(layout: Layout): EmitResult {
  const files: EmittedFile[] = [];
  const warnings: string[] = [];
  const dir = sanitizeFolderName(layout.folderName);
  const source = layout.importedSource;

  if (!source) {
    return {
      files,
      warnings: [
        `"${layout.name}" is marked as imported but carries no original source; nothing was written.`,
      ],
    };
  }

  files.push({
    path: `${dir}/index.css`,
    contents: replaceRootBlock(source.css, layout.tokenOverrides),
    kind: 'css',
  });
  files.push({ path: `${dir}/index.js`, contents: source.js, kind: 'js' });
  for (const [name, html] of Object.entries(source.html)) {
    files.push({ path: `${dir}/${name}`, contents: html, kind: 'html' });
  }

  warnings.push(
    `"${layout.name}" was imported, so only its design tokens are rewritten — structure, CSS and scripts are preserved as authored.`,
  );
  return { files, warnings };
}

/**
 * Replace the first `:root { … }` block's declarations with the layout's
 * tokens, leaving the rest of the stylesheet untouched. Appends a block if the
 * stylesheet has none.
 */
function replaceRootBlock(css: string, tokens: Record<string, string>): string {
  const entries = Object.entries(tokens);
  if (!entries.length) return css;
  const body = entries.map(([name, value]) => `  ${name}: ${value};`).join('\n');
  const block = `:root {\n${body}\n}`;

  const match = /:root\s*\{[^}]*\}/.exec(css);
  if (!match) return `${block}\n\n${css}`;
  return css.slice(0, match.index) + block + css.slice(match.index + match[0].length);
}

function layoutWarnings(layout: Layout): string[] {
  const warnings: string[] = [];
  for (const node of walk(layout.root)) {
    if (node.hidden || node.type !== 'component') continue;
    if (UNIMPLEMENTED_COMPONENTS.has(node.kind)) {
      warnings.push(
        `"${layout.name}" uses the ${node.kind} component, which renders a placeholder — its generation logic is not implemented yet.`,
      );
    }
  }
  return warnings;
}

export function emitPack(pack: Pack): EmitResult {
  const files: EmittedFile[] = [];
  const warnings: string[] = [];
  const folder = packFolder(pack);

  files.push({
    path: `${folder}/theme.css`,
    contents: emitThemeCss(pack),
    kind: 'css',
  });

  if (pack.layouts.some((l) => l.tier === 'native' && usesComponents(l))) {
    files.push({
      path: `${folder}/components.js`,
      contents: COMPONENTS_RUNTIME,
      kind: 'js',
    });
  }

  const seenFolders = new Map<string, string>();
  for (const layout of pack.layouts) {
    const dir = sanitizeFolderName(layout.folderName);
    const previous = seenFolders.get(dir);
    if (previous) {
      warnings.push(
        `"${layout.name}" and "${previous}" both emit to /layout/${dir}/ — rename one before exporting.`,
      );
      continue;
    }
    seenFolders.set(dir, layout.name);

    const result = emitLayout(pack, layout);
    files.push(...result.files);
    warnings.push(...result.warnings);
  }

  return { files, warnings };
}

export { emitCss } from './css';
export { emitHtml, usesComponents } from './html';
export { emitJs } from './js';
export { emitThemeCss } from './theme';
export { COMPONENTS_RUNTIME, UNIMPLEMENTED_COMPONENTS } from './runtime';
