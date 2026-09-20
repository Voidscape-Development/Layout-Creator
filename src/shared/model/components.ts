/**
 * Smart components.
 *
 * The data-driven layouts in the official repo (bracket, top_8, stream_queue,
 * last_sets, stage_strike, map…) build their DOM in loops. Rather than expose
 * that loop as user-editable logic, each ships as a component with fixed
 * generation and an options form. Users position, style, configure and animate
 * them; the emitter writes the matching runtime code.
 *
 * The registry is data-driven so the options panel renders generically and
 * adding a component means adding one entry here plus one emitter template.
 */

export type ComponentKind =
  | 'bracket'
  | 'top_8'
  | 'set_list'
  | 'stream_queue'
  | 'top_n_list'
  | 'stage_strike'
  | 'player_list'
  | 'commentators'
  | 'character_gallery'
  | 'map';

export type OptionKind = 'number' | 'boolean' | 'select' | 'text';

export interface ComponentOptionDef {
  key: string;
  label: string;
  kind: OptionKind;
  default: string | number | boolean;
  /** For `select`. */
  choices?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}

export interface ComponentDef {
  kind: ComponentKind;
  label: string;
  description: string;
  /** Initial size dropped onto the canvas, in px. */
  defaultSize: { width: number; height: number };
  options: ComponentOptionDef[];
  /**
   * Class applied to each generated child, so animation tweens can target the
   * repeated items via `targetSelector`.
   */
  itemClass: string;
}

