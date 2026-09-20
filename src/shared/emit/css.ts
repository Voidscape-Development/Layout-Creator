/**
 * CSS emitter.
 *
 * Produces the layout's `index.css`. Output is grouped and commented to match
 * the house style of the official layouts, because the whole point of the
 * `native` tier is that its output stays hand-editable afterwards.
 */

import type { LayoutNode, ContainerNode } from '../model/nodes';
import { childrenOf, isContainer } from '../model/nodes';
import type { Layout, Variant } from '../model/pack';
import type {
  BorderStyle,
  ShadowStyle,
  StackAlign,
  StackJustify,
  Style,
} from '../model/style';
import { applyStyleOverride, lengthToCss } from '../model/style';

/** Class that identifies a node in emitted CSS and HTML. */
export function nodeClass(id: string): string {
  return `e_${id}`;
}

type Decl = [property: string, value: string];

/** Flex keyword mapping — the model uses short names, CSS wants long ones. */
function alignValue(value: StackAlign): string {
  switch (value) {
    case 'start':
      return 'flex-start';
    case 'end':
      return 'flex-end';
    default:
      return value;
  }
}

function justifyValue(value: StackJustify): string {
  switch (value) {
    case 'start':
      return 'flex-start';
    case 'end':
      return 'flex-end';
    default:
      return value;
  }
}

function borderCss(border: BorderStyle): string {
  return `${border.width}px ${border.style} ${border.color}`;
}

function boxShadowCss(shadows: ShadowStyle[]): string {
  return shadows
    .filter((s) => s.kind === 'box')
    .map(
      (s) =>
        `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread ?? 0}px ${s.color}`,
    )
    .join(', ');
}

function dropShadowCss(shadows: ShadowStyle[]): string {
  // drop-shadow() has no spread parameter, so a spread set in the editor is
  // intentionally ignored here rather than silently approximated.
  return shadows
    .filter((s) => s.kind === 'drop')
    .map((s) => `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`)
    .join(' ');
}

/**
 * Declarations for a single node. `parent` decides whether the node is
 * positioned absolutely (free parent) or participates in flex flow (stack
 * parent). A node with no parent is the root and becomes `<body>`.
 */
export function styleDeclarations(
  node: LayoutNode,
  style: Style,
  parent: ContainerNode | undefined,
): Decl[] {
  const decls: Decl[] = [];
  const { box, text } = style;

  // ── Positioning ───────────────────────────────────────────────────────
  if (parent === undefined) {
    // Root: establishes the containing block for free-positioned children.
    decls.push(['position', 'relative']);
  } else if (parent.layoutMode === 'free') {
    decls.push(['position', 'absolute']);
    decls.push(['left', `${style.free.x}px`]);
    decls.push(['top', `${style.free.y}px`]);
  } else {
    const item = style.stackItem;
    // Only emit flex item properties that differ from the CSS initial values,
    // so the output stays readable.
    if (item.grow !== 0) decls.push(['flex-grow', String(item.grow)]);
    if (item.shrink !== 1) decls.push(['flex-shrink', String(item.shrink)]);
    if (item.basis !== 'auto') {
      decls.push(['flex-basis', lengthToCss(item.basis) ?? 'auto']);
    }
    if (item.alignSelf) decls.push(['align-self', alignValue(item.alignSelf)]);
    if (item.order !== undefined) decls.push(['order', String(item.order)]);
  }

  // ── Container behaviour ───────────────────────────────────────────────
  if (isContainer(node)) {
    if (node.layoutMode === 'stack') {
      decls.push(['display', 'flex']);
      decls.push(['flex-direction', node.stack.direction]);
      if (node.stack.gap) decls.push(['gap', `${node.stack.gap}px`]);
      decls.push(['align-items', alignValue(node.stack.align)]);
      if (node.stack.justify !== 'start') {
        decls.push(['justify-content', justifyValue(node.stack.justify)]);
      }
      if (node.stack.wrap) decls.push(['flex-wrap', 'wrap']);
    } else if (parent !== undefined) {
      // A free container anchors its own absolutely-positioned children.
      decls.push(['position', 'absolute']);
    }
  }

  // ── Box ───────────────────────────────────────────────────────────────
  const width = lengthToCss(box.width);
  if (width) decls.push(['width', width]);
  const height = lengthToCss(box.height);
  if (height) decls.push(['height', height]);
  for (const [key, prop] of [
    ['minWidth', 'min-width'],
    ['minHeight', 'min-height'],
    ['maxWidth', 'max-width'],
    ['maxHeight', 'max-height'],
  ] as const) {
    const value = lengthToCss(box[key]);
    if (value) decls.push([prop, value]);
  }

  if (box.padding && box.padding.some((p) => p !== 0)) {
    decls.push(['padding', box.padding.map((p) => `${p}px`).join(' ')]);
  }
  if (box.background) decls.push(['background', box.background]);
  const radius = lengthToCss(box.borderRadius);
  if (radius) decls.push(['border-radius', radius]);
  if (box.border) decls.push(['border', borderCss(box.border)]);
  if (box.opacity !== undefined) decls.push(['opacity', String(box.opacity)]);
  if (box.overflow) decls.push(['overflow', box.overflow]);
  if (box.zIndex !== undefined) decls.push(['z-index', String(box.zIndex)]);
  // Box-sizing matches the repo: explicit sizes include padding and border.
  if (box.padding?.some((p) => p !== 0) || box.border) {
    decls.push(['box-sizing', 'border-box']);
  }

  if (box.shadow?.length) {
    const boxShadow = boxShadowCss(box.shadow);
    if (boxShadow) decls.push(['box-shadow', boxShadow]);
    const drop = dropShadowCss(box.shadow);
    if (drop) decls.push(['filter', drop]);
  }

  const transforms: string[] = [];
  if (box.rotate) transforms.push(`rotate(${box.rotate}deg)`);
  if (box.scale !== undefined && box.scale !== 1) {
    transforms.push(`scale(${box.scale})`);
  }
  if (transforms.length) decls.push(['transform', transforms.join(' ')]);

  // ── Text ──────────────────────────────────────────────────────────────
  if (text.fontFamily) decls.push(['font-family', text.fontFamily]);
  const fontSize = lengthToCss(text.fontSize);
  if (fontSize) decls.push(['font-size', fontSize]);
  if (text.fontWeight !== undefined) {
    decls.push(['font-weight', String(text.fontWeight)]);
  }
  if (text.lineHeight !== undefined) {
    decls.push(['line-height', String(text.lineHeight)]);
  }
  const letterSpacing = lengthToCss(text.letterSpacing);
  if (letterSpacing) decls.push(['letter-spacing', letterSpacing]);
  if (text.color) decls.push(['color', text.color]);
  if (text.align) decls.push(['text-align', text.align]);
  if (text.transform && text.transform !== 'none') {
    decls.push(['text-transform', text.transform]);
  }
  if (text.italic) decls.push(['font-style', 'italic']);
  if (text.stroke) {
    decls.push(['-webkit-text-stroke', `${text.stroke.width}px ${text.stroke.color}`]);
    decls.push(['paint-order', 'stroke fill']);
  }
  if (text.whiteSpace) decls.push(['white-space', text.whiteSpace]);
  else if (text.fit === 'none') decls.push(['white-space', 'normal']);

  return decls;
}

