/**
 * JavaScript emitter.
 *
 * Produces `index.js` in the shape every official layout uses:
 *
 *   LoadEverything().then(() => {
 *     const startingAnimation = gsap.timeline({ paused: true })...;
 *     Start  = async () => { ... };
 *     Update = async (event) => { ... };
 *   });
 *
 * Values are read with lodash `_.get`, which `globals.js` has already loaded,
 * so a missing path yields `undefined` rather than throwing and blanking the
 * whole overlay mid-match.
 */

import type {
  CharacterNode,
  ComponentNode,
  ImageNode,
  TextNode,
} from '../model/nodes';
import { effectiveScope, walk } from '../model/nodes';
import type { Binding } from '../model/bindings';
import { resolvePath } from '../model/bindings';
import type { Layout } from '../model/pack';
import type { AnimationSpec, Tween } from '../model/animation';
import { nodeClass } from './css';

/** JS string literal, safe for the generated source. */
function lit(value: string): string {
  return JSON.stringify(value);
}

/**
 * A data path as a JS template literal. `{sb}` becomes `${sb}`, which the
 * emitted code binds to `window.scoreboardNumber` — set from the
 * `?scoreboardNumber=` URL param by globals.js.
 */
function pathExpr(path: string): string {
  const withSb = path.replaceAll('{sb}', '${sb}');
  return `\`${withSb}\``;
}

/** Unique, readable local variable name for a node's resolved value. */
function varName(id: string): string {
  return `v_${id}`;
}

/**
 * Emits the statements that resolve a binding into `varName(id)`, applying
 * transforms in order. Returns the lines plus whether the value may be empty.
 */
function resolveBinding(id: string, binding: Binding, indent: string): string[] {
  const name = varName(id);
  const lines: string[] = [];
  lines.push(`${indent}let ${name} = _.get(data, ${pathExpr(resolveRuntimePath(binding.path))});`);

  for (const transform of binding.transforms) {
    switch (transform) {
      case 'transcript':
        // Async — Transcript() returns the original string for non-Japanese
        // input, so this is safe to apply unconditionally.
        lines.push(`${indent}${name} = await Transcript(${name});`);
        break;
      case 'uppercase':
        lines.push(`${indent}if (${name}) ${name} = String(${name}).toUpperCase();`);
        break;
      case 'lowercase':
        lines.push(`${indent}if (${name}) ${name} = String(${name}).toLowerCase();`);
        break;
      case 'trim':
        lines.push(`${indent}if (${name}) ${name} = String(${name}).trim();`);
        break;
      case 'asset-path':
        // Applied at use site so the prefix doesn't leak into text output.
        break;
    }
  }

  if (binding.fallback) {
    lines.push(
      `${indent}if (!nonEmpty(${name})) ${name} = ${lit(binding.fallback)};`,
    );
  }

  return lines;
}

/** Scope placeholders are already substituted; only `{sb}` survives to runtime. */
function resolveRuntimePath(path: string): string {
  return path;
}

function hasAssetPath(binding: Binding): boolean {
  return binding.transforms.includes('asset-path');
}

/* ── Per-node update code ───────────────────────────────────────────────── */

function emitText(node: TextNode, layout: Layout, indent: string): string[] {
  const sel = `.${nodeClass(node.id)}`;
  const lines: string[] = [];
  const label = node.name || 'Text';

  if (!node.binding) {
    if (node.animateChanges) {
      lines.push(`${indent}// ${label}`);
      lines.push(
        `${indent}SetInnerHtml($(${lit(sel)}), ${lit(node.content)}, { fadeTime: ${node.fadeTime} });`,
      );
    }
    // Static, non-animated text is already inlined in the HTML.
    return lines;
  }

  const scope = effectiveScope(layout.root, node.id);
  const path = resolvePath(node.binding.path, scope);
  const name = varName(node.id);

  lines.push(`${indent}// ${label}`);
  lines.push(...resolveBinding(node.id, { ...node.binding, path }, indent));

  const valueExpr = node.binding.template
    ? '`' + node.binding.template.replaceAll('{value}', `\${${name}}`) + '`'
    : `String(${name})`;

  lines.push(
    `${indent}SetInnerHtml($(${lit(sel)}), nonEmpty(${name}) ? ${valueExpr} : "", { fadeTime: ${node.fadeTime} });`,
  );
  return lines;
}

