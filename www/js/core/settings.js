// App settings with validation (mirrors ordkort/core/settings.py where it makes sense on a phone).
export const FACTORY_DEFAULTS = {
  theme: "auto",                 // auto | light | dark
  card_font_scale: 1.0,
  default_deck_id: null,
  study_mode: "smart",
  cards_per_session: 20,
  new_words_per_session: 10,
  card_order: "random",
  auto_play_audio: true,         // speak the word when the answer is shown
  tts_voice: "",                 // "" = automatic Swedish voice
  tts_speed: 1.0,
  first_interval_days: 1, second_interval_days: 3, starting_ease: 2.5, min_ease: 1.3, max_ease: 3.0,
  ease_bonus: 0.10, ease_penalty: 0.20, known_after_streak: 3, max_interval_days: 365,
  practice_requeue_gap: 4, practice_max_requeues: 2,
};

const CHOICES = {
  theme: ["auto", "light", "dark"],
  card_order: ["random", "sequential"],
  study_mode: ["smart", "new", "practice", "learning", "known", "all"],
};
const RANGES = {
  card_font_scale: [0.8, 1.6, false], cards_per_session: [1, 500, true], new_words_per_session: [0, 200, true],
  tts_speed: [0.5, 1.5, false], first_interval_days: [1, 30, true], second_interval_days: [1, 60, true],
  starting_ease: [1.3, 4.0, false], min_ease: [1.1, 3.0, false], max_ease: [1.5, 5.0, false],
  ease_bonus: [0, 0.5, false], ease_penalty: [0, 1, false], known_after_streak: [1, 10, true],
  max_interval_days: [7, 3650, true], practice_requeue_gap: [1, 20, true], practice_max_requeues: [0, 5, true],
};

export function sanitizeSettings(values) {
  const out = { ...FACTORY_DEFAULTS };
  for (const [key, raw] of Object.entries(values || {})) {
    if (!(key in FACTORY_DEFAULTS)) continue;
    if (key in CHOICES) { if (CHOICES[key].includes(raw)) out[key] = raw; }
    else if (key in RANGES) {
      const [lo, hi, isInt] = RANGES[key];
      const n = Number(raw);
      if (Number.isFinite(n)) out[key] = Math.max(lo, Math.min(hi, isInt ? Math.round(n) : n));
    } else if (key === "auto_play_audio") out[key] = Boolean(raw);
    else if (key === "default_deck_id") out[key] = raw === null || raw === "" || raw === 0 ? null : Number(raw) || null;
    else if (key === "tts_voice") out[key] = String(raw || "");
  }
  if (out.min_ease > out.starting_ease) out.min_ease = out.starting_ease;
  if (out.max_ease < out.starting_ease) out.max_ease = out.starting_ease;
  return out;
}
