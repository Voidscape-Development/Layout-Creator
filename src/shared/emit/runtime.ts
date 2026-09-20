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

  /* ── Not yet implemented ─────────────────────────────────
     These need their own generation logic (SVG connector routing for
     brackets, Leaflet for the map, ruleset-driven strike state). They
     render a visible placeholder so a layout using one is obviously
     unfinished rather than silently blank.
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

  renderers.bracket = placeholder("Bracket");
  renderers.top_8 = placeholder("Top 8");
  renderers.stage_strike = placeholder("Stage striking");
  renderers.map = placeholder("Entrant map");

  /* ── Dispatch ───────────────────────────────────────────── */

  async function render(kind, $host, options, event) {
    const host = $host && $host.get ? $host.get(0) : null;
    if (!host) return;

    const renderer = renderers[kind];
    if (!renderer) {
      console.warn("[TSHComponents] unknown component: " + kind);
      return;
    }

    let html = "";
    try {
      html = await renderer(options || {}, event);
    } catch (e) {
      console.error("[TSHComponents] " + kind + " failed to render", e);
      return;
    }

    if (lastRender.get(host) === html) return;
    lastRender.set(host, html);
    $host.html(html);

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

/** Components whose runtime renders a placeholder rather than real output. */
export const UNIMPLEMENTED_COMPONENTS = new Set([
  'bracket',
  'top_8',
  'stage_strike',
  'map',
]);
