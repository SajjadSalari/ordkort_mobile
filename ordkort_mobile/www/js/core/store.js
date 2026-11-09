// Persistence: one JSON document in IndexedDB (localStorage fallback), saved shortly after every change.
import { Library, STATE_VERSION, emptyState } from "./library.js";
import { sanitizeSettings } from "./settings.js";

const DB = "ordkort", STORE = "kv", KEY = "state", LS_KEY = "ordkort.state.v1";

function openIdb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const idbGet = (db) => new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbPut = (db, v) => new Promise((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, KEY); t.oncomplete = res; t.onerror = () => rej(t.error); });

/** In-memory adapter (tests). */
export function memoryAdapter(initial = null) {
  let data = initial;
  return { async load() { return data; }, async save(v) { data = structuredClone(v); }, describe: () => "memory" };
}

export async function browserAdapter() {
  let db = null;
  try { db = await openIdb(); } catch { db = null; }
  return {
    describe: () => (db ? "indexeddb" : "localstorage"),
    async load() {
      if (db) { const v = await idbGet(db); if (v) return v; }
      try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
    },
    async save(v) {
      if (db) { try { await idbPut(db, v); return; } catch { /* fall through */ } }
      localStorage.setItem(LS_KEY, JSON.stringify(v));
    },
  };
}

function normalise(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== "object") return s;
  if ((raw.version || 1) > STATE_VERSION) throw new Error("This data was saved by a newer version of the app.");
  s.nextId = Number(raw.nextId) || 1;
  s.words = Array.isArray(raw.words) ? raw.words.map((w) => ({ ...w, deck_ids: Array.isArray(w.deck_ids) ? w.deck_ids : [] })) : [];
  s.decks = Array.isArray(raw.decks) ? raw.decks : [];
  s.reviews = Array.isArray(raw.reviews) ? raw.reviews : [];
  s.settings = sanitizeSettings(raw.settings);
  s.meta = { last_export: null, ...(raw.meta || {}) };
  const maxId = Math.max(0, ...s.words.map((w) => w.id), ...s.decks.map((d) => d.id));
  s.nextId = Math.max(s.nextId, maxId + 1);
  return s;
}

/** Loads the library and wires automatic, debounced saving. */
export async function openLibrary(adapter, { debounceMs = 250, onSaveError = () => {} } = {}) {
  const lib = new Library(normalise(await adapter.load()));
  let timer = null, pending = false, saving = Promise.resolve();
  const flush = () => {
    clearTimeout(timer); timer = null;
    if (!pending) return saving;
    pending = false;
    saving = saving.then(() => adapter.save(lib.state)).catch((e) => onSaveError(e));
    return saving;
  };
  lib.onChange = () => { pending = true; clearTimeout(timer); timer = setTimeout(flush, debounceMs); };
  lib.flush = flush;
  return lib;
}
