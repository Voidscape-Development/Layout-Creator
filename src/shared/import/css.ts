/**
 * CSS analysis for imported layouts.
 *
 * This is not a CSS parser and does not try to be one. It locates three things
 * by source span — custom-property declarations, colour literals and
 * `font-family` values — so the editor can offer a meaningful surface on a
 * hand-written layout without understanding its structure.
 *
 * Spans matter: edits are applied back to the *original* source right-to-left,
 * so everything the editor doesn't model survives byte-for-byte. That is the
 * promise the imported tier makes.
 *
 * Why colours and not just tokens: of the 29 layouts in the official repo,
 * only four declare a `:root` block. Token-only editing would give a user
 * nothing at all for the other 25, including the popular VGBootCamp skins.
 * Promoting a hardcoded colour to a token is the operation that actually lets
 * someone rebrand an existing layout.
 */

export interface Span {
  start: number;
  end: number;
}

export interface TokenDecl extends Span {
  name: string;
  value: string;
}

export interface ColorOccurrence extends Span {
  /** Exactly as written in the source. */
  raw: string;
  /** Canonical form used to group equivalent spellings. */
  normalized: string;
}

export interface ColorGroup {
  normalized: string;
  /** The first spelling encountered, for display. */
  sample: string;
  occurrences: ColorOccurrence[];
  /**
   * True for near-black / near-white / low-alpha values, which are almost
   * always shadows and borders rather than brand colours. The UI de-emphasises
   * these instead of hiding them.
   */
  likelyIncidental: boolean;
}

export interface FontOccurrence extends Span {
  /** The declaration's value, e.g. `"Montserrat", sans-serif`. */
  value: string;
}

export interface CssAnalysis {
  /** Declarations found inside `:root` blocks. */
  tokens: TokenDecl[];
  /** Span of the first `:root { … }` block, if any. */
  rootBlock?: Span;
  colors: ColorGroup[];
  fonts: FontOccurrence[];
}

/* ── Span helpers ───────────────────────────────────────────────────────── */

function commentSpans(css: string): Span[] {
  const spans: Span[] = [];
  const re = /\/\*[\s\S]*?\*\//g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function within(index: number, spans: Span[]): boolean {
  return spans.some((s) => index >= s.start && index < s.end);
}

/* ── Colour normalisation ───────────────────────────────────────────────── */

/**
 * Canonical form so `#FFF`, `#ffffff` and `#FFFFFF` group together, and
 * `rgba(0,0,0,.5)` groups with `rgba(0, 0, 0, 0.5)`.
 */
export function normalizeColor(raw: string): string {
  const value = raw.trim().toLowerCase();

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    // Expand shorthand: #rgb -> #rrggbb, #rgba -> #rrggbbaa
    if (hex.length === 3 || hex.length === 4) {
      return `#${[...hex].map((c) => c + c).join('')}`;
    }
    // Drop a fully-opaque alpha channel so #rrggbbff groups with #rrggbb.
    if (hex.length === 8 && hex.endsWith('ff')) return `#${hex.slice(0, 6)}`;
    return `#${hex}`;
  }

  // Collapse whitespace and normalise leading-dot decimals inside rgb()/hsl().
  return value
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .replace(/([,(\s])\.(\d)/g, '$10.$2');
}

/** Parsed channel values, for the incidental-colour heuristic. */
function channels(normalized: string): { r: number; g: number; b: number; a: number } | undefined {
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    if (hex.length !== 6 && hex.length !== 8) return undefined;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  const match = /^rgba?\(([^)]+)\)$/.exec(normalized);
  if (!match?.[1]) return undefined;
  const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
  const [r, g, b, a] = parts;
  if (r === undefined || g === undefined || b === undefined) return undefined;
  return { r, g, b, a: a ?? 1 };
}

/**
 * Shadows, hairline borders and scrims dominate these stylesheets by count.
 * Flagging them keeps the genuinely brandable colours near the top of the list.
 */
function isLikelyIncidental(normalized: string): boolean {
  const ch = channels(normalized);
  if (!ch) return false;
  if (ch.a < 0.5) return true;

  const max = Math.max(ch.r, ch.g, ch.b);
  const min = Math.min(ch.r, ch.g, ch.b);
  const isGrey = max - min < 12;
  // Pure greys carry no brand identity; mid-greys are usually dividers.
  return isGrey;
}

/* ── Analysis ───────────────────────────────────────────────────────────── */

const COLOR_RE =
  /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;

