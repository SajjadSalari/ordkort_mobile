// Small inline-SVG charts (no libraries).
import { h } from "./dom.js";

const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const shortDay = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

export function ring(pct, label) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  const svg = s("svg", { viewBox: "0 0 130 130", class: "ring", role: "img", "aria-label": `${label}: ${Math.round(v)} percent` });
  svg.append(s("circle", { cx: 65, cy: 65, r, class: "ring-bg", fill: "none", "stroke-width": 12 }),
    s("circle", { cx: 65, cy: 65, r, class: "ring-fg", fill: "none", "stroke-width": 12, "stroke-linecap": "round",
      "stroke-dasharray": `${(c * v) / 100} ${c}`, transform: "rotate(-90 65 65)" }));
  const t = s("text", { x: 65, y: 70, "text-anchor": "middle", class: "ring-text" }); t.textContent = `${Math.round(v)}%`;
  svg.append(t);
  return svg;
}

export function stackedBars(data, { height = 150 } = {}) {   // data: [{day, know, practice}]
  const W = 320, H = height, pad = { l: 26, r: 4, t: 8, b: 20 };
  const max = Math.max(4, ...data.map((d) => d.know + d.practice));
  const bw = (W - pad.l - pad.r) / data.length, ih = H - pad.t - pad.b;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Reviews per day" });
  for (const f of [0, 0.5, 1]) {
    const y = pad.t + ih * (1 - f);
    svg.append(s("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: "grid" }));
    const t = s("text", { x: pad.l - 4, y: y + 3, "text-anchor": "end", class: "axis" }); t.textContent = Math.round(max * f); svg.append(t);
  }
  const every = Math.ceil(data.length / 7);
  data.forEach((d, i) => {
    const x = pad.l + i * bw + bw * 0.15, w = bw * 0.7;
    const hk = (d.know / max) * ih, hp = (d.practice / max) * ih;
    svg.append(s("rect", { x, y: pad.t + ih - hk, width: w, height: hk, class: "bar-know", rx: 2 }),
      s("rect", { x, y: pad.t + ih - hk - hp, width: w, height: hp, class: "bar-practice", rx: 2 }));
    if ((data.length - 1 - i) % every === 0) {
      const t = s("text", { x: x + w / 2, y: H - 5, "text-anchor": "middle", class: "axis" }); t.textContent = shortDay(d.day); svg.append(t);
    }
  });
  return svg;
}

export function lineChart(data, { height = 150 } = {}) {      // data: [{day, known}]
  const W = 320, H = height, pad = { l: 26, r: 8, t: 10, b: 20 };
  const max = Math.max(4, ...data.map((d) => d.known)), ih = H - pad.t - pad.b, iw = W - pad.l - pad.r;
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : (i * iw) / (data.length - 1)), y = (v) => pad.t + ih * (1 - v / max);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Known words over time" });
  for (const f of [0, 0.5, 1]) {
    const yy = pad.t + ih * (1 - f);
    svg.append(s("line", { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: "grid" }));
    const t = s("text", { x: pad.l - 4, y: yy + 3, "text-anchor": "end", class: "axis" }); t.textContent = Math.round(max * f); svg.append(t);
  }
  const pts = data.map((d, i) => `${x(i)},${y(d.known)}`).join(" ");
  svg.append(s("polygon", { points: `${x(0)},${pad.t + ih} ${pts} ${x(data.length - 1)},${pad.t + ih}`, class: "area" }),
    s("polyline", { points: pts, class: "line", fill: "none", "stroke-width": 2.5, "stroke-linejoin": "round" }));
  const every = Math.ceil(data.length / 6);
  data.forEach((d, i) => {
    if ((data.length - 1 - i) % every === 0) {
      const t = s("text", { x: x(i), y: H - 5, "text-anchor": "middle", class: "axis" }); t.textContent = shortDay(d.day); svg.append(t);
    }
  });
  return svg;
}

export function segmentBar(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return h("div", { class: "segbar", role: "img", "aria-label": "Progress by status" },
    ["known", "learning", "practice", "new"].map((k) => h("span", { class: `seg seg-${k}`, style: { width: `${(100 * counts[k]) / total}%` } })));
}
