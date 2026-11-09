import { h, icon, field, pageHeader, toast } from "./common.js";
import { StudySession, MODES } from "../core/session.js";
import { RESULT } from "../core/srs.js";

// A running session survives switching tabs.
let session = null, lastSummary = null;
export const hasSession = () => Boolean(session && !session.finished);

export function startSession(ctx, overrides = {}) {
  const s = ctx.lib.settings;
  const cfg = { deckId: s.default_deck_id, mode: s.study_mode, limit: s.cards_per_session, newLimit: s.new_words_per_session, order: s.card_order, ...overrides };
  session = new StudySession(ctx.lib, cfg);
  lastSummary = null;
  return session.total;
}

export function renderStudy(ctx, root) {
  if (session && !session.finished) return renderSession(ctx, root);
  if (session && session.finished && session.answered) {
    lastSummary = { known: session.knownCount, practice: session.practiceCount };
    session = null;
  } else session = null;
  renderIdle(ctx, root);
}

function renderIdle(ctx, root) {
  const { lib } = ctx, s = lib.settings;
  root.append(pageHeader("Study", "Flashcards, with missed words first"));
  if (lastSummary) {
    const t = lastSummary.known + lastSummary.practice;
    root.append(h("section", { class: "card note" }, h("h3", {}, "Session complete 🎉"),
      h("p", {}, `You answered ${t} card${t === 1 ? "" : "s"}: ${lastSummary.known} you knew, ${lastSummary.practice} need more practice.`),
      h("p", { class: "muted" }, "Words you struggled with will come back first in your next session.")));
  }
  if (!lib.total) {
    root.append(h("section", { class: "card" }, h("p", {}, "There are no words yet. Import your library or add words first."),
      h("button", { class: "btn primary", onclick: () => ctx.go("library") }, "Go to library")));
    return;
  }
  const deck = h("select", {}, h("option", { value: "" }, "All words"), lib.decks.map((d) => h("option", { value: d.id }, d.name)));
  deck.value = s.default_deck_id ?? "";
  const mode = h("select", {}, Object.entries(MODES).map(([k, v]) => h("option", { value: k }, v)));
  mode.value = s.study_mode;
  const count = h("input", { type: "number", inputMode: "numeric", min: 1, max: 500, value: s.cards_per_session });
  const order = h("select", {}, h("option", { value: "random" }, "Random"), h("option", { value: "sequential" }, "Sequential"));
  order.value = s.card_order;
  root.append(h("section", { class: "card form" },
    field("Deck", deck), field("What to study", mode), field("Cards in this session", count), field("Order", order),
    h("button", { class: "btn primary big", onclick: () => {
      const n = startSession(ctx, { deckId: deck.value === "" ? null : Number(deck.value), mode: mode.value,
        limit: Math.max(1, Math.min(500, Number(count.value) || 20)), order: order.value });
      if (!n) { session = null; toast("No cards match. Try “All words” or a different deck."); return; }
      ctx.render();
    } }, icon("cards"), "Start session")));
}

