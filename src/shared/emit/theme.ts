/**
 * Pack theme emitter.
 *
 * One `theme.css` per pack, loaded by every layout in it after `main.css`.
 * This is the file that makes "change the accent once, every overlay updates"
 * true — layouts and variants only ever emit their *differences* from it.
 */

import type { FontRef, Pack } from '../model/pack';
import { CORE_TOKENS } from '../model/tokens';
import { banner } from './css';

function fontFace(font: FontRef): string {
  const descriptors = [
    `  font-family: ${JSON.stringify(font.family)};`,
    `  src: url("./fonts/${font.file}") format("truetype");`,
  ];
  if (font.weight !== undefined) descriptors.push(`  font-weight: ${font.weight};`);
  if (font.italic) descriptors.push('  font-style: italic;');
  return `@font-face {\n${descriptors.join('\n')}\n}`;
}

export function emitThemeCss(pack: Pack): string {
  const sections: string[] = [];

  sections.push(
    banner(`${pack.name} — theme.css`, [
      'Shared design tokens for every layout in this pack.',
      'Loaded after main.css, so these values win over the TSH defaults.',
      '',
      'Editing a value here updates every layout that uses it.',
    ]),
  );

  if (pack.fonts.length) {
    sections.push(
      `/* ── Fonts ─────────────────────────────────────────── */\n\n${pack.fonts
        .map(fontFace)
        .join('\n\n')}`,
    );
  }

  // Emit documented core tokens first, in their canonical order, with their
  // help text as comments. Custom tokens follow.
  const emitted = new Set<string>();
  const coreLines: string[] = [];
  for (const def of CORE_TOKENS) {
    const value = pack.theme[def.name];
    if (value === undefined) continue;
    emitted.add(def.name);
    if (def.help) coreLines.push(`  /* ${def.help} */`);
    coreLines.push(`  ${def.name}: ${value};`);
  }

  const customLines: string[] = [];
  for (const [name, value] of Object.entries(pack.theme)) {
    if (emitted.has(name)) continue;
    customLines.push(`  ${name}: ${value};`);
  }

  const body = [
    coreLines.join('\n'),
    customLines.length ? `\n  /* Custom tokens */\n${customLines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  sections.push(
    `/* ── Tokens ────────────────────────────────────────── */\n\n:root {\n${body}\n}`,
  );

  return `${sections.join('\n\n')}\n`;
}
