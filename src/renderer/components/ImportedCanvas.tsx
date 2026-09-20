/**
 * Canvas stand-in for an imported layout.
 *
 * There is no element model to draw, so drawing an empty stage would be a lie.
 * Instead this shows the layout's own shipped preview render where it has one,
 * and states plainly what can and can't be changed.
 */

import { useMemo } from 'react';
import { analyzeImported } from '@shared/import/layout';
import { defaultImportedEdits } from '@shared/model/pack';
import { useEditor } from '../store/editor';

export function ImportedCanvas(): JSX.Element {
  const layout = useEditor((s) => s.layout());
  const analysis = useMemo(
    () => (layout ? analyzeImported(layout) : undefined),
    [layout],
  );

  if (!layout) return <div className="canvas-area" />;

  const preview = layout.importedSource?.previewImage;
  const edits = layout.importedEdits ?? defaultImportedEdits();
  const mapped = Object.keys(edits.colorMappings).length;
  const fontsMapped = Object.keys(edits.fontMappings).length;

  return (
    <div className="canvas-area" style={{ alignContent: 'center' }}>
      <div style={{ maxWidth: 720, padding: 24, textAlign: 'center' }}>
        {preview ? (
          <img
            src={`file://${preview.replace(/\\/g, '/')}`}
            alt={`${layout.name} preview`}
            style={{
              maxWidth: '100%',
              maxHeight: 420,
              borderRadius: 6,
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              background: '#000',
            }}
          />
        ) : (
          <div
            className="empty"
            style={{
              border: '1px dashed var(--ui-border)',
              borderRadius: 8,
              padding: 48,
            }}
          >
            This layout ships no preview image.
          </div>
        )}

        <div className="hint" style={{ marginTop: 16, lineHeight: 1.7 }}>
          <strong>{layout.name}</strong> was imported from{' '}
          <span className="mono">/layout/{layout.importedFrom}/</span> and keeps
          its original markup, stylesheet and script. There's no canvas for it
          because nothing here can safely turn hand-written CSS back into
          movable elements.
          <br />
          <br />
          Use the <strong>Element</strong> tab to retheme it, and the{' '}
          <strong>Code</strong> tab to read its source.
          {analysis ? (
            <>
              <br />
              <br />
              Found {analysis.colors.length} colour
              {analysis.colors.length === 1 ? '' : 's'},{' '}
              {analysis.tokens.length} variable
              {analysis.tokens.length === 1 ? '' : 's'} and{' '}
              {analysis.fonts.length} font declaration
              {analysis.fonts.length === 1 ? '' : 's'}.
              {mapped || fontsMapped ? (
                <>
                  {' '}
                  You've remapped {mapped} colour{mapped === 1 ? '' : 's'}
                  {fontsMapped
                    ? ` and ${fontsMapped} font${fontsMapped === 1 ? '' : 's'}`
                    : ''}
                  .
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