export const COMPONENTS: readonly ComponentDef[] = [
  {
    kind: 'bracket',
    label: 'Bracket',
    description: 'Double- or single-elimination tree with animated connector lines.',
    defaultSize: { width: 1600, height: 900 },
    itemClass: 'bracket_set',
    options: [
      {
        key: 'side',
        label: 'Show',
        kind: 'select',
        default: 'both',
        choices: [
          { value: 'both', label: 'Winners and losers' },
          { value: 'winners', label: 'Winners only' },
          { value: 'losers', label: 'Losers only' },
        ],
      },
      {
        key: 'showFlags',
        label: 'Show flags',
        kind: 'boolean',
        default: true,
      },
      {
        key: 'animateLines',
        label: 'Draw connector lines',
        kind: 'boolean',
        default: true,
        help: 'Strokes each connector on as the bracket appears.',
      },
      {
        key: 'maxRounds',
        label: 'Maximum rounds',
        kind: 'number',
        default: 0,
        min: 0,
        max: 12,
        help: '0 shows every round. Otherwise the latest rounds are kept, since those are the ones worth the space.',
      },
    ],
  },
  {
    kind: 'top_8',
    label: 'Top 8',
    description: 'Final-eight placement grid.',
    defaultSize: { width: 1760, height: 900 },
    itemClass: 'top8_entry',
    options: [
      {
        key: 'sameSize',
        label: 'Equal-sized cells',
        kind: 'boolean',
        default: false,
        help: 'Matches index_same_size.html — no emphasis on 1st place.',
      },
      {
        key: 'singleElim',
        label: 'Single elimination',
        kind: 'boolean',
        default: false,
      },
    ],
  },
  {
    kind: 'set_list',
    label: 'Set list',
    description: 'Recent, last or historical sets as a list of results.',
    defaultSize: { width: 800, height: 700 },
    itemClass: 'set_row',
    options: [
      {
        key: 'source',
        label: 'Source',
        kind: 'select',
        default: 'recent',
        choices: [
          { value: 'recent', label: 'Recent sets' },
          { value: 'last', label: "This player's last sets" },
          { value: 'history', label: 'Tournament history' },
        ],
      },
      { key: 'maxRows', label: 'Rows shown', kind: 'number', default: 8, min: 1, max: 32 },
      {
        key: 'showCharacters',
        label: 'Show characters',
        kind: 'boolean',
        default: true,
      },
      { key: 'showRound', label: 'Show round name', kind: 'boolean', default: true },
    ],
  },
  {
    kind: 'stream_queue',
    label: 'Stream queue',
    description: 'Upcoming matches, by station or across multiple streams.',
    defaultSize: { width: 900, height: 800 },
    itemClass: 'queue_row',
    options: [
      {
        key: 'mode',
        label: 'Mode',
        kind: 'select',
        default: 'queue',
        choices: [
          { value: 'queue', label: 'Queue' },
          { value: 'stations', label: 'By station' },
          { value: 'multistream', label: 'Multi-stream' },
          { value: 'next', label: 'Next match only' },
        ],
      },
      { key: 'maxRows', label: 'Rows shown', kind: 'number', default: 8, min: 1, max: 32 },
      { key: 'showRound', label: 'Show round name', kind: 'boolean', default: true },
    ],
  },
  {
    kind: 'top_n_list',
    label: 'Standings',
    description: 'Ranked list of entrants.',
    defaultSize: { width: 700, height: 800 },
    itemClass: 'standing_row',
    options: [
      { key: 'count', label: 'Places shown', kind: 'number', default: 8, min: 1, max: 64 },
      { key: 'showFlags', label: 'Show flags', kind: 'boolean', default: true },
    ],
  },
  {
    kind: 'stage_strike',
    label: 'Stage striking',
    description: 'Neutral and counterpick stages with strike state from the ruleset.',
    defaultSize: { width: 1400, height: 500 },
    itemClass: 'stage_cell',
    options: [
      { key: 'showCounterpicks', label: 'Show counterpicks', kind: 'boolean', default: true },
      { key: 'showRulesetName', label: 'Show ruleset name', kind: 'boolean', default: true },
    ],
  },
  {
    kind: 'player_list',
    label: 'Player list',
    description: 'All entrants in a phase, from player_list.slot.',
    defaultSize: { width: 1600, height: 800 },
    itemClass: 'player_cell',
    options: [
      { key: 'columns', label: 'Columns', kind: 'number', default: 4, min: 1, max: 12 },
      { key: 'showSeed', label: 'Show seeds', kind: 'boolean', default: true },
    ],
  },
  {
    kind: 'commentators',
    label: 'Commentators',
    description: 'Commentary team from data.commentary.',
    defaultSize: { width: 700, height: 200 },
    itemClass: 'commentator',
    options: [
      { key: 'showTwitter', label: 'Show handles', kind: 'boolean', default: true },
      { key: 'showRealName', label: 'Show real names', kind: 'boolean', default: false },
      { key: 'maxRows', label: 'Maximum shown', kind: 'number', default: 4, min: 1, max: 8 },
    ],
  },
  {
    kind: 'character_gallery',
    label: 'Character gallery',
    description: "Every character a player or team has picked this set.",
    defaultSize: { width: 800, height: 300 },
    itemClass: 'gallery_character',
    options: [
      {
        key: 'scope',
        label: 'Scope',
        kind: 'select',
        default: 'team',
        choices: [
          { value: 'team', label: 'Whole team' },
          { value: 'player', label: 'Single player' },
        ],
      },
      { key: 'maxCharacters', label: 'Maximum shown', kind: 'number', default: 8, min: 1, max: 16 },
    ],
  },
  {
    kind: 'map',
    label: 'Entrant map',
    description: 'Leaflet map of where entrants travelled from.',
    defaultSize: { width: 1920, height: 1080 },
    itemClass: 'map_marker',
    options: [
      {
        key: 'style',
        label: 'Style',
        kind: 'select',
        default: 'standard',
        choices: [
          { value: 'standard', label: 'Standard' },
          { value: 'world_fighters', label: 'World Fighters' },
        ],
      },
      { key: 'zoom', label: 'Initial zoom', kind: 'number', default: 2, min: 1, max: 10 },
    ],
  },
] as const;

export type ComponentOptions = Record<string, string | number | boolean>;

export function componentDef(kind: ComponentKind): ComponentDef | undefined {
  return COMPONENTS.find((c) => c.kind === kind);
}

export function defaultComponentOptions(kind: ComponentKind): ComponentOptions {
  const def = componentDef(kind);
  if (!def) return {};
  const out: ComponentOptions = {};
  for (const opt of def.options) out[opt.key] = opt.default;
  return out;
}
