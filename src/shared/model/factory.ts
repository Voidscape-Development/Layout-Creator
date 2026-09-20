/**
 * Node factories and starter templates.
 *
 * Templates are ordinary models, not special cases — a user can take any of
 * them apart. They exist so "New layout" produces something already wired to
 * live data rather than an empty canvas.
 */

import { binding } from './bindings';
import type { ComponentKind } from './components';
import { componentDef, defaultComponentOptions } from './components';
import type {
  CharacterNode,
  ComponentNode,
  ContainerNode,
  ImageNode,
  LayoutNode,
  ShapeNode,
  TextNode,
} from './nodes';
import type { Layout } from './pack';
import { emptyLayout, newId } from './pack';
import { defaultStackConfig, defaultStyle } from './style';
import type { Style } from './style';
import { defaultTween } from './animation';

function baseStyle(overrides: Partial<Style> = {}): Style {
  return { ...defaultStyle(), ...overrides };
}

export function createContainer(
  name: string,
  partial: Partial<ContainerNode> = {},
): ContainerNode {
  return {
    id: newId(),
    name,
    type: 'container',
    classes: [],
    layoutMode: 'stack',
    stack: defaultStackConfig(),
    children: [],
    style: baseStyle(),
    ...partial,
  };
}

export function createText(name: string, partial: Partial<TextNode> = {}): TextNode {
  return {
    id: newId(),
    name,
    type: 'text',
    classes: [],
    content: name,
    animateChanges: true,
    fadeTime: 0.5,
    style: baseStyle(),
    ...partial,
  };
}

export function createImage(name: string, partial: Partial<ImageNode> = {}): ImageNode {
  return {
    id: newId(),
    name,
    type: 'image',
    classes: [],
    fit: 'cover',
    hideWhenEmpty: true,
    style: baseStyle(),
    ...partial,
  };
}

export function createCharacter(
  name: string,
  partial: Partial<CharacterNode> = {},
): CharacterNode {
  return {
    id: newId(),
    name,
    type: 'character',
    classes: [],
    assetKey: 'base_files/icon',
    source: 'score.{sb}.team.{team}',
    customZoom: 1,
    customCenter: [0.5, 0.5],
    scaleFillX: true,
    scaleFillY: true,
    scaleBasedOnParent: false,
    useDividers: true,
    style: baseStyle(),
    ...partial,
  };
}

export function createShape(name: string, partial: Partial<ShapeNode> = {}): ShapeNode {
  return {
    id: newId(),
    name,
    type: 'shape',
    classes: [],
    shape: 'rect',
    style: baseStyle({
      box: { width: 200, height: 100, background: 'var(--bg-color)' },
    }),
    ...partial,
  };
}

export function createComponent(kind: ComponentKind): ComponentNode {
  const def = componentDef(kind);
  return {
    id: newId(),
    name: def?.label ?? kind,
    type: 'component',
    classes: [],
    kind,
    options: defaultComponentOptions(kind),
    style: baseStyle({
      box: {
        width: def?.defaultSize.width ?? 600,
        height: def?.defaultSize.height ?? 400,
        overflow: 'hidden',
      },
    }),
  };
}

/** Node of the requested type with sensible defaults, for the "Add" menu. */
export function createNode(type: LayoutNode['type']): LayoutNode {
  switch (type) {
    case 'container':
      return createContainer('Group', {
        style: baseStyle({ box: { width: 400, height: 80 } }),
      });
    case 'text':
      return createText('Text', {
        content: 'Text',
        style: baseStyle({ text: { fontSize: 32, color: 'var(--text-color)' } }),
      });
    case 'image':
      return createImage('Image', {
        style: baseStyle({ box: { width: 64, height: 64 } }),
      });
    case 'character':
      return createCharacter('Character', {
        style: baseStyle({ box: { width: 64, height: 64 } }),
      });
    case 'shape':
      return createShape('Shape');
    case 'component':
      return createComponent('set_list');
  }
}

/* ── Templates ──────────────────────────────────────────────────────────── */

export type TemplateId =
  | 'blank'
  | 'scoreboard'
  | 'bracket'
  | 'top_8'
  | 'commentators'
  | 'standings';

export interface TemplateDef {
  id: TemplateId;
  label: string;
  description: string;
}

export const TEMPLATES: readonly TemplateDef[] = [
  {
    id: 'scoreboard',
    label: 'Two-player scoreboard',
    description:
      'Player containers with name, score, character and flag chips, positioned in Stack mode so empty fields collapse cleanly.',
  },
  {
    id: 'bracket',
    label: 'Bracket',
    description:
      'Double-elimination tree with animated connectors, drawn from the current phase group.',
  },
  {
    id: 'top_8',
    label: 'Top 8',
    description:
      'Final placement podium, with the winner emphasised and tied placements numbered correctly.',
  },
  {
    id: 'commentators',
    label: 'Commentators',
    description: 'Commentary team lower-third driven by the commentators component.',
  },
  {
    id: 'standings',
    label: 'Standings',
    description: 'Ranked entrant list driven by the standings component.',
  },
  { id: 'blank', label: 'Blank', description: 'An empty 1920x1080 canvas.' },
] as const;

/**
 * One side of a scoreboard. Built in Stack mode on purpose: the flag, sponsor
 * and character slots are exactly the fields TSH often leaves empty, and stack
 * mode is what removes them from the flow instead of leaving a gap.
 */
