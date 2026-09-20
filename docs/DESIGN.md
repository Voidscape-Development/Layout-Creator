# Layout Creator — design

A visual editor for [TournamentStreamHelper](https://github.com/joaorb64/TournamentStreamHelper)
overlays. It creates new layouts and edits existing ones, and its output drops
straight into a TSH install's `/layout/` folder.

This document records what was decided and why. It is the reference for anyone
picking the project up.

---

## 1. What TSH layouts actually are

Before any of the design below makes sense, the target format:

**Structure.** The [official layouts repo](https://github.com/TournamentStreamHelper/TournamentStreamHelper-layouts)
has 41 layout folders holding 126 HTML files (29 of those folders have an
`index.html`; the rest are named for their variants). One folder is a layout *family*:
`index.html` plus variants (`index_3d.html`, `losers_only.html`, `t1_p1.html`)
that share a single `index.css` and `index.js` and differ by a class on
`<body>` — `.ssbu`, `.fgc`, `.sf6.online`. Each folder also carries
`settings.json` and a `*_preview.png` per variant.

**Runtime.** `../include/globals.js` sequentially loads jQuery, GSAP, he,
lodash, Kuroshiro, waitForImages, color-thief, `assetUtils.js` and socket.io. A
layout then implements exactly two globals:

```js
Start  = async () => { /* run the intro timeline */ };
Update = async (event) => { /* event.data is the program state */ };
```

Data arrives over socket.io (`program_state`, then `program_state_update`
deltas) or, on `file://`, by polling `../../out/program_state.json` every 64ms.

**Helpers layouts build on.**

| Helper | Purpose |
| --- | --- |
| `SetInnerHtml($el, html, opts)` | Wraps content in `.text`, crossfades changes, auto-fits, tags empties with `.text_empty` |
| `CharacterDisplay($el, settings, event)` | Character art with `asset_key`, `source`, `custom_zoom`, `custom_center`, `scale_fill_x/y`, `slice_player`, `slice_character`, `use_dividers` |
| `Transcript(text)` | Japanese → romaji via Kuroshiro |
| `FitText` / `CenterImage` / `GetLogoColors` | Text fitting, art centring, auto-theming from the tournament logo |

**Animation.** Uniformly a `gsap.timeline({paused:true})` of `.from()` calls
against semantic classes — `.fade`, `.fade_up|down|left|right`,
`.fade_*_stagger` — guarded with `:not(.text_empty)`.
`gsap.globalTimeline.timeScale(0)` holds everything until the first data
arrives, and `initOnBrowserActive` replays on OBS source activation.

**Theming.** `main.css` defines `--font`, `--border-radius*`, `--text-color`,
`--bg-color`, `--p1/p2-score-bg-color`, `--p1/p2-sponsor-color`. In practice
only three layouts define the core set, and per-layout variables are ad hoc
(`--parry-accent`, `--set-gap`, and a `--infos-wdith` typo). Consistent
theming is the clearest gap the Creator fills.

**Data.** `data.score[n].team[1|2]` → `{score, losers, color, teamName, logo,
player{…}{name, team, country{code,asset}, state, pronoun, seed, twitter,
avatar, online_avatar, sponsor_logo, character}}`, plus `data.tournamentInfo`,
`data.streamQueue`, `data.bracket`, `data.player_list.slot`,
`data.score.ruleset`, `data.commentary`, `data.game.codename`. All asset paths
are `../../`-prefixed, relative to the layout folder.

Everything is a fixed canvas (usually 1920×1080), `overflow: hidden`, and
`opacity: 0` until `globals.js` fades it in.

---

## 2. Decisions

| Area | Decision |
| --- | --- |
| Shell | **Electron.** Bundles its own Chromium so previews match OBS (a CEF/Chromium browser source) on every OS, and keeps the codebase all-JavaScript. Costs ~150MB of installer. |
| Renderer | React + TypeScript + Vite, Zustand for editor state. |
| Project model | **Overlay pack**: many layouts sharing one token theme, with per-layout and per-variant overrides. |
| Variants | **First-class.** Shared structure, CSS and JS; skins switched by body class, exactly as the repo does it. |
| Editing | **Canvas for position, panels for style.** |
| Layout geometry | **Stack / Free modes per container** — see §3. |
| Data-driven layouts | **Smart components**: fixed generation logic, user-controlled placement, styling, options and animation. |
| Animation | GSAP **preset picker with a timeline strip**, plus a raw-vars escape hatch. |
| Simplified CSS | **Plain-language panels with an Advanced toggle** revealing real property names and a per-element raw-CSS box. |
| Preview data | **Bundled mock scenarios *and* optional live socket.io** to a running TSH. |
| Output | Writes into the TSH `/layout/` folder, referencing shared `../include/` and `../main.css`; zip export for sharing. |
| Import | **Tiered** — full editing for Creator-authored layouts; variables, colour promotion and font swaps for hand-written ones (§4). |

---

## 3. Stack and Free — the central decision

A pure absolute-positioning canvas is the easy thing to build and the wrong
thing to ship. The repo's scoreboards are flexbox with `gap`,
`flex-direction: row-reverse` to mirror player 2, and rules like:

```css
.player.container > .flagcountry:has(.text_empty),
.player.container > .character_container:not(:has(:not(.text_empty))) {
  display: none;
}
```

That last part matters more than it looks. TSH routinely leaves fields blank —
a local bracket with hand-typed names has no flags, no sponsors, no pronouns.
Under flexbox those children are removed from the flow and the row closes up.
Under absolute positioning they leave a hole, and the overlay looks broken for
exactly the entrants most likely to be on stream at a local.

So every container has a **layout mode**:

- **Stack** emits flexbox with `gap`, plus the empty-collapse rules above.
  Dragging a child on the canvas **reorders** it among its siblings, because
  its position comes from the flow — offering x/y here would let users set
  coordinates the exported CSS then ignores.
- **Free** emits `position: absolute` with explicit `left`/`top`. Dragging
  moves the element. Right for decorative furniture and one-off designs.

`collapseEmpty` defaults **on** for stack containers. The scoreboard template
ships in Stack mode for precisely this reason.

---

## 4. The imported tier

Import keeps a layout's original HTML, CSS and JavaScript byte-for-byte and
limits the editor to **value substitutions** re-applied to that pristine source
on every export. Nothing attempts to reverse a stylesheet into the element
model.

### Why colour promotion, not just token editing

The obvious design — "import reads the layout's `:root` block, you edit those
variables" — turns out to be nearly worthless against the real corpus. Of the
41 layout folders in the official repo:

| Layouts with a `:root` block | 4 |
| --- | --- |
| Layouts with **no** CSS variables at all | 37 |

That includes every VGBootCamp skin, `scoreboard_simple`, and the whole
`versus_screen` family. Token-only editing would present an empty panel for
90% of imports.

So the editor also finds **hardcoded colour literals** and lets you point each
one at a pack token. `#38ffb7` becomes `var(--p1-score-bg-color)` everywhere it
appears, and the layout starts following your theme. That is the operation
someone actually wants when they import a scoreboard they like.

Colours are grouped by canonical form, so `#FFF`, `#fff` and `#ffffff` are one
entry. Greys and low-alpha values — shadows, hairlines, scrims — are flagged
`likelyIncidental` and collapsed behind a disclosure, because they dominate
these stylesheets by count and drown out the three or four colours that carry
brand identity.

### How edits are applied

`analyzeCss()` returns source **spans** for every token declaration, colour
literal and `font-family` value. Spans are re-derived from the pristine source
on every emit — never stored — so they cannot go stale. All edits are collected
and applied in one right-to-left pass; overlapping edits throw rather than
silently producing corrupt CSS.

Colours inside `:root` blocks and inside comments are excluded from the colour
list: the first are already tokens, and the second aren't real declarations.

### Tokens must be materialised, not linked

An imported layout's HTML is preserved as authored, so it never links the
pack's `theme.css`. A promoted colour pointing at `var(--my-brand)` would
therefore resolve to nothing.

Rather than injecting a `<link>` — which would break the round-trip guarantee
on a file we don't own — the emitter writes every token a substitution
references into the layout's *own* `:root` block, resolved from the pack theme.
A token the stylesheet already declares is left alone, and one the theme can't
resolve is skipped rather than emitted as an empty declaration.

### Verification

Every one of the 41 real layout folders was imported and re-emitted with no
edits: **41 byte-identical, 0 drifted, 0 crashed.** That round-trip is the
guarantee the tier rests on, and `import.test.ts` asserts it on a fixture
carrying the shapes that make it hard — shorthand hex, 8-digit hex with alpha,
spaced `rgba()`, `@font-face`, and a colour inside a comment.

Variants come from the HTML files, with body classes read from source, so
`scoreboard/` imports as 19 variants and `character_line/` as 11.

---

## 5. The bracket component

The first data-driven component with real generation logic, and the one that
set the shape for the rest.

### Slot ids carry meaning

TSH encodes bracket structure in the entrant ids, not in separate flags:

| `playerId[n]` | Meaning | Handling |
| --- | --- | --- |
| a real id | An entrant | Looked up in `bracket.players.slot` |
| `-1` | Empty slot | The set is a bye and is **not drawn at all** |
| `-2` | Undecided | Drawn as a dimmed *TBD* row |

Getting this wrong is what makes a bracket overlay look broken: render the
byes and a 6-entrant top 8 sprouts phantom matches.

### The grand final reset

Rounds are signed — positive for winners, negative for losers. When
`progressionsOut` is 0 the highest winners round is the grand final *reset*,
which only happens if the losers-side entrant wins the grand final.

Showing it unconditionally invents a set that may never be played. Hiding it
unconditionally drops the set currently on stream. So it is drawn only once
the grand final is complete and `score[1] > score[0]`.

### Connectors have to be measured

A connector's path cannot be computed from the data. Where a set box lands
depends on how the browser distributed it down its column, so the component
mounts its markup, waits a frame, measures with `getBoundingClientRect()`, and
only then generates the SVG elbows. A `ResizeObserver` redraws them when the
host changes size.

This is why the runtime's dispatcher accepts `{ html, afterMount }` as well as
a plain HTML string — components that measure themselves need a hook after the
browser has laid them out.

### Two layout bugs worth recording

Both were caught by rendering the component in a real browser, and neither
would have shown up in a string-comparison test:

1. **The round label was a flex child of its column.** With
   `justify-content: space-around` the browser distributed the *label* along
   with the sets, pushing every set off the position its connector expected.
   Sets now live in an inner `.bracket_sets` container and the label is a
   fixed header outside it.
2. **Set boxes filled their whole column.** Rounds share the width evenly, so
   a short bracket stretched each box across hundreds of pixels and stranded
   the score at the far end of an empty bar. Boxes are now capped by
   `--bracket-set-width` and hug the left of their column, leaving the
   remainder as the gutter connectors elbow through.

### Component default styles

Components generate their own DOM, so they now ship `components.css` beside
`components.js` — emitted once per pack and linked *before* the layout's own
stylesheet so a layout always overrides it. Every rule is a single class for
the same reason. Before this, generated markup had no styling at all and every
user would have rebuilt the same baseline by hand.

---

## 6. Architecture

```
electron/
  main/      privileged work: filesystem, TSH discovery, socket.io, zip
  preload/   contextBridge exposing exactly CreatorApi, nothing more
src/shared/
  model/     the pack schema — tokens, style, nodes, bindings, animation,
             components, factory
  emit/      model → HTML/CSS/JS/settings.json, plus the component runtime
  fixtures/  mock program_state scenarios
  ipc.ts     the typed renderer↔main contract
src/renderer/
  store/     Zustand store; every mutation snapshots for undo
  canvas/    binding resolution and model→inline-style conversion
  components/ toolbar, layer tree, canvas, inspector, theme, animation, code
```

Two properties are load-bearing:

**The renderer is sandboxed.** No Node integration, no `ipcRenderer` exposure.
It holds the model and generates file *contents*; the main process decides what
touches disk.

**The canvas reuses the emitter.** `src/renderer/canvas/style.ts` calls the
emitter's own `styleDeclarations()` rather than computing its own styles. The
canvas and the exported CSS therefore cannot drift — if the canvas shows it,
the export produces it.

### Output on disk

```
/layout/
  _packs/<pack>/theme.css       shared tokens for the whole pack
  _packs/<pack>/components.js   smart-component runtime
  <layout_folder>/index.html    one file per variant
  <layout_folder>/index.css
  <layout_folder>/index.js
  <layout_folder>/settings.json
```

`_packs/` leads with an underscore so it can never collide with an official
layout folder.

### Not overwriting people's work

Every generated file carries a `Generated by TSH Layout Creator` marker in its
banner. On export, an existing file without that marker is **skipped and
reported**, never overwritten, unless the user explicitly opts in. `settings.json`
can't carry a comment, so it is only overwritten when it parses as JSON
containing nothing but keys we would have written.

---

## 7. Token layering

Three layers, later winning:

```
main.css :root  →  pack theme.css  →  layout :root  →  body.<variant>
```

The theme panel shows which layer a value is currently coming from, and typing
into a lower layer creates an override there. Without that visibility, "why is
this one overlay a different red" becomes unanswerable, and per-layout
overrides stop being safe to offer.

Emitted CSS only ever contains *differences* — a variant that changes nothing
emits nothing.

---

## 8. Status

### Working

- Pack / layout / variant model with undo, redo and save/load
- Canvas with selection, drag-move in Free, drag-reorder in Stack
- Inspector with plain-language labels, Advanced toggle, per-element raw CSS
- Three-layer theme editor with inheritance display
- GSAP animation: presets, parameters, stagger, draggable timeline strip
- Emitters for HTML, CSS, JS, `settings.json`, `theme.css`
- Live emitted-code viewer
- Export: write into TSH `/layout/` with overwrite protection, or zip
- TSH auto-detection and socket.io live data with delta handling
- Six mock scenarios including overlong names, Japanese names and missing data
- Layout import: browse the TSH install, import with variants and canvas
  detected, retheme via variables, colour promotion and font swaps
- Bracket component: signed rounds, byes, TBD slots, grand-final reset,
  measured SVG connectors, auto-fit row heights
- Component default styles shipped as `components.css`
- 74 tests — emitter (parse-checks on all generated JavaScript), import
  (byte-identical round-trip) and bracket (the runtime evaluated and driven
  against TSH-shaped data)

### Components

| Implemented | Placeholder |
| --- | --- |
| `bracket`, `set_list`, `stream_queue`, `top_n_list`, `commentators`, `player_list`, `character_gallery` | `top_8`, `stage_strike`, `map` |

The three placeholders render a visible "not implemented yet" box and log a
console warning, and exporting a layout that uses one produces an export
warning. They need genuine generation logic — ruleset-driven strike state,
Leaflet for the map — rather than another options form.

### Not built yet

- **Live preview iframe.** Mock-data preview runs on the canvas today. Rendering
  the real emitted layout against a running TSH needs a preview window pointed
  at the install — the plumbing (`connectLive`, delta application) is done.
- **Multi-select editing.** The inspector handles one element at a time.
- **Font import.** The model carries `FontRef` and the theme emitter writes
  `@font-face`, but nothing copies font files into the pack yet.
- **Preview screenshots.** Wanted for the Creator's own layout thumbnails.
- **Component options in variant overrides.** Variants override styles and
  tokens, not component options.

### Known approximations

- The canvas cannot run Kuroshiro, so Japanese names show untranscribed. They
  are flagged on hover; the live preview is the real check.
- Character art and TSH-relative images need an install path to resolve. Without
  one the canvas shows a labelled placeholder.
- Stack reordering uses a fixed 80px travel-per-slot heuristic rather than
  measured child boxes.

---

## 9. Roadmap

1. **Live preview window** against a running TSH.
2. **Remaining components** — top 8, stage striking, map. Top 8 can reuse most
   of the bracket's measurement and slot handling.
4. **Import: animation parameters.** Durations and eases could be substituted
   the same way colours are, by span. Deferred because GSAP call sites vary
   more than CSS values do, and a bad substitution breaks a script rather than
   just a colour.
5. **Upstream contribution output** — README and `*_preview.png` generation, so
   a pack can be submitted to the official repo without hand work.