function formatRule(selector: string, decls: Decl[], rawCss?: string): string {
  const body = decls.map(([prop, value]) => `  ${prop}: ${value};`).join('\n');
  // Raw CSS goes last so an expert override beats everything the model wrote.
  const raw = rawCss
    ? rawCss
        .split('\n')
        .map((line) => (line.trim() ? `  ${line.trim()}` : ''))
        .join('\n')
    : '';
  const inner = [body, raw].filter(Boolean).join('\n');
  return `${selector} {\n${inner}\n}`;
}

/**
 * Collapse rules for a stack container, mirroring `scoreboard/index.css`.
 *
 * Text-bearing children get `:has(.text_empty)`; character containers need
 * `:not(:has(:not(.text_empty)))` because they hold one wrapper per character
 * and are only truly empty when *every* one is. This is the behaviour that
 * absolute positioning cannot reproduce, and the reason stack mode exists.
 */
function collapseRules(container: ContainerNode): string[] {
  if (!container.stack.collapseEmpty) return [];

  const parentSel = `.${nodeClass(container.id)}`;
  const textLike: string[] = [];
  const characterLike: string[] = [];

  for (const child of container.children) {
    if (child.hidden) continue;
    const sel = `${parentSel} > .${nodeClass(child.id)}`;
    if (child.type === 'character') characterLike.push(sel);
    else if (child.type === 'text' || child.type === 'image') textLike.push(sel);
  }

  const rules: string[] = [];
  if (textLike.length) {
    rules.push(
      `${textLike.map((s) => `${s}:has(.text_empty)`).join(',\n')} {\n  display: none;\n}`,
    );
  }
  if (characterLike.length) {
    rules.push(
      `${characterLike
        .map((s) => `${s}:not(:has(:not(.text_empty)))`)
        .join(',\n')} {\n  display: none;\n}`,
    );
  }
  return rules;
}

/** Extra classes the emitter adds based on style choices. */
export function derivedClasses(node: LayoutNode, style: Style): string[] {
  const out: string[] = [];
  if (node.type === 'text' && style.text.fit === 'shrink-font') {
    // globals.js FitText() reads this class to step the font size down
    // instead of squeezing the glyphs horizontally.
    out.push('font-scale-fit');
  }
  return out;
}

export interface CssEmitOptions {
  /** Emitted when present, wrapping every rule for variant-specific output. */
  variant?: Variant;
}

