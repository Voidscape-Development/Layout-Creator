/**
 * Bracket component tests.
 *
 * The runtime ships as a source string, so these tests evaluate it in a fake
 * browser and drive the real renderer against TSH-shaped bracket data. That
 * catches the failures a string-comparison test cannot: a slot semantic
 * handled wrong, a bye that should have been dropped, a grand-final reset
 * shown before it exists.
 */

import { describe, expect, it } from 'vitest';
import { COMPONENTS_CSS, COMPONENTS_RUNTIME } from './runtime';

/* ── Harness ────────────────────────────────────────────────────────────── */

type Renderer = (
  options: Record<string, unknown>,
  event: { data: unknown },
) => Promise<string | { html: string; afterMount: unknown }>;

/**
 * Evaluate the runtime with just enough globals to exercise a renderer.
 * `afterMount` is never invoked here — it measures real layout boxes, which
 * only a browser can supply.
 */
function loadRuntime(): Record<string, Renderer> {
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

async function renderBracket(
  data: unknown,
  options: Record<string, unknown> = {},
): Promise<string> {
  const renderers = loadRuntime();
  const bracket = renderers['bracket'];
  if (!bracket) throw new Error('bracket renderer missing');
  const result = await bracket(options, { data });
  return typeof result === 'string' ? result : result.html;
}

/* ── Fixture ────────────────────────────────────────────────────────────── */

const EMPTY = -1;
const TBD = -2;

function team(name: string) {
  return { player: { '1': { name, team: '', country: { code: '', asset: '' } } } };
}

/**
 * A small double-elimination phase: two winners rounds, one losers round,
 * a grand final and its reset. Round 3 is the grand final, round 4 the reset.
 */
function bracketData(overrides: Record<string, unknown> = {}) {
  return {
    bracket: {
      players: {
        slot: {
          '1': team('Kestrel'),
          '2': team('Marbles'),
          '3': team('Juno'),
          '4': team('Pike'),
        },
      },
      bracket: {
        progressionsIn: 0,
        progressionsOut: 0,
        rounds: {
          '1': {
            name: 'Winners Semi',
            sets: {
              '0': {
                playerId: [1, 2],
                score: [2, 0],
                completed: true,
                nextWin: [2, 0],
              },
              '1': {
                playerId: [3, 4],
                score: [1, 2],
                completed: true,
                nextWin: [2, 0],
              },
              // A bye: one slot empty. Must never be drawn.
              '2': { playerId: [EMPTY, 4], score: [0, 0], completed: false },
            },
          },
          '2': {
            name: 'Winners Final',
            sets: {
              '0': {
                playerId: [1, 4],
                score: [0, 0],
                completed: false,
                nextWin: [3, 0],
              },
            },
          },
          '-1': {
            name: 'Losers Final',
            sets: {
              '0': {
                playerId: [2, TBD],
                score: [0, 0],
                completed: false,
                nextWin: [3, 0],
              },
            },
          },
          '3': {
            name: 'Grand Final',
            sets: { '0': { playerId: [TBD, TBD], score: [0, 0], completed: false } },
          },
          '4': {
            name: 'Grand Final Reset',
            sets: { '0': { playerId: [TBD, TBD], score: [0, 0], completed: false } },
          },
        },
        ...(overrides['bracket'] as object),
      },
    },
  };
}

/** Count how many set boxes made it into the markup. */
function countSets(html: string): number {
  return (html.match(/class="bracket_set/g) ?? []).length;
}

function hasSet(html: string, round: number, set: number): boolean {
  return html.includes(`data-round="${round}" data-set="${set}"`);
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('component runtime source', () => {
  it('parses as JavaScript', () => {
    // The runtime ships as a String.raw template, where a stray backtick or
    // ${ silently truncates it. This catches that at test time.
    expect(() => new Function(COMPONENTS_RUNTIME)).not.toThrow();
  });

  it('contains no unescaped template syntax that would break the wrapper', () => {
    expect(COMPONENTS_RUNTIME).not.toContain('`');
    expect(COMPONENTS_CSS).not.toContain('`');
  });

  it('defines a renderer for every component the registry offers', async () => {
    const renderers = loadRuntime();
    const { COMPONENTS } = await import('../model/components');
    for (const def of COMPONENTS) {
      expect(renderers[def.kind], `missing renderer: ${def.kind}`).toBeTypeOf(
        'function',
      );
    }
  });
});

describe('bracket component', () => {
  it('renders a column per round with its name', async () => {
    const html = await renderBracket(bracketData());
    expect(html).toContain('bracket_round');
    expect(html).toContain('Winners Semi');
    expect(html).toContain('Winners Final');
    expect(html).toContain('Losers Final');
  });

  it('resolves entrant names through the player slot table', async () => {
    const html = await renderBracket(bracketData());
    expect(html).toContain('Kestrel');
    expect(html).toContain('Marbles');
    expect(html).toContain('Juno');
  });

  it('drops byes entirely', async () => {
    const html = await renderBracket(bracketData());
    // Round 1 set 2 has an empty slot and must not be drawn.
    expect(hasSet(html, 1, 0)).toBe(true);
    expect(hasSet(html, 1, 1)).toBe(true);
    expect(hasSet(html, 1, 2)).toBe(false);
  });

  it('shows an undecided slot as TBD rather than blank', async () => {
    const html = await renderBracket(bracketData());
    expect(html).toContain('TBD');
    expect(html).toContain('tbd');
  });

  it('marks the winner and loser of a completed set', async () => {
    const html = await renderBracket(bracketData());
    expect(html).toContain('bracket_slot winner');
    expect(html).toContain('bracket_slot loser');
  });

  it('marks a set with both entrants known and no result as live', async () => {
    const html = await renderBracket(bracketData());
    // Winners Final has both players and is not completed.
    expect(html).toContain('bracket_set live');
  });

  it('hides the grand final reset until the losers-side player forces it', async () => {
    const notForced = await renderBracket(bracketData());
    expect(hasSet(notForced, 4, 0)).toBe(false);

    // Grand final completed with the losers-side entrant (index 1) winning.
    const forced = bracketData();
    const gf = forced.bracket.bracket.rounds['3'].sets['0'];
    gf.playerId = [1, 2];
    gf.score = [1, 3];
    gf.completed = true;

    const html = await renderBracket(forced);
    expect(hasSet(html, 4, 0)).toBe(true);
  });

  it('keeps the reset hidden when the winners-side player closes it out', async () => {
    const closed = bracketData();
    const gf = closed.bracket.bracket.rounds['3'].sets['0'];
    gf.playerId = [1, 2];
    gf.score = [3, 1];
    gf.completed = true;

    expect(hasSet(await renderBracket(closed), 4, 0)).toBe(false);
  });

  it('filters to one side on request', async () => {
    const winners = await renderBracket(bracketData(), { side: 'winners' });
    expect(winners).toContain('Winners Final');
    expect(winners).not.toContain('Losers Final');

    const losers = await renderBracket(bracketData(), { side: 'losers' });
    expect(losers).toContain('Losers Final');
    expect(losers).not.toContain('Winners Final');
  });

  it('keeps the final rounds when trimming to a maximum', async () => {
    // Winners rounds here are Semi, Final and Grand Final (the reset is
    // hidden), so trimming to one keeps the Grand Final.
    const one = await renderBracket(bracketData(), {
      side: 'winners',
      maxRounds: 1,
    });
    expect(one).toContain('Grand Final');
    expect(one).not.toContain('Winners Final');
    expect(one).not.toContain('Winners Semi');

    const two = await renderBracket(bracketData(), {
      side: 'winners',
      maxRounds: 2,
    });
    expect(two).toContain('Grand Final');
    expect(two).toContain('Winners Final');
    expect(two).not.toContain('Winners Semi');
  });

  it('omits flags when asked', async () => {
    const withFlags = await renderBracket(bracketData(), { showFlags: true });
    const without = await renderBracket(bracketData(), { showFlags: false });
    expect(withFlags).toContain('bracket_flag');
    expect(without).not.toContain('bracket_flag');
  });

  it('emits an SVG overlay for the connectors', async () => {
    const html = await renderBracket(bracketData());
    expect(html).toContain('<svg class="bracket_lines"');
  });

  it('renders nothing when no bracket has been loaded', async () => {
    expect(await renderBracket({})).toBe('');
    expect(await renderBracket({ bracket: { bracket: { rounds: {} } } })).toBe('');
  });

  it('survives a round whose sets are all byes', async () => {
    const data = bracketData();
    data.bracket.bracket.rounds['2'].sets = {
      '0': { playerId: [EMPTY, EMPTY], score: [0, 0], completed: false, nextWin: [3, 0] },
    };
    const html = await renderBracket(data);
    expect(hasSet(html, 2, 0)).toBe(false);
    // The rest of the bracket still renders.
    expect(countSets(html)).toBeGreaterThan(0);
  });
});
