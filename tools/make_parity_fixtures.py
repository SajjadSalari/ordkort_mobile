"""Generate test fixtures from the DESKTOP implementation so the phone code can be checked against it.

Usage (needs the desktop project):  python tools/make_parity_fixtures.py /path/to/ordkort_app
Writes tests/fixtures/{srs_cases,keys,desktop_library}.json
"""
import json, random, sys, tempfile
from datetime import date
from pathlib import Path

desktop = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(desktop))
sys.path.insert(0, str(desktop / "samples"))
from ordkort.core import importer as imp, library_io as lio
from ordkort.core.database import Database
from ordkort.core.models import Word
from ordkort.core.srs import SRSConfig, manual_status, schedule
from ordkort.core.textutil import clean_text, dedupe_key

out = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
out.mkdir(parents=True, exist_ok=True)
rng = random.Random(7)

# ---- SRS: random answer sequences under several configs ----------------------------------------
configs = [SRSConfig(), SRSConfig(first_interval_days=2, second_interval_days=5, ease_bonus=0.15, ease_penalty=0.3,
                                  known_after_streak=2, max_interval_days=60),
           SRSConfig(starting_ease=1.8, min_ease=1.2, max_ease=2.2, max_interval_days=30, known_after_streak=5)]
cases = []
today = date(2026, 11, 9)
for ci, cfg in enumerate(configs):
    for run in range(40):
        w = Word(id=1, swedish="x", english="y", ease=cfg.starting_ease)
        steps = []
        for step in range(rng.randint(3, 14)):
            result = rng.choice(["know", "know", "know", "practice"])
            u = schedule(w, result, cfg, today)
            steps.append({"result": result, "expect": u.__dict__})
            w = Word(id=1, swedish="x", english="y", status=u.status, ease=u.ease, interval_days=u.interval_days,
                     due_date=u.due_date, streak=u.streak, reps=u.reps, lapses=u.lapses)
        cases.append({"cfg": cfg.__dict__, "start_ease": cfg.starting_ease, "today": today.isoformat(), "steps": steps})
manual = []
for status in ("new", "known", "learning", "practice"):
    for interval, streak, ease in ((0, 0, 2.5), (10, 4, 2.2), (2, 1, 1.9)):
        w = Word(id=1, swedish="x", english="y", status="learning", ease=ease, interval_days=interval,
                 streak=streak, reps=5, lapses=2)
        cfg = SRSConfig()
        manual.append({"status": status, "word": {k: getattr(w, k) for k in ("ease", "interval_days", "streak", "reps", "lapses")},
                       "expect": manual_status(w, status, cfg, today).__dict__, "today": today.isoformat()})
(out / "srs_cases.json").write_text(json.dumps({"cases": cases, "manual": manual}, indent=1), encoding="utf-8")

# ---- text helpers ----------------------------------------------------------------------------
samples = [("förstå", "to understand"), ("  Förstå. ", "To  Understand!"), ("resa", "trip"), ("resa", "to travel"),
           ("å", "ring"), ("Åska", "thunder"), ("hus​", "house "), ("STRASSE", "Straße"), ("öl", "beer?!"),
           ("", "x"), ("tack", " . "), ("Ärlig", "honest;")]
keys = [{"sv": s, "en": e, "clean_sv": clean_text(s), "key": dedupe_key(s, e)} for s, e in samples]
(out / "keys.json").write_text(json.dumps(keys, indent=1, ensure_ascii=False), encoding="utf-8")

# ---- a real desktop library with progress, decks and history -----------------------------------
tmp = Path(tempfile.mkdtemp())
db = Database(tmp / "d.db")
import make_samples  # noqa: F401  (ensures samples exist)
imp.commit_entries(db, imp.scan_folder(desktop / "samples" / "vocabulary").entries)
cfg = SRSConfig()
words = db.search_words()
for i, w in enumerate(words[:12]):
    for r in (["know", "know", "know"] if i % 3 == 0 else ["practice", "know"] if i % 3 == 1 else ["practice"]):
        fresh = db.get_word(w.id)
        db.record_review(fresh, r, schedule(fresh, r, cfg, today), f"2026-11-0{1 + (i % 8)}T10:0{i % 10}:00")
db.set_pronunciation(words[3].id, "[föʂ'tɔː]", "user")
lio.export_library_json(db, out / "desktop_library.json")
print("fixtures written to", out, "-", len(cases), "srs sequences,", len(words), "words")