function renderSession(ctx, root) {
  const { lib } = ctx, s = session;
  const word = s.current;
  if (!word) { s._skipMissing(); return ctx.render(); }
  const speak = (text) => ctx.speech.speak(text, { voice: lib.settings.tts_voice, rate: lib.settings.tts_speed }).then((ok) => {
    if (!ok) toast(ctx.speech.status().message, 6000);
  });

  const front = h("div", { class: "face front" }, h("div", { class: "face-label" }, "Swedish word"), h("div", { class: "big-word", style: { fontSize: `${2.6 * lib.settings.card_font_scale}rem` } }, word.swedish),
    h("div", { class: "tap-hint muted" }, "Tap the card to reveal"));
  const back = h("div", { class: "face back" },
    h("div", { class: "sec" }, h("div", { class: "face-label" }, "Swedish word"),
      h("div", { class: "row between" }, h("div", { class: "back-word" }, word.swedish),
        h("button", { class: "icon-btn round", "aria-label": "Play pronunciation", onclick: (e) => { e.stopPropagation(); speak(word.swedish); } }, icon("speaker")))),
    h("div", { class: "sec" }, h("div", { class: "face-label" }, "Pronunciation"),
      word.pronunciation ? h("div", { class: "ipa" }, word.pronunciation)
        : h("div", { class: "muted small" }, "IPA transcription not available"),
      ctx.speech.available() ? null : h("div", { class: "warn small" }, "Audio unavailable: no Swedish voice (see Settings).")),
    h("div", { class: "sec" }, h("div", { class: "face-label" }, "English meaning"), h("div", { class: "meaning" }, word.english)),
    word.example_sv ? h("div", { class: "sec" }, h("div", { class: "face-label" }, "Example sentence"),
      h("div", { class: "row between" }, h("div", { class: "example" }, word.example_sv),
        h("button", { class: "icon-btn round small", "aria-label": "Play example sentence", onclick: (e) => { e.stopPropagation(); speak(word.example_sv); } }, icon("speaker")))) : null,
    word.example_en ? h("div", { class: "sec" }, h("div", { class: "face-label" }, "English translation"), h("div", { class: "translation" }, word.example_en)) : null);
  const inner = h("div", { class: `card-inner ${s.revealed ? "flipped" : ""}` }, front, back);
  const flipCard = h("div", { class: "flip", role: "button", tabIndex: 0, "aria-label": s.revealed ? "Card back. Tap to hide answer" : "Card front. Tap to show answer",
    onclick: () => toggle(), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } } }, inner);

  const toggle = () => {
    const revealed = s.toggle();
    inner.classList.toggle("flipped", revealed);
    flipCard.setAttribute("aria-label", revealed ? "Card back. Tap to hide answer" : "Card front. Tap to show answer");
    updateControls();
    if (revealed && lib.settings.auto_play_audio) speak(word.swedish);        // pronounce when the answer is shown
    else if (!revealed) ctx.speech.stop();
  };
  const grade = (result) => {
    if (!s.revealed) { toast("Show the answer first, then grade the card."); return; }
    ctx.speech.stop();
    try { s.answer(result); } catch (e) { toast(e.message); return; }
    ctx.render();
  };

  const revealBtn = h("button", { class: "btn primary big grow", onclick: toggle }, "Show answer");
  const gradeBar = h("div", { class: "grade-bar" },
    h("button", { class: "btn practice big", onclick: () => grade(RESULT.PRACTICE) }, icon("refresh"), "I Need More Practice"),
    h("button", { class: "btn know big", onclick: () => grade(RESULT.KNOW) }, icon("check"), "I Know This Word"));
  const updateControls = () => {
    revealBtn.textContent = s.revealed ? "Hide answer" : "Show answer";
    revealBtn.classList.toggle("primary", !s.revealed);
    gradeBar.classList.toggle("show", s.revealed);
    gradeBar.querySelectorAll("button").forEach((b) => { b.disabled = !s.revealed; });
  };

  const pct = (100 * (s.position - 1)) / Math.max(1, s.total);
  root.classList.add("study-root");
  root.append(
    h("div", { class: "study-top" },
      h("div", { class: "progress-text" }, `Card ${s.position} / ${s.total}`),
      h("button", { class: "btn small", onclick: () => { ctx.speech.stop(); session = null; lastSummary = s.answered ? { known: s.knownCount, practice: s.practiceCount } : null; ctx.render(); } }, "End")),
    h("div", { class: "pbar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": s.total, "aria-valuenow": s.position - 1 }, h("span", { style: { width: `${pct}%` } })),
    flipCard, gradeBar,
    h("div", { class: "nav-row" },
      h("button", { class: "icon-btn round", "aria-label": "Previous card", disabled: s.index === 0, onclick: () => { s.previous(); ctx.render(); } }, icon("left")),
      revealBtn,
      h("button", { class: "icon-btn round", "aria-label": "Next card", onclick: () => { s.next(); ctx.render(); } }, icon("right"))),
    h("div", { class: "util-row" },
      h("button", { class: "btn small", onclick: () => { s.shuffle(); ctx.render(); toast("Remaining cards shuffled."); } }, icon("shuffle", 16), "Shuffle"),
      h("button", { class: "btn small", onclick: () => { s.restart(); ctx.render(); toast("Session restarted."); } }, icon("refresh", 16), "Restart")));
  updateControls();

  // keyboard shortcuts (tablets / desktop browsers)
  ctx.keyHandler = (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "") || document.querySelector(".overlay")) return;
    if (e.key === " " && document.activeElement === flipCard) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { s.next(); ctx.render(); }
    else if (e.key === "ArrowLeft") { s.previous(); ctx.render(); }
    else if (e.key === "1" || e.key.toLowerCase() === "x") grade(RESULT.PRACTICE);
    else if (e.key === "2" || e.key.toLowerCase() === "k") grade(RESULT.KNOW);
    else if (e.key.toLowerCase() === "s") speak(word.swedish);
  };
}
