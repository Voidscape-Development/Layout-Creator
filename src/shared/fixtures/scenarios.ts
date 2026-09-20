/**
 * Mock `program_state` scenarios.
 *
 * These exist so a layout can be designed, and its edge cases checked, without
 * TSH running. The awkward ones matter most: a 28-character sponsor tag, a
 * Japanese name that triggers the transcription block, and a player with no
 * flag, avatar or sponsor are exactly the cases that break a layout live.
 *
 * Shapes follow what the official layouts actually read. Fields TSH may omit
 * are omitted here too rather than filled with plausible-looking defaults.
 */

export interface Scenario {
  id: string;
  label: string;
  description: string;
  state: Record<string, unknown>;
}

interface PlayerSeed {
  name: string;
  team?: string;
  country?: { code: string; asset: string };
  state?: { code: string; asset: string };
  pronoun?: string;
  seed?: number;
  twitter?: string;
  avatar?: string;
  online_avatar?: string;
  sponsor_logo?: string;
}

function player(seed: PlayerSeed): Record<string, unknown> {
  return {
    name: seed.name,
    team: seed.team ?? '',
    country: seed.country ?? { code: '', asset: '' },
    state: seed.state ?? { code: '', asset: '' },
    pronoun: seed.pronoun ?? '',
    seed: seed.seed ?? '',
    twitter: seed.twitter ?? '',
    avatar: seed.avatar ?? '',
    online_avatar: seed.online_avatar ?? '',
    sponsor_logo: seed.sponsor_logo ?? '',
    character: {
      '1': { name: 'Mario', codename: 'mario', assets: {} },
    },
  };
}

interface TeamSeed {
  score: number;
  losers?: boolean;
  color?: string;
  teamName?: string;
  players: PlayerSeed[];
}

function team(seed: TeamSeed): Record<string, unknown> {
  const players: Record<string, unknown> = {};
  seed.players.forEach((p, i) => {
    players[String(i + 1)] = player(p);
  });
  return {
    score: seed.score,
    losers: seed.losers ?? false,
    color: seed.color ?? '',
    teamName: seed.teamName ?? '',
    player: players,
  };
}

interface StateSeed {
  match?: string;
  phase?: string;
  bestOf?: string;
  tournament?: string;
  event?: string;
  entrants?: number;
  teams: [TeamSeed, TeamSeed];
  commentary?: { name: string; pronoun?: string; twitter?: string; real_name?: string }[];
  bracket?: Record<string, unknown>;
}

/* ── Bracket ────────────────────────────────────────────────────────────── */

function emptyBracket(): Record<string, unknown> {
  return {
    players: { slot: {} },
    bracket: { rounds: {}, progressionsIn: 0, progressionsOut: 0 },
  };
}

function bracketPlayer(name: string, country?: { code: string; asset: string }) {
  return { player: { '1': player({ name, ...(country ? { country } : {}) }) } };
}

/**
 * A top-8 double-elimination phase, shaped the way TSH writes it.
 *
 * Round keys are signed — positive for winners, negative for losers. Slot ids
 * of -1 mark a bye and -2 an entrant not yet decided. Round 4 here is the
 * grand final reset, which stays hidden until the losers-side player forces it.
 */
function top8Bracket(): Record<string, unknown> {
  return {
    phase: 'Top 8',
    phaseGroup: 'A',
    players: {
      slot: {
        '1': bracketPlayer('Kestrel', FLAG_US),
        '2': bracketPlayer('Marbles', FLAG_MX),
        '3': bracketPlayer('Juno', FLAG_US),
        '4': bracketPlayer('Pike', FLAG_MX),
        '5': bracketPlayer('Ash', FLAG_JP),
        '6': bracketPlayer('Nine', FLAG_US),
      },
    },
    bracket: {
      progressionsIn: 0,
      progressionsOut: 0,
      winnersOnlyProgressions: false,
      rounds: {
        '1': {
          name: 'Winners Semi-Final',
          sets: {
            '0': { playerId: [1, 3], score: [2, 1], completed: true, nextWin: [2, 0] },
            '1': { playerId: [2, 4], score: [0, 2], completed: true, nextWin: [2, 0] },
          },
        },
        '2': {
          name: 'Winners Final',
          sets: {
            '0': { playerId: [1, 4], score: [1, 1], completed: false, nextWin: [3, 0] },
          },
        },
        '-1': {
          name: 'Losers Quarter-Final',
          sets: {
            '0': { playerId: [5, 6], score: [2, 0], completed: true, nextWin: [-2, 0] },
          },
        },
        '-2': {
          name: 'Losers Final',
          sets: {
            '0': { playerId: [5, 2], score: [0, 0], completed: false, nextWin: [3, 0] },
          },
        },
        '3': {
          name: 'Grand Final',
          sets: {
            '0': { playerId: [-2, -2], score: [0, 0], completed: false, nextWin: [4, 0] },
          },
        },
        '4': {
          name: 'Grand Final Reset',
          sets: { '0': { playerId: [-2, -2], score: [0, 0], completed: false } },
        },
      },
    },
  };
}

