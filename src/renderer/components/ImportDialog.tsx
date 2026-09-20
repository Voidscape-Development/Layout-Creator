/**
 * Importing a hand-written layout from the user's TSH install.
 *
 * The dialog is explicit about what import does and doesn't give you, because
 * the honest answer is "less than you might expect" and finding that out after
 * an hour of work would be worse.
 */

import { useEffect, useState } from 'react';
import type { DiscoveredLayout } from '@shared/ipc';
import { importLayout } from '@shared/import/layout';
import { useEditor } from '../store/editor';

export function ImportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const tsh = useEditor((s) => s.tsh);
  const addLayout = useEditor((s) => s.addLayout);
  const packLayouts = useEditor((s) => s.pack.layouts);

  const [layouts, setLayouts] = useState<DiscoveredLayout[] | undefined>();
  const [selected, setSelected] = useState<DiscoveredLayout | undefined>();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!tsh?.valid) {
      setLayouts([]);
      return;
    }
    void window.creator
      .listLayouts(tsh.layoutDir)
      .then(setLayouts)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLayouts([]);
      });
  }, [tsh]);

  const alreadyImported = new Set(
    packLayouts.map((l) => l.importedFrom).filter(Boolean),
  );

  const visible = (layouts ?? []).filter((l) =>
    l.folderName.toLowerCase().includes(filter.toLowerCase()),
  );

  async function doImport(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setError(undefined);
    try {
      const files = await window.creator.readLayout(selected.path);
      const { layout } = importLayout(files);
      addLayout(layout);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ width: 720 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Import a layout</h2>

        <div className="banner banner--info" style={{ borderRadius: 6 }}>
          Imported layouts keep their original HTML, CSS and JavaScript exactly
          as written. You can retheme them — edit their variables, promote
          hardcoded colours to tokens, swap fonts — but not move or restyle
          individual elements, because nothing here can safely reverse a
          hand-written stylesheet into an editable model.
        </div>

        {!tsh?.valid ? (
          <div className="empty">
            No TournamentStreamHelper install located.
            <br />
            Use <strong>Locate it</strong> in the banner at the top first.
          </div>
        ) : (
          <>
            <input
              className="input"
              placeholder="Filter by folder name…"
              value={filter}
              autoFocus
              onChange={(e) => setFilter(e.target.value)}
            />

            {layouts === undefined ? (
              <div className="empty">Scanning {tsh.layoutDir}…</div>
            ) : visible.length === 0 ? (
              <div className="empty">
                {filter ? 'Nothing matches that filter.' : 'No layouts found.'}
              </div>
            ) : (
              <ul
                className="list"
                style={{ maxHeight: 320, overflowY: 'auto' }}
              >
                {visible.map((layout) => {
                  const imported = alreadyImported.has(layout.folderName);
                  return (
                    <li
                      key={layout.path}
                      className={`list__item${
                        selected?.path === layout.path ? ' list__item--selected' : ''
                      }`}
                      onClick={() => setSelected(layout)}
                      onDoubleClick={() => void doImport()}
                    >
                      {layout.previewImage ? (
                        <img
                          src={`file://${layout.previewImage.replace(/\\/g, '/')}`}
                          alt=""
                          style={{
                            width: 64,
                            height: 36,
                            objectFit: 'cover',
                            borderRadius: 3,
                            background: '#000',
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 64,
                            height: 36,
                            borderRadius: 3,
                            border: '1px dashed var(--ui-border)',
                          }}
                        />
                      )}
                      <span className="list__label">
                        {layout.folderName}
                        <div className="hint">
                          {layout.htmlFiles.length} variant
                          {layout.htmlFiles.length === 1 ? '' : 's'}
                          {layout.hasCss ? '' : ' · no index.css'}
                          {layout.hasJs ? '' : ' · no index.js'}
                        </div>
                      </span>
                      {imported ? (
                        <span className="list__badge" title="Already in this pack">
                          in pack
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {selected ? (
          <div className="hint">
            Imports as <span className="mono">{selected.folderName}</span> with{' '}
            {selected.htmlFiles.length} variant
            {selected.htmlFiles.length === 1 ? '' : 's'}. Exporting writes back
            to the same folder.
          </div>
        ) : null}

        {error ? (
          <div className="banner banner--warn" style={{ borderRadius: 6 }}>
            {error}
          </div>
        ) : null}

        <div className="modal__actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            disabled={!selected || busy}
            onClick={doImport}
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
