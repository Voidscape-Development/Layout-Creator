/**
 * Editing surface for an imported layout.
 *
 * This replaces the element inspector, which has nothing to show for a layout
 * with no model tree. What it offers instead is the set of changes that can be
 * made safely to hand-written CSS: rewrite its variables, promote its
 * hardcoded colours to tokens, and swap its fonts.
 *
 * Colour promotion is the important one. Only four of the official layouts
 * declare any CSS variables, so for most imports this is the *only* route to
 * rebranding — and it's the thing people actually want to do to someone
 * else's scoreboard.
 */

import { useMemo, useState } from 'react';
import { analyzeImported } from '@shared/import/layout';
import type { ColorGroup } from '@shared/import/css';
import { CORE_TOKENS } from '@shared/model/tokens';
import { defaultImportedEdits } from '@shared/model/pack';
import { useEditor } from '../store/editor';
import { Field, Section, TextInput } from './controls';

export function ImportedPanel(): JSX.Element {
  const layout = useEditor((s) => s.layout());
  const pack = useEditor((s) => s.pack);
  const updateLayout = useEditor((s) => s.updateLayout);
  const tokens = useEditor((s) => s.tokens());

  const analysis = useMemo(
    () => (layout ? analyzeImported(layout) : undefined),
    [layout],
  );

  if (!layout || !analysis) {
    return <div className="empty">Not an imported layout.</div>;
  }

  const edits = layout.importedEdits ?? defaultImportedEdits();

  function setColorMapping(normalized: string, replacement: string | undefined): void {
    if (!layout) return;
    updateLayout(layout.id, (l) => {
      l.importedEdits ??= defaultImportedEdits();
      if (replacement) l.importedEdits.colorMappings[normalized] = replacement;
      else delete l.importedEdits.colorMappings[normalized];
    });
  }

  function setFontMapping(original: string, replacement: string | undefined): void {
    if (!layout) return;
    updateLayout(layout.id, (l) => {
      l.importedEdits ??= defaultImportedEdits();
      if (replacement) l.importedEdits.fontMappings[original] = replacement;
      else delete l.importedEdits.fontMappings[original];
    });
  }

  function setToken(name: string, value: string): void {
    if (!layout) return;
    updateLayout(layout.id, (l) => void (l.tokenOverrides[name] = value));
  }

  const mappedCount = Object.keys(edits.colorMappings).length;
  const brandable = analysis.colors.filter((c) => !c.likelyIncidental);
  const incidental = analysis.colors.filter((c) => c.likelyIncidental);

  return (
    <div className="pane__scroll">
      <div className="banner banner--info">
        <strong>Imported layout.</strong> Its original files are kept exactly as
        written; only the values below are rewritten on export.
      </div>

      <Section title="Colours">
        {analysis.colors.length === 0 ? (
          <div className="hint">
            No hardcoded colours found in this stylesheet.
          </div>
        ) : (
          <>
            <div className="hint">
              Point a colour at one of your pack's tokens and every place this
              stylesheet uses it follows your theme. {mappedCount > 0
                ? `${mappedCount} mapped so far.`
                : ''}
            </div>

            {brandable.map((group) => (
              <ColorRow
                key={group.normalized}
                group={group}
                mapping={edits.colorMappings[group.normalized]}
                tokens={tokens}
                onChange={(v) => setColorMapping(group.normalized, v)}
              />
            ))}

            {incidental.length ? (
              <IncidentalColors
                groups={incidental}
                mappings={edits.colorMappings}
                tokens={tokens}
                onChange={setColorMapping}
              />
            ) : null}
          </>
        )}
      </Section>

      <Section title="Variables" defaultOpen={analysis.tokens.length > 0}>
        {analysis.tokens.length === 0 ? (
          <div className="hint">
            This layout declares no CSS variables of its own. Any token you add
            from the Theme tab is written into a new <span className="mono">
            :root</span> block on export.
          </div>
        ) : (
          analysis.tokens.map((token) => (
            <Field key={token.name} label={token.name} stacked>
              <div className="row">
                {/^#[0-9a-f]{6}$/i.test(
                  layout.tokenOverrides[token.name] ?? token.value,
                ) ? (
                  <input
                    className="swatch"
                    type="color"
                    value={layout.tokenOverrides[token.name] ?? token.value}
                    onChange={(e) => setToken(token.name, e.target.value)}
                  />
                ) : (
                  <span
                    className="swatch"
                    style={{
                      background: layout.tokenOverrides[token.name] ?? token.value,
                    }}
                  />
                )}
                <TextInput
                  value={layout.tokenOverrides[token.name] ?? token.value}
                  onChange={(v) => setToken(token.name, v)}
                  mono
                />
              </div>
              {layout.tokenOverrides[token.name] !== undefined &&
              layout.tokenOverrides[token.name] !== token.value ? (
                <div className="field__help">
                  Originally <span className="mono">{token.value}</span>
                </div>
              ) : null}
            </Field>
          ))
        )}
      </Section>

      <Section title="Fonts" defaultOpen={false}>
        {analysis.fonts.length === 0 ? (
          <div className="hint">
            No literal font stacks found — this layout already uses a variable.
          </div>
        ) : (
          dedupeFonts(analysis.fonts.map((f) => f.value)).map((value) => (
            <Field key={value} label="Replace" stacked>
              <div className="hint mono">{value}</div>
              <TextInput
                value={edits.fontMappings[value] ?? ''}
                placeholder="Leave blank to keep as-is"
                onChange={(v) => setFontMapping(value, v.trim() || undefined)}
                mono
              />
              <button
                className="btn btn--sm"
                onClick={() => setFontMapping(value, 'var(--font)')}
              >
                Use the pack font
              </button>
            </Field>
          ))
        )}
      </Section>

      <Section title="Source" defaultOpen={false}>
        <div className="hint">
          Imported from{' '}
          <span className="mono">/layout/{layout.importedFrom}/</span>
          {'. '}
          Exporting writes back to that folder, overwriting the original files.
        </div>
        <Field label="Variants">
          <span className="hint">
            {layout.variants.map((v) => v.fileName).join(', ')}
          </span>
        </Field>
        <Field label="Canvas">
          <span className="hint">
            {layout.canvas.width}&times;{layout.canvas.height}
          </span>
        </Field>
        <div className="hint">
          Pack theme in use: <strong>{pack.name}</strong>. Tokens you reference
          above resolve from it.
        </div>
      </Section>
    </div>
  );
}

