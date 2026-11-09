import { h, icon, toast, messageDialog, confirmDialog, sheet } from "./dom.js";
import { pickFile, readFileAsText, saveTextFile } from "../platform.js";
import { todayIso } from "../core/textutil.js";

export const field = (label, control, hint) =>
  h("label", { class: "field" }, h("span", { class: "label" }, label), control, hint ? h("span", { class: "hint" }, hint) : null);

export const statusChip = (status, labels) => h("span", { class: `chip chip-${status}` }, labels[status] || status);

export function pageHeader(title, subtitle, ...actions) {
  return h("header", { class: "page-head" },
    h("div", {}, h("h1", {}, title), subtitle ? h("p", { class: "muted" }, subtitle) : null),
    actions.length ? h("div", { class: "head-actions" }, actions) : null);
}

export function tile(value, label, cls = "") {
  return h("div", { class: `tile ${cls}` }, h("div", { class: "tile-value" }, String(value)), h("div", { class: "tile-label" }, label));
}

/** Asks for a library file and merges it. Shows a summary or a clear error. */
export async function importLibraryFlow(ctx) {
  const file = await pickFile();
  if (!file) return;
  try {
    const text = await readFileAsText(file);
    const s = ctx.lib.importJson(text);
    await ctx.lib.flush();
    ctx.changed();
    const lines = [`Words added: ${s.words_added}`, `Already in your library (kept as they are): ${s.words_existing}`,
      `Decks created: ${s.decks_created}`, `Review records restored: ${s.reviews_added}`];
    if (s.words_invalid) lines.push(`Skipped invalid entries: ${s.words_invalid}`);
    await messageDialog("Import finished", lines.join("\n"));
  } catch (e) {
    await messageDialog("Import failed", `${e.message}\n\nNothing was changed.`);
  }
}

export async function exportLibraryFlow(ctx, words = null, label = "library") {
  const data = ctx.lib.exportJson(words);
  const name = `ordkort_${label}_${todayIso()}.json`;
  try {
    const how = await saveTextFile(name, JSON.stringify(data, null, 1));
    if (how === "cancelled") return;
    if (!words) { ctx.lib.markExported(); ctx.changed(); }
    toast(how === "downloaded" ? `Saved ${name} to your downloads.` : `Exported ${data.words.length} words.`);
  } catch (e) {
    await messageDialog("Export failed", `The file could not be saved:\n${e.message || e}`);
  }
}

export function daysSince(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export { h, icon, toast, confirmDialog, messageDialog, sheet };
