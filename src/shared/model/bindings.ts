/**
 * Data bindings against TSH's `program_state`.
 *
 * Paths may contain three placeholders, substituted at emit time from the
 * element's enclosing scope:
 *   {sb}     -> window.scoreboardNumber (set from the ?scoreboardNumber= URL param)
 *   {team}   -> 1 | 2
 *   {player} -> 1-based index within the team
 *
 * So `score.{sb}.team.{team}.player.{player}.name` emits as
 * `score[window.scoreboardNumber].team[1].player[1].name`.
 */

export type Transform =
  /** Kuroshiro Japanese -> romaji, via globals.js `Transcript()`. */
  | 'transcript'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  /** Render as `TSH asset path`, i.e. prefixed with `../../`. */
  | 'asset-path';

export interface Binding {
  path: string;
  transforms: Transform[];
  /** Used when the resolved value is null/undefined/empty. */
  fallback?: string;
  /**
   * Wraps the resolved value. `{value}` is the placeholder.
   * e.g. `Seed {value}` or `<span class="losers">L</span>{value}`.
   * Only applied when the value is non-empty, so the decoration disappears
   * along with the data.
   */
  template?: string;
}

export function binding(path: string, extra: Partial<Binding> = {}): Binding {
  return { path, transforms: [], ...extra };
}

/** Which scope values a path needs before it can be resolved. */
export interface BindingRequirements {
  team: boolean;
  player: boolean;
}

export function bindingRequirements(path: string): BindingRequirements {
  return { team: path.includes('{team}'), player: path.includes('{player}') };
}

export interface ScopeValues {
  team?: 1 | 2;
  player?: number;
}

/**
 * Substitute scope placeholders. `{sb}` is left as a marker for the JS emitter
 * to replace with the `window.scoreboardNumber` expression, since it is a
 * runtime value rather than a compile-time one.
 */
export function resolvePath(path: string, scope: ScopeValues): string {
  let out = path;
  if (scope.team !== undefined) out = out.replaceAll('{team}', String(scope.team));
  if (scope.player !== undefined) {
    out = out.replaceAll('{player}', String(scope.player));
  }
  return out;
}

/* ── Field catalog ──────────────────────────────────────────────────────── */

export type FieldKind = 'text' | 'number' | 'image' | 'flag' | 'boolean' | 'color';

export interface FieldDef {
  path: string;
  label: string;
  kind: FieldKind;
  group: FieldGroup;
  /** Transforms applied by default when this field is bound. */
  defaultTransforms?: Transform[];
  help?: string;
}

export type FieldGroup =
  | 'tournament'
  | 'match'
  | 'team'
  | 'player'
  | 'ruleset'
  | 'game';

/**
 * Fields observed across the official layouts. Not exhaustive — TSH writes
 * whatever its widgets define — so the binding panel also accepts a hand-typed
 * path for anything missing here.
 */
