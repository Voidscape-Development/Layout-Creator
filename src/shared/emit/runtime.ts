/**
 * The smart-component runtime.
 *
 * Emitted once per pack as `components.js` and shared by every layout in that
 * pack. Components own their DOM generation; layouts only position, style and
 * animate the host element.
 *
 * Kept as a template string rather than a bundled asset so the emitted file is
 * readable, diffable and hand-editable once it lands in a TSH install — the
 * same property the rest of the emitted output has.
 */

export const COMPONENTS_RUNTIME = String.raw`/* ═══════════════════════════════════════════════════════════
   TSH Layout Creator — smart component runtime
   Generated file. Shared by every layout in this pack.

   Each component reads TournamentStreamHelper's program state and
   regenerates its host element's DOM when the underlying data changes.
   Layouts control position, styling and animation; the markup contract
   below is what your CSS hooks onto.
   ═══════════════════════════════════════════════════════════ */

window.TSHComponents = (function () {
  "use strict";

  // Last emitted HTML per host element, so we only touch the DOM when the
  // data actually changed. Rebuilding every tick would restart CSS
  // transitions and fight the GSAP timeline.
  const lastRender = new WeakMap();

  const isEmpty = (v) => v === undefined || v === null || String(v).length === 0;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** A field div carrying the .text wrapper globals.js expects. */
  function field(cls, value, { raw = false } = {}) {
    const empty = isEmpty(value);
    const inner = empty ? "" : raw ? String(value) : esc(value);
    return (
      '<div class="' + cls + '">' +
      '<div class="text' + (empty ? " text_empty" : "") + '">' + inner + "</div>" +
      "</div>"
    );
  }

  function wrap(cls, inner) {
    return '<div class="' + cls + '">' + (inner || "") + "</div>";
  }

  function assetImg(cls, path, { remote = false } = {}) {
    if (isEmpty(path)) return field(cls, "");
    const src = remote ? String(path) : "../../" + String(path);
    return '<div class="' + cls + '"><img src="' + esc(src) + '" /></div>';
  }

  /** Player display name, transcribed and sponsor-prefixed. */
  async function playerName(player) {
    if (!player) return "";
    const name = await Transcript(player.name || "");
    const sponsor = player.team
      ? '<span class="sponsor">' + esc(player.team) + "</span> "
      : "";
    return sponsor + name;
  }

  /** All players on a team, joined the way the official layouts do. */
  async function teamName(team) {
    if (!team) return "";
    if (team.teamName) return esc(team.teamName);
    const players = Object.values(team.player || {}).filter((p) => p && p.name);
    const names = [];
    for (const p of players) names.push(await Transcript(p.name));
    return names.join(" / ");
  }

  function sb() {
    return window.scoreboardNumber;
  }

  /* ── Components ─────────────────────────────────────────── */

  const renderers = {};

  /**
   * Set list — recent sets, a player's last sets, or tournament history.
   * Markup: .set_row > .set_round, .set_side.p1|.p2 (.winner|.loser) > .set_name, .set_score
   */
  renderers.set_list = async function (options, event) {
    const data = event.data;
    const source = options.source || "recent";
    const max = Number(options.maxRows) || 8;
    const score = _.get(data, ["score", sb()], {});

    let sets = [];
    if (source === "recent") {
      sets = Object.values(score.recent_sets || {});
    } else if (source === "last") {
      const player = options.scope && options.scope.player ? options.scope.player : 1;
      sets = Object.values(_.get(score, ["last_sets", player], {}));
    } else {
      sets = Object.values(score.history_sets || {});
    }

    const rows = [];
    for (const set of sets.slice(0, max)) {
      if (!set) continue;
      // TSH spells this field "oponent_score".
      const mine = Number(set.player_score || 0);
      const theirs = Number(set.oponent_score || 0);
      const won = mine > theirs;

      const parts = [];
      if (options.showRound !== false) {
        parts.push(field("set_round", set.match || set.phase || ""));
      }
      parts.push(
        wrap(
          "set_side p1 " + (won ? "winner" : "loser"),
          (options.showCharacters !== false
            ? assetImg("set_character", set.player_character)
            : "") +
            field("set_name", await playerName(set.player || {}), { raw: true }) +
            field("set_score", mine)
        )
      );
      parts.push(
        wrap(
          "set_side p2 " + (won ? "loser" : "winner"),
          (options.showCharacters !== false
            ? assetImg("set_character", set.oponent_character)
            : "") +
            field("set_name", await playerName(set.oponent || {}), { raw: true }) +
            field("set_score", theirs)
        )
      );
      rows.push(wrap("set_row", parts.join("")));
    }
    return rows.join("");
  };

  /**
   * Stream queue — upcoming matches.
   * Markup: .queue_row > .queue_station, .queue_round, .queue_side > .queue_name
   */
  renderers.stream_queue = async function (options, event) {
    const data = event.data;
    const mode = options.mode || "queue";
    const max = mode === "next" ? 1 : Number(options.maxRows) || 8;
    const queues = data.streamQueue || {};

    // "queue" and "next" read the first stream; the other modes flatten all.
    let entries = [];
    if (mode === "stations" || mode === "multistream") {
      for (const streamName of Object.keys(queues)) {
        for (const set of Object.values(queues[streamName] || {})) {
          entries.push({ set: set, stream: streamName });
        }
      }
    } else {
      const first = Object.keys(queues)[0];
      for (const set of Object.values(queues[first] || {})) {
        entries.push({ set: set, stream: first });
      }
    }

    const rows = [];
    for (const entry of entries.slice(0, max)) {
      const set = entry.set;
      if (!set) continue;
      const parts = [];
      if (mode === "stations") parts.push(field("queue_station", set.station || ""));
      if (mode === "multistream") parts.push(field("queue_stream", entry.stream));
      if (options.showRound !== false) {
        parts.push(field("queue_round", set.match || set.phase || ""));
      }
      for (const key of ["team1", "team2"]) {
        const team = set[key];
        parts.push(
          wrap(
            "queue_side " + (key === "team1" ? "p1" : "p2"),
            field("queue_name", await teamName(team), { raw: true })
          )
        );
      }
      rows.push(wrap("queue_row", parts.join("")));
    }
    return rows.join("");
  };

  /**
   * Standings.
   * Markup: .standing_row > .standing_place, .standing_name, .standing_flag
   */
  renderers.top_n_list = async function (options, event) {
    const data = event.data;
    const count = Number(options.count) || 8;
    const slots = _.get(data, "player_list.slot", {});
    const rows = [];
    let place = 1;

    for (const key of Object.keys(slots)) {
      if (place > count) break;
      const slot = slots[key];
      const players = Object.values((slot && slot.player) || {});
      for (const player of players) {
        if (!player) continue;
        const parts = [
          field("standing_place", place),
          field("standing_name", await playerName(player), { raw: true }),
        ];
        if (options.showFlags !== false) {
          parts.push(assetImg("standing_flag", _.get(player, "country.asset")));
        }
        rows.push(wrap("standing_row", parts.join("")));
      }
      place += 1;
    }
    return rows.join("");
  };

  /**
   * Commentators.
   * Markup: .commentator > .commentator_name, .commentator_pronoun,
   *         .commentator_real_name, .commentator_twitter
   */
  renderers.commentators = async function (options, event) {
    const data = event.data;
    const max = Number(options.maxRows) || 4;
    const people = Object.values(data.commentary || {}).slice(0, max);
    const rows = [];

    for (const person of people) {
      if (!person || !person.name) continue;
      const parts = [
        field("commentator_name", await Transcript(person.name), { raw: true }),
        field("commentator_pronoun", person.pronoun || ""),
      ];
      if (options.showRealName) {
        parts.push(field("commentator_real_name", person.real_name || ""));
      }
      if (options.showTwitter !== false) {
        parts.push(field("commentator_twitter", person.twitter || ""));
      }
      rows.push(wrap("commentator", parts.join("")));
    }
    return rows.join("");
  };

  /**
   * Player list — every entrant in the phase.
   * Markup: .player_cell > .player_seed, .player_name, .player_flag
   */
  renderers.player_list = async function (options, event) {
    const data = event.data;
    const slots = _.get(data, "player_list.slot", {});
    const cells = [];

    for (const key of Object.keys(slots)) {
      const slot = slots[key];
      for (const player of Object.values((slot && slot.player) || {})) {
        if (!player) continue;
        const parts = [];
        if (options.showSeed !== false) {
          parts.push(field("player_seed", player.seed || ""));
        }
        parts.push(
          field("player_name", await playerName(player), { raw: true }),
          assetImg("player_flag", _.get(player, "country.asset"))
        );
        cells.push(wrap("player_cell", parts.join("")));
      }
    }
    return cells.join("");
  };

  /**
   * Character gallery — every character picked this set.
   * Markup: .gallery_character (filled by CharacterDisplay on the next tick)
   */
  renderers.character_gallery = async function (options, event) {
    const scope = options.scope || {};
    const team = scope.team || 1;
    const max = Number(options.maxCharacters) || 8;
    const source =
      options.scope === "player" && scope.player
        ? "score." + sb() + ".team." + team + ".player." + scope.player
        : "score." + sb() + ".team." + team;

    const cells = [];
    for (let i = 0; i < max; i += 1) {
      cells.push(
        '<div class="gallery_character" ' +
          'data-source="' + esc(source) + '" ' +
          'data-slice_character="[' + i + "," + (i + 1) + ']"></div>'
      );
    }
    return cells.join("");
  };

  /* ── Bracket ─────────────────────────────────────────────

     Reads TSH's phase-group bracket and lays each round out as a column,
     then draws SVG connectors between a set and the set its winner
     advances to.

     Slot ids carry meaning:
       -1  an empty slot — the set is a bye and is not drawn at all
       -2  a real slot whose player isn't decided yet, shown as TBD

     Connectors cannot be computed from the data alone: where a set box
     lands depends on how the browser distributed it down its column. So
     the markup is mounted first, positions are measured, and the paths
     are generated from those measurements. A ResizeObserver redraws them
     if the host changes size.

     Markup: .bracket_side > .bracket_round > .bracket_set
               > .bracket_slot > .bracket_name, .bracket_score
             .bracket_lines (the SVG overlay)
     ─────────────────────────────────────────────────────── */

  const SLOT_EMPTY = -1;
  const SLOT_TBD = -2;

  /** Sets with an empty slot are byes and never drawn. */
  function isBye(set) {
    return (
      !set ||
      !set.playerId ||
      set.playerId[0] === SLOT_EMPTY ||
      set.playerId[1] === SLOT_EMPTY
    );
  }

  /**
   * Grand final reset only exists if the losers-side player won the grand
   * final. Showing it before that happens invents a set that may never be
   * played; hiding it after would drop the set currently on stream.
   */
  function gfResetIsLive(rounds, progressionsOut) {
    if (Number(progressionsOut) !== 0) return true;
    const keys = Object.keys(rounds).map(Number).filter((k) => k > 0);
    if (!keys.length) return true;
    const resetRound = Math.max.apply(null, keys);
    const gf = _.get(rounds, [String(resetRound - 1), "sets", "0"]);
    if (!gf || !gf.completed) return false;
    // playerId[1] is the losers-side entrant in the grand final.
    return Number(gf.score[1]) > Number(gf.score[0]);
  }

  function gfResetRound(rounds, progressionsOut) {
    if (Number(progressionsOut) !== 0) return null;
    const keys = Object.keys(rounds).map(Number).filter((k) => k > 0);
    return keys.length ? Math.max.apply(null, keys) : null;
  }

  /** One entrant row. The id may be real, TBD, or missing entirely. */
  async function bracketSlot(pid, team, score, isWinner, showFlags) {
    const classes = ["bracket_slot"];
    if (isWinner) classes.push("winner");
    else if (isWinner === false) classes.push("loser");
    if (pid === SLOT_TBD || !team) classes.push("tbd");

    let label = "";
    if (team) label = await teamName(team);
    else if (pid === SLOT_TBD) label = "TBD";

    const parts = [field("bracket_name", label, { raw: true })];
    if (showFlags && team) {
      const player = Object.values(team.player || {})[0];
      parts.push(assetImg("bracket_flag", _.get(player, "country.asset")));
    }
    parts.push(field("bracket_score", score === undefined ? "" : score));

    return '<div class="' + classes.join(" ") + '">' + parts.join("") + "</div>";
  }

  renderers.bracket = async function (options, event) {
    const data = event.data;
    const rounds = _.get(data, "bracket.bracket.rounds", {});
    const players = _.get(data, "bracket.players.slot", {});
    const progressionsOut = _.get(data, "bracket.bracket.progressionsOut", 0);

    if (!Object.keys(rounds).length) {
      return { html: "", afterMount: null };
    }

    const side = options.side || "both";
    const showFlags = options.showFlags !== false;
    const maxRounds = Number(options.maxRounds) || 0;
    const hideReset = !gfResetIsLive(rounds, progressionsOut);
    const resetRound = gfResetRound(rounds, progressionsOut);

    // Winners rounds are positive, losers negative. Each side runs in its
    // own ascending order, so losers sort by absolute value.
    function roundsFor(sign) {
      return Object.keys(rounds)
        .map(Number)
        .filter((k) => (sign > 0 ? k > 0 : k < 0))
        .filter((k) => !(hideReset && resetRound !== null && k === resetRound))
        .sort((a, b) => Math.abs(a) - Math.abs(b));
    }

    function trimToLast(keys) {
      if (!maxRounds || keys.length <= maxRounds) return keys;
      // Keep the *final* rounds — those are the ones worth screen space.
      return keys.slice(keys.length - maxRounds);
    }

    // Track which sets actually made it into the DOM, so connectors are only
    // drawn between boxes that exist.
    const rendered = {};
    let biggestColumn = 1;

    async function buildSide(sign, sideClass) {
      let keys = trimToLast(roundsFor(sign));
      if (!keys.length) return "";

      let html = "";
      for (const roundKey of keys) {
        const round = rounds[String(roundKey)];
        if (!round) continue;

        const sets = Object.entries(round.sets || {}).filter(
          ([, set]) => !isBye(set)
        );
        if (!sets.length) continue;
        biggestColumn = Math.max(biggestColumn, sets.length);

        let column =
          '<div class="bracket_round" data-round="' + roundKey + '">' +
          field("bracket_round_name", round.name || "") +
          '<div class="bracket_sets">';

        for (const [setIndex, set] of sets) {
          rendered[roundKey + ":" + setIndex] = true;

          const scores = set.score || [];
          const complete = Boolean(set.completed);
          const win0 = complete ? Number(scores[0]) > Number(scores[1]) : null;

          const slots = [
            await bracketSlot(
              set.playerId[0],
              players[set.playerId[0]],
              scores[0],
              win0,
              showFlags
            ),
            await bracketSlot(
              set.playerId[1],
              players[set.playerId[1]],
              scores[1],
              win0 === null ? null : !win0,
              showFlags
            ),
          ];

          const setClasses = ["bracket_set"];
          if (complete) setClasses.push("completed");
          else if (
            set.playerId[0] !== SLOT_TBD &&
            set.playerId[1] !== SLOT_TBD
          ) {
            setClasses.push("live");
          }

          column +=
            '<div class="' + setClasses.join(" ") + '" ' +
            'data-round="' + roundKey + '" ' +
            'data-set="' + setIndex + '">' +
            slots.join("") +
            "</div>";
        }
        column += "</div></div>";
        html += column;
      }

      return '<div class="bracket_side ' + sideClass + '">' + html + "</div>";
    }

    const parts = [];
    if (side === "both" || side === "winners") {
      parts.push(await buildSide(1, "winners"));
    }
    if (side === "both" || side === "losers") {
      parts.push(await buildSide(-1, "losers"));
    }

    const html =
      '<svg class="bracket_lines" xmlns="http://www.w3.org/2000/svg"></svg>' +
      parts.filter(Boolean).join("");

    return {
      html: html,
      afterMount: function ($host) {
        fitBracket($host, biggestColumn);
        drawConnectors($host, rounds, rendered, options);
      },
    };
  };

  /**
   * Shrink the entrant rows until the tallest column fits the host. Brackets
   * vary from 4 sets to 64 between events, so a fixed row height either
   * overflows or wastes most of the box.
   */
  function fitBracket($host, biggestColumn) {
    const host = $host.get(0);
    if (!host) return;

    const available = host.clientHeight - 28; // room for the round labels
    if (available <= 0 || biggestColumn <= 0) return;

    const perSet = available / biggestColumn;
    // Two entrant rows per set, plus the gap between sets.
    const slot = Math.max(9, Math.min(34, Math.floor((perSet - 6) / 2)));

    host.style.setProperty("--bracket-slot-height", slot + "px");
    host.style.setProperty("--bracket-name-size", Math.max(8, slot - 12) + "px");
    host.style.setProperty("--bracket-score-size", Math.max(9, slot - 10) + "px");
  }

  /**
   * Draw one elbow per advancing set, from the right edge of a set to the
   * left edge of the set its winner reaches.
   */
  function drawConnectors($host, rounds, renderedSets, options) {
    const host = $host.get(0);
    const svg = host && host.querySelector(".bracket_lines");
    if (!host || !svg) return;

    const hostRect = host.getBoundingClientRect();
    svg.setAttribute("width", hostRect.width);
    svg.setAttribute("height", hostRect.height);
    svg.setAttribute("viewBox", "0 0 " + hostRect.width + " " + hostRect.height);

    const paths = [];

    for (const [roundKey, round] of Object.entries(rounds)) {
      for (const [setIndex, set] of Object.entries(round.sets || {})) {
        if (!set || !set.nextWin) continue;
        if (!renderedSets[roundKey + ":" + setIndex]) continue;

        const target = set.nextWin[0] + ":" + set.nextWin[1];
        if (!renderedSets[target]) continue;

        const from = host.querySelector(
          '.bracket_set[data-round="' + roundKey + '"][data-set="' + setIndex + '"]'
        );
        const to = host.querySelector(
          '.bracket_set[data-round="' + set.nextWin[0] + '"]' +
            '[data-set="' + set.nextWin[1] + '"]'
        );
        if (!from || !to) continue;

        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();

        // Coordinates are relative to the SVG overlay, which covers the host.
        const x1 = a.right - hostRect.left;
        const y1 = a.top + a.height / 2 - hostRect.top;
        const x2 = b.left - hostRect.left;
        const y2 = b.top + b.height / 2 - hostRect.top;
        const mid = x1 + (x2 - x1) / 2;

        paths.push(
          '<path class="bracket_line" ' +
            'data-round="' + esc(roundKey) + '" ' +
            'd="M' + x1 + " " + y1 + " H" + mid + " V" + y2 + " H" + x2 + '" />'
        );
      }
    }

    svg.innerHTML = paths.join("");

    if (options.animateLines !== false) {
      // Stroke each connector on, the way the official bracket layout does.
      $host.find(".bracket_line").each(function (_i, path) {
        let length = 0;
        try {
          length = path.getTotalLength();
        } catch (e) {
          return; // Not laid out yet; the resize pass will catch it.
        }
        if (!length) return;
        gsap.fromTo(
          path,
          { strokeDasharray: length, strokeDashoffset: length },
          { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }
        );
      });
    }
  }

  /* ── Not yet implemented ─────────────────────────────────
     These need their own generation logic (Leaflet for the map,
     ruleset-driven strike state). They render a visible placeholder so a
     layout using one is obviously unfinished rather than silently blank.
     ─────────────────────────────────────────────────────── */

  function placeholder(label) {
    return function () {
      console.warn(
        "[TSHComponents] '" + label + "' is not implemented yet in this runtime."
      );
      return (
        '<div class="component_placeholder">' +
        '<div class="text">' + esc(label) + " — not implemented yet</div>" +
        "</div>"
      );
    };
  }

  renderers.top_8 = placeholder("Top 8");
  renderers.stage_strike = placeholder("Stage striking");
  renderers.map = placeholder("Entrant map");

  /* ── Dispatch ───────────────────────────────────────────── */

  // Components that measure their own DOM re-run that pass when the host
  // changes size, since their output depends on where boxes actually landed.
  const remount = new WeakMap();
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(function (entries) {
          for (const entry of entries) {
            const again = remount.get(entry.target);
            if (again) again();
          }
        });

  async function render(kind, $host, options, event) {
    const host = $host && $host.get ? $host.get(0) : null;
    if (!host) return;

    const renderer = renderers[kind];
    if (!renderer) {
      console.warn("[TSHComponents] unknown component: " + kind);
      return;
    }

    let result;
    try {
      result = await renderer(options || {}, event);
    } catch (e) {
      console.error("[TSHComponents] " + kind + " failed to render", e);
      return;
    }

    // A renderer returns either plain HTML or { html, afterMount }, the
    // latter for components that must measure themselves once mounted.
    const html = typeof result === "string" ? result : (result && result.html) || "";
    const afterMount = typeof result === "string" ? null : result && result.afterMount;

    if (lastRender.get(host) === html) {
      // Same markup, but the data behind a measured component may have moved
      // it, so let it re-measure without tearing the DOM down.
      if (afterMount) afterMount($host);
      return;
    }
    lastRender.set(host, html);
    $host.html(html);

    if (afterMount) {
      // Measure on the next frame, once the browser has laid the markup out.
      window.requestAnimationFrame(function () {
        afterMount($host);
      });
      if (resizeObserver && !remount.has(host)) {
        remount.set(host, function () {
          afterMount($host);
        });
        resizeObserver.observe(host);
      } else if (resizeObserver) {
        remount.set(host, function () {
          afterMount($host);
        });
      }
    }

    // Character cells declare their settings as data attributes; hand them to
    // the shared CharacterDisplay pipeline once they exist in the DOM.
    $host.find(".gallery_character").each(function (_i, cell) {
      const $cell = $(cell);
      const source = $cell.attr("data-source");
      if (!source) return;
      let slice = undefined;
      try {
        slice = JSON.parse($cell.attr("data-slice_character") || "null") || undefined;
      } catch (e) {
        slice = undefined;
      }
      CharacterDisplay(
        $cell,
        { source: source, slice_character: slice, scale_fill_x: true, scale_fill_y: true },
        event
      );
    });
  }

  return { render: render, renderers: renderers };
})();
`;