function playerBlock(team: 1 | 2): ContainerNode {
  const mirrored = team === 2;

  const name = createText('Player name', {
    classes: ['name'],
    binding: binding('score.{sb}.team.{team}.player.{player}.name', {
      transforms: ['transcript'],
    }),
    style: baseStyle({
      text: { fontSize: 34, fontWeight: 700, fit: 'scale-x', whiteSpace: 'nowrap' },
      stackItem: { grow: 1, shrink: 1, basis: 0 },
    }),
  });

  const score = createText('Score', {
    classes: ['score'],
    binding: binding('score.{sb}.team.{team}.score'),
    style: baseStyle({
      box: {
        width: 64,
        height: 64,
        background: `var(--p${team}-score-bg-color)`,
        borderRadius: 'var(--border-radius)',
      },
      text: {
        fontSize: 42,
        fontWeight: 700,
        align: 'center',
        color: `var(--p${team}-score-color)`,
      },
    }),
  });

  const character = createCharacter('Character', {
    classes: ['character_container'],
    style: baseStyle({ box: { width: 64, height: 64 } }),
  });

  const flag = createImage('Country flag', {
    classes: ['flagcountry'],
    binding: binding('score.{sb}.team.{team}.player.{player}.country.asset', {
      transforms: ['asset-path', 'lowercase'],
    }),
    style: baseStyle({ box: { width: 42, height: 28 } }),
  });

  const sponsor = createImage('Sponsor logo', {
    classes: ['sponsor_icon'],
    binding: binding('score.{sb}.team.{team}.player.{player}.sponsor_logo', {
      transforms: ['asset-path'],
    }),
    style: baseStyle({ box: { width: 48, height: 48 } }),
  });

  // Row order mirrors for player 2 via flex-direction, exactly as the repo's
  // `.p2.container { flex-direction: row-reverse; }` does.
  return createContainer(`Player ${team}`, {
    classes: ['player', 'container'],
    scope: { team, player: 1 },
    layoutMode: 'stack',
    stack: {
      ...defaultStackConfig(),
      direction: mirrored ? 'row-reverse' : 'row',
      gap: 8,
      collapseEmpty: true,
    },
    style: baseStyle({
      box: {
        width: 620,
        height: 72,
        padding: [0, 10, 0, 10],
        background: `color-mix(in srgb, var(--p${team}-score-bg-color) 15%, var(--bg-color) 85%)`,
        borderRadius: 'var(--border-radius)',
        overflow: 'hidden',
      },
      text: { color: 'var(--text-color)' },
      free: { x: mirrored ? 1920 - 620 - 130 : 130, y: 40 },
    }),
    children: [sponsor, character, name, flag, score],
  });
}

function scoreboardTemplate(layout: Layout): Layout {
  const p1 = playerBlock(1);
  const p2 = playerBlock(2);

  const roundText = createText('Round', {
    classes: ['match'],
    binding: binding('score.{sb}.match'),
    style: baseStyle({
      box: { width: 520, height: 44 },
      text: { fontSize: 26, align: 'center', transform: 'uppercase' },
      free: { x: (1920 - 520) / 2, y: 124 },
    }),
  });

  const tournament = createText('Tournament', {
    classes: ['tournament_name'],
    binding: binding('tournamentInfo.tournamentName'),
    style: baseStyle({
      box: { width: 520, height: 40 },
      text: { fontSize: 24, align: 'center' },
      free: { x: (1920 - 520) / 2, y: 40 },
    }),
  });

  layout.root.children = [tournament, roundText, p1, p2];
  layout.root.layoutMode = 'free';

  layout.animation.tweens = [
    defaultTween({
      id: newId(),
      name: 'Player containers',
      targetIds: [p1.id, p2.id],
      preset: 'fade_up',
      duration: 0.3,
      distance: 24,
      position: 0,
    }),
    defaultTween({
      id: newId(),
      name: 'Match info',
      targetIds: [tournament.id, roundText.id],
      preset: 'fade_down',
      duration: 0.3,
      distance: 20,
      position: 0.1,
    }),
  ];

  return layout;
}

function componentTemplate(layout: Layout, kind: ComponentKind): Layout {
  const node = createComponent(kind);
  const def = componentDef(kind);
  node.style.free = {
    x: Math.round((layout.canvas.width - (def?.defaultSize.width ?? 600)) / 2),
    y: 120,
  };
  layout.root.children = [node];
  layout.root.layoutMode = 'free';
  layout.animation.tweens = [
    defaultTween({
      id: newId(),
      name: `${def?.label ?? kind} rows`,
      targetIds: [],
      targetSelector: `.${def?.itemClass ?? 'row'}`,
      preset: 'fade_up',
      duration: 0.25,
      distance: 18,
      stagger: { each: 0.06, from: 'start' },
      position: 0,
    }),
  ];
  return layout;
}

export function createLayoutFromTemplate(
  template: TemplateId,
  name: string,
  folderName: string,
): Layout {
  const layout = emptyLayout(name, folderName);
  switch (template) {
    case 'scoreboard':
      return scoreboardTemplate(layout);
    case 'bracket':
      return componentTemplate(layout, 'bracket');
    case 'top_8':
      return componentTemplate(layout, 'top_8');
    case 'commentators':
      return componentTemplate(layout, 'commentators');
    case 'standings':
      return componentTemplate(layout, 'top_n_list');
    case 'blank':
      return layout;
  }
}
