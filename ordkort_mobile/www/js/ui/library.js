import { h, icon, field, statusChip, pageHeader, toast, confirmDialog, messageDialog, sheet, importLibraryFlow, exportLibraryFlow } from "./common.js";
import { ALL_STATUSES, STATUS_LABELS } from "../core/srs.js";
import { LibraryError } from "../core/library.js";

const PAGE = 100;
const view = { text: "", status: "", deck: "", shown: PAGE };

export function renderLibrary(ctx, root) {
  const { lib } = ctx;
  const search = h("input", { type: "search", placeholder: "Search Swedish or English…", value: view.text, "aria-label": "Search words", autocomplete: "off", autocapitalize: "off" });
  const statusSel = h("select", { "aria-label": "Filter by status" }, h("option", { value: "" }, "All statuses"),
    ALL_STATUSES.map((s) => h("option", { value: s }, STATUS_LABELS[s])));
  const deckSel = h("select", { "aria-label": "Filter by deck" }, h("option", { value: "" }, "All decks"), lib.decks.map((d) => h("option", { value: d.id }, d.name)));
  statusSel.value = view.status;
  deckSel.value = lib.getDeck(Number(view.deck)) ? view.deck : "";
  const list = h("div", { class: "list" });
  const count = h("div", { class: "muted small count" });

  const current = () => lib.search({ text: search.value, deckId: deckSel.value === "" ? null : Number(deckSel.value), status: statusSel.value || null });
  const refresh = () => {
    view.text = search.value; view.status = statusSel.value; view.deck = deckSel.value;
    const all = current();
    count.textContent = `${all.length} of ${lib.total} words`;
    list.replaceChildren(...all.slice(0, view.shown).map((w) =>
      h("button", { class: "row-item", onclick: () => editWord(ctx, w.id) },
        h("div", { class: "grow" }, h("div", { class: "rw-sv" }, w.swedish), h("div", { class: "rw-en muted" }, w.english)), statusChip(w.status, STATUS_LABELS))));
    if (all.length > view.shown)
      list.append(h("button", { class: "btn wide", onclick: () => { view.shown += PAGE; refresh(); } }, `Show more (${all.length - view.shown} left)`));
    if (!all.length) list.append(h("p", { class: "muted center" }, lib.total ? "No words match." : "No words yet. Import a library file or tap + to add words."));
  };
  let t = null;
  search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { view.shown = PAGE; refresh(); }, 120); });
  for (const el of [statusSel, deckSel]) el.addEventListener("change", () => { view.shown = PAGE; refresh(); });

  root.append(pageHeader("Library", null,
    h("button", { class: "icon-btn", "aria-label": "More actions", onclick: () => libraryMenu(ctx, current) }, icon("more"))),
    h("div", { class: "search" }, icon("search", 18), search), h("div", { class: "filters" }, statusSel, deckSel), count, list,
    h("button", { class: "fab", "aria-label": "Add word", onclick: () => editWord(ctx, null) }, icon("plus", 26)));
  refresh();
}

function libraryMenu(ctx, current) {
  return sheet("Library", (body, close) => {
    const item = (label, sub, fn) => h("button", { class: "menu-item", onclick: () => { close(); fn(); } }, h("b", {}, label), h("span", { class: "muted small" }, sub));
    const shown = current();
    body.append(
      item("Import library file", "Merge a .json exported from Ordkort", () => importLibraryFlow(ctx)),
      item("Export entire library", "Words, decks, progress and history (.json)", () => exportLibraryFlow(ctx)),
      item(`Export the ${shown.length} words shown`, "Respects search, status and deck filters", () => exportLibraryFlow(ctx, shown, "words")),
      item("Manage decks", "Create, rename or delete decks", () => manageDecks(ctx)),
      item(`Mark the ${shown.length} words shown as…`, "Known, Learning, Needs practice or New", () => markShown(ctx, shown)));
  });
}

async function markShown(ctx, words) {
  if (!words.length) return toast("There are no words to mark.");
  const status = await sheet(`Mark ${words.length} words as…`, (body, close) => {
    for (const s of ALL_STATUSES)
      body.append(h("button", { class: "menu-item", onclick: () => close(s) }, h("b", {}, s === "new" ? "New (clear progress)" : STATUS_LABELS[s])));
  });
  if (!status) return;
  const warn = status === "new" ? "\n\nTheir learning progress will be reset." : "";
  if (!(await confirmDialog("Change status", `Mark ${words.length} words as “${STATUS_LABELS[status]}”?${warn}`, { ok: "Mark", danger: status === "new" }))) return;
  ctx.lib.markStatus(words.map((w) => w.id), status);
  ctx.changed();
  toast(`${words.length} words marked.`);
}

