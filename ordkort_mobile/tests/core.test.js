import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanText, dedupeKey, addDays } from "../www/js/core/textutil.js";
import { schedule, manualStatus, SRS_DEFAULTS, srsConfig } from "../www/js/core/srs.js";
import { Library, emptyState, LibraryError } from "../www/js/core/library.js";
import { StudySession, selectCards } from "../www/js/core/session.js";
import * as stats from "../www/js/core/stats.js";
import { openLibrary, memoryAdapter } from "../www/js/core/store.js";

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));
const newLib = () => new Library(emptyState());
const seeded = () => {
  const lib = newLib();
  const deck = lib.createDeck("Mat");
  ["äpple|apple", "bröd|bread", "mjölk|milk", "ost|cheese", "vatten|water", "kaffe|coffee"].forEach((p, i) => {
    const [sv, en] = p.split("|");
    lib.addWord({ swedish: sv, english: en, example_sv: `Jag gillar ${sv}.`, example_en: `I like ${en}.`, deck_ids: i < 3 ? [deck.id] : [] });
  });
  return lib;
};

// ------------------------------------------------------------------ parity with the desktop app
test("dedupe keys and text cleaning match the desktop implementation", () => {
  for (const k of fx("keys")) {
    assert.equal(cleanText(k.sv), k.clean_sv, JSON.stringify(k.sv));
    assert.equal(dedupeKey(k.sv, k.en), k.key, JSON.stringify([k.sv, k.en]));
  }
});

test("SRS scheduling matches the desktop implementation on 120 random answer sequences", () => {
  const { cases } = fx("srs_cases");
  let steps = 0;
  for (const c of cases) {
    const cfg = srsConfig(c.cfg);
    let w = { streak: 0, reps: 0, lapses: 0, interval_days: 0, ease: c.start_ease, status: "new", due_date: null };
    for (const s of c.steps) {
      const u = schedule(w, s.result, cfg, c.today);
      assert.deepEqual(u, s.expect);
      w = { ...u }; steps++;
    }
  }
  assert.ok(steps > 500);
});

test("manual status changes match the desktop implementation", () => {
  for (const m of fx("srs_cases").manual)
    assert.deepEqual(manualStatus(m.word, m.status, srsConfig({}), m.today), m.expect);
});

test("a library file exported by the desktop app imports completely", () => {
  const lib = newLib();
  const text = readFileSync(new URL("./fixtures/desktop_library.json", import.meta.url), "utf8");
  const s = lib.importJson(text);
  const raw = JSON.parse(text);
  assert.equal(s.words_added, raw.words.length);
  assert.equal(lib.total, 50);
  assert.equal(s.reviews_added, raw.words.reduce((n, w) => n + w.reviews.length, 0));
  assert.equal(lib.decks.length, raw.decks.length);
  assert.ok(lib.words.some((w) => w.swedish.match(/[åäö]/)));            // Swedish characters intact
  assert.equal(lib.words.find((w) => w.pronunciation === "[föʂ'tɔː]").pronunciation_source, "user");
  const known = lib.words.filter((w) => w.status === "known");
  assert.ok(known.length > 0 && known.every((w) => w.streak >= 3));
  // importing the same file again changes nothing (no duplicates)
  const again = lib.importJson(text);
  assert.equal(again.words_added, 0); assert.equal(again.words_existing, 50); assert.equal(lib.total, 50);
});

