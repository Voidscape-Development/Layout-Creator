/**
 * Test harness for the component runtime.
 *
 * The runtime ships as a source string, so tests evaluate it with just enough
 * browser globals to drive a renderer for real. That catches the failures a
 * string-comparison test cannot: a slot semantic handled wrong, a bye that
 * should have been dropped, a placement computed off by a tier.
 *
 * Not a `.test.ts` file so vitest treats it as a module rather than a suite.
 */

import { COMPONENTS_RUNTIME } from './runtime';

export type Renderer = (
  options: Record<string, unknown>,
  event: { data: unknown },
) => Promise<string | { html: string; afterMount: unknown }>;

/**
 * Evaluate the runtime with just enough globals to exercise a renderer.
 * `afterMount` is never invoked here — it measures real layout boxes, which
 * only a browser can supply.
 */
export function loadRuntime(): Record<string, Renderer> {
  const globals: Record<string, unknown> = {
    // The runtime reads values through lodash `get`; this covers the paths it uses.
    _: {
      get(object: unknown, path: string | string[], fallback?: unknown) {
        const parts = Array.isArray(path) ? path : path.split('.');
        let cursor: unknown = object;
        for (const part of parts) {
          if (cursor === null || typeof cursor !== 'object') return fallback;
          cursor = (cursor as Record<string, unknown>)[part];
        }
        return cursor === undefined ? fallback : cursor;
      },
    },
    Transcript: async (text: string) => text,
    CharacterDisplay: async () => undefined,
    gsap: { fromTo: () => undefined },
    $: () => ({ get: () => null, find: () => ({ each: () => undefined }) }),
    ResizeObserver: undefined,
    console: { warn: () => undefined, error: () => undefined, log: () => undefined },
  };

  const window: Record<string, unknown> = { scoreboardNumber: 1 };
  const factory = new Function(
    'window',
    ...Object.keys(globals),
    `${COMPONENTS_RUNTIME}\nreturn window.TSHComponents;`,
  );
  const api = factory(window, ...Object.values(globals)) as {
    renderers: Record<string, Renderer>;
  };
  return api.renderers;
}

/** Render one component and return its markup. `afterMount` is not invoked —
 *  it measures real layout boxes, which only a browser can supply. */
export async function renderComponent(
  kind: string,
  data: unknown,
  options: Record<string, unknown> = {},
): Promise<string> {
  const renderer = loadRuntime()[kind];
  if (!renderer) throw new Error(`no renderer for ${kind}`);
  const result = await renderer(options, { data });
  return typeof result === 'string' ? result : result.html;
}
