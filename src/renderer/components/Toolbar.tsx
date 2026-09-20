/**
 * Top toolbar: pack persistence, the TSH connection, the Advanced switch,
 * preview scenario selection and export.
 */

import { useEffect, useMemo, useState } from 'react';
import { emitPack } from '@shared/emit';
import type { WriteReport } from '@shared/ipc';
import { SCENARIOS } from '@shared/fixtures/scenarios';
import { canRedo, canUndo, useEditor } from '../store/editor';
import { Toggle } from './controls';

export function Toolbar(): JSX.Element {
  const pack = useEditor((s) => s.pack);
  const packPath = useEditor((s) => s.packPath);
  const dirty = useEditor((s) => s.dirty);
  const advanced = useEditor((s) => s.advanced);
  const setAdvanced = useEditor((s) => s.setAdvanced);
  const setPack = useEditor((s) => s.setPack);
  const markSaved = useEditor((s) => s.markSaved);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const undoable = useEditor(canUndo);
  const redoable = useEditor(canRedo);
  const tsh = useEditor((s) => s.tsh);
  const setTsh = useEditor((s) => s.setTsh);
  const scenarioId = useEditor((s) => s.preview.scenarioId);
  const setScenario = useEditor((s) => s.setScenario);
  const updatePack = useEditor((s) => s.updatePack);

  const [exporting, setExporting] = useState(false);

  // Look for a TSH install once at startup so exporting is one click later.
  useEffect(() => {
    void window.creator.detectTsh().then((install) => {
      if (install) setTsh(install);
    });
  }, [setTsh]);

  // Ctrl/Cmd+Z and Ctrl/Cmd+S, which anyone will reach for reflexively.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((event.key === 'z' && event.shiftKey) || event.key === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 's') {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function save(): Promise<void> {
    const path = await window.creator.savePack(packPath, pack);
    if (path) markSaved(path);
  }

  async function open(): Promise<void> {
    const result = await window.creator.openPack();
    if (result) setPack(result.pack, result.path);
  }

  return (
    <>
      <div className="toolbar">
        <span className="toolbar__title">TSH Layout Creator</span>

        <input
          className="input"
          style={{ width: 200 }}
          value={pack.name}
          onChange={(e) => updatePack((p) => void (p.name = e.target.value))}
          title="Pack name — also the folder your shared theme is written to"
        />

        <button className="btn" onClick={open}>
          Open
        </button>
        <button className="btn" onClick={save}>
          Save{dirty ? ' •' : ''}
        </button>

        <button className="btn" disabled={!undoable} onClick={undo} title="Ctrl+Z">
          ↶
        </button>
        <button className="btn" disabled={!redoable} onClick={redo} title="Ctrl+Shift+Z">
          ↷
        </button>

        <div className="toolbar__spacer" />

        <label className="hint">Preview data</label>
        <select
          className="select"
          style={{ width: 170 }}
          value={scenarioId}
          onChange={(e) => setScenario(e.target.value)}
          title={SCENARIOS.find((s) => s.id === scenarioId)?.description}
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <Toggle checked={advanced} onChange={setAdvanced} label="Advanced" />

        <button
          className="btn btn--primary"
          disabled={!pack.layouts.length}
          onClick={() => setExporting(true)}
        >
          Export
        </button>
      </div>

      {!tsh?.valid ? (
        <div className="banner banner--warn">
          No TournamentStreamHelper install found, so exporting and live preview
          are unavailable.{' '}
          <button
            className="btn btn--sm"
            onClick={async () => {
              const install = await window.creator.chooseTshFolder();
              if (install) setTsh(install);
            }}
          >
            Locate it
          </button>
        </div>
      ) : null}

      {exporting ? <ExportDialog onClose={() => setExporting(false)} /> : null}
    </>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const pack = useEditor((s) => s.pack);
  const tsh = useEditor((s) => s.tsh);
  const [report, setReport] = useState<WriteReport | undefined>();
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  // Emitting is pure and fast, so it runs straight off the current pack —
  // what's listed here is exactly what the buttons below write.
  const fresh = useMemo(() => emitPack(pack), [pack]);

  async function writeToTsh(): Promise<void> {
    if (!tsh?.valid) return;
    setBusy(true);
    try {
      const written = await window.creator.writeFiles({
        layoutDir: tsh.layoutDir,
        files: fresh.files,
        allowOverwriteForeign: overwrite,
      });
      setReport(written);
    } finally {
      setBusy(false);
    }
  }

  async function exportZip(): Promise<void> {
    setBusy(true);
    try {
      await window.creator.exportZip(pack, fresh.files);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>

        <div className="hint">
          {fresh.files.length} file{fresh.files.length === 1 ? '' : 's'} across{' '}
          {pack.layouts.length} layout{pack.layouts.length === 1 ? '' : 's'}.
        </div>

        {fresh.warnings.length ? (
          <div className="banner banner--warn" style={{ borderRadius: 6 }}>
            {fresh.warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        ) : null}

        <ul className="list" style={{ maxHeight: 180, overflowY: 'auto' }}>
          {fresh.files.map((file) => (
            <li key={file.path} className="list__item">
              <span className="list__label mono">{file.path}</span>
              <span className="list__badge">{file.kind}</span>
            </li>
          ))}
        </ul>

        <Toggle
          checked={overwrite}
          onChange={setOverwrite}
          label="Overwrite files this app didn't create"
        />
        <div className="hint">
          Off by default. Existing layouts that weren't generated here are left
          untouched and listed as skipped.
        </div>

        {report ? (
          <div className="banner banner--info" style={{ borderRadius: 6 }}>
            Wrote {report.written.length} file
            {report.written.length === 1 ? '' : 's'}.
            {report.skipped.length ? (
              <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                {report.skipped.map((s) => (
                  <li key={s.path}>
                    <span className="mono">{s.path}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="modal__actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn" disabled={busy} onClick={exportZip}>
            Save zip
          </button>
          <button
            className="btn btn--primary"
            disabled={busy || !tsh?.valid}
            onClick={writeToTsh}
            title={tsh?.valid ? tsh.layoutDir : 'No TSH install located'}
          >
            Write into TSH
          </button>
        </div>
      </div>
    </div>
  );
}
