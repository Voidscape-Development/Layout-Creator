/**
 * The derived getters are read straight from components as
 * `useEditor((s) => s.tokens())`. zustand v5 subscribes through
 * `useSyncExternalStore`, which compares snapshots by reference, so a getter
 * that rebuilds its result on every call reports a changed snapshot on every
 * render. React retries until it throws "Maximum update depth exceeded", which
 * unmounts the tree and leaves the packaged app showing a blank window.
 *
 * These tests pin the invariant that makes that impossible: same inputs, same
 * reference out — and a fresh reference once the inputs really change.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createLayoutFromTemplate } from '@shared/model/factory';
import { emptyPack } from '@shared/model/pack';
import { useEditor } from './editor';

function loadStarterPack(): void {
  const pack = emptyPack('Test pack');
  pack.layouts.push(
    createLayoutFromTemplate('scoreboard', 'Scoreboard', 'scoreboard'),
  );
  useEditor.getState().setPack(pack);
}

describe('derived editor state', () => {
  beforeEach(() => {
    loadStarterPack();
  });

  it('returns the same tokens reference while nothing changes', () => {
    const first = useEditor.getState().tokens();
    expect(useEditor.getState().tokens()).toBe(first);
    expect(useEditor.getState().tokens()).toBe(first);
  });

  it('returns a new tokens reference once the theme changes', () => {
    const before = useEditor.getState().tokens();
    useEditor.getState().updatePack((pack) => {
      pack.theme['--accent'] = '#ff0066';
    });

    const after = useEditor.getState().tokens();
    expect(after).not.toBe(before);
    expect(after['--accent']).toBe('#ff0066');
  });

  it('returns the same selectedNodes reference while the selection holds', () => {
    const root = useEditor.getState().layout()?.root;
    const firstChild = root?.children[0];
    expect(firstChild).toBeDefined();

    useEditor.getState().selectNodes([firstChild!.id]);

    const nodes = useEditor.getState().selectedNodes();
    expect(nodes).toHaveLength(1);
    expect(useEditor.getState().selectedNodes()).toBe(nodes);
  });

  it('returns a new selectedNodes reference once the selection changes', () => {
    const children = useEditor.getState().layout()?.root.children ?? [];
    expect(children.length).toBeGreaterThan(1);

    useEditor.getState().selectNodes([children[0]!.id]);
    const before = useEditor.getState().selectedNodes();

    useEditor.getState().selectNodes([children[1]!.id]);
    const after = useEditor.getState().selectedNodes();

    expect(after).not.toBe(before);
    expect(after[0]?.id).toBe(children[1]!.id);
  });

  it('keeps the empty selection stable', () => {
    useEditor.getState().selectNodes([]);
    const empty = useEditor.getState().selectedNodes();
    expect(empty).toHaveLength(0);
    expect(useEditor.getState().selectedNodes()).toBe(empty);
  });
});
