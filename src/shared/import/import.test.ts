/**
 * Import tests.
 *
 * The load-bearing assertion is the round-trip: an imported layout with no
 * edits must come back out byte-for-byte. Everything else the imported tier
 * promises rests on that.
 *
 * The fixture mirrors the shapes actually found in the official layouts —
 * shorthand hex, 8-digit hex with alpha, spaced `rgba()`, a `@font-face`, a
 * commented-out colour, and multiple HTML files with body classes.
 */

import { describe, expect, it } from 'vitest';
import { analyzeCss, applyEdits, bodyClassOf, normalizeColor } from './css';
import { importLayout } from './layout';
import { rewriteImportedCss, emitPack } from '../emit';
import { emptyPack } from '../model/pack';
import type { ImportedLayoutFiles } from '../ipc';

const FIXTURE_CSS = `/* A comment mentioning #abcdef that must be ignored */
:root {
  --accent: #ff0000;
  --panel: rgba(18, 18, 18, 0.8);
}

@font-face {
  font-family: "Montserrat";
  src: url("./Montserrat.ttf");
}

body {
  width: 1920px;
  height: 1080px;
  font-family: "Montserrat", sans-serif;
}

.player {
  background: #FFF;
  border: 1px solid #0000001f;
  color: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.12);
}

.score {
  background: #38ffb7;
  font-family: var(--font);
}
`;

const FIXTURE: ImportedLayoutFiles = {
  folderName: 'scoreboard_demo',
  css: FIXTURE_CSS,
  js: 'LoadEverything().then(() => {\n  Update = async (e) => {};\n});\n',
  html: {
    'index.html': '<html><body class="">x</body></html>',
    'fgc.html': '<html><body class="fgc thin">x</body></html>',
  },
  settings: '{"assets":{"default":{"asset_key":"base_files/icon"}}}',
};

describe('CSS analysis', () => {
  const analysis = analyzeCss(FIXTURE_CSS);

  it('finds custom properties declared in :root', () => {
    expect(analysis.tokens.map((t) => t.name)).toEqual(['--accent', '--panel']);
    expect(analysis.tokens[0]?.value).toBe('#ff0000');
    expect(analysis.rootBlock).toBeDefined();
  });

  it('groups equivalent colour spellings', () => {
    // #FFF and #fff are the same colour written two ways, in two rules.
    const white = analysis.colors.find((c) => c.normalized === '#ffffff');
    expect(white?.occurrences).toHaveLength(2);
    expect(white?.occurrences.map((o) => o.raw).sort()).toEqual(['#FFF', '#fff']);
  });

  it('ignores colours inside comments', () => {
    expect(analysis.colors.some((c) => c.normalized === '#abcdef')).toBe(false);
  });

  it('ignores colours inside :root, which are already tokens', () => {
    expect(analysis.colors.some((c) => c.normalized === '#ff0000')).toBe(false);
    expect(
      analysis.colors.some((c) => c.normalized.startsWith('rgba(18')),
    ).toBe(false);
  });

  it('flags greys and low-alpha values as incidental, not brand colours', () => {
    const mint = analysis.colors.find((c) => c.normalized === '#38ffb7');
    const shadow = analysis.colors.find((c) => c.normalized.startsWith('rgba(0, 0, 0'));
    const hairline = analysis.colors.find((c) => c.normalized === '#0000001f');

    expect(mint?.likelyIncidental).toBe(false);
    expect(shadow?.likelyIncidental).toBe(true);
    expect(hairline?.likelyIncidental).toBe(true);
    // Brandable colours sort ahead of incidental ones.
    expect(analysis.colors[0]?.likelyIncidental).toBe(false);
  });

  it('finds literal font stacks but skips ones already using a variable', () => {
    const values = analysis.fonts.map((f) => f.value);
    expect(values).toContain('"Montserrat", sans-serif');
    expect(values).toContain('"Montserrat"');
    expect(values).not.toContain('var(--font)');
  });

  it('records spans that point at the right source text', () => {
    for (const group of analysis.colors) {
      for (const occurrence of group.occurrences) {
        expect(FIXTURE_CSS.slice(occurrence.start, occurrence.end)).toBe(
          occurrence.raw,
        );
      }
    }
    for (const font of analysis.fonts) {
      expect(FIXTURE_CSS.slice(font.start, font.end)).toBe(font.value);
    }
  });
});

describe('normalizeColor', () => {
  it('expands shorthand hex', () => {
    expect(normalizeColor('#FFF')).toBe('#ffffff');
    expect(normalizeColor('#f00')).toBe('#ff0000');
    expect(normalizeColor('#abcd')).toBe('#aabbccdd');
  });

  it('drops a fully-opaque alpha channel so it groups with the 6-digit form', () => {
    expect(normalizeColor('#112233ff')).toBe('#112233');
    expect(normalizeColor('#1122331f')).toBe('#1122331f');
  });

  it('normalises whitespace and leading-dot decimals in rgb()', () => {
    expect(normalizeColor('rgba(0,0,0,.5)')).toBe('rgba(0, 0, 0, 0.5)');
    expect(normalizeColor('RGBA( 0 , 0 , 0 , 0.5 )')).toBe('rgba(0, 0, 0, 0.5)');
  });
});

