import { browserAdapter, openLibrary } from "./core/store.js";
import { isNative, speech } from "./platform.js";
import { h, icon, toast } from "./ui/dom.js";
import { renderHome } from "./ui/home.js";
import { renderStudy, startSession } from "./ui/study.js";
import { renderLibrary } from "./ui/library.js";
import { renderStats } from "./ui/stats.js";
import { renderSettings } from "./ui/settings.js";

const TABS = [["home", "Home", "home", renderHome], ["study", "Study", "cards", renderStudy], ["library", "Library", "book", renderLibrary],
              ["stats", "Stats", "chart", renderStats], ["settings", "Settings", "gear", renderSettings]];

function fatal(message) {
  document.getElementById("app").replaceChildren(h("div", { class: "fatal" }, h("h1", {}, "Ordkort cannot start"), h("p", { class: "pre" }, message),
    h("p", { class: "muted" }, "Your stored words have not been changed or deleted.")));
}

async function boot() {
  let lib, adapter;
  try {
    adapter = await browserAdapter();
    lib = await openLibrary(adapter, { onSaveError: (e) => toast(`Could not save your changes: ${e.message || e}`, 8000) });
  } catch (e) { return fatal(e.message || String(e)); }   // never start (and overwrite data) after a failed load
  navigator.storage?.persist?.().catch(() => {});

  const app = document.getElementById("app");
  const main = h("main", { id: "main", tabIndex: -1 });
  const nav = h("nav", { class: "tabbar", "aria-label": "Main" });
  app.replaceChildren(main, nav);

  const ctx = { lib, speech, storageKind: adapter.describe(), tab: "home", keyHandler: null };
  ctx.applyTheme = () => {
    const t = lib.settings.theme;
    if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f1722" : "#f4f6fb");
  };
  const keepScroll = new Set(["library", "settings", "stats", "home"]);
  ctx.render = () => {
    const prev = main.scrollTop;
    ctx.keyHandler = null;
    const [, , , render] = TABS.find((t) => t[0] === ctx.tab);
    main.replaceChildren(); main.className = `page page-${ctx.tab}`;
    render(ctx, main);
    main.scrollTop = keepScroll.has(ctx.tab) ? prev : 0;
    for (const b of nav.children) { const on = b.dataset.tab === ctx.tab; b.classList.toggle("on", on); on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"); }
  };
  ctx.go = (tab) => { speech.stop(); ctx.tab = tab; ctx.render(); };
  ctx.changed = () => ctx.render();
  ctx.startStudy = () => { if (startSession(ctx)) { ctx.go("study"); } else { toast("No cards are due. Pick a different mode in Study."); ctx.go("study"); } };

  for (const [key, label, ic] of TABS)
    nav.append(h("button", { class: "tab", dataset: { tab: key }, onclick: () => ctx.go(key) }, icon(ic, 24), h("span", {}, label)));
  document.addEventListener("keydown", (e) => ctx.keyHandler?.(e));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") lib.flush(); });
  addEventListener("pagehide", () => lib.flush());
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", ctx.applyTheme);

  ctx.applyTheme();
  ctx.render();
  speech.init().then(() => { if (ctx.tab === "settings" || ctx.tab === "study") ctx.render(); });

  if (!isNative && "serviceWorker" in navigator && /^https?:$/.test(location.protocol))
    navigator.serviceWorker.register("sw.js").catch(() => {});
  window.__ordkort = ctx;                                    // handy for debugging / automated tests
}
boot();
