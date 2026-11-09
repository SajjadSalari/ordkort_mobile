"""Drives the real app in headless Chromium at phone size: import -> study -> pronounce -> grade -> reload -> export.
Run:  python tools/ui_check.py   (starts its own static server; writes screenshots to ./screens)
"""
import json, os, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parent.parent
shots = root / "screens"; shots.mkdir(exist_ok=True)
port = 8123
server = subprocess.Popen(["node", str(root / "tools/serve.mjs")], env={**os.environ, "PORT": str(port)}, stdout=subprocess.DEVNULL)
time.sleep(0.8)
STUB = """
window.__spoken = [];
const stub = { getVoices(){ return [{name:'Alva', lang:'sv-SE', voiceURI:'alva'}, {name:'Samantha', lang:'en-US', voiceURI:'sam'}]; },
  speak(u){ window.__spoken.push({text:u.text, lang:u.lang, voice:u.voice && u.voice.name, rate:u.rate}); }, cancel(){}, addEventListener(){} };
Object.defineProperty(window, 'speechSynthesis', { value: stub, configurable: true });
window.SpeechSynthesisUtterance = class { constructor(t){ this.text = t; } };
"""
problems = []
def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond: problems.append(msg)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2, has_touch=True, is_mobile=True, accept_downloads=True)
        ctx.add_init_script(STUB)
        errors = []
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(f"http://localhost:{port}/")
        page.wait_for_selector(".tabbar")
        check("Welcome" in page.inner_text("main"), "empty library shows the welcome screen")
        page.screenshot(path=str(shots / "01_welcome.png"))

        # --- import the library file the DESKTOP app exported
        with page.expect_file_chooser() as fc:
            page.click("text=Import library file")
        fc.value.set_files(str(root / "tests/fixtures/desktop_library.json"))
        page.wait_for_selector(".sheet")
        check("Words added: 50" in page.inner_text(".sheet"), "import dialog reports 50 words added")
        page.click(".sheet >> text=OK")
        check(page.evaluate("__ordkort.lib.total") == 50, "library holds 50 words")
        page.screenshot(path=str(shots / "02_home.png"))

        # --- library search
        page.click(".tab[data-tab=library]")
        page.fill("input[type=search]", "ö")
        page.wait_for_timeout(300)
        n = page.locator(".row-item").count()
        check(0 < n < 50, f"search for 'ö' filters the list ({n} shown)")
        page.fill("input[type=search]", "")
        page.wait_for_timeout(300)
        page.screenshot(path=str(shots / "03_library.png"))

        # --- study: front shows only the Swedish word, answer reveals everything, audio is automatic
        page.click(".tab[data-tab=study]")
        page.fill("input[type=number]", "5")
        page.click("text=Start session")
        page.wait_for_selector(".flip")
        word = page.evaluate("__ordkort.lib.getWord(__ordkort.lib.words[0].id).swedish")
        shown = page.inner_text(".front .big-word")
        check(page.evaluate("window.__spoken.length") == 0, "front of the card is silent")
        check(page.is_visible(".front") and "Card 1 / 5" in page.inner_text(".study-top"), f"front shows '{shown}' and progress 'Card 1 / 5'")
        page.screenshot(path=str(shots / "04_front.png"))
        page.click("text=Show answer")
        page.wait_for_timeout(700)
        spoken = page.evaluate("window.__spoken")
        check(len(spoken) == 1 and spoken[0]["text"] == shown and spoken[0]["voice"] == "Alva" and spoken[0]["lang"] == "sv-SE",
              f"Show answer pronounced the word with the Swedish voice: {spoken}")
        back = page.inner_text(".back")
        for label in ("SWEDISH WORD", "PRONUNCIATION", "ENGLISH MEANING", "EXAMPLE SENTENCE", "ENGLISH TRANSLATION"):
            check(label in back.upper(), f"back of card shows {label}")
        page.screenshot(path=str(shots / "05_back.png"))
        page.click("text=Hide answer"); page.wait_for_timeout(100)
        check(page.evaluate("window.__spoken.length") == 1, "hiding the answer is silent")
        page.click("text=Show answer"); page.wait_for_timeout(100)
        check(page.evaluate("window.__spoken.length") == 2, "showing again pronounces again")

        # --- grade
        wid = page.evaluate("__ordkort.lib.words.find(w => w.swedish === %s).id" % json.dumps(shown))
        before = page.evaluate(f"__ordkort.lib.getWord({wid}).reps")
        page.click("text=I Need More Practice")
        page.wait_for_selector(".study-top")
        w = page.evaluate(f"__ordkort.lib.getWord({wid})")
        check(w["status"] == "practice" and w["reps"] == before + 1 and w["lapses"] >= 1, f"'I Need More Practice' updates the word: {w['status']}")
        check("Card 2 /" in page.inner_text(".study-top"), "moved to the next card automatically")
        page.click("text=Show answer"); page.click("text=I Know This Word")
        page.wait_for_selector(".study-top")
        check(page.evaluate("__ordkort.lib.state.reviews.length") >= 2 + 1, "answers are logged in the review history")

        # --- reload: data and progress persist
        page.evaluate("__ordkort.lib.flush()")
        page.reload(); page.wait_for_selector(".tabbar")
        check(page.evaluate("__ordkort.lib.total") == 50, "after reload all 50 words are still there")
        check(page.evaluate(f"__ordkort.lib.getWord({wid}).status") == "practice", "after reload the learning status is kept")
        page.click(".tab[data-tab=stats]"); page.wait_for_selector(".tiles")
        page.screenshot(path=str(shots / "06_stats.png"), full_page=False)

        # --- settings + export
        page.click(".tab[data-tab=settings]"); page.wait_for_selector("text=Pronunciation")
        check("Swedish voice ready" in page.inner_text("main"), "settings report the Swedish voice")
        page.screenshot(path=str(shots / "07_settings.png"))
        page.select_option("select >> nth=0", "dark")
        check(page.evaluate("document.documentElement.dataset.theme") == "dark", "dark theme applies")
        page.screenshot(path=str(shots / "08_dark.png"))
        with page.expect_download() as dl:
            page.click("text=Export library")
        out = shots / "exported_from_phone.json"
        dl.value.save_as(str(out))
        data = json.loads(out.read_text(encoding="utf-8"))
        check(data["format"] == "ordkort-library" and len(data["words"]) == 50, "export downloads a valid library file with 50 words")
        page.click(".tab[data-tab=study]"); page.click("text=Start session"); page.wait_for_selector(".flip")
        page.click(".tab[data-tab=home]"); page.click(".tab[data-tab=study]")
        check(page.is_visible(".flip"), "a running session survives switching tabs")
        check(not [e for e in errors if "favicon" not in e], f"no JavaScript errors in the console {errors[:3]}")

        # --- the NATIVE (Capacitor) code path, with the plugins mocked: voice list, speak(), file save + share
        NATIVE = """
        window.__calls = [];
        const plugins = {
          TextToSpeech: {
            getSupportedVoices: async () => ({ voices: [
              { voiceURI: 'en-1', name: 'English', lang: 'en_US', default: true, localService: true },
              { voiceURI: 'sv-1', name: 'Swedish female', lang: 'sv_SE', default: false, localService: true },
              { voiceURI: 'sv-2', name: 'Swedish male', lang: 'sv-SE', default: false, localService: true }] }),
            isLanguageSupported: async () => ({ supported: true }),
            speak: async (o) => { window.__calls.push(['speak', o]); }, stop: async () => {}, openInstall: async () => {} },
          Filesystem: { writeFile: async (o) => { window.__calls.push(['write', o.path, o.data.length]); return {}; },
                        getUri: async (o) => ({ uri: 'file:///cache/' + o.path }) },
          Share: { share: async (o) => { window.__calls.push(['share', o.url]); return {}; } },
        };
        window.Capacitor = { isNativePlatform: () => true, registerPlugin: (n) => plugins[n] };
        """
        ctx2 = b.new_context(viewport={"width": 390, "height": 800}, has_touch=True, is_mobile=True)
        ctx2.add_init_script(NATIVE)
        n = ctx2.new_page()
        n.goto(f"http://localhost:{port}/"); n.wait_for_selector(".tabbar")
        n.evaluate("""() => __ordkort.lib.importJson(%s)""" % json.dumps((root / "tests/fixtures/desktop_library.json").read_text(encoding="utf-8")))
        n.evaluate("__ordkort.changed()")
        n.click(".tab[data-tab=study]"); n.fill("input[type=number]", "3"); n.click("text=Start session"); n.wait_for_selector(".flip")
        n.click("text=Show answer"); n.wait_for_timeout(300)
        calls = n.evaluate("window.__calls")
        speak = [c[1] for c in calls if c[0] == "speak"]
        check(len(speak) == 1 and speak[0]["lang"] == "sv-SE" and speak[0]["voice"] == 1 and speak[0]["category"] == "playback",
              f"native: speaks Swedish with the first Swedish voice (index 1): {speak}")
        n.click(".tab[data-tab=settings]"); n.wait_for_selector("text=Pronunciation")
        opts = n.locator("select >> nth=1 >> option").all_inner_texts()
        check("Swedish female" in " ".join(opts) and "English" not in " ".join(opts), f"native: voice list has Swedish voices only: {opts}")
        n.click("text=Export library"); n.wait_for_timeout(500)
        calls = n.evaluate("window.__calls")
        check(any(c[0] == "write" and c[1].startswith("ordkort_library_") for c in calls) and any(c[0] == "share" for c in calls),
              "native: export writes a file and opens the share sheet")
        b.close()
finally:
    server.terminate()
print("\nALL PASSED" if not problems else f"\n{len(problems)} FAILED: {problems}")
sys.exit(1 if problems else 0)