const ROOT_RE = /:root\s*\{([^}]*)\}/g;
const TOKEN_RE = /(--[A-Za-z][A-Za-z0-9-]*)\s*:\s*([^;]+);/g;
const FONT_RE = /font-family\s*:\s*([^;}]+)/g;

export function analyzeCss(css: string): CssAnalysis {
  const comments = commentSpans(css);
  const rootSpans: Span[] = [];
  const tokens: TokenDecl[] = [];
  let rootBlock: Span | undefined;

  // 1. Custom properties inside :root blocks.
  ROOT_RE.lastIndex = 0;
  let rootMatch: RegExpExecArray | null;
  while ((rootMatch = ROOT_RE.exec(css))) {
    if (within(rootMatch.index, comments)) continue;
    const span = { start: rootMatch.index, end: rootMatch.index + rootMatch[0].length };
    rootSpans.push(span);
    rootBlock ??= span;

    const body = rootMatch[1] ?? '';
    const bodyOffset = rootMatch.index + rootMatch[0].indexOf(body);
    TOKEN_RE.lastIndex = 0;
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = TOKEN_RE.exec(body))) {
      const name = tokenMatch[1];
      const value = tokenMatch[2];
      if (!name || value === undefined) continue;
      tokens.push({
        name,
        value: value.trim(),
        start: bodyOffset + tokenMatch.index,
        end: bodyOffset + tokenMatch.index + tokenMatch[0].length,
      });
    }
  }

  // 2. Colour literals, excluding comments and token declarations (a value
  //    inside :root is already a token — promoting it would be circular).
  const byNormalized = new Map<string, ColorOccurrence[]>();
  COLOR_RE.lastIndex = 0;
  let colorMatch: RegExpExecArray | null;
  while ((colorMatch = COLOR_RE.exec(css))) {
    const start = colorMatch.index;
    if (within(start, comments) || within(start, rootSpans)) continue;
    const raw = colorMatch[0];
    const normalized = normalizeColor(raw);
    const occurrence: ColorOccurrence = {
      raw,
      normalized,
      start,
      end: start + raw.length,
    };
    const existing = byNormalized.get(normalized);
    if (existing) existing.push(occurrence);
    else byNormalized.set(normalized, [occurrence]);
  }

  const colors: ColorGroup[] = [...byNormalized.entries()]
    .map(([normalized, occurrences]) => ({
      normalized,
      sample: occurrences[0]?.raw ?? normalized,
      occurrences,
      likelyIncidental: isLikelyIncidental(normalized),
    }))
    // Brandable colours first, then by how widely each is used.
    .sort((a, b) => {
      if (a.likelyIncidental !== b.likelyIncidental) return a.likelyIncidental ? 1 : -1;
      return b.occurrences.length - a.occurrences.length;
    });

  // 3. font-family declarations, excluding ones that already use a token.
  const fonts: FontOccurrence[] = [];
  FONT_RE.lastIndex = 0;
  let fontMatch: RegExpExecArray | null;
  while ((fontMatch = FONT_RE.exec(css))) {
    if (within(fontMatch.index, comments)) continue;
    const value = fontMatch[1];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed.startsWith('var(')) continue;
    const valueStart = fontMatch.index + fontMatch[0].indexOf(value);
    fonts.push({
      value: trimmed,
      start: valueStart,
      end: valueStart + value.length,
    });
  }

  return { tokens, rootBlock, colors, fonts };
}

/* ── Applying edits ─────────────────────────────────────────────────────── */

export interface CssEdit extends Span {
  replacement: string;
}

/**
 * Apply edits to the source. Spans must come from an analysis of this exact
 * string; applying right-to-left keeps earlier offsets valid.
 *
 * Overlapping edits are a programming error, so they throw rather than
 * silently producing corrupt CSS.
 */
export function applyEdits(source: string, edits: CssEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start);

  let previousStart = Number.POSITIVE_INFINITY;
  let out = source;
  for (const edit of ordered) {
    if (edit.end > previousStart) {
      throw new Error(
        `Overlapping CSS edits at ${edit.start}-${edit.end}; refusing to corrupt the source.`,
      );
    }
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
    previousStart = edit.start;
  }
  return out;
}

/** Extract `<body class="...">` so imported HTML files become real variants. */
export function bodyClassOf(html: string): string {
  const match = /<body[^>]*\sclass\s*=\s*["']([^"']*)["']/i.exec(html);
  return match?.[1]?.trim() ?? '';
}

/** A short, stable digest used to detect that a source file changed on disk. */
export function hashSource(...parts: string[]): string {
  // FNV-1a: no crypto dependency, and this only needs to catch edits, not
  // resist an adversary.
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
