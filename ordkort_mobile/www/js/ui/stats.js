import { h, pageHeader, tile } from "./common.js";
import { reviewsPerDay, knownOverTime, streakDays, totals, deckBreakdown, overview } from "../core/stats.js";
import { STATUS_LABELS } from "../core/srs.js";
import { stackedBars, lineChart, segmentBar } from "./charts.js";
import { todayIso } from "../core/textutil.js";

const range = { perDay: 14, known: 30 };

export function renderStats(ctx, root) {
  const { lib } = ctx, today = todayIso();
  root.append(pageHeader("Statistics", "Your learning performance"));
  if (!lib.total) { root.append(h("section", { class: "card" }, h("p", { class: "muted" }, "Statistics appear after you add words and start studying."))); return; }
  const o = overview(lib, today), t = totals(lib);
  const seg = (name, opts, key, redraw) => h("div", { class: "seg-switch", role: "group", "aria-label": name },
    opts.map((n) => h("button", { class: n === range[key] ? "on" : "", onclick: () => { range[key] = n; redraw(); } }, `${n} d`)));
  root.append(h("div", { class: "tiles" }, tile(t.reviews, "Total reviews"), tile(`${Math.round(t.accuracy_pct)}%`, "Accuracy"), tile(streakDays(lib, today), "Day streak")));
  root.append(h("section", { class: "card" }, h("h3", {}, "Status"), segmentBar(o.counts),
    h("div", { class: "legend" }, ["known", "learning", "practice", "new"].map((k) => h("span", {}, h("i", { class: `dot seg-${k}` }), `${STATUS_LABELS[k]} ${o.counts[k]}`)))));
  const a = h("section", { class: "card" }), b = h("section", { class: "card" });
  const drawA = () => a.replaceChildren(h("div", { class: "row between" }, h("h3", {}, "Reviews per day"), seg("Range", [14, 30, 90], "perDay", drawA)), stackedBars(reviewsPerDay(lib, range.perDay, today)));
  const drawB = () => b.replaceChildren(h("div", { class: "row between" }, h("h3", {}, "Known words over time"), seg("Range", [30, 90], "known", drawB)), lineChart(knownOverTime(lib, range.known, today)));
  drawA(); drawB();
  root.append(a, b);
  const decks = deckBreakdown(lib);
  if (decks.length) root.append(h("section", { class: "card" }, h("h3", {}, "Progress by deck"),
    decks.map((d) => h("div", { class: "deck-prog" }, h("div", { class: "row between" }, h("b", {}, d.name), h("span", { class: "muted small" }, `${d.counts.known}/${d.total} known`)), segmentBar(d.counts)))));
  const recent = lib.state.reviews.filter((r) => r.result === "know" || r.result === "practice").slice(-40).reverse();
  root.append(h("section", { class: "card" }, h("h3", {}, "Recent answers"),
    recent.length ? h("div", { class: "history" }, recent.map((r) => h("div", { class: "hist-row" },
      h("span", { class: "grow" }, r.swedish), h("span", { class: `chip chip-${r.result === "know" ? "known" : "practice"}` }, r.result === "know" ? "Knew" : "Practice"),
      h("span", { class: "muted small" }, r.reviewed_at.replace("T", " ").slice(0, 16)))))
      : h("p", { class: "muted" }, "No reviews yet.")));
}