function emitImage(node: ImageNode, layout: Layout, indent: string): string[] {
  if (!node.binding) return [];

  const sel = `.${nodeClass(node.id)}`;
  const scope = effectiveScope(layout.root, node.id);
  const path = resolvePath(node.binding.path, scope);
  const name = varName(node.id);
  const prefix = hasAssetPath(node.binding) ? '../../' : '';

  const lines: string[] = [];
  lines.push(`${indent}// ${node.name || 'Image'}`);
  lines.push(...resolveBinding(node.id, { ...node.binding, path }, indent));
  lines.push(
    `${indent}SetInnerHtml($(${lit(sel)}), nonEmpty(${name}) ? \`<img src="${prefix}\${${name}}" />\` : "");`,
  );
  return lines;
}

function emitCharacter(
  node: CharacterNode,
  layout: Layout,
  indent: string,
): string[] {
  const sel = `.${nodeClass(node.id)}`;
  const scope = effectiveScope(layout.root, node.id);
  const source = resolvePath(node.source, scope);

  const settings: string[] = [];
  if (node.assetKey) settings.push(`asset_key: ${lit(node.assetKey)}`);
  settings.push(`source: ${pathExpr(source)}`);
  settings.push(`custom_zoom: ${node.customZoom}`);
  settings.push(
    `custom_center: [${node.customCenter[0]}, ${node.customCenter[1]}]`,
  );
  if (node.scaleFillX) settings.push('scale_fill_x: true');
  if (node.scaleFillY) settings.push('scale_fill_y: true');
  if (node.scaleBasedOnParent) settings.push('scale_based_on_parent: true');
  if (!node.useDividers) settings.push('use_dividers: false');
  if (node.slicePlayer) {
    settings.push(
      `slice_player: [${node.slicePlayer[0]}, ${node.slicePlayer[1] ?? 'Infinity'}]`,
    );
  }
  if (node.sliceCharacter) {
    settings.push(
      `slice_character: [${node.sliceCharacter[0]}, ${node.sliceCharacter[1] ?? 'Infinity'}]`,
    );
  }

  return [
    `${indent}// ${node.name || 'Character'}`,
    `${indent}await CharacterDisplay($(${lit(sel)}), {`,
    ...settings.map((s) => `${indent}  ${s},`),
    `${indent}}, event);`,
  ];
}

function emitComponent(
  node: ComponentNode,
  layout: Layout,
  indent: string,
): string[] {
  const sel = `.${nodeClass(node.id)}`;
  const scope = effectiveScope(layout.root, node.id);
  const options = JSON.stringify({ ...node.options, scope }, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : `${indent}${line}`))
    .join('\n');

  return [
    `${indent}// ${node.name || node.kind}`,
    `${indent}await TSHComponents.render(${lit(node.kind)}, $(${lit(sel)}), ${options}, event);`,
  ];
}

/* ── Animation ──────────────────────────────────────────────────────────── */

function tweenSelectors(tween: Tween, layout: Layout): string[] {
  const guard = tween.skipEmpty ? ':not(.text_empty)' : '';
  const byId = tween.targetIds
    .filter((id) => nodeExists(layout, id))
    .map((id) => `.${nodeClass(id)}${guard}`);
  if (tween.targetSelector) byId.push(`${tween.targetSelector}${guard}`);
  return byId;
}

function nodeExists(layout: Layout, id: string): boolean {
  for (const node of walk(layout.root)) {
    if (node.id === id) return !node.hidden;
  }
  return false;
}