export function manageDecks(ctx) {
  const { lib } = ctx;
  return sheet("Decks", (body, close) => {
    const draw = () => {
      body.replaceChildren();
      const name = h("input", { type: "text", placeholder: "New deck name", "aria-label": "New deck name", maxLength: 60 });
      const add = () => { try { lib.createDeck(name.value); ctx.changed(); draw(); } catch (e) { toast(e.message); } };
      name.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
      body.append(h("div", { class: "row" }, name, h("button", { class: "btn primary", onclick: add }, "Add")));
      for (const d of lib.deckCounts())
        body.append(h("div", { class: "row-item static" }, h("div", { class: "grow" }, h("b", {}, d.name), h("div", { class: "muted small" }, `${d.count} words`)),
          h("button", { class: "btn small", onclick: async () => {
            const v = await promptText("Rename deck", d.name);
            if (v !== undefined) try { lib.renameDeck(d.id, v); ctx.changed(); draw(); } catch (e) { toast(e.message); }
          } }, "Rename"),
          h("button", { class: "btn small danger-text", onclick: async () => {
            if (await confirmDialog("Delete deck", `Delete the deck “${d.name}”?\nThe ${d.count} words in it are NOT deleted.`, { ok: "Delete deck", danger: true })) { lib.deleteDeck(d.id); ctx.changed(); draw(); }
          } }, "Delete")));
      if (!lib.decks.length) body.append(h("p", { class: "muted" }, "No decks yet. Decks group words, for example by topic or by Word file."));
      body.append(h("div", { class: "row end" }, h("button", { class: "btn", onclick: () => close() }, "Done")));
    };
    draw();
  });
}

export function promptText(title, value = "") {
  return sheet(title, (body, close) => {
    const input = h("input", { type: "text", value, maxLength: 60 });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") close(input.value); });
    body.append(input, h("div", { class: "row end" }, h("button", { class: "btn", onclick: () => close(undefined) }, "Cancel"), h("button", { class: "btn primary", onclick: () => close(input.value) }, "OK")));
    setTimeout(() => input.select(), 30);
  });
}

function editWord(ctx, id) {
  const { lib } = ctx, w = id === null ? null : lib.getWord(id);
  const f = (name, ph, value = "", multi = false) => (multi ? h("textarea", { rows: 2, placeholder: ph, value, "aria-label": name }) : h("input", { type: "text", placeholder: ph, value, "aria-label": name, autocapitalize: "off" }));
  return sheet(w ? "Edit word" : "Add word", (body, close) => {
    const sv = f("Swedish word", "förstå", w?.swedish), en = f("English meaning", "to understand", w?.english);
    const exs = f("Example (Swedish)", "Jag förstår dig.", w?.example_sv, true), exe = f("Translation", "I understand you.", w?.example_en, true);
    const ipa = f("Pronunciation (IPA)", "optional - only if you know it", w?.pronunciation);
    const status = h("select", {}, ALL_STATUSES.map((s) => h("option", { value: s }, STATUS_LABELS[s])));
    status.value = w ? w.status : "new";
    const decks = lib.decks.map((d) => ({ d, box: h("input", { type: "checkbox", checked: w ? w.deck_ids.includes(d.id) : false }) }));
    body.append(field("Swedish word", sv), field("English meaning", en), field("Example sentence (Swedish)", exs), field("English translation", exe),
      field("Pronunciation (IPA, optional)", ipa),
      w ? field("Learning status", status) : null,
      decks.length ? h("div", { class: "field" }, h("span", { class: "label" }, "Decks"), h("div", { class: "checks" }, decks.map(({ d, box }) => h("label", { class: "check" }, box, d.name)))) : null,
      w ? h("p", { class: "muted small" }, `${w.reps} reviews · ${w.lapses} missed${w.due_date ? ` · next review ${w.due_date}` : ""}${w.source_file ? ` · from ${w.source_file}` : ""}`) : null);
    const save = (again) => {
      try {
        const deck_ids = decks.filter((x) => x.box.checked).map((x) => x.d.id);
        const fields = { swedish: sv.value, english: en.value, example_sv: exs.value, example_en: exe.value, pronunciation: ipa.value, deck_ids };
        if (w) { lib.updateWord(w.id, fields); if (status.value !== w.status) lib.markStatus([w.id], status.value); }
        else lib.addWord({ ...fields, source_file: "added on phone" });
        ctx.changed();
        if (again) { toast("Word added."); close(); editWord(ctx, null); } else close();
      } catch (e) { if (e instanceof LibraryError) toast(e.message); else throw e; }
    };
    body.append(h("div", { class: "row end wrap" },
      w ? h("button", { class: "btn danger-text", onclick: async () => {
        if (await confirmDialog("Delete word", `Delete “${w.swedish}”?\nThis cannot be undone (your review history is kept for the statistics).`, { ok: "Delete", danger: true })) { lib.deleteWords([w.id]); ctx.changed(); close(); }
      } }, "Delete") : h("button", { class: "btn", onclick: () => save(true) }, "Save & add another"),
      h("button", { class: "btn", onclick: () => close() }, "Cancel"), h("button", { class: "btn primary", onclick: () => save(false) }, "Save")));
  });
}
