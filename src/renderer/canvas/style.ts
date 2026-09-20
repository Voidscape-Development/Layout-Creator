/**
 * Turning the model into inline styles for the canvas.
 *
 * The canvas deliberately reuses the *emitter's* `styleDeclarations()` rather
 * than computing its own styles. That way the canvas and the exported CSS
 * cannot drift: if the canvas shows it, the export produces it.
 */

import type { CSSProperties } from 'react';
import { styleDeclarations } from '@shared/emit/css';
import type { ContainerNode, LayoutNode } from '@shared/model/nodes';
import type { Style } from '@shared/model/style';

/** `border-radius` -> `borderRadius`; custom properties pass through. */
function toCamel(property: string): string {
  if (property.startsWith('--')) return property;
  return property.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

export function reactStyle(
  node: LayoutNode,
  style: Style,
  parent: ContainerNode | undefined,
): CSSProperties {
  const out: Record<string, string> = {};
  for (const [property, value] of styleDeclarations(node, style, parent)) {
    out[toCamel(property)] = value;
  }
  return out as CSSProperties;
}

/** Token map as inline custom properties, applied to the canvas root. */
export function tokenStyle(tokens: Record<string, string>): CSSProperties {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens)) out[name] = value;
  return out as CSSProperties;
}
