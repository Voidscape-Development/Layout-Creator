/**
 * Theme editor.
 *
 * Shows the three token layers at once — pack, layout, variant — and makes it
 * obvious which level a value is coming from. That visibility is the whole
 * reason per-layout overrides are safe to offer: without it, "why is this one
 * overlay a different red" becomes unanswerable.
 */

import { useState } from 'react';
import { CORE_TOKENS, isValidTokenName } from '@shared/model/tokens';
import type { TokenDef } from '@shared/model/tokens';
import { useEditor } from '../store/editor';
import { Field, Section, TextInput } from './controls';

type Level = 'pack' | 'layout' | 'variant';

export function ThemePanel(): JSX.Element {
  const pack = useEditor((s) => s.pack);
  const layout = useEditor((s) => s.layout());
  const variant = useEditor((s) => s.variant());
  const updatePack = useEditor((s) => s.updatePack);
  const updateLayout = useEditor((s) => s.updateLayout);
  const [level, setLevel] = useState<Level>('pack');
  const [newToken, setNewToken] = useState('');

  const target =
    level === 'pack'
      ? pack.theme
      : level === 'layout'
        ? (layout?.tokenOverrides ?? {})
        : (variant?.tokenOverrides ?? {});

  function setToken(name: string, value: string | undefined): void {
    if (level === 'pack') {
      updatePack((p) => {
        if (value === undefined) delete p.theme[name];
        else p.theme[name] = value;
      });
      return;
    }
    if (!layout) return;
    updateLayout(layout.id, (l) => {
      if (level === 'layout') {
        if (value === undefined) delete l.tokenOverrides[name];
        else l.tokenOverrides[name] = value;
        return;
      }
      const v = l.variants.find((x) => x.id === variant?.id);
      if (!v) return;
      if (value === undefined) delete v.tokenOverrides[name];
      else v.tokenOverrides[name] = value;
    });
  }

  /** Where the value actually in effect for this token comes from. */
  function sourceOf(name: string): Level | 'default' {
    if (variant?.tokenOverrides[name] !== undefined) return 'variant';
    if (layout?.tokenOverrides[name] !== undefined) return 'layout';
    if (pack.theme[name] !== undefined) return 'pack';
    return 'default';
  }

  function effectiveValue(name: string, def?: TokenDef): string {
    return (
      variant?.tokenOverrides[name] ??
      layout?.tokenOverrides[name] ??
      pack.theme[name] ??
      def?.fallback ??
      ''
    );
  }

  const customNames = Object.keys(target).filter(
    (name) => !CORE_TOKENS.some((t) => t.name === name),
  );

  return (
    <div className="pane__scroll">
      <div className="banner banner--info">
        Editing the <strong>{level}</strong> layer.
        {level === 'pack'
          ? ' Changes here apply to every layout in the pack.'
          : level === 'layout'
            ? ` Overrides the pack theme for "${layout?.name ?? ''}" only.`
            : ` Overrides everything for the "${variant?.name ?? ''}" variant only.`}
      </div>

      <Section title="Layer">
        <div className="row">
          {(['pack', 'layout', 'variant'] as const).map((l) => (
            <button
              key={l}
              className={`btn btn--sm${level === l ? ' btn--primary' : ''}`}
              disabled={(l === 'layout' && !layout) || (l === 'variant' && !variant)}
              onClick={() => setLevel(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Colours">
        {CORE_TOKENS.filter((t) => t.group === 'color' || t.group === 'player').map(
          (def) => (
            <TokenRow
              key={def.name}
              def={def}
              value={target[def.name]}
              effective={effectiveValue(def.name, def)}
              source={sourceOf(def.name)}
              level={level}
              onChange={(v) => setToken(def.name, v)}
            />
          ),
        )}
      </Section>

      <Section title="Shape and type">
        {CORE_TOKENS.filter((t) => t.group === 'shape' || t.group === 'type').map(
          (def) => (
            <TokenRow
              key={def.name}
              def={def}
              value={target[def.name]}
              effective={effectiveValue(def.name, def)}
              source={sourceOf(def.name)}
              level={level}
              onChange={(v) => setToken(def.name, v)}
            />
          ),
        )}
      </Section>

      <Section title="Custom tokens" defaultOpen={customNames.length > 0}>
        <div className="hint">
          Your own variables, available as{' '}
          <span className="mono">var(--name)</span> anywhere in this pack.
        </div>
        {customNames.map((name) => (
          <Field key={name} label={name} stacked>
            <div className="row">
              <TextInput
                value={target[name]}
                onChange={(v) => setToken(name, v)}
                mono
              />
              <button
                className="btn btn--sm btn--danger"
                onClick={() => setToken(name, undefined)}
              >
                ×
              </button>
            </div>
          </Field>
        ))}
        <div className="row">
          <input
            className="input"
            placeholder="--my-accent"
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
          />
          <button
            className="btn btn--sm"
            disabled={!isValidTokenName(newToken)}
            title={
              isValidTokenName(newToken)
                ? 'Add token'
                : 'Names must start with -- followed by a letter'
            }
            onClick={() => {
              setToken(newToken, '#ffffff');
              setNewToken('');
            }}
          >
            Add
          </button>
        </div>
      </Section>
    </div>
  );
}

function TokenRow({
  def,
  value,
  effective,
  source,
  level,
  onChange,
}: {
  def: TokenDef;
  value: string | undefined;
  effective: string;
  source: Level | 'default';
  level: Level;
  onChange: (value: string | undefined) => void;
}): JSX.Element {
  const overriddenHere = value !== undefined;
  const pickable = /^#[0-9a-f]{6}$/i.test(effective);

  return (
    <Field label={def.label} advancedLabel={def.name} help={def.help}>
      <div className="row">
        {pickable ? (
          <input
            className="swatch"
            type="color"
            value={effective}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <span
            className="swatch"
            style={{ background: effective }}
            title={effective}
          />
        )}
        <TextInput
          value={overriddenHere ? value : effective}
          onChange={onChange}
          mono
        />
        {overriddenHere && level !== 'pack' ? (
          <button
            className="btn btn--sm"
            title="Remove this override and inherit again"
            onClick={() => onChange(undefined)}
          >
            ↺
          </button>
        ) : null}
      </div>
      {source !== level ? (
        <div className="field__help">
          Currently inherited from <strong>{source}</strong>. Typing here creates
          a {level} override.
        </div>
      ) : null}
    </Field>
  );
}
