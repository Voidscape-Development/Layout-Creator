/**
 * The style model.
 *
 * Deliberately *not* a general CSS bag. Every field here maps to a control in
 * the simplified panel and to a predictable chunk of emitted CSS. Anything the
 * model can't express goes in `rawCss`, which is appended last so it always
 * wins — that's the expert escape hatch.
 */

/**
 * A CSS length. Numbers are px (what the canvas manipulates directly);
 * strings pass through untouched so `50%`, `fit-content`, `calc(...)` and
 * `var(--x)` all remain expressible.
 */
export type Length = number | string;

export type LengthAuto = Length | 'auto';

export function lengthToCss(value: Length | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? `${round(value)}px` : value;
}

/** Canvas drags produce sub-pixel floats; emitted CSS shouldn't carry them. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ── Layout modes ───────────────────────────────────────────────────────── */

/**
 * How a container positions its children.
 *
 * - `stack` emits flexbox with `gap`, matching how the layouts repo builds
 *   player containers. Children keep flowing when a sibling is empty, and the
 *   emitter adds the repo's `:has(.text_empty)` collapse rules so a missing
 *   flag or sponsor doesn't leave a hole.
 * - `free` emits `position: absolute` children at explicit coordinates. Total
 *   freedom on the canvas; no reflow when data is missing.
 *
 * Free mode is the right choice for decorative furniture and one-off designs.
 * Stack is the right choice for anything holding live player data.
 */
export type LayoutMode = 'stack' | 'free';

export type StackDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type StackJustify =
  | 'start'
  | 'center'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

export interface StackConfig {
  direction: StackDirection;
  /** Gap between children, in px. */
  gap: number;
  /** Cross-axis alignment. */
  align: StackAlign;
  /** Main-axis distribution. */
  justify: StackJustify;
  wrap: boolean;
  /**
   * Emit the repo's empty-collapse rules, so children bound to data that TSH
   * left blank are removed from the flow instead of contributing a gap.
   * This is the behaviour absolute positioning cannot reproduce, and it is on
   * by default for exactly that reason.
   */
  collapseEmpty: boolean;
}

export function defaultStackConfig(): StackConfig {
  return {
    direction: 'row',
    gap: 6,
    align: 'center',
    justify: 'start',
    wrap: false,
    collapseEmpty: true,
  };
}

/** How a child behaves inside a `stack` parent. Ignored in `free` parents. */
export interface StackItem {
  /** flex-grow */
  grow: number;
  /** flex-shrink */
  shrink: number;
  /** flex-basis */
  basis: LengthAuto;
  /** Overrides the parent's cross-axis alignment for this child alone. */
  alignSelf?: StackAlign;
  order?: number;
}

export function defaultStackItem(): StackItem {
  return { grow: 0, shrink: 1, basis: 'auto' };
}

/** Where a child sits inside a `free` parent. Ignored in `stack` parents. */
export interface FreeBox {
  x: number;
  y: number;
}

export function defaultFreeBox(): FreeBox {
  return { x: 0, y: 0 };
}

/* ── Visual style ───────────────────────────────────────────────────────── */

export interface BoxStyle {
  width?: LengthAuto;
  height?: LengthAuto;
  minWidth?: Length;
  minHeight?: Length;
  maxWidth?: Length;
  maxHeight?: Length;
  /** Shorthand padding, in px: [top, right, bottom, left]. */
  padding?: [number, number, number, number];
  background?: string;
  borderRadius?: Length;
  border?: BorderStyle;
  shadow?: ShadowStyle[];
  opacity?: number;
  /** `hidden` is what the repo uses to keep overlays inside their box. */
  overflow?: 'visible' | 'hidden';
  rotate?: number;
  scale?: number;
  zIndex?: number;
}

export interface BorderStyle {
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  color: string;
}

export interface ShadowStyle {
  /** Drop shadows on the element box vs. on the rendered pixels. */
  kind: 'box' | 'drop';
  x: number;
  y: number;
  blur: number;
  /** Ignored for `drop` shadows — `drop-shadow()` has no spread. */
  spread?: number;
  color: string;
  inset?: boolean;
}

export interface TextStyle {
  fontFamily?: string;
  fontSize?: Length;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: Length;
  color?: string;
  align?: 'left' | 'center' | 'right';
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  italic?: boolean;
  /**
   * Contrasting outline behind the glyphs. `main.css` applies one globally;
   * this overrides it per element.
   */
  stroke?: { width: number; color: string };
  /**
   * How overlong text is handled. `scale-x` squeezes horizontally (the repo's
   * default via FitText), `shrink-font` steps the font size down instead
   * (the repo's `.font-scale-fit`).
   */
  fit?: 'none' | 'scale-x' | 'shrink-font';
  whiteSpace?: 'nowrap' | 'normal';
}

export interface Style {
  box: BoxStyle;
  text: TextStyle;
  /** Position inside a `free` parent. */
  free: FreeBox;
  /** Behaviour inside a `stack` parent. */
  stackItem: StackItem;
  /**
   * Raw CSS declarations, emitted last inside the element's rule so they beat
   * everything above. Not parsed or validated — this is the escape hatch.
   */
  rawCss?: string;
}

export function defaultStyle(): Style {
  return {
    box: {},
    text: {},
    free: defaultFreeBox(),
    stackItem: defaultStackItem(),
  };
}

/**
 * Variant style overrides are sparse — a variant usually nudges a handful of
 * properties rather than restating an element's whole style.
 */
export type StyleOverride = {
  box?: Partial<BoxStyle>;
  text?: Partial<TextStyle>;
  free?: Partial<FreeBox>;
  stackItem?: Partial<StackItem>;
  rawCss?: string;
};

export function applyStyleOverride(base: Style, override?: StyleOverride): Style {
  if (!override) return base;
  return {
    box: { ...base.box, ...override.box },
    text: { ...base.text, ...override.text },
    free: { ...base.free, ...override.free },
    stackItem: { ...base.stackItem, ...override.stackItem },
    // A variant's raw CSS is appended to the base's, not swapped for it, so
    // the variant adds to the element's expert overrides instead of silently
    // dropping them.
    rawCss: [base.rawCss, override.rawCss].filter(Boolean).join('\n') || undefined,
  };
}
