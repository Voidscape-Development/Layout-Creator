/**
 * Design tokens.
 *
 * These mirror the `:root` block in the layouts repo's `main.css` so that
 * emitted layouts drop into a TSH install and inherit sane values even if the
 * pack's own `theme.css` is missing. Anything a user adds beyond this set is
 * carried through verbatim.
 *
 * Token resolution order at runtime (last wins):
 *   main.css :root  ->  pack theme.css  ->  layout <body> class  ->  variant class
 */

export type TokenName = string;
export type TokenValue = string;

export interface TokenDef {
  name: TokenName;
  /** Shown in the simplified panel instead of the raw CSS variable name. */
  label: string;
  /** Drives which editor control is used. */
  kind: 'color' | 'length' | 'font' | 'number' | 'raw';
  group: TokenGroup;
  /** Value used when neither the pack nor a layout overrides it. */
  fallback: TokenValue;
  /** One-line explanation surfaced as help text. */
  help?: string;
}

export type TokenGroup = 'color' | 'player' | 'shape' | 'type';

/**
 * The core token set. Kept deliberately small — these are the values a
 * tournament organiser actually rebrands. Layout-specific knobs live as
 * per-layout tokens instead of polluting this list.
 */
export const CORE_TOKENS: readonly TokenDef[] = [
  {
    name: '--font',
    label: 'Font stack',
    kind: 'font',
    group: 'type',
    fallback:
      '"SairaCondensed", "NotoSans", "NotoSansJP", "NotoSansSC", "NotoSansTC", "NotoSansKR", sans-serif',
    help: 'Falls back per character, so Japanese, Chinese and Korean names still render.',
  },
  {
    name: '--text-color',
    label: 'Text',
    kind: 'color',
    group: 'color',
    fallback: '#ffffff',
  },
  {
    name: '--bg-color',
    label: 'Panel background',
    kind: 'color',
    group: 'color',
    fallback: 'rgb(18, 17, 28)',
    help: 'Background of scoreboard containers. Use an alpha value to let the game feed through.',
  },
  {
    name: '--p1-score-bg-color',
    label: 'Player 1 accent',
    kind: 'color',
    group: 'player',
    fallback: '#e53935',
    help: 'Overwritten live by TSH per match unless "Force default score colors" is on.',
  },
  {
    name: '--p2-score-bg-color',
    label: 'Player 2 accent',
    kind: 'color',
    group: 'player',
    fallback: '#1e88e5',
    help: 'Overwritten live by TSH per match unless "Force default score colors" is on.',
  },
  {
    name: '--p1-score-color',
    label: 'Player 1 score text',
    kind: 'color',
    group: 'player',
    fallback: '#ffffff',
  },
  {
    name: '--p2-score-color',
    label: 'Player 2 score text',
    kind: 'color',
    group: 'player',
    fallback: '#ffffff',
  },
  {
    name: '--p1-sponsor-color',
    label: 'Player 1 sponsor',
    kind: 'color',
    group: 'player',
    fallback: 'oklch(from var(--p1-score-bg-color) calc(l + 0.13) c h)',
    help: 'Defaults to a lightened Player 1 accent.',
  },
  {
    name: '--p2-sponsor-color',
    label: 'Player 2 sponsor',
    kind: 'color',
    group: 'player',
    fallback: 'oklch(from var(--p2-score-bg-color) calc(l + 0.13) c h)',
    help: 'Defaults to a lightened Player 2 accent.',
  },
  {
    name: '--border-radius',
    label: 'Corner rounding',
    kind: 'length',
    group: 'shape',
    fallback: '12px',
  },
  {
    name: '--border-radius-chip',
    label: 'Chip rounding',
    kind: 'length',
    group: 'shape',
    fallback: '5px',
  },
  {
    name: '--border-radius-pill',
    label: 'Pill rounding',
    kind: 'length',
    group: 'shape',
    fallback: '9999px',
  },
] as const;

export const CORE_TOKEN_NAMES: ReadonlySet<string> = new Set(
  CORE_TOKENS.map((t) => t.name),
);

export type TokenMap = Record<TokenName, TokenValue>;

/** Every core token at its documented fallback. */
export function defaultTokens(): TokenMap {
  const out: TokenMap = {};
  for (const token of CORE_TOKENS) out[token.name] = token.fallback;
  return out;
}

export function tokenDef(name: TokenName): TokenDef | undefined {
  return CORE_TOKENS.find((t) => t.name === name);
}

/** `--p1-score-bg-color` -> `var(--p1-score-bg-color)` */
export function tokenRef(name: TokenName): string {
  return `var(${name})`;
}

const TOKEN_REF = /^var\(\s*(--[A-Za-z0-9-]+)\s*\)$/;

/** Inverse of {@link tokenRef}; returns undefined for literal values. */
export function parseTokenRef(value: string): TokenName | undefined {
  const match = TOKEN_REF.exec(value.trim());
  return match?.[1];
}

/**
 * Merge pack -> layout -> variant token layers. Later layers win, and a layer
 * may legitimately set a token the pack never declared.
 */
export function resolveTokens(...layers: Array<TokenMap | undefined>): TokenMap {
  return Object.assign({}, ...layers.filter(Boolean)) as TokenMap;
}

/**
 * Tokens that differ from what the layer beneath already provides. Used when
 * emitting so we only write out genuine overrides rather than a full copy.
 */
export function tokenDiff(base: TokenMap, override: TokenMap): TokenMap {
  const out: TokenMap = {};
  for (const [name, value] of Object.entries(override)) {
    if (base[name] !== value) out[name] = value;
  }
  return out;
}

/** Custom name validation — CSS custom properties must start with `--`. */
export function isValidTokenName(name: string): boolean {
  return /^--[A-Za-z][A-Za-z0-9-]*$/.test(name);
}