describe('applyEdits', () => {
  it('applies non-overlapping edits right-to-left', () => {
    expect(
      applyEdits('abcdef', [
        { start: 0, end: 1, replacement: 'X' },
        { start: 4, end: 6, replacement: 'YY' },
      ]),
    ).toBe('XbcdYY');
  });

  it('handles replacements of different length than the span', () => {
    expect(
      applyEdits('a-b-c', [
        { start: 1, end: 2, replacement: '=====' },
        { start: 3, end: 4, replacement: '' },
      ]),
    ).toBe('a=====bc');
  });

  it('refuses to apply overlapping edits rather than corrupting the source', () => {
    expect(() =>
      applyEdits('abcdef', [
        { start: 1, end: 4, replacement: 'X' },
        { start: 2, end: 5, replacement: 'Y' },
      ]),
    ).toThrow(/Overlapping/);
  });
});

describe('bodyClassOf', () => {
  it('reads the class attribute from the body tag', () => {
    expect(bodyClassOf('<html><body class="ssbu">x</body></html>')).toBe('ssbu');
    expect(bodyClassOf("<body class='fgc thin'>")).toBe('fgc thin');
    expect(bodyClassOf('<body>')).toBe('');
  });
});

describe('importLayout', () => {
  it('turns each HTML file into a variant, with index.html first', () => {
    const { layout } = importLayout(FIXTURE);
    expect(layout.variants.map((v) => v.fileName)).toEqual([
      'index.html',
      'fgc.html',
    ]);
    expect(layout.variants[1]?.bodyClass).toBe('fgc thin');
    expect(layout.variants[0]?.name).toBe('Default');
  });

  it('adopts the layout as imported and keeps the source verbatim', () => {
    const { layout } = importLayout(FIXTURE);
    expect(layout.tier).toBe('imported');
    expect(layout.importedFrom).toBe('scoreboard_demo');
    expect(layout.importedSource?.css).toBe(FIXTURE_CSS);
    expect(layout.root.children).toHaveLength(0);
  });

  it('reads existing variables into editable token overrides', () => {
    const { layout } = importLayout(FIXTURE);
    expect(layout.tokenOverrides['--accent']).toBe('#ff0000');
  });

  it('detects the canvas size from the body rule', () => {
    const { layout } = importLayout(FIXTURE);
    expect(layout.canvas).toEqual({ width: 1920, height: 1080 });

    const fourByThree = importLayout({
      ...FIXTURE,
      css: 'body { width: 1440px; height: 1080px; }',
    });
    expect(fourByThree.layout.canvas).toEqual({ width: 1440, height: 1080 });
  });

  it('carries settings.json through, and survives a malformed one', () => {
    const { layout } = importLayout(FIXTURE);
    expect(layout.settings.assets['default']?.['asset_key']).toBe('base_files/icon');

    const broken = importLayout({ ...FIXTURE, settings: '{not json' });
    expect(broken.layout.settings.assets).toBeDefined();
  });

  it('notes when a layout has no variables to edit', () => {
    const { notes } = importLayout({ ...FIXTURE, css: 'body { color: red; }' });
    expect(notes.join(' ')).toContain('no CSS variables');
  });
});