function state(seed: StateSeed): Record<string, unknown> {
  const commentary: Record<string, unknown> = {};
  (seed.commentary ?? []).forEach((c, i) => {
    commentary[String(i + 1)] = {
      name: c.name,
      pronoun: c.pronoun ?? '',
      twitter: c.twitter ?? '',
      real_name: c.real_name ?? '',
    };
  });

  return {
    timestamp: Date.now(),
    game: { codename: 'ssbu', name: 'Super Smash Bros. Ultimate' },
    bracket: seed.bracket ?? emptyBracket(),
    tournamentInfo: {
      tournamentName: seed.tournament ?? 'Voidscape Monthly #12',
      eventName: seed.event ?? 'Singles',
      numEntrants: seed.entrants ?? 128,
      shortLink: 'start.gg/vsm12',
    },
    score: {
      '1': {
        match: seed.match ?? 'Winners Semi-Final',
        phase: seed.phase ?? 'Top 8',
        best_of_text: seed.bestOf ?? 'Best of 5',
        best_of_short_text: 'Bo5',
        station: '1',
        stream_url: '',
        team: {
          '1': team(seed.teams[0]),
          '2': team(seed.teams[1]),
        },
        recent_sets: {},
        last_sets: {},
        history_sets: {},
      },
      ruleset: { name: 'Standard Ruleset', banCount: 3 },
    },
    commentary,
    player_list: { slot: {} },
    streamQueue: {},
  };
}

const FLAG_US = { code: 'US', asset: 'assets/country_flag/us.png' };
const FLAG_JP = { code: 'JP', asset: 'assets/country_flag/jp.png' };
const FLAG_MX = { code: 'MX', asset: 'assets/country_flag/mx.png' };

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'singles',
    label: 'Singles',
    description: 'A typical 1v1 set with complete player data.',
    state: state({
      teams: [
        {
          score: 2,
          color: '#e53935',
          players: [
            {
              name: 'Kestrel',
              team: 'VSD',
              country: FLAG_US,
              pronoun: 'they/them',
              seed: 3,
              twitter: 'kestrelplays',
            },
          ],
        },
        {
          score: 1,
          color: '#1e88e5',
          losers: true,
          players: [
            {
              name: 'Marbles',
              team: 'TSM',
              country: FLAG_MX,
              pronoun: 'he/him',
              seed: 9,
              twitter: 'marbles_ssbu',
            },
          ],
        },
      ],
      commentary: [
        { name: 'Ava', pronoun: 'she/her', twitter: 'avacasts' },
        { name: 'Rook', pronoun: 'he/him', twitter: 'rookonmic' },
      ],
    }),
  },
  {
    id: 'doubles',
    label: 'Doubles',
    description: 'Two players per team, with team names set.',
    state: state({
      match: 'Grand Final',
      teams: [
        {
          score: 2,
          teamName: 'Twin Pillars',
          players: [
            { name: 'Kestrel', country: FLAG_US },
            { name: 'Juno', country: FLAG_US },
          ],
        },
        {
          score: 3,
          teamName: 'Static Cling',
          players: [
            { name: 'Marbles', country: FLAG_MX },
            { name: 'Pike', country: FLAG_MX },
          ],
        },
      ],
    }),
  },
  {
    id: 'long-names',
    label: 'Overlong names',
    description:
      'Maximum-length sponsor tags and handles. Use this to check text fitting before an event, not after.',
    state: state({
      match: 'Losers Quarter-Final',
      tournament: 'The Exceptionally Long Regional Championship Series 2026',
      teams: [
        {
          score: 0,
          players: [
            {
              name: 'ExtraordinarilyLongPlayerTag',
              team: 'VERYLONGSPONSORNAME',
              country: FLAG_US,
              pronoun: 'she/her',
              seed: 1,
              twitter: 'anextremelylonghandlehere',
            },
          ],
        },
        {
          score: 0,
          players: [
            {
              name: 'AnotherRatherLengthyGamertag',
              team: 'ALSOQUITELONG',
              country: FLAG_MX,
              seed: 64,
            },
          ],
        },
      ],
    }),
  },
  {
    id: 'japanese',
    label: 'Japanese names',
    description:
      'Triggers the Kuroshiro transcription block, which renders as two stacked lines and is taller than plain text.',
    state: state({
      match: 'Winners Final',
      teams: [
        {
          score: 2,
          players: [{ name: '空木', team: 'ウツギ', country: FLAG_JP, seed: 2 }],
        },
        {
          score: 2,
          players: [{ name: 'かえで', country: FLAG_JP, seed: 5 }],
        },
      ],
    }),
  },
  {
    id: 'sparse',
    label: 'Missing data',
    description:
      'No flags, sponsors, pronouns or seeds. This is what a locals bracket with hand-typed names actually looks like.',
    state: state({
      match: 'Pools',
      phase: '',
      teams: [
        { score: 0, players: [{ name: 'player one' }] },
        { score: 0, players: [{ name: 'p2' }] },
      ],
    }),
  },
  {
    id: 'bracket',
    label: 'Top 8 bracket',
    description:
      'A double-elimination phase with a live winners final, a losers side, and a grand final reset that stays hidden until it is forced.',
    state: state({
      match: 'Winners Final',
      bracket: top8Bracket(),
      teams: [
        { score: 1, players: [{ name: 'Kestrel', country: FLAG_US, seed: 1 }] },
        { score: 1, players: [{ name: 'Pike', country: FLAG_MX, seed: 4 }] },
      ],
    }),
  },
  {
    id: 'grand-final-reset',
    label: 'Grand final reset',
    description: 'Both sides on losers, maximum score width.',
    state: state({
      match: 'Grand Final Reset',
      bestOf: 'Best of 5',
      teams: [
        {
          score: 10,
          losers: true,
          players: [{ name: 'Kestrel', team: 'VSD', country: FLAG_US, seed: 3 }],
        },
        {
          score: 10,
          losers: true,
          players: [{ name: 'Marbles', team: 'TSM', country: FLAG_MX, seed: 9 }],
        },
      ],
    }),
  },
] as const;

export const DEFAULT_SCENARIO = SCENARIOS[0]!;

export function findScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? DEFAULT_SCENARIO;
}
