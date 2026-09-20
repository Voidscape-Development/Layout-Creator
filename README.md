# Layout Creator

A visual layout creator for [TournamentStreamHelper](https://github.com/joaorb64/TournamentStreamHelper)
overlays — build new layouts, restyle existing ones, and write them straight
into your TSH install.

> **Status: early.** The editor, emitters, import and export all work end to
> end. Three of the ten smart components still render placeholders. See
> [docs/DESIGN.md](docs/DESIGN.md#8-status) for exactly what is and isn't done.

## What it does

- **Design on a canvas** at true overlay size, with live mock tournament data.
- **Plain-language styling.** Panels say "Rounded corners" and "Drop shadow",
  not `border-radius` and `filter`. An Advanced toggle reveals the real CSS
  property names and a raw-CSS box per element when you want them.
- **One theme, many overlays.** A pack shares design tokens across every layout
  in it, with per-layout and per-variant overrides — change your accent colour
  once and the scoreboard, the queue and the standings all follow.
- **Variants**, the way the official layouts do it: one folder, one stylesheet,
  one script, several skins switched by a body class.
- **GSAP animation** from presets — rise in, slide in, stagger — with a
  timeline strip for ordering, and a raw-vars escape hatch.
- **Smart components** for the data-driven layouts: brackets, set lists,
  stream queues, standings, commentators, player lists, character galleries.
  The bracket draws a full double-elimination tree with measured SVG
  connectors, handles byes and undecided slots, and hides the grand final
  reset until it's actually forced.
- **Readable output.** Emitted HTML, CSS and JS follow the conventions of the
  official layouts and are meant to be hand-edited afterwards. You can watch
  them being generated in the Code tab as you work.
- **Import and retheme existing layouts** — see below.

## Stack and Free

Every container picks how it arranges its children, and the choice is the
difference between an overlay that survives a real bracket and one that doesn't:

- **Stack** lays children out in a row or column with even spacing. When TSH
  leaves a field blank — no flag, no sponsor, no pronouns — that element is
  removed from the flow and the row closes up. Drag a child to reorder it.
- **Free** puts children at fixed coordinates. Drag to move. Right for
  backdrops and one-off designs, but a blank field leaves a hole.

Anything holding live player data wants Stack.

## Importing an existing layout

**Import** in the Layouts panel lists everything in your TSH `/layout/` folder.
An imported layout keeps its original HTML, CSS and JavaScript exactly as
written — nothing here can safely turn a hand-written stylesheet back into
movable elements, so it doesn't pretend to.

What you get instead is retheming. Most TSH layouts define no CSS variables at
all (only 4 of the 41 in the official repo do), so the editor finds their
**hardcoded colours** and lets you point each one at a token in your pack.
Map `#38ffb7` to your accent and every rule using it follows your theme.
Fonts and any existing variables are editable the same way.

Everything you don't remap round-trips byte-for-byte. All 41 official layouts
were imported and re-exported unchanged as a check.

## Getting started

```bash
npm install
npm run dev
```

The app looks for your TournamentStreamHelper folder on launch. If it can't
find it, use **Locate it** in the banner — it needs the folder containing
`layout/include/globals.js`.

### Other commands

```bash
npm run build      # typecheck and bundle
npm test           # emitter tests
npm run dist       # package an installer for the current platform
```

## Exporting

**Write into TSH** puts each layout in its own `/layout/<folder>/` and the
shared theme in `/layout/_packs/<pack>/`, referencing TSH's own `main.css` and
`include/` like every official layout. Point an OBS browser source at
`/layout/<folder>/index.html` and you're live.

Existing files that this app didn't generate are **skipped, not overwritten**,
and listed for you afterwards. There's an opt-in if you really do want to
replace them.

**Save zip** exports the same file tree for sharing.

## Project layout

```
electron/main       filesystem, TSH discovery, live socket.io, zip
electron/preload    the only bridge into the renderer
src/shared/model    the pack schema
src/shared/emit     model → HTML/CSS/JS
src/shared/fixtures mock tournament data
src/renderer        the editor UI
docs/DESIGN.md      decisions, architecture and status
```

## Licence

MIT. See [LICENSE](LICENSE).

TournamentStreamHelper and its layouts are separate projects with their own
licences; this tool generates files for them but bundles none of their code.