test("the phone's export has exactly the desktop format (round trip through JSON)", () => {
  const a = newLib();
  a.importJson(readFileSync(new URL("./fixtures/desktop_library.json", import.meta.url), "utf8"));
  const out = JSON.parse(JSON.stringify(a.exportJson()));
  const raw = JSON.parse(readFileSync(new URL("./fixtures/desktop_library.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(out).sort(), Object.keys(raw).sort());
  assert.deepEqual(Object.keys(out.words[0]).sort(), Object.keys(raw.words[0]).sort());
  assert.deepEqual(Object.keys(out.words[0].progress).sort(), Object.keys(raw.words[0].progress).sort());
  const norm = (d) => d.words.map((w) => ({ ...w, decks: [...w.decks].sort() })).sort((x, y) => (x.swedish + x.english).localeCompare(y.swedish + y.english));
  assert.deepEqual(norm(out), norm(raw));
  const b = newLib();
  b.importJson(JSON.stringify(out));
  assert.equal(b.total, a.total);
});

// ------------------------------------------------------------------ library
test("adding, duplicates, editing and deleting words", () => {
  const lib = seeded();
  assert.equal(lib.total, 6);
  assert.throws(() => lib.addWord({ swedish: "  Äpple. ", english: "APPLE" }), LibraryError);
  lib.addWord({ swedish: "resa", english: "trip" });
  lib.addWord({ swedish: "resa", english: "to travel" });          // different meaning is kept
  assert.equal(lib.total, 8);
  assert.throws(() => lib.addWord({ swedish: "", english: "x" }), LibraryError);
  const w = lib.words[0];
  lib.updateWord(w.id, { english: "apples" });
  assert.equal(lib.getWord(w.id).key.split("␟")[1], "apples");
  assert.throws(() => lib.updateWord(w.id, { swedish: "bröd", english: "bread" }), LibraryError);
  lib.review(w.id, "know");
  assert.equal(lib.deleteWords([w.id]), 1);
  assert.ok(lib.state.reviews.every((r) => r.word_id === null || lib.getWord(r.word_id)));   // history kept
  assert.equal(lib.state.reviews.length, 1);
});

test("search is case-insensitive, matches both languages, and ignores accents for plain queries", () => {
  const lib = seeded();
  assert.deepEqual(lib.search({ text: "APPLE" }).map((w) => w.swedish), ["äpple"]);
  assert.deepEqual(lib.search({ text: "apple" }).map((w) => w.swedish), ["äpple"]);
  assert.deepEqual(lib.search({ text: "mjolk" }).map((w) => w.swedish), ["mjölk"]);     // plain a/o finds ä/ö
  assert.deepEqual(lib.search({ text: "mjölk" }).map((w) => w.swedish), ["mjölk"]);
  assert.equal(lib.search({ text: "ö" }).length, 2);                                     // ö exact: bröd, mjölk
  assert.equal(lib.search({ text: "" }).length, 6);
});

test("Swedish alphabetical order puts å, ä, ö after z", () => {
  const lib = newLib();
  for (const s of ["ö", "z", "ä", "a", "å"]) lib.addWord({ swedish: s, english: `en-${s}` });
  assert.deepEqual(lib.search().map((w) => w.swedish), ["a", "z", "å", "ä", "ö"]);
});

test("decks: create, rename, delete never deletes words", () => {
  const lib = seeded();
  const d = lib.decks[0];
  assert.throws(() => lib.createDeck("mat"), LibraryError);
  lib.renameDeck(d.id, "Mat och dryck");
  assert.equal(lib.deckCounts()[0].count, 3);
  lib.applySettings({ default_deck_id: d.id });
  lib.deleteDeck(d.id);
  assert.equal(lib.total, 6);
  assert.equal(lib.settings.default_deck_id, null);
  assert.ok(lib.words.every((w) => w.deck_ids.length === 0));
});

test("invalid or hostile import files are rejected without changing anything", () => {
  const lib = seeded();
  const before = JSON.stringify(lib.state);
  for (const bad of ["not json", "{}", JSON.stringify({ format: "ordkort-library", version: 99, words: [] }),
                     JSON.stringify({ format: "ordkort-library", version: 1 })])
    assert.throws(() => lib.importJson(bad), LibraryError);
  assert.equal(JSON.stringify(lib.state), before);
  const s = lib.importJson(JSON.stringify({ format: "ordkort-library", version: 1, words: [
    { swedish: "", english: "x" }, "junk", { swedish: "tak", english: "roof", progress: { status: "bogus", ease: 99, reps: -4 } }] }));
  assert.equal(s.words_added, 1); assert.equal(s.words_invalid, 2);
  const w = lib.words.find((x) => x.swedish === "tak");
  assert.deepEqual([w.status, w.ease, w.reps], ["new", 5, 0]);
});

// ------------------------------------------------------------------ learning
test("answers update status, schedule and history; missed words come first next time", () => {
  const lib = seeded();
  const [a, b, c] = lib.words;
  const day1 = new Date(2026, 10, 9, 10, 0, 0);
  lib.review(a.id, "know", day1); lib.review(a.id, "know", day1); lib.review(a.id, "know", day1);
  assert.equal(lib.getWord(a.id).status, "known");
  lib.review(b.id, "practice", day1);
  assert.equal(lib.getWord(b.id).status, "practice");
  assert.equal(lib.state.reviews.length, 4);
  assert.match(lib.state.reviews[0].reviewed_at, /^2026-11-09T10:00:00$/);
  const cards = selectCards(lib, { mode: "smart", limit: 3, newLimit: 10, order: "random" }, "2026-11-09", () => 0.3);
  assert.equal(cards[0].id, b.id);                      // practice tier first even when shuffled
  assert.ok(!cards.find((x) => x.id === a.id));          // known word not due yet
  const later = selectCards(lib, { mode: "smart", limit: 6, newLimit: 10, order: "sequential" }, addDays("2026-11-09", 400));
  assert.equal(later[0].id, b.id); assert.equal(later[1].id, a.id);
});

test("study session flow: reveal, grade, requeue, restart, navigation", () => {
  const lib = seeded();
  const s = new StudySession(lib, { mode: "all", limit: 4, newLimit: 10, order: "sequential" });
  assert.equal(s.total, 4); assert.equal(s.position, 1);
  assert.throws(() => s.answer("know"), /Reveal/);
  s.reveal(); assert.equal(s.revealed, true);
  s.answer("practice");                                    // missed -> comes back later
  assert.equal(s.total, 5); assert.equal(s.index, 1); assert.equal(s.revealed, false);
  s.reveal(); s.answer("know");
  s.previous(); assert.equal(s.index, 1);
  s.previous(); assert.equal(s.index, 0);
  s.next(); s.next();
  s.shuffle();
  s.restart(); assert.equal(s.index, 0); assert.equal(s.answered, 0);
  let guard = 0;
  while (!s.finished && guard++ < 20) { s.reveal(); s.answer("know"); }
  assert.ok(s.finished && s.current === null);
});

test("a word deleted during a session is skipped instead of crashing", () => {
  const lib = seeded();
  const s = new StudySession(lib, { mode: "all", limit: 3, newLimit: 10, order: "sequential" });
  lib.deleteWords([s.queue[0]]);
  assert.equal(s.current, null);                                     // the deleted card has no word
  s.index = 0; s._skipMissing();
  assert.equal(s.index, 1);
});

test("statistics", () => {
  const lib = seeded();
  const [a, b] = lib.words;
  const at = (d, h) => new Date(2026, 10, d, h, 0, 0);
  lib.review(a.id, "know", at(7, 9)); lib.review(a.id, "know", at(8, 9)); lib.review(a.id, "know", at(9, 9));
  lib.review(b.id, "practice", at(9, 10));
  const today = "2026-11-09";
  const o = stats.overview(lib, today);
  assert.deepEqual([o.total, o.counts.known, o.counts.practice, o.counts.new, o.reviewed_today], [6, 1, 1, 4, 2]);
  assert.equal(o.due_today, 1);
  assert.equal(Math.round(o.progress_pct), 17);
  const perDay = stats.reviewsPerDay(lib, 3, today);
  assert.deepEqual(perDay.map((d) => [d.day, d.know, d.practice]), [["2026-11-07", 1, 0], ["2026-11-08", 1, 0], ["2026-11-09", 1, 1]]);
  assert.deepEqual(stats.knownOverTime(lib, 3, today).map((d) => d.known), [0, 0, 1]);
  assert.equal(stats.streakDays(lib, today), 3);
  assert.deepEqual(stats.totals(lib), { reviews: 4, know: 3, practice: 1, accuracy_pct: 75 });
  assert.equal(stats.deckBreakdown(lib)[0].total, 3);
});

// ------------------------------------------------------------------ persistence
test("data survives closing and reopening the app", async () => {
  const adapter = memoryAdapter();
  const lib = await openLibrary(adapter, { debounceMs: 1 });
  lib.createDeck("Test");
  lib.addWord({ swedish: "förstå", english: "to understand", deck_ids: [lib.decks[0].id] });
  lib.review(lib.words[0].id, "know");
  lib.applySettings({ theme: "dark", auto_play_audio: false });
  await lib.flush();
  const reopened = await openLibrary(adapter);
  assert.equal(reopened.total, 1);
  assert.equal(reopened.words[0].status, "learning");
  assert.equal(reopened.state.reviews.length, 1);
  assert.equal(reopened.decks[0].name, "Test");
  assert.deepEqual([reopened.settings.theme, reopened.settings.auto_play_audio], ["dark", false]);
  const w = reopened.addWord({ swedish: "hej", english: "hello" });
  assert.ok(w.id > reopened.words[0].id);                                  // ids never reused
});

test("settings are validated and auto-pronounce is on by default", () => {
  const lib = newLib();
  assert.equal(lib.settings.auto_play_audio, true);
  lib.applySettings({ cards_per_session: 9999, tts_speed: -3, theme: "neon", min_ease: 99 });
  assert.equal(lib.settings.cards_per_session, 500);
  assert.equal(lib.settings.tts_speed, 0.5);
  assert.equal(lib.settings.theme, "auto");
  assert.ok(lib.settings.min_ease <= lib.settings.starting_ease);
  assert.equal(SRS_DEFAULTS.first_interval_days, 1);
});
