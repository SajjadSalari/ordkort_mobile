// The vocabulary library: words, decks, learning progress, review history, JSON import/export.
// The JSON format is identical to the desktop app's "Ordkort library" file (ordkort/core/library_io.py).
import { ALL_STATUSES, RESULT, STATUS, manualStatus, schedule, srsConfig } from "./srs.js";
import { sanitizeSettings } from "./settings.js";
import { cleanText, compareSwedish, dedupeKey, fold, nowIso, plain, todayIso } from "./textutil.js";

export const FORMAT_NAME = "ordkort-library";
export const FORMAT_VERSION = 1;
export const STATE_VERSION = 1;

export class LibraryError extends Error {}

export function emptyState() {
  return { version: STATE_VERSION, nextId: 1, words: [], decks: [], reviews: [],
           settings: sanitizeSettings({}), meta: { last_export: null } };
}

const num = (v, def, lo = -Infinity, hi = Infinity, int = false) => {
  let n = Number(v);
  if (!Number.isFinite(n)) return def;
  if (int) n = Math.trunc(n);
  return Math.max(lo, Math.min(hi, n));
};

export class Library {
  constructor(state = emptyState(), onChange = () => {}) {
    this.state = state;
    this.onChange = onChange;
  }

  _changed() { this.onChange(this.state); }
  get settings() { return this.state.settings; }
  get words() { return this.state.words; }
  get decks() { return this.state.decks; }
  get total() { return this.state.words.length; }
  getWord(id) { return this.state.words.find((w) => w.id === id) || null; }
  srs() { return srsConfig(this.state.settings); }

  // ------------------------------------------------------------------ words
  addWord({ swedish, english, example_sv = "", example_en = "", pronunciation = "", source_file = "",
            deck_ids = [], pronunciation_source = "" }) {
    const sv = cleanText(swedish), en = cleanText(english);
    if (!sv || !en) throw new LibraryError("A word needs both a Swedish word and an English meaning.");
    const key = dedupeKey(sv, en);
    if (this.state.words.some((w) => w.key === key))
      throw new LibraryError(`"${sv}" with the meaning "${en}" is already in your library.`);
    const now = nowIso();
    const word = {
      id: this.state.nextId++, swedish: sv, english: en, example_sv: cleanText(example_sv),
      example_en: cleanText(example_en), pronunciation: cleanText(pronunciation), pronunciation_source,
      source_file, import_date: now, created_at: now, key, status: STATUS.NEW, ease: this.settings.starting_ease,
      interval_days: 0, due_date: null, streak: 0, reps: 0, lapses: 0, last_reviewed: null,
      deck_ids: [...new Set(deck_ids)].filter((d) => this.getDeck(d)),
    };
    this.state.words.push(word);
    this._changed();
    return word;
  }

  updateWord(id, fields) {
    const w = this.getWord(id);
    if (!w) throw new LibraryError("That word no longer exists.");
    const sv = cleanText(fields.swedish ?? w.swedish), en = cleanText(fields.english ?? w.english);
    if (!sv || !en) throw new LibraryError("A word needs both a Swedish word and an English meaning.");
    const key = dedupeKey(sv, en);
    if (this.state.words.some((o) => o.id !== id && o.key === key))
      throw new LibraryError(`"${sv}" with the meaning "${en}" already exists in your library.`);
    Object.assign(w, { swedish: sv, english: en, key,
      example_sv: cleanText(fields.example_sv ?? w.example_sv), example_en: cleanText(fields.example_en ?? w.example_en),
      pronunciation: cleanText(fields.pronunciation ?? w.pronunciation) });
    if ("pronunciation" in fields) w.pronunciation_source = w.pronunciation ? "user" : "";
    if (fields.deck_ids) w.deck_ids = [...new Set(fields.deck_ids)].filter((d) => this.getDeck(d));
    this._changed();
    return w;
  }

  deleteWords(ids) {
    const set = new Set(ids);
    for (const r of this.state.reviews) if (set.has(r.word_id)) r.word_id = null;   // history survives
    const before = this.state.words.length;
    this.state.words = this.state.words.filter((w) => !set.has(w.id));
    this._changed();
    return before - this.state.words.length;
  }

  search({ text = "", deckId = null, status = null } = {}) {
    const q = fold(cleanText(text));
    const accentBlind = q && plain(q) === q;
    let out = this.state.words.filter((w) => {
      if (deckId !== null && !w.deck_ids.includes(deckId)) return false;
      if (status && w.status !== status) return false;
      if (!q) return true;
      const sv = fold(w.swedish), en = fold(w.english);
      return sv.includes(q) || en.includes(q) || (accentBlind && (plain(w.swedish).includes(q) || plain(w.english).includes(q)));
    });
    out = out.slice().sort((a, b) => compareSwedish(a.swedish, b.swedish) || a.id - b.id);
    return out;
  }

