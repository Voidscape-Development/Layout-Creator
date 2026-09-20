/**
 * Form controls.
 *
 * Each takes a plain-language `label` and an optional `advancedLabel` — the
 * real CSS property name. The Advanced switch in the toolbar swaps which one
 * is shown, so beginners never see `flex-basis` and experts can find it.
 */

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useEditor } from '../store/editor';

interface FieldProps {
  label: string;
  advancedLabel?: string;
  help?: string;
  children: ReactNode;
  stacked?: boolean;
}

export function Field({
  label,
  advancedLabel,
  help,
  children,
  stacked,
}: FieldProps): JSX.Element {
  const advanced = useEditor((s) => s.advanced);
  const shown = advanced && advancedLabel ? advancedLabel : label;
  return (
    <div className={stacked ? 'field field--stacked' : 'field'}>
      <label
        className={`field__label${advanced && advancedLabel ? ' field__label--advanced' : ''}`}
        title={advanced ? label : advancedLabel}
      >
        {shown}
      </label>
      {children}
      {help ? <div className="field__help">{help}</div> : null}
    </div>
  );
}

export function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <button className="section__head" onClick={() => setOpen(!open)}>
        <span className="section__chevron">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open ? <div className="section__body">{children}</div> : null}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}): JSX.Element {
  return (
    <input
      className="input"
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        // Clearing the box means "unset", not zero — the difference matters
        // for properties whose absence is meaningful (auto width, no radius).
        onChange(raw === '' ? undefined : Number(raw));
      }}
    />
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <input
      className="input"
      type="text"
      style={mono ? { fontFamily: 'var(--ui-mono)', fontSize: 12 } : undefined}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <select
      className="select"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <label className="checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/**
 * Colour control that understands design tokens.
 *
 * A value like `var(--p1-score-bg-color)` must stay a token reference — that
 * is what makes the pack theme work — so the picker only writes a literal when
 * the user explicitly switches away from the token.
 */
export function ColorInput({
  value,
  onChange,
  tokens,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  tokens: Record<string, string>;
}): JSX.Element {
  const tokenNames = Object.keys(tokens).filter((t) => /color|bg/i.test(t));
  // Narrowed via a local rather than `value?.startsWith` so the slice below
  // is provably safe.
  const isToken = value !== undefined && value.startsWith('var(');
  const currentToken = isToken ? value.slice(4, -1).trim() : '';

  // A token's own value may itself be a var() chain or an oklch() expression,
  // neither of which <input type="color"> accepts, so the swatch falls back to
  // showing the raw string instead of a colour well.
  const literal = isToken ? tokens[currentToken] : value;
  const pickable = literal && /^#[0-9a-f]{6}$/i.test(literal);

  return (
    <div className="row">
      <select
        className="select"
        value={isToken ? currentToken : '__literal'}
        onChange={(e) => {
          const next = e.target.value;
          if (next === '__literal') onChange(literal ?? '#ffffff');
          else onChange(`var(${next})`);
        }}
      >
        <option value="__literal">Custom colour</option>
        {tokenNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {isToken ? (
        <span
          className="swatch"
          style={{ background: literal ?? 'transparent' }}
          title={`${currentToken}: ${literal ?? 'unset'}`}
        />
      ) : pickable ? (
        <input
          className="swatch"
          type="color"
          value={literal}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <TextInput value={value} onChange={onChange} mono />
      )}
    </div>
  );
}

/**
 * A length that may be a number of pixels or any CSS string. Numbers get a
 * spinner; anything else falls back to a text box so `50%`, `fit-content` and
 * `calc()` remain typeable.
 */
export function LengthInput({
  value,
  onChange,
  placeholder = 'auto',
}: {
  value: number | string | undefined;
  onChange: (value: number | string | undefined) => void;
  placeholder?: string;
}): JSX.Element {
  const isNumeric = value === undefined || typeof value === 'number';
  const [freeform, setFreeform] = useState(!isNumeric);

  return (
    <div className="row">
      {freeform ? (
        <TextInput
          value={value === undefined ? '' : String(value)}
          onChange={(v) => onChange(v === '' ? undefined : v)}
          placeholder={placeholder}
          mono
        />
      ) : (
        <NumberInput
          value={typeof value === 'number' ? value : undefined}
          onChange={onChange}
          placeholder={placeholder}
        />
      )}
      <button
        className="btn btn--sm"
        title={freeform ? 'Switch to pixels' : 'Enter a CSS value'}
        onClick={() => {
          const next = !freeform;
          setFreeform(next);
          // Converting between modes shouldn't silently keep a value the other
          // mode can't represent.
          if (!next && typeof value === 'string') onChange(undefined);
        }}
      >
        {freeform ? 'css' : 'px'}
      </button>
    </div>
  );
}