describe('rewriteImportedCss', () => {
  it('returns the source unchanged when nothing has been edited', () => {
    const { layout } = importLayout(FIXTURE);
    // importLayout seeds tokenOverrides from the source, so an untouched
    // layout must still round-trip byte-for-byte.
    expect(rewriteImportedCss(layout, FIXTURE_CSS)).toBe(FIXTURE_CSS);
  });

  it('rewrites an existing variable in place', () => {
    const { layout } = importLayout(FIXTURE);
    layout.tokenOverrides['--accent'] = '#00ff00';

    const out = rewriteImportedCss(layout, FIXTURE_CSS);
    expect(out).toContain('--accent: #00ff00;');
    expect(out).not.toContain('--accent: #ff0000;');
    // The neighbouring token and everything else survive.
    expect(out).toContain('--panel: rgba(18, 18, 18, 0.8);');
    expect(out).toContain('@font-face');
  });

  it('promotes every occurrence of a colour to a token', () => {
    const { layout } = importLayout(FIXTURE);
    layout.importedEdits = {
      colorMappings: { '#ffffff': 'var(--text-color)' },
      fontMappings: {},
    };

    const out = rewriteImportedCss(layout, FIXTURE_CSS);
    // Both spellings, in both rules, are replaced.
    expect(out).not.toContain('#FFF');
    expect(out).toContain('background: var(--text-color);');
    expect(out).toContain('color: var(--text-color);');
    // Unmapped colours are left exactly as written.
    expect(out).toContain('#38ffb7');
    expect(out).toContain('rgba(0,0,0,0.12)');
  });

  it('adds a new variable into the existing :root block', () => {
    const { layout } = importLayout(FIXTURE);
    layout.tokenOverrides['--brand'] = '#123456';

    const out = rewriteImportedCss(layout, FIXTURE_CSS);
    expect(out).toContain('--brand: #123456;');
    // Added inside the existing block, not in a second one.
    expect(out.match(/:root\s*\{/g)).toHaveLength(1);
  });

  it('creates a :root block when the stylesheet has none', () => {
    const cssNoRoot = 'body { color: #fff; }';
    const { layout } = importLayout({ ...FIXTURE, css: cssNoRoot });
    layout.tokenOverrides['--brand'] = '#123456';

    const out = rewriteImportedCss(layout, cssNoRoot);
    expect(out).toContain(':root {');
    expect(out).toContain('--brand: #123456;');
    expect(out).toContain('body { color: #fff; }');
  });

  it('substitutes fonts without touching ones using a variable', () => {
    const { layout } = importLayout(FIXTURE);
    layout.importedEdits = {
      colorMappings: {},
      fontMappings: { '"Montserrat", sans-serif': 'var(--font)' },
    };

    const out = rewriteImportedCss(layout, FIXTURE_CSS);
    expect(out).toContain('font-family: var(--font);');
    // The @font-face declaration names the family and must survive.
    expect(out).toContain('font-family: "Montserrat";');
  });

  it('materialises pack tokens a promotion references', () => {
    // An imported layout keeps its original HTML, which never links the pack's
    // theme.css. Without this, a promoted colour resolves to nothing.
    const { layout } = importLayout({ ...FIXTURE, css: '.score { background: #38ffb7; }' });
    layout.importedEdits = {
      colorMappings: { '#38ffb7': 'var(--my-brand)' },
      fontMappings: {},
    };

    const out = rewriteImportedCss(layout, '.score { background: #38ffb7; }', {
      '--my-brand': '#ff00ff',
    });
    expect(out).toContain('--my-brand: #ff00ff;');
    expect(out).toContain('background: var(--my-brand);');
  });

  it('skips a referenced token the theme cannot resolve, rather than emitting an empty value', () => {
    const css = '.score { background: #38ffb7; }';
    const { layout } = importLayout({ ...FIXTURE, css });
    layout.importedEdits = {
      colorMappings: { '#38ffb7': 'var(--nowhere)' },
      fontMappings: {},
    };

    const out = rewriteImportedCss(layout, css, {});
    expect(out).not.toContain('--nowhere:');
    expect(out).toContain('var(--nowhere)');
  });

  it("does not restate a referenced token the stylesheet already declares", () => {
    const { layout } = importLayout(FIXTURE);
    layout.importedEdits = {
      colorMappings: { '#38ffb7': 'var(--accent)' },
      fontMappings: {},
    };

    const out = rewriteImportedCss(layout, FIXTURE_CSS, { '--accent': '#999999' });
    // The layout's own declaration stands; the pack value must not shadow it.
    expect(out).toContain('--accent: #ff0000;');
    expect(out).not.toContain('--accent: #999999;');
    expect(out.match(/--accent:/g)).toHaveLength(1);
  });

  it('applies colour, font and token edits together without corruption', () => {
    const { layout } = importLayout(FIXTURE);
    layout.tokenOverrides['--accent'] = '#00ff00';
    layout.tokenOverrides['--brand'] = '#123456';
    layout.importedEdits = {
      colorMappings: {
        '#ffffff': 'var(--text-color)',
        '#38ffb7': 'var(--p1-score-bg-color)',
      },
      fontMappings: { '"Montserrat", sans-serif': 'var(--font)' },
    };

    const out = rewriteImportedCss(layout, FIXTURE_CSS);
    expect(out).toContain('--accent: #00ff00;');
    expect(out).toContain('--brand: #123456;');
    expect(out).toContain('var(--text-color)');
    expect(out).toContain('var(--p1-score-bg-color)');
    expect(out).toContain('font-family: var(--font);');
    // Structure is untouched: same rules, same selectors.
    expect(out).toContain('.player {');
    expect(out).toContain('.score {');
    expect(out).toContain('border: 1px solid #0000001f;');
  });
});

describe('exporting an imported layout', () => {
  it('writes back every original file and warns about the limited rewrite', () => {
    const pack = emptyPack('My Pack');
    const { layout } = importLayout(FIXTURE);
    pack.layouts.push(layout);

    const { files, warnings } = emitPack(pack);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('scoreboard_demo/index.html');
    expect(paths).toContain('scoreboard_demo/fgc.html');
    expect(paths).toContain('scoreboard_demo/index.css');
    expect(paths).toContain('scoreboard_demo/index.js');
    expect(warnings.join(' ')).toContain('preserved as authored');

    // The script is never regenerated.
    expect(files.find((f) => f.path.endsWith('index.js'))?.contents).toBe(
      FIXTURE.js,
    );
    // Nor is the markup.
    expect(files.find((f) => f.path.endsWith('fgc.html'))?.contents).toBe(
      FIXTURE.html['fgc.html'],
    );
  });
});