  // ------------------------------------------------------------------ decks
  getDeck(id) { return this.state.decks.find((d) => d.id === id) || null; }
  deckByName(name) { const n = cleanText(name).toLowerCase(); return this.state.decks.find((d) => d.name.toLowerCase() === n) || null; }
  deckCounts() { return this.state.decks.map((d) => ({ ...d, count: this.state.words.filter((w) => w.deck_ids.includes(d.id)).length })); }

  createDeck(name) {
    name = cleanText(name);
    if (!name) throw new LibraryError("A deck needs a name.");
    if (this.deckByName(name)) throw new LibraryError(`A deck named "${name}" already exists.`);
    const deck = { id: this.state.nextId++, name, created_at: nowIso() };
    this.state.decks.push(deck);
    this._changed();
    return deck;
  }
  getOrCreateDeck(name) { return this.deckByName(name) || this.createDeck(name); }
  renameDeck(id, name) {
    name = cleanText(name);
    const d = this.getDeck(id);
    if (!d) return;
    if (!name) throw new LibraryError("A deck needs a name.");
    const other = this.deckByName(name);
    if (other && other.id !== id) throw new LibraryError(`A deck named "${name}" already exists.`);
    d.name = name;
    this._changed();
  }
  deleteDeck(id) {                       // never deletes words
    this.state.decks = this.state.decks.filter((d) => d.id !== id);
    for (const w of this.state.words) w.deck_ids = w.deck_ids.filter((x) => x !== id);
    if (this.settings.default_deck_id === id) this.settings.default_deck_id = null;
    this._changed();
  }
  addToDeck(deckId, wordIds) {
    for (const id of wordIds) { const w = this.getWord(id); if (w && !w.deck_ids.includes(deckId)) w.deck_ids.push(deckId); }
    this._changed();
  }

  // ------------------------------------------------------------------ learning state
  _log(word, result, before, update, when) {
    this.state.reviews.push({ word_id: word.id, swedish: word.swedish, reviewed_at: when, result,
      status_before: before, status_after: update.status, interval_after: update.interval_days, ease_after: update.ease });
  }

  review(wordId, result, now = new Date()) {
    const w = this.getWord(wordId);
    if (!w) throw new LibraryError("That word no longer exists.");
    const update = schedule(w, result, this.srs(), todayIso(now));
    const before = w.status, when = nowIso(now);
    Object.assign(w, update, { last_reviewed: when });
    this._log(w, result, before, update, when);
    this._changed();
    return w;
  }

  markStatus(wordIds, status, now = new Date()) {
    for (const id of wordIds) {
      const w = this.getWord(id);
      if (!w) continue;
      const update = manualStatus(w, status, this.srs(), todayIso(now));
      const before = w.status;
      Object.assign(w, update);
      if (status === STATUS.NEW) w.last_reviewed = null;
      this._log(w, status === STATUS.NEW ? RESULT.RESET : RESULT.MANUAL, before, update, nowIso(now));
    }
    this._changed();
  }

  // ------------------------------------------------------------------ settings
  applySettings(values) {
    this.state.settings = sanitizeSettings({ ...this.state.settings, ...values });
    this._changed();
  }

  // ------------------------------------------------------------------ export
  exportJson(words = null) {
    const list = words || this.state.words;
    const ids = new Set(list.map((w) => w.id));
    const deckName = (id) => (this.getDeck(id) || {}).name;
    const reviewsOf = new Map();
    for (const r of this.state.reviews) {
      if (r.word_id !== null && ids.has(r.word_id)) {
        if (!reviewsOf.has(r.word_id)) reviewsOf.set(r.word_id, []);
        reviewsOf.get(r.word_id).push({ reviewed_at: r.reviewed_at, result: r.result, status_before: r.status_before,
          status_after: r.status_after, interval_after: r.interval_after, ease_after: r.ease_after });
      }
    }
    const names = (w) => w.deck_ids.map(deckName).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const deckSet = new Set(list.flatMap(names));
    return {
      format: FORMAT_NAME, version: FORMAT_VERSION, exported_at: nowIso(),
      decks: [...deckSet].sort((a, b) => a.localeCompare(b)),
      words: list.map((w) => ({
        swedish: w.swedish, english: w.english, example_sv: w.example_sv, example_en: w.example_en,
        pronunciation: w.pronunciation, pronunciation_source: w.pronunciation_source, source_file: w.source_file,
        import_date: w.import_date, created_at: w.created_at, decks: names(w),
        progress: { status: w.status, ease: w.ease, interval_days: w.interval_days, due_date: w.due_date,
                    streak: w.streak, reps: w.reps, lapses: w.lapses, last_reviewed: w.last_reviewed },
        reviews: reviewsOf.get(w.id) || [],
      })),
    };
  }

