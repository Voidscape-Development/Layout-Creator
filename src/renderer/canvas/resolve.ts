/**
 * Resolving bindings for the canvas.
 *
 * Mirrors what the emitted `index.js` does at runtime, with one honest
 * difference: Japanese transcription needs Kuroshiro, which only exists inside
 * a real TSH layout. The canvas shows the original string and flags it, and
 * the live preview is where that gets verified for real.
 */

import type { Binding, ScopeValues } from '@shared/model/bindings';
import { resolvePath } from '@shared/model/bindings';

type State = Record<string, unknown>;

/** `score.1.team.2.player.1.name` -> the value, or undefined. */
function getPath(state: State, path: string): unknown {
  let cursor: unknown = state;
  for (const piece of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[piece];
  }
  return cursor;
}

export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || String(value).length === 0;
}

export interface ResolvedBinding {
  value: string;
  empty: boolean;
  /** True when a transform could not be applied faithfully on the canvas. */
  approximated: boolean;
}

export function resolveBinding(
  state: State,
  binding: Binding,
  scope: ScopeValues,
  scoreboardNumber = 1,
): ResolvedBinding {
  const path = resolvePath(binding.path, scope).replaceAll(
    '{sb}',
    String(scoreboardNumber),
  );

  let raw = getPath(state, path);
  let approximated = false;

  for (const transform of binding.transforms) {
    if (isEmptyValue(raw)) break;
    switch (transform) {
      case 'uppercase':
        raw = String(raw).toUpperCase();
        break;
      case 'lowercase':
        raw = String(raw).toLowerCase();
        break;
      case 'trim':
        raw = String(raw).trim();
        break;
      case 'transcript':
        // Kuroshiro is not available here. Non-Japanese text is unaffected at
        // runtime anyway, so this only under-represents Japanese input.
        if (/[぀-ヿ一-龯]/.test(String(raw))) approximated = true;
        break;
      case 'asset-path':
        // Handled by the image renderer, which needs the prefix separately.
        break;
    }
  }

  if (isEmptyValue(raw) && binding.fallback) raw = binding.fallback;

  const empty = isEmptyValue(raw);
  let value = empty ? '' : String(raw);
  if (!empty && binding.template) {
    value = binding.template.replaceAll('{value}', value);
  }

  return { value, empty, approximated };
}

/** Asset paths in TSH state are relative to the install root. */
export function assetUrl(
  value: string,
  tshRoot: string | undefined,
  remote: boolean,
): string | undefined {
  if (!value) return undefined;
  if (remote || /^https?:/i.test(value)) return value;
  if (!tshRoot) return undefined;
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
  return `file://${tshRoot.replace(/\\/g, '/')}/${normalized}`;
}
