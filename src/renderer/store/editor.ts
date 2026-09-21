/**
 * Editor state.
 *
 * One store holds the whole pack. Mutating actions go through `commit()`,
 * which snapshots the previous pack for undo — simple structural sharing is
 * plenty at this document size, and it means every action is undoable without
 * each one having to implement an inverse.
 */

import { create } from 'zustand';
import type { Layout, Pack, Variant } from '@shared/model/pack';
import {
  effectiveTokens,
  emptyPack,
  findLayout,
  findVariant,
  newId,
  sanitizeFileName,
} from '@shared/model/pack';
import type { ContainerNode, LayoutNode } from '@shared/model/nodes';
import { findNode, isContainer, parentOf, walk } from '@shared/model/nodes';
import type { Tween } from '@shared/model/animation';
import type { TshInstall } from '@shared/ipc';
import { DEFAULT_SCENARIO } from '@shared/fixtures/scenarios';

const HISTORY_LIMIT = 100;

export interface EditorState {
  pack: Pack;
  packPath?: string;
  dirty: boolean;

  selectedLayoutId?: string;
  selectedVariantId?: string;
  selectedNodeIds: string[];

  /** Reveals raw CSS property names and the raw-CSS boxes. */
  advanced: boolean;

  tsh?: TshInstall;

  preview: {
    scenarioId: string;
    live: boolean;
    /** Animation scrub position in seconds; undefined means "not scrubbing". */
    playhead?: number;
  };

  past: Pack[];
  future: Pack[];

  // Derived ---------------------------------------------------------------
  layout(): Layout | undefined;
  variant(): Variant | undefined;
  selectedNodes(): LayoutNode[];
  tokens(): Record<string, string>;

  // Pack ------------------------------------------------------------------
  setPack(pack: Pack, path?: string): void;
  updatePack(recipe: (pack: Pack) => void): void;
  markSaved(path: string): void;

  // History ---------------------------------------------------------------
  undo(): void;
  redo(): void;

  // Selection -------------------------------------------------------------
  selectLayout(id: string): void;
  selectVariant(id: string): void;
  selectNodes(ids: string[]): void;
  toggleNode(id: string): void;

  // Layouts ---------------------------------------------------------------
  addLayout(layout: Layout): void;
  removeLayout(id: string): void;
  updateLayout(id: string, recipe: (layout: Layout) => void): void;

  // Variants --------------------------------------------------------------
  addVariant(name: string): void;
  removeVariant(id: string): void;

  // Nodes -----------------------------------------------------------------
  addNode(node: LayoutNode, parentId?: string): void;
  updateNode(id: string, recipe: (node: LayoutNode) => void): void;
  removeNodes(ids: string[]): void;
  moveNode(id: string, newParentId: string, index: number): void;
  duplicateNode(id: string): void;

  // Animation -------------------------------------------------------------
  addTween(tween: Tween): void;
  updateTween(id: string, recipe: (tween: Tween) => void): void;
  removeTween(id: string): void;

  // Misc ------------------------------------------------------------------
  setAdvanced(value: boolean): void;
  setTsh(install: TshInstall | undefined): void;
  setScenario(id: string): void;
  setLive(live: boolean): void;
  setPlayhead(seconds: number | undefined): void;
}

/**
 * Structured clone keeps undo snapshots independent. The pack is plain JSON,
 * so this is exact and cheap enough at editor scale.
 */
function snapshot(pack: Pack): Pack {
  return structuredClone(pack);
}

/**
 * Caches a derived value against the state references it was computed from.
 *
 * Components read derived state with `useEditor((s) => s.tokens())`, and
 * zustand v5 subscribes through `useSyncExternalStore`, which compares
 * snapshots by reference. A derived getter that builds a fresh object on every
 * call therefore looks like a changed snapshot on every render, and React
 * re-renders until it gives up with "Maximum update depth exceeded" — which
 * unmounts the whole tree and leaves a blank window. Returning the previous
 * value while the inputs are unchanged keeps those snapshots stable.
 */
function derived<Deps extends readonly unknown[], Value>(
  compute: (...deps: Deps) => Value,
): (...deps: Deps) => Value {
  let last: { deps: Deps; value: Value } | undefined;
  return (...deps: Deps): Value => {
    if (
      last &&
      last.deps.length === deps.length &&
      last.deps.every((dep, i) => Object.is(dep, deps[i]))
    ) {
      return last.value;
    }
    const value = compute(...deps);
    last = { deps, value };
    return value;
  };
}

