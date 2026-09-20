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
import { analyzeCss, applyEdits } from '../import/css';
import type { CssEdit } from '../import/css';

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
    return emitImportedLayout(layout, pack.theme);
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
function emitImportedLayout(
  layout: Layout,
  themeTokens: Record<string, string>,
): EmitResult {
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
    contents: rewriteImportedCss(layout, source.css, themeTokens),
    kind: 'css',
  });
  files.push({ path: `${dir}/index.js`, contents: source.js, kind: 'js' });
  for (const [name, html] of Object.entries(source.html)) {
    files.push({ path: `${dir}/${name}`, contents: html, kind: 'html' });
  }

  warnings.push(
    `"${layout.name}" was imported, so only its tokens, colours and fonts are rewritten — structure, layout rules and scripts are preserved as authored.`,
  );
  return { files, warnings };
}

/**
 * Token names referenced by the layout's substitutions, e.g. the `--my-brand`
 * in a `var(--my-brand)` colour mapping.
 */
function referencedTokens(layout: Layout): string[] {
  const values = [
    ...Object.values(layout.importedEdits?.colorMappings ?? {}),
    ...Object.values(layout.importedEdits?.fontMappings ?? {}),
  ];
  const names = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*\)/g)) {
      if (match[1]) names.add(match[1]);
    }
  }
  return [...names];
}

/**
 * Rewrite an imported stylesheet.
 *
 * Every edit is a span substitution against the pristine source, collected
 * into one right-to-left pass. Spans are re-derived here rather than stored,
 * so they can never go stale relative to the text they describe.
 *
 * `themeTokens` carries the pack theme. It matters because an imported
 * layout's HTML is preserved as authored and therefore never links the pack's
 * `theme.css` — so any token a substitution references has to be materialised
 * into this stylesheet's own `:root`, or the promoted value would resolve to
 * nothing. Doing it here rather than by editing the HTML is what keeps the
 * round-trip guarantee intact for every file we don't own.
 */
export function rewriteImportedCss(
  layout: Layout,
  css: string,
  themeTokens: Record<string, string> = {},
): string {
  const analysis = analyzeCss(css);
  const edits: CssEdit[] = [];

  // 1. Token declarations. Existing ones are rewritten in place so surrounding
  //    formatting and comments survive; genuinely new tokens are appended to
  //    the root block, or given one if the stylesheet has none.
  const tokens = { ...layout.tokenOverrides };

  // Materialise referenced tokens the stylesheet doesn't already carry. The
  // layout's own override wins, then the pack theme; an unresolvable name is
  // skipped rather than emitted as an empty declaration.
  for (const name of referencedTokens(layout)) {
    if (tokens[name] !== undefined) continue;
    if (analysis.tokens.some((t) => t.name === name)) continue;
    const value = themeTokens[name];
    if (value !== undefined) tokens[name] = value;
  }
  for (const decl of analysis.tokens) {
    const value = tokens[decl.name];
    if (value === undefined || value === decl.value) {
      delete tokens[decl.name];
      continue;
    }
    edits.push({
      start: decl.start,
      end: decl.end,
      replacement: `${decl.name}: ${value};`,
    });
    delete tokens[decl.name];
  }

  const added = Object.entries(tokens);
  let prefix = '';
  if (added.length) {
    const body = added.map(([name, value]) => `  ${name}: ${value};`).join('\n');
    if (analysis.rootBlock) {
      // Insert before the closing brace of the existing block.
      edits.push({
        start: analysis.rootBlock.end - 1,
        end: analysis.rootBlock.end,
        replacement: `${body}\n}`,
      });
    } else {
      prefix = `/* Tokens added by TSH Layout Creator */\n:root {\n${body}\n}\n\n`;
    }
  }

  // 2. Colour promotions — the substitution that makes importing worthwhile.
  const colorMappings = layout.importedEdits?.colorMappings ?? {};
  for (const group of analysis.colors) {
    const replacement = colorMappings[group.normalized];
    if (!replacement) continue;
    for (const occurrence of group.occurrences) {
      edits.push({
        start: occurrence.start,
        end: occurrence.end,
        replacement,
      });
    }
  }

  // 3. Font substitutions.
  const fontMappings = layout.importedEdits?.fontMappings ?? {};
  for (const font of analysis.fonts) {
    const replacement = fontMappings[font.value];
    if (!replacement) continue;
    edits.push({ start: font.start, end: font.end, replacement });
  }

  return prefix + applyEdits(css, edits);
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
