/**
 * Top 8 component tests.
 *
 * The component reads `player_list.slot`, which TSH orders by finish, and
 * derives each entrant's placement from its position. The placement sequence
 * is the part worth testing hardest: the official layout hardcodes an array
 * that is wrong past 8th place, so these assertions pin the real progression
 * rather than the one in the repo.
 */

import { describe, expect, it } from 'vitest';
import { renderComponent } from './runtimeHarness';

/* ── Fixture ────────────────────────────────────────────────────────────── */

const NAMES = [
  'Kestrel',
  'Pike',
  'Ash',
  'Marbles',
  'Juno',
  'Nine',
  'Sable',
  'Wren',
  'Fen',
  'Oxide',
  'Quill',
  'Rune',
  'Slate',
  'Tally',
  'Umber',
  'Vex',
];

function standings(count = 8, playersPerSlot = 1) {
  const slot: Record<string, unknown> = {};
  for (let i = 0; i < count; i += 1) {
    const player: Record<string, unknown> = {};
    for (let p = 0; p < playersPerSlot; p += 1) {
      player[String(p + 1)] = {
        name: `${NAMES[i] ?? `P${i}`}${p ? ` ${p + 1}` : ''}`,
        team: '',
        country: { code: 'US', asset: 'assets/country_flag/us.png' },
      };
    }
    slot[String(i + 1)] = { player };
  }
  return { player_list: { slot } };
}

const renderTop8 = (
  data: unknown = standings(),
  options: Record<string, unknown> = {},
) => renderComponent('top_8', data, options);

/** Placement numbers in the order they appear in the markup. */
function placements(html: string): number[] {
  return [...html.matchAll(/data-place="(\d+)"/g)].map((m) => Number(m[1]));
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('top 8 component', () => {
  it('renders one entry per finisher, in finish order', async () => {
    const html = await renderTop8();
    expect((html.match(/class="top8_entry"/g) ?? []).length).toBe(8);
    expect(html.indexOf('Kestrel')).toBeLessThan(html.indexOf('Pike'));
    expect(html.indexOf('Pike')).toBeLessThan(html.indexOf('Ash'));
  });

  it('computes double-elimination placements', async () => {
    // 1st, 2nd, 3rd, 4th, then tied pairs at 5th and 7th.
    expect(placements(await renderTop8(standings(8)))).toEqual([
      1, 2, 3, 4, 5, 5, 7, 7,
    ]);
  });

  it('keeps going correctly past 8th, where the official layout does not', async () => {
    // The repo hardcodes [...,7,7,17,17,17,17,21,21,21,21] beside a
    // "TODO: Standings formula" comment. Positions 9-12 place 9th and 13-16
    // place 13th; the array's 17s and 21s are wrong.
    expect(placements(await renderTop8(standings(16), { count: 16 }))).toEqual([
      1, 2, 3, 4, 5, 5, 7, 7, 9, 9, 9, 9, 13, 13, 13, 13,
    ]);
  });

  it('computes single-elimination placements, where losers of a round tie', async () => {
    expect(
      placements(await renderTop8(standings(16), { count: 16, singleElim: true })),
    ).toEqual([1, 2, 3, 3, 5, 5, 5, 5, 9, 9, 9, 9, 9, 9, 9, 9]);
  });

  it('tiers the grid into winner, top four and the rest', async () => {
    const html = await renderTop8();
    expect(html).toContain('top8_tier tier_1');
    expect(html).toContain('top8_tier tier_4');
    expect(html).toContain('top8_tier tier_8');

    // First place alone in its tier, next three together, remaining four after.
    const tier1 = html.slice(html.indexOf('tier_1'), html.indexOf('tier_4'));
    expect((tier1.match(/top8_entry/g) ?? []).length).toBe(1);
    const tier4 = html.slice(html.indexOf('tier_4'), html.indexOf('tier_8'));
    expect((tier4.match(/top8_entry/g) ?? []).length).toBe(3);
  });

  it('flattens to a single tier when equal-sized cells are asked for', async () => {
    const html = await renderTop8(standings(), { sameSize: true });
    expect(html).not.toContain('tier_1');
    expect(html).not.toContain('tier_4');
    expect((html.match(/top8_entry/g) ?? []).length).toBe(8);
  });

  it('honours the place count', async () => {
    const html = await renderTop8(standings(16), { count: 4 });
    expect((html.match(/class="top8_entry"/g) ?? []).length).toBe(4);
    expect(html).not.toContain('Juno');
  });

  it('does not invent entries when fewer finishers exist than requested', async () => {
    const html = await renderTop8(standings(3), { count: 8 });
    expect((html.match(/class="top8_entry"/g) ?? []).length).toBe(3);
  });

  it('joins both names for a doubles entrant', async () => {
    const html = await renderTop8(standings(2, 2));
    expect(html).toContain('Kestrel / Kestrel 2');
  });

  it('omits flags and characters when asked', async () => {
    const full = await renderTop8();
    expect(full).toContain('top8_flag');
    expect(full).toContain('top8_character');

    const bare = await renderTop8(standings(), {
      showFlags: false,
      showCharacters: false,
    });
    expect(bare).not.toContain('top8_flag');
    expect(bare).not.toContain('top8_character');
  });

  it('mounts character cells through the shared data-attribute hook', async () => {
    // Keyed off data-tsh-character rather than a component-specific class, so
    // every component gets character art through the same path.
    const html = await renderTop8();
    expect(html).toContain('data-tsh-character');
    expect(html).toContain('data-source="player_list.slot.1"');
  });

  it('renders nothing when no standings have been loaded', async () => {
    expect(await renderTop8({})).toBe('');
    expect(await renderTop8({ player_list: { slot: {} } })).toBe('');
  });
});
