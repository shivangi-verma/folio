// quotes.js — live quote fetching (Cloudflare Worker proxy) + symbol directory/search

const WORKER_URL = "https://folio.devsim.workers.dev/";
const SYMBOL_MASTER_URL = "https://public.fyers.in/sym_details/NSE_CM_sym_master.json";
const QUOTE_TTL = 10 * 60 * 1000;        // 10 min
const SYMBOL_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHUNK = 4;     // worker rate-limits large batches — keep requests small
const CONC = 2;      // chunks in flight at once
const RETRIES = 3;   // re-attempt symbols the worker dropped

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let masterData = {};
let searchIndex = [];

/* ---------- Symbol directory ---------- */

export async function initSymbols() {
  let source = "bundled";
  let idb = null;
  try {
    if (typeof SymbolDB !== "undefined") idb = await SymbolDB.getSymbols("NSE");
  } catch (e) { console.warn("IndexedDB unavailable:", e); }

  if (idb?.data) {
    masterData = idb.data;
    source = "indexeddb";
    if (Date.now() - idb.timestamp > SYMBOL_TTL) refreshSymbols(false);
  } else {
    try {
      const res = await fetch("./NSE_CM_sym_master.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      masterData = await res.json();
      if (typeof SymbolDB !== "undefined") SymbolDB.saveSymbols("NSE", masterData).catch(() => {});
      refreshSymbols(false);
    } catch (e) {
      console.error("Failed to load symbol master", e);
      masterData = {};
    }
  }
  buildIndex();
  console.log(`Symbols: ${searchIndex.length} EQ stocks from ${source}`);
  return searchIndex.length;
}

function buildIndex() {
  searchIndex = Object.values(masterData)
    .filter((v) => v.exSeries === "EQ" || v.exSeries === "RR")
    .map((v) => ({
      symbol: v.exSymbol,
      name: v.exSymName,
      search: (v.exSymbol + " " + v.exSymName).toUpperCase(),
    }));
}

export function searchSymbols(query, limit = 20) {
  const q = query.trim().toUpperCase();
  if (!q) return popularSymbols();
  const out = [];
  for (const item of searchIndex) {
    if (item.search.includes(q)) {
      out.push(item);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function popularSymbols() {
  const pop = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "TATAMOTORS", "LT"];
  return pop.map((s) => searchIndex.find((i) => i.symbol === s)).filter(Boolean);
}

export function symbolName(sym) {
  return searchIndex.find((i) => i.symbol === sym)?.name || sym;
}

export async function refreshSymbols(manual = true) {
  try {
    const res = await fetch(SYMBOL_MASTER_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    masterData = await res.json();
    if (typeof SymbolDB !== "undefined") {
      try { await SymbolDB.saveSymbols("NSE", masterData); } catch {}
    }
    buildIndex();
    return { ok: true, count: searchIndex.length };
  } catch (e) {
    console.error("Symbol refresh failed", e);
    return { ok: false };
  }
}

export async function symbolsStatusText() {
  let ts = null;
  try { if (typeof SymbolDB !== "undefined") ts = await SymbolDB.getLastUpdated("NSE"); } catch {}
  const count = searchIndex.length;
  if (!ts) return count ? `${count} symbols · bundled` : "Using bundled data";
  const age = Date.now() - ts;
  const h = Math.floor(age / 3.6e6), d = Math.floor(h / 24);
  const when = d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : "just now";
  return `${count} symbols · updated ${when}`;
}

/* ---------- Quotes ---------- */

function cacheKey(t) { return `folio.q.${t}`; }

export function readCachedQuote(ticker) {
  try {
    const raw = localStorage.getItem(cacheKey(ticker));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return { data, ts, stale: Date.now() - ts > QUOTE_TTL };
  } catch { return null; }
}

function writeCache(ticker, data) {
  try { localStorage.setItem(cacheKey(ticker), JSON.stringify({ data, ts: Date.now() })); } catch {}
}

export function dropCachedQuote(ticker) {
  try { localStorage.removeItem(cacheKey(ticker)); } catch {}
}

async function fetchChunk(tickers) {
  const param = tickers.map(encodeURIComponent).join(",");
  const res = await fetch(`${WORKER_URL}?stock=${param}`);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Fetch quotes for many tickers. Returns a map { TICKER: quote }.
 * Uses cache unless force=true; only network-fetches stale/missing ones.
 */
export async function fetchQuotes(tickers, { force = false } = {}) {
  const result = {};
  let need = [];
  for (const t of tickers) {
    const c = readCachedQuote(t);
    if (c && !c.stale && !force) result[t] = c.data;
    else need.push(t);
  }

  // Small chunks, limited concurrency, with retry rounds for dropped symbols.
  for (let attempt = 0; attempt < RETRIES && need.length; attempt++) {
    const chunks = [];
    for (let i = 0; i < need.length; i += CHUNK) chunks.push(need.slice(i, i + CHUNK));
    for (let i = 0; i < chunks.length; i += CONC) {
      const settled = await Promise.allSettled(chunks.slice(i, i + CONC).map(fetchChunk));
      for (const s of settled) {
        if (s.status !== "fulfilled") continue;
        for (const [t, info] of Object.entries(s.value)) {
          if (info && !info.error) { result[t] = info; writeCache(t, info); }
        }
      }
      await sleep(140);
    }
    need = need.filter((t) => !result[t]);
    if (need.length) await sleep(350 * (attempt + 1));
  }

  // Fall back to any stale cache for tickers still missing.
  for (const t of need) { const c = readCachedQuote(t); if (c) result[t] = c.data; }
  return result;
}

export async function fetchQuote(ticker, opts) {
  const map = await fetchQuotes([ticker], opts);
  return map[ticker] || null;
}
