# Ordkort Mobile — Swedish vocabulary flashcards for your phone

*Design by Dr. Sajjad Salari*

The phone version of the Ordkort desktop app: the same flashcards, spaced repetition, statistics and
**Swedish pronunciation that plays automatically when you press "Show answer"**.

One code base gives you:

| You have | You get | Needs |
|---|---|---|
| **Android** | a real installable app (`.apk`) | a free GitHub account (it is built in the cloud) — or Android Studio |
| **iPhone** | the same app, installed from Safari (“Add to Home Screen”) | a free place to host the `www` folder (GitHub Pages workflow included) |
| **iPhone, native** | a real App Store-style app | a Mac with Xcode (free Apple ID works for 7-day installs; a paid Apple Developer account for permanent installs / TestFlight) |

## What it does

* **Study:** front shows only the Swedish word; tap the card or **Show answer** to flip it. The back shows the Swedish word,
  pronunciation (speaker button + IPA only if your library has it — never invented), English meaning, Swedish example and
  English translation. **I Know This Word / I Need More Practice** record your answer and move on.
  Previous / Next, Show/Hide answer, Shuffle, Restart, progress bar. Keyboard shortcuts on tablets/desktop browsers
  (Space, ←/→, 1/X = practice, 2/K = know, S = speak).
* **Automatic pronunciation** when the answer is shown (Settings → switch off if you prefer). Uses the phone's own
  Swedish voice — offline, no Google lookup. It never reads Swedish with a non-Swedish voice; if there is none it tells you how to install one.
* **Smart review** identical to the desktop app: missed words come first, known words appear less and less often
  (configurable intervals in Settings).
* **Library:** search (Swedish or English, accent-insensitive for plain letters), filter by status/deck, add / edit / delete,
  decks, mark words as Known / Learning / Needs practice / New.
* **Dashboard & Statistics:** totals per status, reviewed today, due today, progress ring, 14/30/90-day charts, streak, accuracy, per-deck progress, history.
* **Light / dark theme**, text size, offline use, data stays on your phone.

## Moving your words between computer and phone

Both apps use the same file format (`.json`, "Ordkort library"): words, decks, learning status, schedule **and review history**.

1. **Computer → phone:** desktop app → *Library → More ▾ → Export entire library…* → choose `.json` → get the file to the phone
   (email to yourself, cloud drive, USB, messenger) → phone app → *Home/Library → Import library file*.
2. **Phone → computer (e.g. your progress):** phone app → *Settings → Export library* → send the file to the computer →
   desktop app → *Library → More ▾ → Import library file…*.

Importing **merges**: words you already have keep their current progress on that device; missing words are added with their progress and history.
Nothing is overwritten and nothing is synced automatically — export/import whenever you want to move progress across.
(Tip: pick one device as the “main” one for progress, or export from the one you studied on last.)

## Getting the app

### A. Android app (APK) — no software to install on your PC

1. Create a free account at github.com and a new repository; upload the contents of this folder
   (*Add file → Upload files*; the `.github` folder must be included — if the web uploader skips hidden folders, use GitHub Desktop or `git push`).
2. Open the repository → **Actions → "Build Android app (APK)" → Run workflow**. After ~5–10 minutes open the finished run and download
   the artifact **Ordkort-android-apk** (a zip containing `app-debug.apk`).
3. Copy `app-debug.apk` to the phone (email, drive, USB), open it, and allow “Install unknown apps” for that source when Android asks.
4. Open **Ordkort** → import your library file. If Settings says no Swedish voice: Settings → **Install Swedish voice (Android)**
   (or Android Settings → System → Languages → Text-to-speech output → Google → Install voice data → Swedish).

This is a *debug-signed* APK for your own use. (Publishing on Google Play would need a release signing key and a Play developer account — not covered here.)

*Prefer building locally?* Install Node 22+, JDK 21 and Android Studio, then:
```
npm install
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug        # APK: android/app/build/outputs/apk/debug/app-debug.apk
```

### B. iPhone, without a Mac: the web app on your home screen

1. Host the `www` folder anywhere that serves static files over https. Easiest: put this folder in a GitHub repository, then
   **Settings → Pages → Source: GitHub Actions** and run **"Publish web version"** (free GitHub accounts need a *public* repository for Pages;
   the app contains no personal data — your words only ever live on your phone).
2. On the iPhone open the page in **Safari** → Share → **Add to Home Screen**. It then opens like an app, full screen, and works offline.
3. Import your library file (Files app / email attachment → choose the file). iPhone needs a Swedish voice: Settings → Accessibility →
   Spoken Content → Voices → Swedish → download one.

Android phones can use this web version as well. **Important on iPhone:** Safari may delete stored website data for sites unused for a long
time; an app added to the Home Screen is exempt from the 7-day cleanup, but still **export a backup now and then**.

### C. iPhone, native app (needs a Mac)

```
npm install
npx cap add ios
npx @capacitor/assets generate --ios --assetPath assets   # icons (optional)
npx cap sync ios
npx cap open ios        # Xcode: pick your Team under Signing & Capabilities, choose your iPhone, press Run
```
With a free Apple ID the app expires after 7 days and must be re-installed from Xcode; a paid Apple Developer membership removes that and enables TestFlight.

## Try it on a computer

```
npm install
npm test            # logic tests, including parity with the desktop app
npm run serve       # http://localhost:8080  (use browser dev tools "device mode" to see the phone layout)
```
`python tools/ui_check.py` drives the real UI in headless Chromium (needs Playwright) and checks import → study → pronunciation → grading → reload → export.

## Project layout

```
www/                 the app (plain HTML/CSS/ES modules - no build step)
  js/core/           logic: library, srs, session, stats, store (shared behaviour with the desktop app)
  js/ui/             screens: home, study, library, stats, settings
  js/platform.js     Swedish speech + file save/share (native plugin or browser)
capacitor.config.json  native wrapper settings
tests/               node tests (+ fixtures generated by the desktop code: tools/make_parity_fixtures.py)
tools/               ui_check.py, serve.mjs, make_icons.py
.github/workflows/   android.yml (APK build), web.yml (publish web version)
```

## Honest limitations

* **Not verified by me:** the APK build itself and running on real Android/iOS devices — my build environment has no Android SDK or Apple tooling and
  no phone. What *is* verified: all logic against the desktop implementation (120 random SRS sequences, text keys, file format both ways), and the
  complete UI in a headless phone-sized browser, including the native code path with the speech/file plugins simulated. Expect to possibly tweak
  small things on first install; tell me what you see.
* Words come from the desktop app's library file; importing Word `.docx` files directly on the phone is not included (do that on the computer).
* No automatic sync between devices (by design: no server, no account, your data stays yours).
* IPA is shown only if it is in your library; there is no online IPA lookup on the phone.
* Capacitor 8 requires recent toolchains (Node 22+, JDK 21; current Xcode for iOS) — see capacitorjs.com/docs/getting-started/environment-setup.
