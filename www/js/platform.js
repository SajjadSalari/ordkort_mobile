// Everything that differs between the native app (Capacitor: Android/iOS) and a plain browser/PWA:
// Swedish text-to-speech, and saving/sharing files.
const cap = globalThis.Capacitor;
export const isNative = Boolean(cap && cap.isNativePlatform && cap.isNativePlatform());

const plugins = {};
function plugin(name) {
  if (!plugins[name]) { try { plugins[name] = cap.registerPlugin(name); } catch { plugins[name] = null; } }
  return plugins[name];
}

// ------------------------------------------------------------------ Swedish speech
const isSwedish = (lang) => /^sv([-_]|$)/i.test(lang || "");

class Speech {
  constructor() { this.list = []; this.ready = false; this.problem = ""; }

  async init() {
    this.list = []; this.problem = "";
    try {
      if (isNative) await this._initNative();
      else await this._initWeb();
    } catch (e) {
      this.problem = `Speech is not available (${e.message || e}).`;
    }
    this.ready = true;
    if (!this.list.length && !this.problem)
      this.problem = isNative
        ? "No Swedish voice found. Install Swedish speech data: Android Settings → System → Languages → Text-to-speech output (Google) → Install voice data → Swedish. On iPhone: Settings → Accessibility → Spoken Content → Voices → Swedish."
        : "This browser has no Swedish voice. Install Swedish speech data in your device's speech/language settings.";
    return this.status();
  }

  async _initNative() {
    const tts = plugin("TextToSpeech");
    if (!tts) throw new Error("text-to-speech plugin missing");
    const { voices } = await tts.getSupportedVoices();
    this.list = (voices || []).map((v, index) => ({ v, index }))
      .filter(({ v }) => isSwedish(v.lang))
      .map(({ v, index }) => ({ id: v.voiceURI || v.name || String(index), name: v.name || v.voiceURI || `Voice ${index + 1}`, index }));
    if (!this.list.length) {            // some engines only report support per language, without voice lists
      const { supported } = await tts.isLanguageSupported({ lang: "sv-SE" });
      if (supported) this.list = [{ id: "default-sv", name: "Swedish (system voice)", index: -1 }];
    }
  }

  async _initWeb() {
    const synth = globalThis.speechSynthesis;
    if (!synth) throw new Error("this browser has no speech synthesis");
    const read = () => synth.getVoices().filter((v) => isSwedish(v.lang));
    let found = read();
    if (!found.length)                  // voices load asynchronously in most browsers
      found = await new Promise((resolve) => {
        const done = () => resolve(read());
        synth.addEventListener?.("voiceschanged", done, { once: true });
        setTimeout(done, 1500);
      });
    this.list = found.map((v) => ({ id: v.voiceURI || v.name, name: `${v.name} (${v.lang})`, voice: v }));
  }

  /** Android: opens the system screen to install Swedish voice data. */
  async openInstall() { try { await plugin("TextToSpeech")?.openInstall(); } catch (e) { console.warn(e); } }

  voices() { return this.list.map(({ id, name }) => ({ id, name })); }
  available() { return this.list.length > 0; }
  status() {
    return this.available()
      ? { available: true, message: `Swedish voice ready (${this.list.length} voice${this.list.length === 1 ? "" : "s"}).` }
      : { available: false, message: this.problem || "Swedish speech is unavailable." };
  }

  /** Speaks Swedish text. Never speaks Swedish with a non-Swedish voice. Resolves true if playback started. */
  async speak(text, { voice = "", rate = 1 } = {}) {
    text = (text || "").trim();
    if (!text || !this.available()) return false;
    const chosen = this.list.find((v) => v.id === voice) || this.list[0];
    try {
      if (isNative) {
        const tts = plugin("TextToSpeech");
        await tts.stop().catch(() => {});
        const opts = { text, lang: "sv-SE", rate, pitch: 1.0, volume: 1.0, category: "playback" };   // "playback": also audible with the iPhone silent switch on
        if (chosen.index >= 0) opts.voice = chosen.index;
        tts.speak(opts).catch((e) => console.warn("speak failed", e));
      } else {
        const synth = globalThis.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = chosen.voice; u.lang = chosen.voice.lang; u.rate = rate;
        synth.speak(u);
      }
      return true;
    } catch (e) { console.warn("speech error", e); return false; }
  }

  stop() {
    try { if (isNative) plugin("TextToSpeech")?.stop(); else globalThis.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }
}
export const speech = new Speech();

// ------------------------------------------------------------------ files
/** Saves text as a file: the share sheet on phones, a download in a desktop browser. */
export async function saveTextFile(filename, text, mime = "application/json") {
  if (isNative) {
    const fs = plugin("Filesystem"), share = plugin("Share");
    await fs.writeFile({ path: filename, data: text, directory: "CACHE", encoding: "utf8" });
    const { uri } = await fs.getUri({ path: filename, directory: "CACHE" });
    await share.share({ title: filename, url: uri, dialogTitle: "Save or send the file" });
    return "shared";
  }
  const file = new File([text], filename, { type: mime });
  const touch = globalThis.matchMedia?.("(pointer: coarse)").matches;
  if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "downloaded";
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error("The file could not be read."));
    r.readAsText(file, "utf-8");
  });
}

export function pickFile(accept = ".json,application/json") {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept });
    input.style.display = "none";
    input.addEventListener("change", () => { resolve(input.files[0] || null); input.remove(); });
    input.addEventListener("cancel", () => { resolve(null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}