function ColorRow({
  group,
  mapping,
  tokens,
  onChange,
}: {
  group: ColorGroup;
  mapping: string | undefined;
  tokens: Record<string, string>;
  onChange: (value: string | undefined) => void;
}): JSX.Element {
  // Only colour-ish tokens are worth offering as a target here.
  const tokenNames = Object.keys(tokens).filter((t) => /color|bg/i.test(t));
  const coreFirst = [
    ...CORE_TOKENS.filter((t) => tokenNames.includes(t.name)).map((t) => t.name),
    ...tokenNames.filter((n) => !CORE_TOKENS.some((t) => t.name === n)),
  ];

  const current = mapping?.startsWith('var(') ? mapping.slice(4, -1).trim() : '';

  return (
    <div className="field field--stacked" style={{ gap: 5 }}>
      <div className="row">
        <span
          className="swatch"
          style={{ background: group.normalized }}
          title={group.sample}
        />
        <span className="mono" style={{ flex: 1 }}>
          {group.sample}
        </span>
        <span className="list__badge">
          {group.occurrences.length}&times;
        </span>
      </div>
      <div className="row">
        <select
          className="select"
          value={current}
          onChange={(e) =>
            onChange(e.target.value ? `var(${e.target.value})` : undefined)
          }
        >
          <option value="">Leave as-is</option>
          {coreFirst.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {mapping ? (
          <span
            className="swatch"
            style={{ background: tokens[current] ?? 'transparent' }}
            title={`Becomes ${mapping}`}
          />
        ) : null}
      </div>
    </div>
  );
}

function IncidentalColors({
  groups,
  mappings,
  tokens,
  onChange,
}: {
  groups: ColorGroup[];
  mappings: Record<string, string>;
  tokens: Record<string, string>;
  onChange: (normalized: string, value: string | undefined) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const mappedHere = groups.filter((g) => mappings[g.normalized]).length;

  return (
    <>
      <button className="btn btn--sm" onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'} {groups.length} shadow and grey value
        {groups.length === 1 ? '' : 's'}
        {mappedHere ? ` (${mappedHere} mapped)` : ''}
      </button>
      {open ? (
        <>
          <div className="hint">
            Greys and semi-transparent values, usually shadows and borders
            rather than brand colours.
          </div>
          {groups.map((group) => (
            <ColorRow
              key={group.normalized}
              group={group}
              mapping={mappings[group.normalized]}
              tokens={tokens}
              onChange={(v) => onChange(group.normalized, v)}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

function dedupeFonts(values: string[]): string[] {
  return [...new Set(values)];
}
