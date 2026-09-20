/**
 * Emitter tests.
 *
 * The highest-value assertions here are the ones that catch output which
 * *looks* fine as a string but would fail in a browser: JS that doesn't parse,
 * and the Stack-mode collapse rules that are the reason the mode exists.
 */

import { describe, expect, it } from 'vitest';
import { emitCss, emitJs, emitPack, emitHtml, packFolder } from './index';
import { emitThemeCss } from './theme';
import { nodeClass } from './css';
import { emptyPack, emptyLayout, defaultVariant, newId } from '../model/pack';
import type { Layout, Pack } from '../model/pack';
import {
  createCharacter,
  createComponent,
  createContainer,
  createImage,
  createLayoutFromTemplate,
  createText,
} from '../model/factory';
import { binding } from '../model/bindings';
import { defaultStackConfig } from '../model/style';
import { defaultTween } from '../model/animation';

function packWith(layout: Layout): Pack {
  const pack = emptyPack('Test Pack');
  pack.layouts.push(layout);
  return pack;
}

/**
 * Parses source as a function body. `new Function` performs a full syntax
 * check without executing anything, which is exactly what we want: the
 * emitted file references browser globals that don't exist here.
 */
function assertParses(source: string): void {
  expect(() => new Function(source)).not.toThrow();
}

