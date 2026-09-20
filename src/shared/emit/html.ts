/**
 * HTML emitter.
 *
 * One file per variant. Markup is intentionally sparse — almost every element
 * is an empty div that `index.js` fills at runtime, which is exactly how the
 * official layouts work and what lets `SetInnerHtml` manage crossfades and
 * `.text_empty` bookkeeping.
 */

import type { LayoutNode } from '../model/nodes';
import { isContainer } from '../model/nodes';
import type { Layout, Pack, Variant } from '../model/pack';
import { componentDef } from '../model/components';
import { applyStyleOverride } from '../model/style';
import { derivedClasses, nodeClass } from './css';

const INDENT = '  ';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Classes emitted on a node: its identity class, the scope marker the repo's
 * selectors rely on (`.p1` / `.p2`), any style-derived classes, and whatever
 * semantic classes the user added.
 */
function classListFor(node: LayoutNode, variant: Variant): string[] {
  const style = applyStyleOverride(node.style, variant.styleOverrides[node.id]);
  const classes = [nodeClass(node.id)];

  if (node.scope?.team) classes.push(`p${node.scope.team}`);
  if (node.type === 'character') classes.push('character_container');
  if (node.type === 'component') {
    const def = componentDef(node.kind);
    classes.push(`component`, `component_${node.kind}`);
    if (def) classes.push(`${node.kind}_host`);
  }

  classes.push(...derivedClasses(node, style));
  classes.push(...node.classes);

  // Preserve order but drop duplicates — a user may re-add a derived class.
  return [...new Set(classes.filter(Boolean))];
}

function renderNode(
  node: LayoutNode,
  layout: Layout,
  variant: Variant,
  depth: number,
): string {
  if (node.hidden) return '';
  // Hidden-in-variant nodes still render; CSS hides them. That keeps the DOM
  // shape identical across variants so one index.js serves them all.

  const pad = INDENT.repeat(depth);
  const cls = classListFor(node, variant).join(' ');
  const open = `${pad}<div class="${cls}">`;

  if (isContainer(node)) {
    const children = node.children
      .map((child) => renderNode(child, layout, variant, depth + 1))
      .filter(Boolean);
    if (!children.length) return `${open}</div>`;
    return `${open}\n${children.join('\n')}\n${pad}</div>`;
  }

  // A static, non-animated text node can be inlined. Anything bound to data is
  // left empty for index.js to populate through SetInnerHtml.
  if (node.type === 'text' && !node.binding && !node.animateChanges) {
    return `${open}<div class="text">${escapeHtml(node.content)}</div></div>`;
  }

  // A static image needs no runtime work either.
  if (node.type === 'image' && node.src && !node.binding) {
    return `${open}<img src="${escapeHtml(node.src)}" /></div>`;
  }

  return `${open}</div>`;
}

export interface HtmlEmitOptions {
  /** Relative path from the layout folder to the pack's shared assets. */
  packAssetPath: string;
}

/** Whether any visible node in the layout needs the component runtime. */
export function usesComponents(layout: Layout): boolean {
  const stack: LayoutNode[] = [layout.root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.hidden) continue;
    if (node.type === 'component') return true;
    if (isContainer(node)) stack.push(...node.children);
  }
  return false;
}

export function emitHtml(
  pack: Pack,
  layout: Layout,
  variant: Variant,
  options: HtmlEmitOptions,
): string {
  const body = layout.root.children
    .map((child) => renderNode(child, layout, variant, 2))
    .filter(Boolean)
    .join('\n');

  const bodyClass = variant.bodyClass ? ` class="${variant.bodyClass}"` : '';
  const themeHref = `${options.packAssetPath}/theme.css`;
  // The component runtime must be in place before index.js runs its first
  // Update(), so it loads in <head> alongside globals.js.
  const usesAny = usesComponents(layout);
  const componentsTag = usesAny
    ? `\n    <script src="${escapeHtml(`${options.packAssetPath}/components.js`)}"></script>`
    : '';
  // Loaded before ./index.css so a layout's own rules override the defaults.
  const componentsCssTag = usesAny
    ? `\n    <link rel="stylesheet" href="${escapeHtml(`${options.packAssetPath}/components.css`)}" />`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`${pack.name} — ${layout.name}${variant.bodyClass ? ` (${variant.name})` : ''}`)}</title>
    <script src="../include/globals.js"></script>${componentsTag}
    <link rel="stylesheet" href="../main.css" />
    <link rel="stylesheet" href="${escapeHtml(themeHref)}" />${componentsCssTag}
    <link rel="stylesheet" href="./index.css" />
  </head>
  <body${bodyClass}>
${body}
    <script src="index.js"></script>
  </body>
</html>
`;
}
