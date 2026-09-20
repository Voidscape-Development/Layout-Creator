/**
 * The design canvas.
 *
 * Renders the model at its true pixel size, scaled to fit. Dragging behaves
 * differently per layout mode, and that difference is the whole point of the
 * Stack/Free split:
 *
 * - In a **free** parent, dragging moves the child's x/y. Direct manipulation.
 * - In a **stack** parent, position comes from flex flow, so dragging reorders
 *   the child among its siblings instead of moving it. Pretending otherwise
 *   would let users set coordinates that the exported CSS then ignores.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { ContainerNode, LayoutNode } from '@shared/model/nodes';
import { parentOf } from '@shared/model/nodes';
import { applyStyleOverride } from '@shared/model/style';
import { componentDef } from '@shared/model/components';
import { useEditor } from '../store/editor';
import { findScenario } from '@shared/fixtures/scenarios';
import { reactStyle, tokenStyle } from '../canvas/style';
import { assetUrl, resolveBinding } from '../canvas/resolve';

interface DragState {
  nodeId: string;
  mode: 'move' | 'reorder';
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  /** Sibling index at drag start, for reorder mode. */
  startIndex: number;
}

export function Canvas(): JSX.Element {
  const layout = useEditor((s) => s.layout());
  const variant = useEditor((s) => s.variant());
  const tokens = useEditor((s) => s.tokens());
  const selectedIds = useEditor((s) => s.selectedNodeIds);
  const selectNodes = useEditor((s) => s.selectNodes);
  const updateNode = useEditor((s) => s.updateNode);
  const moveNode = useEditor((s) => s.moveNode);
  const scenarioId = useEditor((s) => s.preview.scenarioId);
  const tsh = useEditor((s) => s.tsh);

  const [zoom, setZoom] = useState(0.5);
  const [hoveredId, setHoveredId] = useState<string | undefined>();
  const dragRef = useRef<DragState | undefined>(undefined);

  const scenario = useMemo(() => findScenario(scenarioId), [scenarioId]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent, node: LayoutNode) => {
      if (!layout || node.locked) return;
      event.stopPropagation();
      selectNodes([node.id]);

      const parent = parentOf(layout.root, node.id);
      if (!parent) return;

      const index = parent.children.findIndex((c) => c.id === node.id);
      dragRef.current = {
        nodeId: node.id,
        mode: parent.layoutMode === 'free' ? 'move' : 'reorder',
        startX: event.clientX,
        startY: event.clientY,
        originX: node.style.free.x,
        originY: node.style.free.y,
        startIndex: index,
      };
      (event.target as Element).setPointerCapture?.(event.pointerId);
    },
    [layout, selectNodes],
  );

  useEffect(() => {
    function onMove(event: PointerEvent): void {
      const drag = dragRef.current;
      if (!drag || !layout) return;

      const dx = (event.clientX - drag.startX) / zoom;
      const dy = (event.clientY - drag.startY) / zoom;

      if (drag.mode === 'move') {
        updateNode(drag.nodeId, (node) => {
          node.style.free.x = Math.round(drag.originX + dx);
          node.style.free.y = Math.round(drag.originY + dy);
        });
        return;
      }

      // Reorder: translate travel along the parent's main axis into an index
      // shift. Approximate on purpose — precise drop targets would need
      // measured child boxes, and this reads well enough at editor speed.
      const parent = parentOf(layout.root, drag.nodeId);
      if (!parent) return;
      const horizontal = parent.stack.direction.startsWith('row');
      const reversed = parent.stack.direction.endsWith('reverse');
      const travel = horizontal ? dx : dy;
      const step = 80;
      const direction = reversed ? -1 : 1;
      const shift = Math.trunc((travel * direction) / step);
      const target = Math.max(
        0,
        Math.min(parent.children.length - 1, drag.startIndex + shift),
      );
      const current = parent.children.findIndex((c) => c.id === drag.nodeId);
      if (target !== current) moveNode(drag.nodeId, parent.id, target);
    }

    function onUp(): void {
      dragRef.current = undefined;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [layout, moveNode, updateNode, zoom]);

  if (!layout || !variant) {
    return (
      <div className="canvas-area">
        <div className="empty">
          No layout selected.
          <br />
          Add one from the panel on the left.
        </div>
      </div>
    );
  }

  const renderNode = (
    node: LayoutNode,
    parent: ContainerNode | undefined,
  ): JSX.Element | null => {
    if (node.hidden || variant.hiddenNodeIds.includes(node.id)) return null;

    const style = applyStyleOverride(node.style, variant.styleOverrides[node.id]);
    const css = reactStyle(node, style, parent);
    const classes = [
      'canvas-node',
      selectedIds.includes(node.id) ? 'canvas-node--selected' : '',
      hoveredId === node.id && !selectedIds.includes(node.id)
        ? 'canvas-node--hovered'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        key={node.id}
        className={classes}
        style={css}
        onPointerDown={(e) => onPointerDown(e, node)}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHoveredId(node.id);
        }}
        onPointerLeave={() => setHoveredId(undefined)}
      >
        {renderContents(node, parent)}
      </div>
    );
  };

  const renderContents = (
    node: LayoutNode,
    _parent: ContainerNode | undefined,
  ): React.ReactNode => {
    switch (node.type) {
      case 'container':
        return node.children.map((child) => renderNode(child, node));

      case 'text': {
        if (!node.binding) return <div className="text">{node.content}</div>;
        const resolved = resolveBinding(scenario.state, node.binding, node.scope ?? {});
        return (
          <div
            className={`text${resolved.empty ? ' text_empty' : ''}`}
            title={resolved.approximated ? 'Transcribed live by TSH' : undefined}
          >
            {resolved.value}
          </div>
        );
      }

      case 'image': {
        let src = node.src;
        if (node.binding) {
          const resolved = resolveBinding(
            scenario.state,
            node.binding,
            node.scope ?? {},
          );
          const remote = !node.binding.transforms.includes('asset-path');
          src = resolved.empty
            ? undefined
            : assetUrl(resolved.value, tsh?.root, remote);
        }
        if (!src) return <PlaceholderBox label="image" />;
        return (
          <img
            src={src}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: node.fit }}
          />
        );
      }

      case 'character':
        // Character art comes from the user's own TSH asset packs, which the
        // canvas has no index of. The live preview resolves it properly.
        return <PlaceholderBox label="character" />;

      case 'component': {
        const def = componentDef(node.kind);
        return <PlaceholderBox label={def?.label ?? node.kind} component />;
      }

      case 'shape':
        return null;
    }
  };

  const stageStyle: CSSProperties = {
    ...tokenStyle(tokens),
    width: layout.canvas.width,
    height: layout.canvas.height,
    transform: `scale(${zoom})`,
    position: 'relative',
    fontFamily: 'var(--font)',
    color: 'var(--text-color)',
    overflow: 'hidden',
  };

  // Returns the toolbar and stage as siblings; App's `.canvas-wrap` grid owns
  // the row layout so the animation timeline can share it.
  return (
    <>
      <div className="canvas-toolbar">
        <span className="hint">
          {layout.canvas.width}&times;{layout.canvas.height}
        </span>
        <div className="toolbar__spacer" />
        <label className="hint">Zoom</label>
        <input
          type="range"
          min={0.15}
          max={1}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
        <span className="hint">{Math.round(zoom * 100)}%</span>
        <button className="btn btn--sm" onClick={() => setZoom(0.5)}>
          Reset
        </button>
      </div>

      <div className="canvas-area" onPointerDown={() => selectNodes([])}>
        <div className="canvas-stage" style={stageStyle}>
          {layout.root.children.map((child) => renderNode(child, layout.root))}
        </div>
      </div>
    </>
  );
}

function PlaceholderBox({
  label,
  component,
}: {
  label: string;
  component?: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        border: `1px dashed ${component ? '#7c6cff' : '#666'}`,
        borderRadius: 4,
        color: '#999',
        fontSize: 12,
        fontFamily: 'sans-serif',
        background: component ? 'rgba(124,108,255,0.08)' : 'rgba(0,0,0,0.15)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      {label}
    </div>
  );
}
