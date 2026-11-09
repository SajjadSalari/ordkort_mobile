import { h, field, pageHeader, toast, confirmDialog, messageDialog, importLibraryFlow, exportLibraryFlow, daysSince } from "./common.js";
import { FACTORY_DEFAULTS } from "../core/settings.js";
import { MODES } from "../core/session.js";
import { isNative } from "../platform.js";
import { manageDecks } from "./library.js";

export const APP_VERSION = "1.0.0";

export function renderSettings(ctx, root) {
  const { lib, speech } = ctx;
  const s = lib.settings;
  const set = (key, value) => { lib.applySettings({ [key]: value }); ctx.applyTheme(); };

  const select = (key, options, parse = (v) => v) => {
    const el = h("select", {}, options.map(([v, l]) => h("option", { value: v ?? "" }, l)));
    el.value = s[key] ?? "";
    el.addEventListener("change", () => set(key, parse(el.value)));
    return el;
  };
  const number = (key, min, max, step = 1) => {
    const el = h("input", { type: "number", inputMode: "decimal", min, max, step, value: s[key] });
    el.addEventListener("change", () => { set(key, Number(el.value)); el.value = lib.settings[key]; });
    return el;
  };
  const range = (key, min, max, step, fmt) => {
    const out = h("span", { class: "muted small range-out" }, fmt(s[key]));
    const el = h("input", { type: "range", min, max, step, value: s[key], "aria-label": key });
    el.addEventListener("input", () => { out.textContent = fmt(Number(el.value)); });
    el.addEventListener("change", () => set(key, Number(el.value)));
    return h("div", { class: "row" }, el, out);
  };
  const toggle = (key, label) => {
    const el = h("input", { type: "checkbox", checked: s[key] });
    el.addEventListener("change", () => set(key, el.checked));
    return h("label", { class: "check big-check" }, el, label);
  };

  const voiceStatus = h("p", { class: "small" });
  const drawVoice = () => {
    const st = speech.status();
    voiceStatus.textContent = st.message; voiceStatus.className = `small ${st.available ? "ok" : "warn"}`;
  };
  const voiceSel = h("select", {}, h("option", { value: "" }, "Automatic (first Swedish voice)"), speech.voices().map((v) => h("option", { value: v.id }, v.name)));
  voiceSel.value = speech.voices().some((v) => v.id === s.tts_voice) ? s.tts_voice : "";
  voiceSel.disabled = !speech.available();
  voiceSel.addEventListener("change", () => set("tts_voice", voiceSel.value));
  drawVoice();

  const section = (title, ...kids) => h("section", { class: "card form" }, h("h3", {}, title), kids);
  const decks = [[null, "All words"], ...lib.decks.map((d) => [d.id, d.name])];

  root.append(pageHeader("Settings", "Changes are saved automatically"),
    section("Appearance", field("Theme", select("theme", [["auto", "Follow the phone"], ["light", "Light"], ["dark", "Dark"]])),
      field("Flashcard text size", range("card_font_scale", 0.8, 1.6, 0.1, (v) => `${Math.round(v * 100)}%`))),
    section("Pronunciation", toggle("auto_play_audio", "Pronounce the word automatically when the answer is shown"),
      field("Swedish voice", voiceSel), field("Playback speed", range("tts_speed", 0.5, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`)),
      h("button", { class: "btn", disabled: !speech.available(), onclick: async () => { const ok = await speech.speak("Hej! Jag heter Ordkort. Vi ska öva svenska idag.", { voice: s.tts_voice, rate: lib.settings.tts_speed }); if (!ok) toast(speech.status().message, 6000); } }, "Test voice"),
      voiceStatus,
      isNative && !speech.available() ? h("button", { class: "btn", onclick: () => speech.openInstall() }, "Install Swedish voice (Android)") : null,
      h("button", { class: "btn small", onclick: async () => { await speech.init(); ctx.render(); } }, "Check voices again")),
    section("Study", field("Default deck", select("default_deck_id", decks, (v) => (v === "" ? null : Number(v)))),
      field("Default study mode", select("study_mode", Object.entries(MODES))),
      field("Cards per session", number("cards_per_session", 1, 500)), field("New words per smart session (max)", number("new_words_per_session", 0, 200)),
      field("Card order", select("card_order", [["random", "Random"], ["sequential", "Sequential"]]))),
    h("details", { class: "card form" }, h("summary", {}, h("b", {}, "Review behaviour (spaced repetition)")),
      h("p", { class: "muted small" }, "“I Know This Word” pushes the next review further away: first interval, then the second, then previous × ease. “I Need More Practice” makes the word due again at once and repeats it later in the session."),
      field("First interval (days)", number("first_interval_days", 1, 30)), field("Second interval (days)", number("second_interval_days", 1, 60)),
      field("Known after N correct in a row", number("known_after_streak", 1, 10)), field("Maximum interval (days)", number("max_interval_days", 7, 3650)),
      field("Starting ease", number("starting_ease", 1.3, 4, 0.1)), field("Minimum ease", number("min_ease", 1.1, 3, 0.1)), field("Maximum ease", number("max_ease", 1.5, 5, 0.1)),
      field("Ease bonus per correct answer", number("ease_bonus", 0, 0.5, 0.05)), field("Ease penalty for “needs practice”", number("ease_penalty", 0, 1, 0.05)),
      field("Repeat missed cards after N other cards", number("practice_requeue_gap", 1, 20)), field("Max repeats of a missed card per session", number("practice_max_requeues", 0, 5)),
      h("button", { class: "btn danger-text", onclick: async () => {
        if (await confirmDialog("Reset to factory settings", "All settings return to their original values. Your words and progress are not touched.", { ok: "Reset settings", danger: true })) {
          lib.applySettings({ ...FACTORY_DEFAULTS }); ctx.applyTheme(); ctx.render(); toast("Settings reset.");
        }
      } }, "Reset all settings to factory defaults")),
    section("Your data", h("p", { class: "muted small" }, `${lib.total} words · ${lib.decks.length} decks · ${lib.state.reviews.length} review records. Stored only on this device.`),
      h("p", { class: "small" }, lib.state.meta.last_export ? `Last export: ${lib.state.meta.last_export.replace("T", " ").slice(0, 16)}` : "You have not exported yet."),
      h("div", { class: "row wrap" },
        h("button", { class: "btn primary", onclick: () => exportLibraryFlow(ctx) }, "Export library"),
        h("button", { class: "btn", onclick: () => importLibraryFlow(ctx) }, "Import library file"),
        h("button", { class: "btn", onclick: () => manageDecks(ctx) }, "Manage decks")),
      h("p", { class: "muted small" }, "The exported .json file works with Ordkort on your computer too (Library → More → Import library file…). Export regularly: if you delete the app or clear browser data, the words stored on the phone are gone."),
      h("button", { class: "btn danger-text", onclick: async () => {
        if (!(await confirmDialog("Erase everything?", `This deletes all ${lib.total} words, decks, progress and history from this phone.\nExport first if you want to keep them.`, { ok: "Continue", danger: true }))) return;
        if (!(await confirmDialog("Really erase everything?", "This cannot be undone.", { ok: "Erase everything", danger: true }))) return;
        lib.reset(); await lib.flush(); ctx.applyTheme(); ctx.changed(); toast("All data erased.");
      } }, "Erase all data on this phone…")),
    section("About", h("p", { class: "small" }, `Ordkort ${APP_VERSION} · ${isNative ? "app" : "web version"} · storage: ${ctx.storageKind}`)));
}
