/**
 * Left pane: the layouts in the pack, the variants of the selected layout,
 * and the layer tree of the selected variant.
 */

import { useState } from 'react';
import type { LayoutNode } from '@shared/model/nodes';
import { isContainer } from '@shared/model/nodes';
import { COMPONENTS } from '@shared/model/components';
import { createNode, createComponent, TEMPLATES } from '@shared/model/factory';
import type { TemplateId } from '@shared/model/factory';
import { createLayoutFromTemplate } from '@shared/model/factory';
import { sanitizeFolderName } from '@shared/model/pack';
import { useEditor } from '../store/editor';

export function LeftPane(): JSX.Element {
  return (
    <div className="pane">
      <LayoutList />
      <VariantList />
      <LayerTree />
    </div>
  );
}

function LayoutList(): JSX.Element {
  const layouts = useEditor((s) => s.pack.layouts);
  const selectedId = useEditor((s) => s.selectedLayoutId);
  const select = useEditor((s) => s.selectLayout);
  const remove = useEditor((s) => s.removeLayout);
  const [adding, setAdding] = useState(false);

  return (
    <div className="section">
      <div className="section__head" style={{ cursor: 'default' }}>
        Layouts
        <div className="toolbar__spacer" />
        <button className="btn btn--sm" onClick={() => setAdding(true)}>
          + Add
        </button>
      </div>
      <ul className="list">
        {layouts.length === 0 ? (
          <li className="empty">No layouts yet.</li>
        ) : null}
        {layouts.map((layout) => (
          <li
            key={layout.id}
            className={`list__item${layout.id === selectedId ? ' list__item--selected' : ''}`}
            onClick={() => select(layout.id)}
          >
            <span className="list__label" title={`/layout/${layout.folderName}/`}>
              {layout.name}
            </span>
            {layout.tier === 'imported' ? (
              <span className="list__badge" title="Imported — limited editing">
                imp
              </span>
            ) : null}
            <button
              className="btn btn--sm btn--danger"
              title="Remove from pack"
              onClick={(e) => {
                e.stopPropagation();
                remove(layout.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {adding ? <NewLayoutDialog onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function NewLayoutDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const addLayout = useEditor((s) => s.addLayout);
  const [name, setName] = useState('My scoreboard');
  const [template, setTemplate] = useState<TemplateId>('scoreboard');

  const folder = sanitizeFolderName(name);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New layout</h2>

        <div className="field field--stacked">
          <label className="field__label">Name</label>
          <input
            className="input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <div className="hint">
            Exports to <span className="mono">/layout/{folder || 'layout'}/</span>
          </div>
        </div>

        <div className="field field--stacked">
          <label className="field__label">Start from</label>
          {TEMPLATES.map((t) => (
            <label key={t.id} className="checkbox" style={{ alignItems: 'start' }}>
              <input
                type="radio"
                name="template"
                checked={template === t.id}
                onChange={() => setTemplate(t.id)}
              />
              <span>
                <strong>{t.label}</strong>
                <div className="hint">{t.description}</div>
              </span>
            </label>
          ))}
        </div>

        <div className="modal__actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            disabled={!folder}
            onClick={() => {
              addLayout(createLayoutFromTemplate(template, name.trim() || 'Layout', folder));
              onClose();
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function VariantList(): JSX.Element | null {
  const layout = useEditor((s) => s.layout());
  const selectedId = useEditor((s) => s.selectedVariantId);
  const select = useEditor((s) => s.selectVariant);
  const add = useEditor((s) => s.addVariant);
  const remove = useEditor((s) => s.removeVariant);

  if (!layout) return null;

  return (
    <div className="section">
      <div className="section__head" style={{ cursor: 'default' }}>
        Variants
        <div className="toolbar__spacer" />
        <button
          className="btn btn--sm"
          title="A variant shares this layout's structure and script, with its own colours and tweaks"
          onClick={() => add(`Variant ${layout.variants.length + 1}`)}
        >
          + Add
        </button>
      </div>
      <ul className="list">
        {layout.variants.map((variant, index) => (
          <li
            key={variant.id}
            className={`list__item${variant.id === selectedId ? ' list__item--selected' : ''}`}
            onClick={() => select(variant.id)}
          >
            <span className="list__label" title={variant.fileName}>
              {variant.name}
            </span>
            <span className="list__badge">{variant.fileName}</span>
            {index > 0 ? (
              <button
                className="btn btn--sm btn--danger"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(variant.id);
                }}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LayerTree(): JSX.Element | null {
  const layout = useEditor((s) => s.layout());
  const selectedIds = useEditor((s) => s.selectedNodeIds);
  const selectNodes = useEditor((s) => s.selectNodes);
  const addNode = useEditor((s) => s.addNode);
  const removeNodes = useEditor((s) => s.removeNodes);
  const duplicate = useEditor((s) => s.duplicateNode);
  const [showAdd, setShowAdd] = useState(false);

  if (!layout) return null;

  const targetParent = (): string | undefined => {
    // Add into the selected container, or next to the selected element.
    const selected = selectedIds[0];
    if (!selected) return undefined;
    const node = findNode(layout.root, selected);
    return node && isContainer(node) ? node.id : undefined;
  };

  const renderRow = (node: LayoutNode, depth: number): JSX.Element[] => {
    const rows = [
      <li
        key={node.id}
        className={`list__item${selectedIds.includes(node.id) ? ' list__item--selected' : ''}${
          node.hidden ? ' list__item--muted' : ''
        }`}
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={(e) => {
          if (e.shiftKey) useEditor.getState().toggleNode(node.id);
          else selectNodes([node.id]);
        }}
      >
        <span className="list__label">{node.name}</span>
        <span className="list__badge">
          {node.type === 'container'
            ? node.layoutMode === 'stack'
              ? 'stack'
              : 'free'
            : node.type}
        </span>
      </li>,
    ];
    if (isContainer(node)) {
      for (const child of node.children) rows.push(...renderRow(child, depth + 1));
    }
    return rows;
  };

  return (
    <div className="section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="section__head" style={{ cursor: 'default' }}>
        Elements
        <div className="toolbar__spacer" />
        <button className="btn btn--sm" onClick={() => setShowAdd(!showAdd)}>
          + Add
        </button>
        <button
          className="btn btn--sm"
          disabled={!selectedIds.length}
          onClick={() => selectedIds[0] && duplicate(selectedIds[0])}
          title="Duplicate"
        >
          ⧉
        </button>
        <button
          className="btn btn--sm btn--danger"
          disabled={!selectedIds.length}
          onClick={() => removeNodes(selectedIds)}
        >
          ×
        </button>
      </div>

      {showAdd ? (
        <div className="section__body">
          <div className="row row--wrap">
            {(['container', 'text', 'image', 'character', 'shape'] as const).map(
              (type) => (
                <button
                  key={type}
                  className="btn btn--sm"
                  onClick={() => {
                    addNode(createNode(type), targetParent());
                    setShowAdd(false);
                  }}
                >
                  {type}
                </button>
              ),
            )}
          </div>
          <div className="field__label">Components</div>
          <div className="row row--wrap">
            {COMPONENTS.map((def) => (
              <button
                key={def.kind}
                className="btn btn--sm"
                title={def.description}
                onClick={() => {
                  addNode(createComponent(def.kind), targetParent());
                  setShowAdd(false);
                }}
              >
                {def.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="list pane__scroll">
        {layout.root.children.flatMap((child) => renderRow(child, 0))}
        {layout.root.children.length === 0 ? (
          <li className="empty">
            Nothing here yet.
            <br />
            Add an element to begin.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function findNode(root: LayoutNode, id: string): LayoutNode | undefined {
  if (root.id === id) return root;
  if (!isContainer(root)) return undefined;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}