/** GSAP `from()` vars for a preset. These animate *from* the offset state. */
function tweenVars(tween: Tween): string[] {
  const vars: string[] = [`duration: ${tween.duration}`];

  switch (tween.preset) {
    case 'fade':
      vars.push('autoAlpha: 0');
      break;
    case 'fade_up':
      vars.push('autoAlpha: 0', `y: "${tween.distance}px"`);
      break;
    case 'fade_down':
      vars.push('autoAlpha: 0', `y: "-${tween.distance}px"`);
      break;
    case 'fade_left':
      vars.push('autoAlpha: 0', `x: "-${tween.distance}px"`);
      break;
    case 'fade_right':
      vars.push('autoAlpha: 0', `x: "${tween.distance}px"`);
      break;
    case 'scale_in':
      vars.push('autoAlpha: 0', `scale: ${tween.scaleFrom}`, 'transformOrigin: "center center"');
      break;
    case 'scale_out':
      // No autoAlpha — a logo settling into place shouldn't also fade.
      vars.push(`scale: ${tween.scaleFrom}`, 'transformOrigin: "center center"');
      break;
    case 'custom':
      return [tween.customVars?.trim() || `duration: ${tween.duration}`];
  }

  vars.push(`ease: ${JSON.stringify(tween.ease)}`);

  if (tween.stagger) {
    vars.push(
      `stagger: { each: ${tween.stagger.each}, from: ${JSON.stringify(tween.stagger.from)} }`,
    );
  }

  return vars;
}

function emitAnimation(spec: AnimationSpec, layout: Layout): string {
  const active = spec.tweens.filter((t) => t.enabled);
  const lines: string[] = ['  const startingAnimation = gsap'];
  lines.push('    .timeline({ paused: true })');

  for (const tween of active) {
    const selectors = tweenSelectors(tween, layout);
    if (!selectors.length) continue;
    const targets = selectors.map((s) => lit(s)).join(', ');
    const vars = tweenVars(tween);
    lines.push(`    // ${tween.name}`);
    lines.push(`    .from(`);
    lines.push(`      [${targets}],`);
    lines.push(`      {`);
    lines.push(...vars.map((v) => `        ${v},`));
    lines.push(`      },`);
    lines.push(`      ${tween.position}`);
    lines.push(`    )`);
  }

  // Trailing `;` closes the chain regardless of how many tweens were emitted.
  lines.push('    ;');

  if (spec.timeScale !== 1) {
    lines.push(`  startingAnimation.timeScale(${spec.timeScale});`);
  }

  return lines.join('\n');
}

/* ── Whole file ─────────────────────────────────────────────────────────── */

export function emitJs(layout: Layout): string {
  const updateLines: string[] = [];
  const indent = '    ';

  for (const node of walk(layout.root)) {
    if (node.hidden) continue;
    let block: string[] = [];
    switch (node.type) {
      case 'text':
        block = emitText(node, layout, indent);
        break;
      case 'image':
        block = emitImage(node, layout, indent);
        break;
      case 'character':
        block = emitCharacter(node, layout, indent);
        break;
      case 'component':
        block = emitComponent(node, layout, indent);
        break;
      default:
        break;
    }
    if (block.length) updateLines.push(...block, '');
  }

  const usesComponents = [...walk(layout.root)].some(
    (n) => !n.hidden && n.type === 'component',
  );

  const startBody = layout.animation.replayOnShow
    ? '    startingAnimation.restart();'
    : [
        '    // Intro plays once; OBS re-shows will not replay it.',
        '    if (introPlayed) return;',
        '    introPlayed = true;',
        '    startingAnimation.restart();',
      ].join('\n');

  return `/* ${'═'.repeat(59)}
   ${layout.name} — index.js
   Generated by TSH Layout Creator.

   Start(*)  runs the intro timeline.
   Update(*) runs whenever TSH's program state changes.
   ${'═'.repeat(59)} */

LoadEverything().then(() => {
  gsap.config({ nullTargetWarn: false, trialWarn: false });
${layout.animation.replayOnShow ? '' : '\n  let introPlayed = false;\n'}
  // Treats undefined, null and "" alike, so an unset TSH field clears its
  // element instead of printing "undefined".
  const nonEmpty = (v) => v !== undefined && v !== null && String(v).length > 0;

${emitAnimation(layout.animation, layout)}

  Start = async () => {
${startBody}
  };

  Update = async (event) => {
    const data = event.data;
    const sb = window.scoreboardNumber;
${usesComponents ? '' : ''}
${updateLines.join('\n')}  };
});
`;
}
