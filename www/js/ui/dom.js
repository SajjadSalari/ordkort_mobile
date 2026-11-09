// Tiny DOM helpers: element builder, toast, confirm dialog, bottom sheet, icons.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k in el && k !== "list") { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="3"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  speaker: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  refresh: '<path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M20 10A8 8 0 0 0 6 6L4 10M4 14a8 8 0 0 0 14 4l2-4"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
};
export function icon(name, size = 22) {
  return h("span", { class: "ico", "aria-hidden": "true", html:
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>` });
}

let toastTimer = null;
export function toast(message, ms = 3500) {
  let el = document.getElementById("toast");
  if (!el) { el = h("div", { id: "toast", role: "status", "aria-live": "polite" }); document.body.append(el); }
  el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/** Bottom sheet / dialog. Resolves with whatever `close(value)` is called with. */
export function sheet(title, build, { dismissible = true } = {}) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const close = (value) => { overlay.remove(); document.body.classList.remove("noscroll"); prevFocus?.focus?.(); resolve(value); };
    const body = h("div", { class: "sheet-body" });
    const panel = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "sheet-head" }, h("h2", {}, title),
        dismissible ? h("button", { class: "icon-btn", "aria-label": "Close", onclick: () => close(undefined) }, icon("x")) : null),
      body);
    const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay && dismissible) close(undefined); } }, panel);
    build(body, close);
    document.body.append(overlay);
    document.body.classList.add("noscroll");
    overlay.querySelector("input,select,textarea,button.primary")?.focus?.();
  });
}

export function confirmDialog(title, message, { ok = "OK", danger = false, cancel = "Cancel" } = {}) {
  return sheet(title, (body, close) => {
    body.append(h("p", { class: "pre" }, message),
      h("div", { class: "row end" },
        h("button", { class: "btn", onclick: () => close(false) }, cancel),
        h("button", { class: `btn ${danger ? "danger" : "primary"}`, onclick: () => close(true) }, ok)));
  }).then((v) => v === true);
}

export function messageDialog(title, message) {
  return sheet(title, (body, close) => {
    body.append(h("p", { class: "pre" }, message), h("div", { class: "row end" }, h("button", { class: "btn primary", onclick: () => close(true) }, "OK")));
  });
}
