/**
 * Emitted-code viewer.
 *
 * Deliberately prominent rather than buried: the promise of the native tier is
 * that its output is readable and hand-editable, and the fastest way to keep
 * that honest is to show people the code while they design.
 */

import { useMemo, useState } from 'react';
import { emitCss, emitHtml, emitJs } from '@shared/emit';
import { packFolder } from '@shared/emit';
import { useEditor } from '../store/editor';

type Tab = 'html' | 'css' | 'js';

export function CodePanel(): JSX.Element {
  const pack = useEditor((s) => s.pack);
  const layout = useEditor((s) => s.layout());
  const variant = useEditor((s) => s.variant());
  const [tab, setTab] = useState<Tab>('css');

  const source = useMemo(() => {
    if (!layout || !variant) return '';
    if (layout.tier === 'imported') {
      const imported = layout.importedSource;
      if (!imported) return '// No source captured for this imported layout.';
      if (tab === 'css') return imported.css;
      if (tab === 'js') return imported.js;
      return imported.html[variant.fileName] ?? '';
    }
    switch (tab) {
      case 'html':
        return emitHtml(pack, layout, variant, {
          packAssetPath: `../${packFolder(pack)}`,
        });
      case 'css':
        return emitCss(layout);
      case 'js':
        return emitJs(layout);
    }
  }, [pack, layout, variant, tab]);

  if (!layout) return <div className="empty">No layout selected.</div>;

  return (
    <div className="pane__scroll">
      <div className="row" style={{ padding: '8px 12px', gap: 4 }}>
        {(['html', 'css', 'js'] as const).map((t) => (
          <button
            key={t}
            className={`btn btn--sm${tab === t ? ' btn--primary' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.toUpperCase()}
          </button>
        ))}
        <div className="toolbar__spacer" />
        <button
          className="btn btn--sm"
          onClick={() => void navigator.clipboard.writeText(source)}
        >
          Copy
        </button>
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: '0 12px 12px',
          whiteSpace: 'pre',
          overflowX: 'auto',
          lineHeight: 1.5,
        }}
      >
        {source}
      </pre>
    </div>
  );
}