export const useEditor = create<EditorState>((set, get) => {
  const computeTokens = derived(
    (pack: Pack, layout: Layout | undefined, variant: Variant | undefined) =>
      layout ? effectiveTokens(pack, layout, variant) : pack.theme,
  );

  const computeSelectedNodes = derived(
    (layout: Layout | undefined, ids: string[]) =>
      layout
        ? ids
            .map((id) => findNode(layout.root, id))
            .filter((n): n is LayoutNode => Boolean(n))
        : [],
  );

  /** Apply a mutation to a cloned pack, pushing the old one onto the undo stack. */
  function commit(recipe: (pack: Pack) => void): void {
    const state = get();
    const previous = snapshot(state.pack);
    const next = snapshot(state.pack);
    recipe(next);
    next.updatedAt = new Date().toISOString();
    set({
      pack: next,
      dirty: true,
      past: [...state.past, previous].slice(-HISTORY_LIMIT),
      future: [],
    });
  }

  /** Run a recipe against the currently selected layout. */
  function withLayout(recipe: (layout: Layout) => void): void {
    const id = get().selectedLayoutId;
    if (!id) return;
    commit((pack) => {
      const layout = findLayout(pack, id);
      if (layout) recipe(layout);
    });
  }

  return {
    pack: emptyPack(),
    dirty: false,
    selectedNodeIds: [],
    advanced: false,
    preview: { scenarioId: DEFAULT_SCENARIO.id, live: false },
    past: [],
    future: [],

    // ── Derived ─────────────────────────────────────────────────────────
    layout() {
      const { pack, selectedLayoutId } = get();
      return selectedLayoutId ? findLayout(pack, selectedLayoutId) : undefined;
    },

    variant() {
      const layout = get().layout();
      const id = get().selectedVariantId;
      if (!layout) return undefined;
      return (id ? findVariant(layout, id) : undefined) ?? layout.variants[0];
    },

    selectedNodes() {
      return computeSelectedNodes(get().layout(), get().selectedNodeIds);
    },

    tokens() {
      return computeTokens(get().pack, get().layout(), get().variant());
    },

    // ── Pack ────────────────────────────────────────────────────────────
    setPack(pack, path) {
      set({
        pack,
        packPath: path,
        dirty: false,
        past: [],
        future: [],
        selectedLayoutId: pack.layouts[0]?.id,
        selectedVariantId: pack.layouts[0]?.variants[0]?.id,
        selectedNodeIds: [],
      });
    },

    updatePack(recipe) {
      commit(recipe);
    },

    markSaved(path) {
      set({ packPath: path, dirty: false });
    },

    // ── History ─────────────────────────────────────────────────────────
    undo() {
      const { past, pack, future } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      set({
        pack: previous,
        past: past.slice(0, -1),
        future: [snapshot(pack), ...future].slice(0, HISTORY_LIMIT),
        dirty: true,
      });
    },

    redo() {
      const { past, pack, future } = get();
      const next = future[0];
      if (!next) return;
      set({
        pack: next,
        past: [...past, snapshot(pack)].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        dirty: true,
      });
    },

    // ── Selection ───────────────────────────────────────────────────────
    selectLayout(id) {
      const layout = findLayout(get().pack, id);
      set({
        selectedLayoutId: id,
        selectedVariantId: layout?.variants[0]?.id,
        selectedNodeIds: [],
      });
    },

    selectVariant(id) {
      set({ selectedVariantId: id });
    },

    selectNodes(ids) {
      set({ selectedNodeIds: ids });
    },

    toggleNode(id) {
      const { selectedNodeIds } = get();
      set({
        selectedNodeIds: selectedNodeIds.includes(id)
          ? selectedNodeIds.filter((n) => n !== id)
          : [...selectedNodeIds, id],
      });
    },

    // ── Layouts ─────────────────────────────────────────────────────────
    addLayout(layout) {
      commit((pack) => {
        pack.layouts.push(layout);
      });
      set({
        selectedLayoutId: layout.id,
        selectedVariantId: layout.variants[0]?.id,
        selectedNodeIds: [],
      });
    },

    removeLayout(id) {
      commit((pack) => {
        pack.layouts = pack.layouts.filter((l) => l.id !== id);
      });
      if (get().selectedLayoutId === id) {
        const first = get().pack.layouts[0];
        set({
          selectedLayoutId: first?.id,
          selectedVariantId: first?.variants[0]?.id,
          selectedNodeIds: [],
        });
      }
    },

    updateLayout(id, recipe) {
      commit((pack) => {
        const layout = findLayout(pack, id);
        if (layout) recipe(layout);
      });
    },

    // ── Variants ────────────────────────────────────────────────────────
    addVariant(name) {
      const id = newId();
      withLayout((layout) => {
        layout.variants.push({
          id,
          name,
          fileName: sanitizeFileName(name),
          // The body class is what scopes this variant's CSS, so it must be
          // present and unique for anything but the default variant.
          bodyClass: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          tokenOverrides: {},
          styleOverrides: {},
          hiddenNodeIds: [],
        });
      });
      set({ selectedVariantId: id });
    },

    removeVariant(id) {
      withLayout((layout) => {
        // The first variant is the layout's index.html; it can't be removed.
        if (layout.variants.length <= 1) return;
        layout.variants = layout.variants.filter((v) => v.id !== id);
      });
      if (get().selectedVariantId === id) {
        set({ selectedVariantId: get().layout()?.variants[0]?.id });
      }
    },

    // ── Nodes ───────────────────────────────────────────────────────────
    addNode(node, parentId) {
      withLayout((layout) => {
        const parent = parentId
          ? findNode(layout.root, parentId)
          : layout.root;
        const target: ContainerNode =
          parent && isContainer(parent) ? parent : layout.root;
        target.children.push(node);
      });
      set({ selectedNodeIds: [node.id] });
    },

    updateNode(id, recipe) {
      withLayout((layout) => {
        const node = findNode(layout.root, id);
        if (node) recipe(node);
      });
    },

    removeNodes(ids) {
      withLayout((layout) => {
        const remove = (container: ContainerNode): void => {
          container.children = container.children.filter((c) => !ids.includes(c.id));
          for (const child of container.children) {
            if (isContainer(child)) remove(child);
          }
        };
        remove(layout.root);

        // Tweens referencing removed nodes would emit dead selectors.
        for (const tween of layout.animation.tweens) {
          tween.targetIds = tween.targetIds.filter((t) => !ids.includes(t));
        }
        for (const variant of layout.variants) {
          for (const id of ids) delete variant.styleOverrides[id];
          variant.hiddenNodeIds = variant.hiddenNodeIds.filter(
            (n) => !ids.includes(n),
          );
        }
      });
      set({ selectedNodeIds: [] });
    },

    moveNode(id, newParentId, index) {
      withLayout((layout) => {
        const node = findNode(layout.root, id);
        const newParent = findNode(layout.root, newParentId);
        if (!node || !newParent || !isContainer(newParent)) return;

        // Refuse to reparent a node into its own subtree — that would detach
        // the branch from the tree entirely.
        for (const descendant of walk(node)) {
          if (descendant.id === newParentId) return;
        }

        const oldParent = parentOf(layout.root, id);
        if (!oldParent) return;
        oldParent.children = oldParent.children.filter((c) => c.id !== id);
        newParent.children.splice(index, 0, node);
      });
    },

    duplicateNode(id) {
      const layout = get().layout();
      if (!layout) return;
      const source = findNode(layout.root, id);
      if (!source) return;

      // Fresh ids throughout, or the copy would collide in emitted CSS.
      const clone = structuredClone(source);
      for (const node of walk(clone)) node.id = newId();
      clone.name = `${source.name} copy`;

      const parent = parentOf(layout.root, id) ?? layout.root;
      withLayout((l) => {
        const target = findNode(l.root, parent.id);
        if (target && isContainer(target)) target.children.push(clone);
      });
      set({ selectedNodeIds: [clone.id] });
    },

    // ── Animation ───────────────────────────────────────────────────────
    addTween(tween) {
      withLayout((layout) => {
        layout.animation.tweens.push(tween);
      });
    },

    updateTween(id, recipe) {
      withLayout((layout) => {
        const tween = layout.animation.tweens.find((t) => t.id === id);
        if (tween) recipe(tween);
      });
    },

    removeTween(id) {
      withLayout((layout) => {
        layout.animation.tweens = layout.animation.tweens.filter((t) => t.id !== id);
      });
    },

    // ── Misc ────────────────────────────────────────────────────────────
    setAdvanced(value) {
      set({ advanced: value });
    },
    setTsh(install) {
      set({ tsh: install });
    },
    setScenario(id) {
      set({ preview: { ...get().preview, scenarioId: id } });
    },
    setLive(live) {
      set({ preview: { ...get().preview, live } });
    },
    setPlayhead(seconds) {
      set({ preview: { ...get().preview, playhead: seconds } });
    },
  };
});

export function canUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}
