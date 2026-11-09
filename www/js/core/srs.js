// Spaced repetition - a line-by-line port of ordkort/core/srs.py (simplified SM-2, two grades).
import { addDays } from "./textutil.js";

export const STATUS = { NEW: "new", LEARNING: "learning", KNOWN: "known", PRACTICE: "practice" };
export const ALL_STATUSES = ["new", "learning", "known", "practice"];
export const STATUS_LABELS = { new: "New", learning: "Learning", known: "Known", practice: "Needs practice" };
export const RESULT = { KNOW: "know", PRACTICE: "practice", RESET: "reset", MANUAL: "manual" };

export const SRS_DEFAULTS = {
  first_interval_days: 1, second_interval_days: 3, starting_ease: 2.5, min_ease: 1.3, max_ease: 3.0,
  ease_bonus: 0.10, ease_penalty: 0.20, known_after_streak: 3, max_interval_days: 365,
  practice_requeue_gap: 4, practice_max_requeues: 2,
};

/** Python's round(): halves go to the even neighbour. */
export function pyRound(x) {
  const f = Math.floor(x), d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}
const round3 = (x) => Number(x.toFixed(3));

export function srsConfig(settings) {
  const cfg = {};
  for (const k of Object.keys(SRS_DEFAULTS)) cfg[k] = settings && settings[k] !== undefined ? settings[k] : SRS_DEFAULTS[k];
  return cfg;
}

export function schedule(word, result, cfg, today) {
  if (result === RESULT.KNOW) {
    const streak = word.streak + 1;
    let interval;
    if (streak === 1) interval = cfg.first_interval_days;
    else if (streak === 2) interval = Math.max(cfg.second_interval_days, cfg.first_interval_days);
    else {
      const prev = Math.max(word.interval_days, 1.0);
      interval = Math.max(prev + 1, pyRound(prev * word.ease));
    }
    interval = Math.min(interval, cfg.max_interval_days);
    const ease = Math.min(cfg.max_ease, word.ease + cfg.ease_bonus);
    return {
      status: streak >= cfg.known_after_streak ? STATUS.KNOWN : STATUS.LEARNING,
      ease: round3(ease), interval_days: interval, due_date: addDays(today, Math.trunc(interval)),
      streak, reps: word.reps + 1, lapses: word.lapses,
    };
  }
  if (result === RESULT.PRACTICE) {
    const ease = Math.max(cfg.min_ease, word.ease - cfg.ease_penalty);
    return { status: STATUS.PRACTICE, ease: round3(ease), interval_days: 0, due_date: today,
             streak: 0, reps: word.reps + 1, lapses: word.lapses + 1 };
  }
  throw new Error(`Unknown review result: ${result}`);
}

export function manualStatus(word, status, cfg, today) {
  if (!ALL_STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
  if (status === STATUS.NEW)
    return { status, ease: cfg.starting_ease, interval_days: 0, due_date: null, streak: 0, reps: 0, lapses: 0 };
  if (status === STATUS.KNOWN) {
    const interval = Math.max(word.interval_days, cfg.second_interval_days);
    return { status, ease: word.ease, interval_days: interval, due_date: addDays(today, Math.trunc(interval)),
             streak: Math.max(word.streak, cfg.known_after_streak), reps: word.reps, lapses: word.lapses };
  }
  if (status === STATUS.LEARNING)
    return { status, ease: word.ease, interval_days: 0, due_date: today,
             streak: Math.min(word.streak, cfg.known_after_streak - 1), reps: word.reps, lapses: word.lapses };
  return { status, ease: word.ease, interval_days: 0, due_date: today, streak: 0, reps: word.reps, lapses: word.lapses };
}
