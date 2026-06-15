// server.js — local dev server: serves the static app AND the /api/advise route,
// so the Gemini-powered narration works locally just like it will on Vercel.
// Run: npm start   (reads the key from .env.local)

const http = require("http");
const fs = require("fs");
const path = require("path");

try { process.loadEnvFile(path.join(__dirname, ".env.local")); } catch { /* no .env.local — AI stays off */ }
const { advise } = require("./api/_gemini.js");

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};
const send = (res, code, body, headers = {}) => { res.writeHead(code, headers); res.end(body); };
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/api/advise") {
    if (req.method === "OPTIONS") return send(res, 204, "", { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", async () => {
      try {
        const { kind, facts } = JSON.parse(data || "{}");
        if (!facts) return json(res, 400, { error: "Missing facts" });
        const out = await advise({ kind, facts });
        json(res, 200, out);
      } catch (e) { json(res, 500, { error: String(e.message || e) }); }
    });
    return;
  }

  let p = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.join(ROOT, path.normalize(p));
  if (!filePath.startsWith(ROOT)) return send(res, 403, "Forbidden");
  fs.readFile(filePath, (err, content) => {
    if (err) return send(res, 404, "Not found");
    send(res, 200, content, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
  });
});

server.listen(PORT, () => {
  console.log(`Folio dev server: https://folio-mca.vercel.app/`);
  console.log(`AI advice: ${process.env.GEMINI_API_KEY ? "enabled (" + (process.env.GEMINI_MODEL || "gemini-flash-lite-latest") + ")" : "disabled — add GEMINI_API_KEY to .env.local"}`);
});
