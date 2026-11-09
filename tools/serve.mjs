// Minimal static server for trying the app in a browser:  npm run serve  ->  http://localhost:8080
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "www");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };
const port = Number(process.env.PORT) || 8080;
http.createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  try { const data = await readFile(join(root, p)); res.writeHead(200, { "Content-Type": types[extname(p)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(data); }
  catch { res.writeHead(404); res.end("Not found"); }
}).listen(port, () => console.log(`Ordkort running at http://localhost:${port}`));