function nodeRules(
  node: LayoutNode,
  parent: ContainerNode | undefined,
  prefix: string,
  variant: Variant | undefined,
  out: string[],
): void {
  if (node.hidden) return;
  if (variant?.hiddenNodeIds.includes(node.id)) {
    out.push(`${prefix}.${nodeClass(node.id)} {\n  display: none;\n}`);
    return;
  }

  const style: Style = variant
    ? applyStyleOverride(node.style, variant.styleOverrides[node.id])
    : node.style;

  // The root maps onto <body>, which is already selected by the body class.
  const selector =
    parent === undefined ? prefix || 'body' : `${prefix}.${nodeClass(node.id)}`;

  const decls = styleDeclarations(node, style, parent);
  if (decls.length || style.rawCss) {
    out.push(formatRule(selector, decls, style.rawCss));
  }

  if (isContainer(node)) {
    if (!variant) out.push(...collapseRules(node));
    for (const child of node.children) {
      nodeRules(child, node, prefix, variant, out);
    }
  }
}

/**
 * Variant rules are only the *differences*, scoped under the body class. A
 * variant that changes nothing emits nothing.
 */
function variantRules(layout: Layout, variant: Variant): string[] {
  if (!variant.bodyClass) return [];
  const out: string[] = [];
  const prefix = `body.${variant.bodyClass} `;

  for (const [nodeId, override] of Object.entries(variant.styleOverrides)) {
    const node = findById(layout.root, nodeId);
    if (!node || node.hidden) continue;
    const parent = findParent(layout.root, nodeId);
    const merged = applyStyleOverride(node.style, override);
    const decls = diffDeclarations(
      styleDeclarations(node, node.style, parent),
      styleDeclarations(node, merged, parent),
    );
    if (decls.length || override.rawCss) {
      out.push(
        formatRule(`${prefix}.${nodeClass(nodeId)}`, decls, override.rawCss),
      );
    }
  }

  for (const nodeId of variant.hiddenNodeIds) {
    out.push(`${prefix}.${nodeClass(nodeId)} {\n  display: none;\n}`);
  }

  return out;
}

/** Declarations present in `next` that differ from `base`. */
function diffDeclarations(base: Decl[], next: Decl[]): Decl[] {
  const baseMap = new Map(base);
  return next.filter(([prop, value]) => baseMap.get(prop) !== value);
}

function findById(root: LayoutNode, id: string): LayoutNode | undefined {
  if (root.id === id) return root;
  for (const child of childrenOf(root)) {
    const found = findById(child, id);
    if (found) return found;
  }
  return undefined;
}

function findParent(root: LayoutNode, id: string): ContainerNode | undefined {
  if (!isContainer(root)) return undefined;
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParent(child, id);
    if (found) return found;
  }
  return undefined;
}

/** Token overrides scoped to a layout, emitted at the top of `index.css`. */
function tokenBlock(selector: string, tokens: Record<string, string>): string {
  const entries = Object.entries(tokens);
  if (!entries.length) return '';
  const body = entries.map(([name, value]) => `  ${name}: ${value};`).join('\n');
  return `${selector} {\n${body}\n}`;
}

export function emitCss(layout: Layout): string {
  const sections: string[] = [];

  sections.push(banner(`${layout.name} — index.css`, [
    'Generated by TSH Layout Creator. Safe to hand-edit: re-importing this',
    'layout keeps your changes in the imported tier.',
    '',
    'Design tokens come from ../main.css and the pack theme.css.',
  ]));

  const layoutTokens = tokenBlock(':root', layout.tokenOverrides);
  if (layoutTokens) {
    sections.push(`/* ── Layout tokens ─────────────────────────────────── */\n\n${layoutTokens}`);
  }

  // Body sizing mirrors the repo: fixed canvas, hidden overflow, and opacity 0
  // until globals.js fades it in once the first data arrives.
  sections.push(
    `/* ── Canvas ────────────────────────────────────────── */\n\n` +
      formatRule('body', [
        ['font-family', 'var(--font)'],
        ['margin', '0'],
        ['opacity', '0'],
        ['overflow', 'hidden'],
        ['width', `${layout.canvas.width}px`],
        ['height', `${layout.canvas.height}px`],
        ['position', 'relative'],
        ['color', 'var(--text-color)'],
      ]),
  );

  const elementRules: string[] = [];
  for (const child of layout.root.children) {
    nodeRules(child, layout.root, '', undefined, elementRules);
  }
  if (isContainer(layout.root) && layout.root.stack.collapseEmpty) {
    elementRules.push(...collapseRules(layout.root));
  }
  if (elementRules.length) {
    sections.push(
      `/* ── Elements ──────────────────────────────────────── */\n\n${elementRules.join('\n\n')}`,
    );
  }

  for (const variant of layout.variants) {
    if (!variant.bodyClass) continue;
    const rules = [
      tokenBlock(`body.${variant.bodyClass}`, variant.tokenOverrides),
      ...variantRules(layout, variant),
    ].filter(Boolean);
    if (rules.length) {
      sections.push(
        `/* ── Variant: ${variant.name} ─────────────────────── */\n\n${rules.join('\n\n')}`,
      );
    }
  }

  return `${sections.filter(Boolean).join('\n\n')}\n`;
}

export function banner(title: string, lines: string[] = []): string {
  const rule = '═'.repeat(59);
  const body = lines.map((l) => (l ? `   ${l}` : '')).join('\n');
  return `/* ${rule}\n   ${title}\n${body ? `${body}\n` : ''}   ${rule} */`;
}
