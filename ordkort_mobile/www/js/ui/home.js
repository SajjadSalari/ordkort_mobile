import { h, icon, tile, pageHeader, importLibraryFlow, exportLibraryFlow, daysSince, sheet } from "./common.js";
import { overview, reviewsPerDay, streakDays } from "../core/stats.js";
import { STATUS_LABELS } from "../core/srs.js";
import { ring, stackedBars, segmentBar } from "./charts.js";
import { todayIso } from "../core/textutil.js";

export function renderHome(ctx, root) {
  const { lib } = ctx;
  root.append(pageHeader("Ordkort", "Swedish vocabulary trainer"));
  if (!lib.total) {
    root.append(h("section", { class: "card welcome" },
      h("h2", {}, "Welcome 👋"),
      h("p", {}, "Your library is empty. Bring your words over from Ordkort on your computer:"),
      h("ol", {}, h("li", {}, "In the desktop app open ", h("b", {}, "Library → More → Export entire library…"), " and save the .json file."),
        h("li", {}, "Get that file onto this phone (email it to yourself, cloud drive, USB or messaging app)."),
        h("li", {}, "Tap the button below and pick the file.")),
      h("div", { class: "row" },
        h("button", { class: "btn primary", onclick: () => importLibraryFlow(ctx) }, "Import library file"),
        h("button", { class: "btn", onclick: () => ctx.go("library") }, "Add words by hand"))));
    return;
  }
  const today = todayIso(), o = overview(lib, today);
  root.append(h("section", { class: "card hero" },
    h("div", {}, h("div", { class: "hero-num" }, o.due_today), h("div", { class: "muted" }, o.due_today === 1 ? "word to review today" : "words to review today")),
    h("button", { class: "btn primary big", onclick: () => ctx.startStudy() }, icon("cards"), "Study now")));
  root.append(h("div", { class: "tiles" },
    tile(o.total, "Total words"), tile(o.counts.new, "New", "t-new"), tile(o.counts.learning, "Learning", "t-learning"),
    tile(o.counts.known, "Known", "t-known"), tile(o.counts.practice, "Needs practice", "t-practice"), tile(o.reviewed_today, "Reviewed today")));
  root.append(h("section", { class: "card" },
    h("h3", {}, "Overall progress"),
    h("div", { class: "progress-row" }, ring(o.progress_pct, "Known words"),
      h("div", { class: "grow" }, segmentBar(o.counts),
        h("div", { class: "legend" }, ["known", "learning", "practice", "new"].map((k) => h("span", {}, h("i", { class: `dot seg-${k}` }), `${STATUS_LABELS[k]} ${o.counts[k]}`))),
        h("p", { class: "muted" }, `🔥 ${streakDays(lib, today)}-day streak`)))));
  root.append(h("section", { class: "card" }, h("h3", {}, "Last 14 days"), stackedBars(reviewsPerDay(lib, 14, today)),
    h("div", { class: "legend" }, h("span", {}, h("i", { class: "dot seg-known" }), "Knew it"), h("span", {}, h("i", { class: "dot seg-practice" }), "Needs practice"))));
  const since = daysSince(lib.state.meta.last_export);
  if (since > 14)
    root.append(h("section", { class: "card note" }, h("b", {}, "Back up your progress"),
      h("p", {}, since === Infinity ? "You have never exported your library from this phone." : `Your last export was ${since} days ago.`),
      h("button", { class: "btn", onclick: () => exportLibraryFlow(ctx) }, "Export library now")));
}