  markExported() { this.state.meta.last_export = nowIso(); this._changed(); }

  // ------------------------------------------------------------------ import (merge, all-or-nothing)
  importJson(text) {
    let data;
    try { data = JSON.parse(String(text).replace(/^﻿/, "")); }
    catch (e) { throw new LibraryError(`The file could not be read as an Ordkort library file (${e.message}).`); }
    if (!data || typeof data !== "object" || data.format !== FORMAT_NAME)
      throw new LibraryError("This is not an Ordkort library file (.json exported from Ordkort).");
    if (num(data.version, 0, 0, Infinity, true) > FORMAT_VERSION)
      throw new LibraryError("This library file was made by a newer version of Ordkort.");
    if (!Array.isArray(data.words)) throw new LibraryError("The library file contains no word list.");

    const draft = new Library(structuredClone(this.state), () => {});
    const summary = { words_added: 0, words_existing: 0, words_invalid: 0, decks_created: 0, reviews_added: 0, problems: [] };
    const deckId = (name) => {
      name = cleanText(name);
      if (!name) return null;
      if (!draft.deckByName(name)) summary.decks_created++;
      return draft.getOrCreateDeck(name).id;
    };
    for (const n of data.decks || []) if (typeof n === "string") deckId(n);
    data.words.forEach((e, i) => {
      if (!e || typeof e !== "object" || Array.isArray(e)) { summary.words_invalid++; return; }
      const sv = cleanText(e.swedish), en = cleanText(e.english);
      if (!sv || !en) { summary.words_invalid++; summary.problems.push(`Entry ${i + 1}: missing Swedish word or English meaning.`); return; }
      const names = (Array.isArray(e.decks) ? e.decks : []).filter((n) => typeof n === "string");
      const key = dedupeKey(sv, en);
      const existing = draft.state.words.find((w) => w.key === key);
      if (existing) {
        summary.words_existing++;
        for (const n of names) { const id = deckId(n); if (id && !existing.deck_ids.includes(id)) existing.deck_ids.push(id); }
        return;
      }
      const p = e.progress && typeof e.progress === "object" ? e.progress : {};
      const now = nowIso();
      const w = {
        id: draft.state.nextId++, swedish: sv, english: en, example_sv: cleanText(e.example_sv),
        example_en: cleanText(e.example_en), pronunciation: cleanText(e.pronunciation),
        pronunciation_source: String(e.pronunciation_source || ""), source_file: String(e.source_file || ""),
        import_date: e.import_date || now, created_at: e.created_at || now, key,
        status: ALL_STATUSES.includes(p.status) ? p.status : STATUS.NEW,
        ease: num(p.ease, 2.5, 1.1, 5.0), interval_days: num(p.interval_days, 0, 0), due_date: p.due_date || null,
        streak: num(p.streak, 0, 0, Infinity, true), reps: num(p.reps, 0, 0, Infinity, true),
        lapses: num(p.lapses, 0, 0, Infinity, true), last_reviewed: p.last_reviewed || null, deck_ids: [],
      };
      draft.state.words.push(w);
      summary.words_added++;
      for (const n of names) { const id = deckId(n); if (id && !w.deck_ids.includes(id)) w.deck_ids.push(id); }
      for (const r of Array.isArray(e.reviews) ? e.reviews : []) {
        if (!r || typeof r !== "object" || !["know", "practice", "reset", "manual"].includes(r.result) || !r.reviewed_at) continue;
        draft.state.reviews.push({ word_id: w.id, swedish: sv, reviewed_at: String(r.reviewed_at), result: r.result,
          status_before: r.status_before ?? null, status_after: r.status_after ?? null,
          interval_after: r.interval_after ?? null, ease_after: r.ease_after ?? null });
        summary.reviews_added++;
      }
    });
    Object.assign(this.state, { nextId: draft.state.nextId, words: draft.state.words, decks: draft.state.decks, reviews: draft.state.reviews });
    this._changed();
    return summary;
  }

  /** Replace everything (used by "erase all data"). */
  reset() { Object.assign(this.state, emptyState()); this._changed(); }
}