/** The body of the first rule whose selector mentions `className`. */
function ruleFor(css: string, className: string): string {
  const start = css.indexOf(`.${className} {`);
  if (start === -1) return '';
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('CSS emitter', () => {
  it('emits flexbox for a stack container and leaves its children in flow', () => {
    const layout = emptyLayout('Test', 'test');
    const child = createText('Label');
    // Coordinates that must be ignored: the parent is a stack, so position
    // comes from the flow, not from these.
    child.style.free = { x: 999, y: 999 };
    const container = createContainer('Row', {
      layoutMode: 'stack',
      stack: { ...defaultStackConfig(), direction: 'row', gap: 12 },
      children: [child],
    });
    layout.root.children.push(container);

    const css = emitCss(layout);
    expect(css).toContain('display: flex');
    expect(css).toContain('flex-direction: row');
    expect(css).toContain('gap: 12px');

    // The container itself sits in the free root, so it *is* absolute. Its
    // child must not be, and must not carry the stale coordinates.
    const childRule = ruleFor(css, nodeClass(child.id));
    expect(childRule).not.toContain('position: absolute');
    expect(childRule).not.toContain('999px');
  });

  it('emits absolute coordinates for a child of a free container', () => {
    const layout = emptyLayout('Test', 'test');
    const free = createContainer('Free', { layoutMode: 'free' });
    const text = createText('Label');
    text.style.free = { x: 120, y: 340 };
    free.children.push(text);
    layout.root.children.push(free);

    const css = emitCss(layout);
    expect(css).toContain('position: absolute');
    expect(css).toContain('left: 120px');
    expect(css).toContain('top: 340px');
  });

  it('emits empty-collapse rules only for stack containers that ask for them', () => {
    const layout = emptyLayout('Test', 'test');
    const text = createText('Name', { binding: binding('tournamentInfo.eventName') });
    const character = createCharacter('Char');

    const withCollapse = createContainer('Row', {
      layoutMode: 'stack',
      stack: { ...defaultStackConfig(), collapseEmpty: true },
      children: [text, character],
    });
    layout.root.children.push(withCollapse);

    const css = emitCss(layout);
    // Text-bearing children collapse when their own .text is empty…
    expect(css).toContain(`.${nodeClass(text.id)}:has(.text_empty)`);
    // …but a character container is only empty when every character is.
    expect(css).toContain(
      `.${nodeClass(character.id)}:not(:has(:not(.text_empty)))`,
    );
    expect(css).toContain('display: none');
  });

  it('omits collapse rules when the option is off', () => {
    const layout = emptyLayout('Test', 'test');
    const text = createText('Name');
    layout.root.children.push(
      createContainer('Row', {
        layoutMode: 'stack',
        stack: { ...defaultStackConfig(), collapseEmpty: false },
        children: [text],
      }),
    );
    expect(emitCss(layout)).not.toContain(':has(.text_empty)');
  });

  it('puts raw CSS last so it overrides generated declarations', () => {
    const layout = emptyLayout('Test', 'test');
    const text = createText('Label');
    text.style.box.background = 'red';
    text.style.rawCss = 'background: blue;';
    layout.root.children.push(text);

    const css = emitCss(layout);
    const rule = css.slice(css.indexOf(`.${nodeClass(text.id)}`));
    expect(rule.indexOf('background: blue')).toBeGreaterThan(
      rule.indexOf('background: red'),
    );
  });

  it('scopes variant overrides under the body class and emits only differences', () => {
    const layout = emptyLayout('Test', 'test');
    const text = createText('Label');
    text.style.text.fontSize = 30;
    layout.root.children.push(text);

    layout.variants.push(
      defaultVariant({
        id: newId(),
        name: 'FGC',
        fileName: 'fgc.html',
        bodyClass: 'fgc',
        styleOverrides: { [text.id]: { text: { fontSize: 44 } } },
      }),
    );

    const css = emitCss(layout);
    expect(css).toContain(`body.fgc .${nodeClass(text.id)}`);
    expect(css).toContain('font-size: 44px');
    // The unchanged colour must not be restated inside the variant rule.
    const variantRule = css.slice(css.indexOf('body.fgc'));
    expect(variantRule).not.toContain('font-weight');
  });
});

describe('JS emitter', () => {
  it('produces syntactically valid JavaScript for a template layout', () => {
    const layout = createLayoutFromTemplate('scoreboard', 'Scoreboard', 'sb');
    assertParses(emitJs(layout));
  });

  it('produces valid JavaScript for an empty layout', () => {
    assertParses(emitJs(emptyLayout('Empty', 'empty')));
  });

  it('produces valid JavaScript with every node type and a custom tween', () => {
    const layout = emptyLayout('Kitchen sink', 'sink');
    const text = createText('Name', {
      binding: binding('score.{sb}.team.{team}.player.{player}.name', {
        transforms: ['transcript', 'uppercase'],
        template: 'Seed {value}',
        fallback: 'TBD',
      }),
      scope: { team: 1, player: 1 },
    });
    const character = createCharacter('Char', { scope: { team: 2 } });
    const component = createComponent('set_list');
    layout.root.children.push(text, character, component);
    layout.animation.tweens.push(
      defaultTween({
        id: newId(),
        name: 'Custom',
        targetIds: [text.id],
        preset: 'custom',
        customVars: 'autoAlpha: 0, rotation: -8',
      }),
    );

    assertParses(emitJs(layout));
  });

  it('substitutes scope into data paths and leaves {sb} for runtime', () => {
    const layout = emptyLayout('Test', 'test');
    const text = createText('Name', {
      binding: binding('score.{sb}.team.{team}.player.{player}.name'),
      scope: { team: 2, player: 1 },
    });
    layout.root.children.push(text);

    const js = emitJs(layout);
    expect(js).toContain('score.${sb}.team.2.player.1.name');
    expect(js).not.toContain('{team}');
    expect(js).not.toContain('{player}');
  });

  it('prefixes TSH asset paths but leaves remote URLs alone', () => {
    const withAsset = emptyLayout('Assets', 'assets');
    const localImg = createImage('Flag', {
      binding: binding('score.{sb}.team.{team}.player.{player}.country.asset', {
        transforms: ['asset-path'],
      }),
      scope: { team: 1, player: 1 },
    });
    const remoteImg = createImage('Online avatar', {
      binding: binding('score.{sb}.team.{team}.player.{player}.online_avatar'),
      scope: { team: 1, player: 1 },
    });
    withAsset.root.children.push(localImg, remoteImg);

    const js = emitJs(withAsset);
    expect(js).toContain(`<img src="../../\${v_${localImg.id}}" />`);
    expect(js).toContain(`<img src="\${v_${remoteImg.id}}" />`);
  });

  it('guards staggered tweens against empty data', () => {
    const layout = emptyLayout('Test', 'test');
    const text = createText('Chip');
    layout.root.children.push(text);
    layout.animation.tweens.push(
      defaultTween({
        id: newId(),
        targetIds: [text.id],
        preset: 'fade_up',
        skipEmpty: true,
      }),
    );

    expect(emitJs(layout)).toContain(`.${nodeClass(text.id)}:not(.text_empty)`);
  });

  it('applies the layout time scale', () => {
    const layout = createLayoutFromTemplate('scoreboard', 'SB', 'sb');
    layout.animation.timeScale = 0.5;
    expect(emitJs(layout)).toContain('startingAnimation.timeScale(0.5)');
  });

  it('drops tweens whose targets no longer exist', () => {
    const layout = emptyLayout('Test', 'test');
    layout.animation.tweens.push(
      defaultTween({ id: newId(), targetIds: ['does-not-exist'] }),
    );
    const js = emitJs(layout);
    expect(js).not.toContain('does-not-exist');
    assertParses(js);
  });
});

describe('HTML emitter', () => {
  it('links the shared theme and includes the component runtime only when used', () => {
    const plain = emptyLayout('Plain', 'plain');
    const pack = packWith(plain);
    const html = emitHtml(pack, plain, plain.variants[0]!, {
      packAssetPath: `../${packFolder(pack)}`,
    });
    expect(html).toContain('../main.css');
    expect(html).toContain('theme.css');
    expect(html).not.toContain('components.js');

    const withComponent = emptyLayout('Comp', 'comp');
    withComponent.root.children.push(createComponent('commentators'));
    const pack2 = packWith(withComponent);
    const html2 = emitHtml(pack2, withComponent, withComponent.variants[0]!, {
      packAssetPath: `../${packFolder(pack2)}`,
    });
    expect(html2).toContain('components.js');
  });

  it('sets the body class for a variant but not for the default', () => {
    const layout = emptyLayout('Test', 'test');
    layout.variants.push(
      defaultVariant({ id: newId(), name: 'FGC', fileName: 'fgc.html', bodyClass: 'fgc' }),
    );
    const pack = packWith(layout);
    const options = { packAssetPath: `../${packFolder(pack)}` };

    expect(emitHtml(pack, layout, layout.variants[0]!, options)).toContain('<body>');
    expect(emitHtml(pack, layout, layout.variants[1]!, options)).toContain(
      '<body class="fgc">',
    );
  });

  it('escapes user-supplied text', () => {
    const layout = emptyLayout('Test', 'test');
    layout.root.children.push(
      createText('Label', { content: '<script>bad()</script>', animateChanges: false }),
    );
    const pack = packWith(layout);
    const html = emitHtml(pack, layout, layout.variants[0]!, {
      packAssetPath: `../${packFolder(pack)}`,
    });
    expect(html).not.toContain('<script>bad()');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('Theme emitter', () => {
  it('writes core tokens with their help text', () => {
    const css = emitThemeCss(emptyPack('My Pack'));
    expect(css).toContain('--p1-score-bg-color');
    expect(css).toContain(':root {');
  });

  it('carries custom tokens through', () => {
    const pack = emptyPack('My Pack');
    pack.theme['--my-accent'] = '#ff00ff';
    expect(emitThemeCss(pack)).toContain('--my-accent: #ff00ff;');
  });
});

describe('Pack emitter', () => {
  it('emits one folder per layout plus shared pack assets', () => {
    const pack = emptyPack('My Pack');
    pack.layouts.push(createLayoutFromTemplate('scoreboard', 'Scoreboard', 'scoreboard'));

    const { files } = emitPack(pack);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('_packs/my_pack/theme.css');
    expect(paths).toContain('scoreboard/index.html');
    expect(paths).toContain('scoreboard/index.css');
    expect(paths).toContain('scoreboard/index.js');
    expect(paths).toContain('scoreboard/settings.json');
  });

  it('warns rather than silently overwriting when two layouts share a folder', () => {
    const pack = emptyPack('My Pack');
    pack.layouts.push(emptyLayout('One', 'same'), emptyLayout('Two', 'same'));

    const { warnings, files } = emitPack(pack);
    expect(warnings.join(' ')).toContain('both emit to');
    // Only the first layout's files should be present.
    expect(files.filter((f) => f.path === 'same/index.css')).toHaveLength(1);
  });

  it('warns about components whose runtime is still a placeholder', () => {
    const layout = emptyLayout('Map', 'map_test');
    layout.root.children.push(createComponent('map'));
    const pack = packWith(layout);

    expect(emitPack(pack).warnings.join(' ')).toContain('not implemented');
  });

  it('does not warn about implemented components', () => {
    const layout = emptyLayout('Bracket', 'bracket_test');
    layout.root.children.push(createComponent('bracket'));
    const pack = packWith(layout);

    expect(emitPack(pack).warnings.join(' ')).not.toContain('not implemented');
  });

  it('ships the component runtime and its default styles when one is used', () => {
    const layout = emptyLayout('Bracket', 'bracket_test');
    layout.root.children.push(createComponent('bracket'));
    const pack = packWith(layout);

    const paths = emitPack(pack).files.map((f) => f.path);
    expect(paths).toContain('_packs/test_pack/components.js');
    expect(paths).toContain('_packs/test_pack/components.css');
  });

  it('preserves an imported layout and rewrites only its :root block', () => {
    const layout = emptyLayout('Imported', 'imported');
    layout.tier = 'imported';
    layout.tokenOverrides = { '--text-color': '#ff0000' };
    layout.importedSource = {
      css: ':root {\n  --text-color: #ffffff;\n}\n\n.custom { color: lime; }',
      js: '// hand written\nconsole.log(1);',
      html: { 'index.html': '<html><body>hand written</body></html>' },
      hash: 'abc',
    };

    const { files } = emitPack(packWith(layout));
    const css = files.find((f) => f.path === 'imported/index.css')!.contents;
    const js = files.find((f) => f.path === 'imported/index.js')!.contents;

    expect(css).toContain('--text-color: #ff0000');
    // Everything the editor doesn't model must survive untouched.
    expect(css).toContain('.custom { color: lime; }');
    expect(js).toBe('// hand written\nconsole.log(1);');
  });

  it('sanitises folder names into filesystem-safe form', () => {
    const pack = emptyPack('My Pack');
    pack.layouts.push(emptyLayout('Weird', 'My Layout! (v2)'));
    const paths = emitPack(pack).files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('my_layout_v2/'))).toBe(true);
  });
});