export const FIELDS: readonly FieldDef[] = [
  // Tournament ------------------------------------------------------------
  {
    path: 'tournamentInfo.tournamentName',
    label: 'Tournament name',
    kind: 'text',
    group: 'tournament',
  },
  {
    path: 'tournamentInfo.eventName',
    label: 'Event name',
    kind: 'text',
    group: 'tournament',
  },
  {
    path: 'tournamentInfo.numEntrants',
    label: 'Entrant count',
    kind: 'number',
    group: 'tournament',
  },
  {
    path: 'tournamentInfo.shortLink',
    label: 'Bracket link',
    kind: 'text',
    group: 'tournament',
  },

  // Match -----------------------------------------------------------------
  {
    path: 'score.{sb}.match',
    label: 'Round',
    kind: 'text',
    group: 'match',
    help: 'e.g. "Winners Semi-Final".',
  },
  { path: 'score.{sb}.phase', label: 'Phase', kind: 'text', group: 'match' },
  {
    path: 'score.{sb}.best_of_text',
    label: 'Best of (long)',
    kind: 'text',
    group: 'match',
    help: 'e.g. "Best of 5".',
  },
  {
    path: 'score.{sb}.best_of_short_text',
    label: 'Best of (short)',
    kind: 'text',
    group: 'match',
    help: 'e.g. "Bo5".',
  },
  { path: 'score.{sb}.station', label: 'Station', kind: 'text', group: 'match' },
  {
    path: 'score.{sb}.stream_url',
    label: 'Stream URL',
    kind: 'text',
    group: 'match',
  },

  // Team ------------------------------------------------------------------
  {
    path: 'score.{sb}.team.{team}.score',
    label: 'Score',
    kind: 'number',
    group: 'team',
  },
  {
    path: 'score.{sb}.team.{team}.teamName',
    label: 'Team name',
    kind: 'text',
    group: 'team',
    help: 'Set for doubles; usually blank in singles.',
  },
  {
    path: 'score.{sb}.team.{team}.losers',
    label: 'In losers',
    kind: 'boolean',
    group: 'team',
    help: 'Drives the "L" marker next to a player name.',
  },
  {
    path: 'score.{sb}.team.{team}.color',
    label: 'Team colour',
    kind: 'color',
    group: 'team',
    help: 'TSH writes this into --p1/--p2 accent tokens automatically.',
  },
  {
    path: 'score.{sb}.team.{team}.logo',
    label: 'Team logo',
    kind: 'image',
    group: 'team',
    defaultTransforms: ['asset-path'],
  },

  // Player ----------------------------------------------------------------
  {
    path: 'score.{sb}.team.{team}.player.{player}.name',
    label: 'Player name',
    kind: 'text',
    group: 'player',
    defaultTransforms: ['transcript'],
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.team',
    label: 'Sponsor tag',
    kind: 'text',
    group: 'player',
    help: 'The prefix before a player name, e.g. "TSM".',
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.pronoun',
    label: 'Pronouns',
    kind: 'text',
    group: 'player',
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.seed',
    label: 'Seed',
    kind: 'number',
    group: 'player',
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.twitter',
    label: 'Twitter / X handle',
    kind: 'text',
    group: 'player',
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.country.code',
    label: 'Country code',
    kind: 'text',
    group: 'player',
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.country.asset',
    label: 'Country flag',
    kind: 'flag',
    group: 'player',
    defaultTransforms: ['asset-path', 'lowercase'],
    help: 'TSH stores country flag paths uppercase; they resolve lowercase on disk.',
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.state.code',
    label: 'State code',
    kind: 'text',
    group: 'player',
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.state.asset',
    label: 'State flag',
    kind: 'flag',
    group: 'player',
    defaultTransforms: ['asset-path'],
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.avatar',
    label: 'Avatar',
    kind: 'image',
    group: 'player',
    defaultTransforms: ['asset-path'],
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.online_avatar',
    label: 'Online avatar',
    kind: 'image',
    group: 'player',
    help: 'A remote URL from start.gg — not prefixed with ../../.',
  },
  {
    path: 'score.{sb}.team.{team}.player.{player}.sponsor_logo',
    label: 'Sponsor logo',
    kind: 'image',
    group: 'player',
    defaultTransforms: ['asset-path'],
  },

  // Ruleset ---------------------------------------------------------------
  { path: 'score.ruleset.name', label: 'Ruleset name', kind: 'text', group: 'ruleset' },
  { path: 'score.ruleset.banCount', label: 'Ban count', kind: 'number', group: 'ruleset' },

  // Game ------------------------------------------------------------------
  {
    path: 'game.codename',
    label: 'Game codename',
    kind: 'text',
    group: 'game',
    help: 'Selects per-game asset settings from settings.json.',
  },
  { path: 'game.name', label: 'Game name', kind: 'text', group: 'game' },
] as const;

export function fieldsByGroup(group: FieldGroup): FieldDef[] {
  return FIELDS.filter((f) => f.group === group);
}

export function findField(path: string): FieldDef | undefined {
  return FIELDS.find((f) => f.path === path);
}
