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
has 29 layout folders holding 128 HTML files. One folder is a layout *family*:
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
| Import | **Tiered** — full editing for Creator-authored layouts, tokens/colours/fonts/animation only for hand-written ones. |

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

## 4. Architecture

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

## 5. Token layering

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

## 6. Status

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
- 24 emitter tests, including parse-checks on all generated JavaScript

### Components

| Implemented | Placeholder |
| --- | --- |
| `set_list`, `stream_queue`, `top_n_list`, `commentators`, `player_list`, `character_gallery` | `bracket`, `top_8`, `stage_strike`, `map` |

The four placeholders render a visible "not implemented yet" box and log a
console warning, and exporting a layout that uses one produces an export
warning. They need genuine generation logic — SVG connector routing for
brackets, ruleset-driven strike state, Leaflet for the map — rather than
another options form.

### Not built yet

- **Layout import.** The main-process side (`listLayouts`, `readLayout`) and
  the imported-tier emitter both exist and are tested; the UI to drive them,
  and the CSS parser that extracts a hand-written layout's tokens, do not.
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

## 7. Roadmap

1. **Import UI** — the piece with the clearest user demand, and the half that
   isn't built is the smaller half.
2. **Bracket component** — the most-requested data-driven layout.
3. **Live preview window** against a running TSH.
4. **Remaining components** — top 8, stage striking, map.
5. **Upstream contribution output** — README and `*_preview.png` generation, so
   a pack can be submitted to the official repo without hand work.
