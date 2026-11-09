// Card selection and the study session - port of ordkort/core/session.py.
import { RESULT, STATUS } from "./srs.js";
import { nowIso, todayIso } from "./textutil.js";

export const MODES = {
  smart: "Smart review (recommended)", new: "New words only", practice: "Needs more practice",
  learning: "Words I am learning", known: "Known words (refresh)", all: "All words",
};

export function shuffled(list, rng = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function fetchWords(lib, deckId, statuses, dueBy, order, limit) {
  let list = lib.words.filter((w) =>
    (deckId === null || w.deck_ids.includes(deckId)) &&
    (!statuses || statuses.includes(w.status)) &&
    (!dueBy || (w.due_date && w.due_date <= dueBy)));
  if (order === "due") list = list.slice().sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "") || a.id - b.id);
  else list = list.slice().sort((a, b) => a.id - b.id);
  return limit === null ? list : list.slice(0, limit);
}

/** Smart mode: 1) needs-practice  2) due learning/known (most overdue first)  3) new (capped).
 *  Random order shuffles WITHIN each tier so missed words always come first. */
export function selectCards(lib, cfg, today, rng = Math.random) {
  const limit = Math.max(1, cfg.limit), deck = cfg.deckId ?? null, shuffle = cfg.order === "random";
  const tier = (w) => (shuffle ? shuffled(w, rng) : w);
  if (cfg.mode === "smart") {
    let picked = tier(fetchWords(lib, deck, [STATUS.PRACTICE], null, "due", limit));
    if (picked.length < limit)
      picked = picked.concat(tier(fetchWords(lib, deck, [STATUS.LEARNING, STATUS.KNOWN], today, "due", limit - picked.length)));
    if (picked.length < limit) {
      const room = Math.min(limit - picked.length, Math.max(0, cfg.newLimit));
      if (room) picked = picked.concat(tier(fetchWords(lib, deck, [STATUS.NEW], null, "id", room)));
    }
    return picked;
  }
  const statuses = { new: [STATUS.NEW], practice: [STATUS.PRACTICE], learning: [STATUS.LEARNING], known: [STATUS.KNOWN], all: null }[cfg.mode];
  let picked = fetchWords(lib, deck, statuses, null, "id", null);
  if (shuffle) picked = shuffled(picked, rng);
  return picked.slice(0, limit);
}

export class StudySession {
  constructor(lib, cfg, { rng = Math.random, now = () => new Date() } = {}) {
    this.lib = lib; this.cfg = cfg; this.rng = rng; this.now = now;
    this.restart();
  }
  get today() { return todayIso(this.now()); }
  restart() {
    this.queue = selectCards(this.lib, this.cfg, this.today, this.rng).map((w) => w.id);
    this.index = 0; this.revealed = false; this.results = new Map(); this.requeues = new Map();
    this.knownCount = 0; this.practiceCount = 0;
  }
  get total() { return this.queue.length; }
  get position() { return Math.min(this.index + 1, this.total); }
  get finished() { return this.index >= this.total; }
  get current() { return this.finished ? null : this.lib.getWord(this.queue[this.index]); }
  get answered() { return this.knownCount + this.practiceCount; }
  reveal() { if (!this.finished) this.revealed = true; }
  hide() { this.revealed = false; }
  toggle() { this.revealed ? this.hide() : this.reveal(); return this.revealed; }
  next() { if (this.index < this.total) this.index++; this.revealed = false; }
  previous() { if (this.index > 0) this.index--; this.revealed = false; }
  shuffle() {
    const rest = shuffled(this.queue.slice(this.index), this.rng);
    this.queue.splice(this.index, rest.length, ...rest);
    this.revealed = false;
  }
  /** Skips cards whose word was deleted meanwhile. */
  _skipMissing() { while (!this.finished && !this.lib.getWord(this.queue[this.index])) this.index++; }
  answer(result) {
    this._skipMissing();
    const word = this.current;
    if (!word) throw new Error("The session is finished.");
    if (!this.revealed) throw new Error("Reveal the answer before grading the card.");
    if (result !== RESULT.KNOW && result !== RESULT.PRACTICE) throw new Error(`Bad result ${result}`);
    this.lib.review(word.id, result, this.now());
    this.results.set(word.id, result);
    if (result === RESULT.KNOW) this.knownCount++;
    else {
      this.practiceCount++;
      const used = this.requeues.get(word.id) || 0;
      if (used < this.lib.srs().practice_max_requeues) {
        this.requeues.set(word.id, used + 1);
        const at = Math.min(this.index + 1 + this.lib.srs().practice_requeue_gap, this.queue.length);
        this.queue.splice(at, 0, word.id);
      }
    }
    this.index++;
    this.revealed = false;
    return this.lib.getWord(word.id);
  }
}
