// Text helpers - must behave exactly like ordkort/core/textutil.py on the desktop app,
// because words are matched between desktop and phone by this key.
const ZERO_WIDTH = /[​‌‍⁠﻿­]/g;
const STRIP = " .,;:!?";

export function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).normalize("NFC").replace(ZERO_WIDTH, "").replace(/ /g, " ")
    .replace(/\s+/g, " ").trim();
}

const casefold = (s) => s.toLowerCase().replace(/ß/g, "ss");

function stripEnds(s) {
  let a = 0, b = s.length;
  while (a < b && STRIP.includes(s[a])) a++;
  while (b > a && STRIP.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

/** Same Swedish word AND same meaning = same item ("resa" = trip / to travel stay separate). */
export function dedupeKey(swedish, english) {
  return `${stripEnds(casefold(cleanText(swedish)))}␟${stripEnds(casefold(cleanText(english)))}`;
}

export const fold = (t) => (t ? casefold(cleanText(t)) : "");
export const stripAccents = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const plain = (t) => (t ? stripAccents(fold(t)) : "");

const collator = new Intl.Collator("sv", { sensitivity: "base", numeric: true });
/** Swedish alphabetical order (å, ä, ö after z). */
export const compareSwedish = (a, b) => collator.compare(a, b);

// ---- dates (all local time, ISO strings, like the desktop app) -------------------------------
const pad = (n) => String(n).padStart(2, "0");
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export function nowIso(now = new Date()) {
  return `${todayIso(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
export function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
