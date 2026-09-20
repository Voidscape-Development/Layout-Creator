/**
 * Pack, Layout and Variant — the top of the model.
 *
 * A *pack* is what a tournament organiser actually ships: a set of overlays
 * that share a look. A *layout* is one overlay folder in the TSH `/layout/`
 * directory. A *variant* is one `.html` file inside that folder — the repo's
 * convention of several skins sharing one CSS/JS, switched by a body class.
 */

import type { AnimationSpec } from './animation';
import { defaultAnimation } from './animation';
import type { ContainerNode } from './nodes';
import type { StyleOverride } from './style';
import type { TokenMap } from './tokens';
import { defaultTokens } from './tokens';

export const SCHEMA_VERSION = 1;

/**
 * How much of the editor a layout supports.
 *
 * - `native`: authored here. Full canvas, styling, animation, the lot.
 * - `imported`: parsed from hand-written repo layouts. We understand its
 *   tokens, colours, fonts, animation parameters and text bindings, but not
 *   its arbitrary CSS, so structural editing stays disabled rather than
 *   silently mangling the original.
 */
export type EditTier = 'native' | 'imported';

export interface Variant {
  id: string;
  /** Display name, e.g. "Smash Ultimate". */
  name: string;
  /** Emitted filename, e.g. `ssbultimate.html`. */
  fileName: string;
  /**
   * Class placed on `<body>`. Every variant-specific CSS rule is nested under
   * it, exactly as `scoreboard/index.css` does with `.ssbu` / `.fgc`.
   * Empty for the default variant, which needs no qualifier.
   */
  bodyClass: string;
  tokenOverrides: TokenMap;
  /** Per-node style tweaks, keyed by node id. */
  styleOverrides: Record<string, StyleOverride>;
  /** Nodes hidden in this variant only. */
  hiddenNodeIds: string[];
}

export function defaultVariant(partial: Partial<Variant> = {}): Variant {
  return {
    id: '',
    name: 'Default',
    fileName: 'index.html',
    bodyClass: '',
    tokenOverrides: {},
    styleOverrides: {},
    hiddenNodeIds: [],
    ...partial,
  };
}

/**
 * Per-game asset configuration, emitted as the layout's `settings.json`.
 * Keys are TSH game codenames; `default` applies to anything unlisted.
 */
export interface AssetSettings {
  [gameCodename: string]: {
    asset_key?: string;
    custom_zoom?: number;
    custom_center?: [number, number];
    [extra: string]: unknown;
  };
}

export interface LayoutSettings {
  assets: AssetSettings;
  /** Arbitrary extra keys merged into the emitted settings.json. */
  extra?: Record<string, unknown>;
}

export interface Layout {
  id: string;
  name: string;
  /** Directory name inside `/layout/`. Must be filesystem-safe. */
  folderName: string;
  tier: EditTier;
  /** Canvas size. Not every layout is 1920x1080 — see scoreboard_4by3. */
  canvas: { width: number; height: number };
  /** Layout-level token overrides, layered over the pack theme. */
  tokenOverrides: TokenMap;
  root: ContainerNode;
  variants: Variant[];
  animation: AnimationSpec;
  settings: LayoutSettings;
  /**
   * Original folder an imported layout came from, so re-export can warn before
   * overwriting someone's hand-written work.
   */
  importedFrom?: string;
  /**
   * Verbatim source for an imported layout. Kept so the un-modelled parts
   * round-trip untouched instead of being regenerated from an incomplete
   * understanding.
   */
  importedSource?: ImportedSource;
  notes?: string;
}

export interface ImportedSource {
  css: string;
  js: string;
  html: Record<string, string>;
  /** Byte-level fidelity check on re-import. */
  hash: string;
}

export interface FontRef {
  /** `font-family` name used in CSS. */
  family: string;
  /** Path inside the pack's font directory. */
  file: string;
  weight?: number;
  italic?: boolean;
}

export interface Pack {
  schemaVersion: number;
  id: string;
  name: string;
  /** Free-text, surfaced in exported READMEs. */
  author?: string;
  description?: string;
  /** Pack-wide tokens. Layouts and variants layer on top. */
  theme: TokenMap;
  fonts: FontRef[];
  layouts: Layout[];
  createdWith: string;
  updatedAt: string;
}

export function defaultLayoutSettings(): LayoutSettings {
  return { assets: { default: {} } };
}

export function emptyPack(name = 'Untitled pack'): Pack {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name,
    theme: defaultTokens(),
    fonts: [],
    layouts: [],
    createdWith: '0.1.0',
    updatedAt: new Date().toISOString(),
  };
}

export function emptyLayout(name: string, folderName: string): Layout {
  return {
    id: newId(),
    name,
    folderName,
    tier: 'native',
    canvas: { width: 1920, height: 1080 },
    tokenOverrides: {},
    root: {
      id: newId(),
      name: 'Layout',
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
    variants: [defaultVariant({ id: newId() })],
    animation: defaultAnimation(),
    settings: defaultLayoutSettings(),
  };
}

/* ── Identity ───────────────────────────────────────────────────────────── */

let idCounter = 0;

/**
 * Short, stable, collision-resistant enough for a single-document editor.
 * Not a UUID — these end up in emitted CSS class names, so they stay short and
 * start with a letter.
 */
export function newId(): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `n${idCounter.toString(36)}${rand}`;
}

/* ── Lookups ────────────────────────────────────────────────────────────── */

export function findLayout(pack: Pack, id: string): Layout | undefined {
  return pack.layouts.find((l) => l.id === id);
}

export function findVariant(layout: Layout, id: string): Variant | undefined {
  return layout.variants.find((v) => v.id === id);
}

/** Tokens in effect for a given layout/variant, pack theme included. */
export function effectiveTokens(
  pack: Pack,
  layout: Layout,
  variant?: Variant,
): TokenMap {
  return {
    ...pack.theme,
    ...layout.tokenOverrides,
    ...(variant?.tokenOverrides ?? {}),
  };
}

/**
 * Folder names land on disk and in URLs, so restrict them the same way the
 * official repo does: lowercase, alphanumeric, underscores.
 */
export function sanitizeFolderName(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '') || 'layout'
  );
}

/** Same, for a variant's `.html` filename. */
export function sanitizeFileName(input: string): string {
  const base = sanitizeFolderName(input.replace(/\.html?$/i, ''));
  return `${base}.html`;
}