/**
 * Default styling for generated component markup.
 *
 * Emitted once per pack as `components.css`. Components generate their own
 * DOM, so without this they'd render as unstyled divs and every user would
 * have to rebuild the same baseline by hand. Everything here is written in
 * terms of pack tokens, so a component picks up the theme automatically, and
 * every rule is low-specificity so a layout's own CSS overrides it freely.
 */
export const COMPONENTS_CSS = String.raw`/* ═══════════════════════════════════════════════════════════
   TSH Layout Creator — component defaults
   Generated file. Shared by every layout in this pack.

   These are baseline styles for markup the components generate.
   Override any of them from your layout's own index.css — every
   selector here is a single class, so yours will win.
   ═══════════════════════════════════════════════════════════ */

/* ── Shared ────────────────────────────────────────────── */

.component .text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.component_placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border: 1px dashed var(--p1-score-bg-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* ── Rows shared by the list-shaped components ─────────── */

.set_row,
.queue_row,
.standing_row,
.player_cell,
.commentator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  margin-bottom: 4px;
  border-radius: var(--border-radius-chip);
  background: var(--bg-color);
  color: var(--text-color);
}

.set_name,
.queue_name,
.standing_name,
.player_name,
.commentator_name {
  flex: 1 1 0;
  min-width: 0;
  white-space: nowrap;
}

.set_score,
.standing_place,
.player_seed {
  flex: 0 0 auto;
  min-width: 1.6em;
  text-align: center;
  font-weight: 700;
}

.set_side {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
}

/* A decided set dims its loser so the winner reads at a glance. */
.set_side.loser {
  opacity: 0.55;
}

.set_character,
.standing_flag,
.player_flag,
.queue_flag {
  flex: 0 0 auto;
  height: 1.2em;
}

.set_character img,
.standing_flag img,
.player_flag img,
.queue_flag img {
  height: 100%;
  width: auto;
  display: block;
}

/* Empty fields collapse rather than leaving a gap, matching Stack mode. */
.set_row > *:has(.text_empty),
.queue_row > *:has(.text_empty),
.standing_row > *:has(.text_empty),
.player_cell > *:has(.text_empty),
.commentator > *:has(.text_empty) {
  display: none;
}

/* ── Bracket ───────────────────────────────────────────── */

.component_bracket {
  /* Overwritten at runtime to fit the tallest column into the box. */
  --bracket-slot-height: 20px;
  --bracket-name-size: 12px;
  --bracket-score-size: 13px;
  --bracket-line: rgba(255, 255, 255, 0.35);
  /* Upper bound on a set box. Rounds share the width evenly, so without a
     cap a short bracket stretches each box across hundreds of pixels and
     strands the score at the far end of an empty bar. */
  --bracket-set-width: 300px;

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bracket_side {
  display: flex;
  flex-direction: row;
  flex: 1 1 0;
  min-height: 0;
}

.bracket_round {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
}

.bracket_round_name {
  /* Fixed header, deliberately outside .bracket_sets: as a sibling of the
     sets it would be spaced out along with them by space-around, pushing
     every set off the position its connector expects. */
  flex: 0 0 auto;
  text-align: left;
  font-size: var(--bracket-name-size);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.6;
  color: var(--text-color);
  margin-bottom: 4px;
}

.bracket_sets {
  display: flex;
  flex-direction: column;
  /* Boxes hug the left of their column; the remainder is the gutter the
     connectors elbow through. */
  align-items: flex-start;
  /* space-around centres each set within its share of the column, which is
     what lets two sets' connectors meet neatly at the next round's set. */
  justify-content: space-around;
  flex: 1 1 auto;
  min-height: 0;
}

.bracket_set {
  display: flex;
  flex-direction: column;
  border-radius: var(--border-radius-chip);
  overflow: hidden;
  background: var(--bg-color);
  color: var(--text-color);
  width: 100%;
  max-width: var(--bracket-set-width);
}

/* The set currently being played is the one viewers are looking for. */
.bracket_set.live {
  outline: 2px solid var(--p1-score-bg-color);
  outline-offset: 1px;
}

.bracket_slot {
  display: flex;
  align-items: center;
  gap: 5px;
  height: var(--bracket-slot-height);
  padding: 0 5px;
  font-size: var(--bracket-name-size);
}

.bracket_slot + .bracket_slot {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.bracket_slot.loser {
  opacity: 0.5;
}

.bracket_slot.tbd {
  opacity: 0.35;
  font-style: italic;
}

.bracket_name {
  flex: 1 1 0;
  min-width: 0;
  white-space: nowrap;
}

.bracket_flag {
  flex: 0 0 auto;
  height: calc(var(--bracket-slot-height) * 0.6);
}

.bracket_flag img {
  height: 100%;
  width: auto;
  display: block;
}

.bracket_score {
  flex: 0 0 auto;
  min-width: 1.3em;
  text-align: center;
  font-size: var(--bracket-score-size);
  font-weight: 700;
}

.bracket_slot.winner .bracket_score {
  color: var(--p1-score-bg-color);
}

/* The connector overlay sits above the columns but must never eat clicks
   or block the sets underneath it. */
.bracket_lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}

.bracket_line {
  fill: none;
  stroke: var(--bracket-line);
  stroke-width: 2;
  stroke-linejoin: round;
}
`;

/** Components whose runtime renders a placeholder rather than real output. */
export const UNIMPLEMENTED_COMPONENTS = new Set(['top_8', 'stage_strike', 'map']);
