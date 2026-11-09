// Dashboard / statistics - port of ordkort/core/stats.py.
import { ALL_STATUSES, STATUS } from "./srs.js";
import { addDays, todayIso } from "./textutil.js";

const answered = (r) => r.result === "know" || r.result === "practice";
const day = (r) => r.reviewed_at.slice(0, 10);

export function statusCounts(lib, deckId = null) {
  const c = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));
  for (const w of lib.words) if (deckId === null || w.deck_ids.includes(deckId)) c[w.status]++;
  return c;
}

export function dueCount(lib, today, deckId = null) {
  return lib.words.filter((w) => (deckId === null || w.deck_ids.includes(deckId)) &&
    (w.status === STATUS.PRACTICE || ((w.status === STATUS.LEARNING || w.status === STATUS.KNOWN) && w.due_date && w.due_date <= today))).length;
}

export function reviewedToday(lib, today) {
  return new Set(lib.state.reviews.filter((r) => answered(r) && day(r) === today && r.word_id !== null).map((r) => r.word_id)).size;
}

export function overview(lib, today = todayIso(), deckId = null) {
  const counts = statusCounts(lib, deckId);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { total, counts, reviewed_today: reviewedToday(lib, today), due_today: dueCount(lib, today, deckId),
           progress_pct: total ? (100 * counts.known) / total : 0 };
}

export function reviewsPerDay(lib, days = 14, today = todayIso()) {
  const start = addDays(today, -(days - 1));
  const data = new Map();
  for (const r of lib.state.reviews) {
    if (!answered(r) || day(r) < start) continue;
    const e = data.get(day(r)) || { know: 0, practice: 0 };
    e[r.result]++;
    data.set(day(r), e);
  }
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i), e = data.get(d) || { know: 0, practice: 0 };
    return { day: d, know: e.know, practice: e.practice };
  });
}

export function knownOverTime(lib, days = 30, today = todayIso()) {
  const start = addDays(today, -(days - 1));
  const rows = lib.state.reviews.filter((r) => r.word_id !== null)
    .map((r, i) => ({ ...r, i })).sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at) || a.i - b.i);
  const state = new Map();
  let known = 0, idx = 0;
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    while (idx < rows.length && day(rows[idx]) <= d) {
      const r = rows[idx++];
      const was = state.get(r.word_id) === STATUS.KNOWN;
      state.set(r.word_id, r.status_after);
      known += (r.status_after === STATUS.KNOWN ? 1 : 0) - (was ? 1 : 0);
    }
    out.push({ day: d, known });
  }
  return out;
}

export function streakDays(lib, today = todayIso()) {
  const days = new Set(lib.state.reviews.filter(answered).map(day));
  let cursor = days.has(today) ? today : addDays(today, -1), n = 0;
  while (days.has(cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
}

export function totals(lib) {
  let know = 0, practice = 0;
  for (const r of lib.state.reviews) { if (r.result === "know") know++; else if (r.result === "practice") practice++; }
  const t = know + practice;
  return { reviews: t, know, practice, accuracy_pct: t ? (100 * know) / t : 0 };
}

export function deckBreakdown(lib) {
  return lib.decks.map((d) => {
    const c = statusCounts(lib, d.id), total = Object.values(c).reduce((a, b) => a + b, 0);
    return { id: d.id, name: d.name, total, counts: c, progress_pct: total ? (100 * c.known) / total : 0 };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
