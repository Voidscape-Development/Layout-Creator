/**
 * The element tree.
 *
 * Nodes map one-to-one onto emitted DOM elements. Each carries the semantic
 * classes the official layouts use (`.player`, `.name`, `.score`, `.chip`…)
 * so emitted markup stays recognisable to anyone who has edited a TSH layout
 * by hand, and so `globals.js` helpers that key off those classes keep working.
 */

import type { Binding } from './bindings';
import type { ComponentKind, ComponentOptions } from './components';
import type { LayoutMode, StackConfig, Style } from './style';

export type NodeType =
  | 'container'
  | 'text'
  | 'image'
  | 'character'
  | 'component'
  | 'shape';

/**
 * Scope narrows which team/player a subtree's bindings resolve against.
 * Declaring `{ team: 1 }` on a container both fills `{team}` in descendant
 * paths and emits a `.p1` class, matching the repo's `.p1 .name` selectors.
 */
export interface NodeScope {
  team?: 1 | 2;
  player?: number;
}

export interface BaseNode {
  id: string;
  /** Shown in the layer tree. Also seeds the emitted class name. */
  name: string;
  type: NodeType;
  /**
   * Semantic classes emitted on the element, in addition to the generated
   * identity class. Users can add their own for custom CSS to hook onto.
   */
  classes: string[];
  scope?: NodeScope;
  style: Style;
  /** Hidden nodes are skipped by the emitter entirely. */
  hidden?: boolean;
  /** Excluded from canvas selection; useful for backdrop furniture. */
  locked?: boolean;
}

export interface ContainerNode extends BaseNode {
  type: 'container';
  layoutMode: LayoutMode;
  /** Only meaningful when `layoutMode === 'stack'`. */
  stack: StackConfig;
  children: LayoutNode[];
}

export interface TextNode extends BaseNode {
  type: 'text';
  /** Static text, used when `binding` is absent. */
  content: string;
  binding?: Binding;
  /**
   * Emit through `SetInnerHtml()` so the value crossfades on change and gets
   * `.text_empty` bookkeeping. Turning this off emits a plain assignment —
   * appropriate for static labels that never change.
   */
  animateChanges: boolean;
  /** Crossfade duration handed to `SetInnerHtml`. */
  fadeTime: number;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  /** Path relative to the layout folder, for bundled art. */
  src?: string;
  binding?: Binding;
  fit: 'cover' | 'contain' | 'fill' | 'none';
  /** Hide the element entirely when the bound value is empty. */
  hideWhenEmpty: boolean;
}

/**
 * A `CharacterDisplay()` container. Options mirror the documented settings
 * from the TSH wiki's "Layout Javascript editing" page.
 */
export interface CharacterNode extends BaseNode {
  type: 'character';
  /** Asset pack key, e.g. `base_files/icon`. Empty means largest available. */
  assetKey: string;
  /** Data path to the team or player, e.g. `score.{sb}.team.{team}`. */
  source: string;
  customZoom: number;
  customCenter: [number, number];
  scaleFillX: boolean;
  scaleFillY: boolean;
  scaleBasedOnParent: boolean;
  useDividers: boolean;
  /** `[start, end]` slices; `null` end means "to the end". */
  slicePlayer?: [number, number | null];
  sliceCharacter?: [number, number | null];
}

export interface ComponentNode extends BaseNode {
  type: 'component';
  kind: ComponentKind;
  options: ComponentOptions;
}

export interface ShapeNode extends BaseNode {
  type: 'shape';
  shape: 'rect' | 'ellipse';
}

export type LayoutNode =
  | ContainerNode
  | TextNode
  | ImageNode
  | CharacterNode
  | ComponentNode
  | ShapeNode;

/* ── Tree helpers ───────────────────────────────────────────────────────── */

export function isContainer(node: LayoutNode): node is ContainerNode {
  return node.type === 'container';
}

export function childrenOf(node: LayoutNode): LayoutNode[] {
  return isContainer(node) ? node.children : [];
}

/** Depth-first walk, parents before children. */
export function* walk(node: LayoutNode): Generator<LayoutNode> {
  yield node;
  for (const child of childrenOf(node)) yield* walk(child);
}

export function findNode(root: LayoutNode, id: string): LayoutNode | undefined {
  for (const node of walk(root)) {
    if (node.id === id) return node;
  }
  return undefined;
}

/** Path from root to the node, inclusive. Empty if the node isn't in the tree. */
export function pathToNode(root: LayoutNode, id: string): LayoutNode[] {
  if (root.id === id) return [root];
  for (const child of childrenOf(root)) {
    const sub = pathToNode(child, id);
    if (sub.length) return [root, ...sub];
  }
  return [];
}

export function parentOf(root: LayoutNode, id: string): ContainerNode | undefined {
  const path = pathToNode(root, id);
  const parent = path[path.length - 2];
  return parent && isContainer(parent) ? parent : undefined;
}

/**
 * Scope in effect for a node: the nearest ancestor value for each field,
 * with the node's own declaration winning.
 */
export function effectiveScope(root: LayoutNode, id: string): NodeScope {
  const out: NodeScope = {};
  for (const node of pathToNode(root, id)) {
    if (node.scope?.team !== undefined) out.team = node.scope.team;
    if (node.scope?.player !== undefined) out.player = node.scope.player;
  }
  return out;
}

/**
 * Whether a node participates in flex flow. Children of a `free` container are
 * absolutely positioned and therefore out of flow; everything else is in it.
 */
export function isInFlow(root: LayoutNode, id: string): boolean {
  const parent = parentOf(root, id);
  return parent ? parent.layoutMode === 'stack' : false;
}
