// store.js — in-memory app state with localStorage persistence (+ optional cloud sync hook)

const KEYS = {
  profile: "folio.profile",
  goal: "folio.goal",
  watchlist: "folio.watchlist",
  paper: "folio.paper",
  settings: "folio.settings",
};

export const PAPER_START = 1_000_000; // ₹10,00,000 virtual cash

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn("persist failed", key, e); }
}

export const state = {
  profile: null,
  goal: null,
  watchlist: [],
  paper: { cash: PAPER_START, holdings: [], trades: [] },
  settings: { theme: "dark", onboarded: false },
};

// Optional listener (set by the cloud-sync layer). Called after any data change.
let onChange = null;
export function setOnChange(fn) { onChange = fn; }
function touch() { if (onChange) onChange(); }

export function loadState() {
  state.profile = read(KEYS.profile, null);
  state.goal = read(KEYS.goal, null);
  state.settings = { theme: "dark", onboarded: false, ...read(KEYS.settings, {}) };
  state.paper = { cash: PAPER_START, holdings: [], trades: [], ...read(KEYS.paper, {}) };

  let wl = read(KEYS.watchlist, null);
  if (!wl) {
    const legacy = read("userStockList", null);
    wl = Array.isArray(legacy) ? legacy : [];
    if (wl.length) write(KEYS.watchlist, wl);
  }
  state.watchlist = wl;
}

/* ---------- Profile + goal ---------- */
export function setProfile(profile) {
  state.profile = { ...profile, createdAt: profile.createdAt || Date.now() };
  write(KEYS.profile, state.profile); touch();
}
export function setGoal(goal) { state.goal = goal; write(KEYS.goal, goal); touch(); }
export function isOnboarded() { return !!(state.settings.onboarded && state.profile); }
export function completeOnboarding() { state.settings.onboarded = true; write(KEYS.settings, state.settings); touch(); }

/* ---------- Settings ---------- */
export function setTheme(theme) { state.settings.theme = theme; write(KEYS.settings, state.settings); }

/* ---------- Watchlist (bookmarks) ---------- */
export function isWatched(sym) { return state.watchlist.includes(sym); }
export function addToWatchlist(sym) {
  if (state.watchlist.includes(sym)) return false;
  state.watchlist.push(sym); write(KEYS.watchlist, state.watchlist); touch(); return true;
}
export function removeFromWatchlist(sym) {
  state.watchlist = state.watchlist.filter((s) => s !== sym);
  write(KEYS.watchlist, state.watchlist); touch();
}
export function setWatchlist(list) { state.watchlist = list; write(KEYS.watchlist, state.watchlist); touch(); }

/* ---------- Paper trading ---------- */
function savePaper() { write(KEYS.paper, state.paper); touch(); }
export function paperBuy(symbol, name, price, qty) {
  const cost = price * qty;
  if (cost > state.paper.cash) return { ok: false, error: "Not enough virtual cash" };
  const h = state.paper.holdings.find((x) => x.symbol === symbol);
  if (h) { const total = h.qty * h.avgPrice + cost; h.qty += qty; h.avgPrice = total / h.qty; }
  else { state.paper.holdings.push({ symbol, name, qty, avgPrice: price }); }
  state.paper.cash -= cost;
  state.paper.trades.unshift({ type: "buy", symbol, qty, price, ts: Date.now() });
  savePaper(); return { ok: true };
}
export function paperSell(symbol, price, qty) {
  const h = state.paper.holdings.find((x) => x.symbol === symbol);
  if (!h || h.qty < qty) return { ok: false, error: "Not enough shares" };
  h.qty -= qty; state.paper.cash += price * qty;
  if (h.qty <= 0) state.paper.holdings = state.paper.holdings.filter((x) => x.symbol !== symbol);
  state.paper.trades.unshift({ type: "sell", symbol, qty, price, ts: Date.now() });
  savePaper(); return { ok: true };
}
export function resetPaper() { state.paper = { cash: PAPER_START, holdings: [], trades: [] }; savePaper(); }

/* ---------- Cloud sync helpers ---------- */
// Snapshot of everything that should sync to the signed-in account.
export function snapshot() {
  return { profile: state.profile, goal: state.goal, watchlist: state.watchlist, paper: state.paper, onboarded: state.settings.onboarded };
}
// Load a snapshot pulled from the account into memory and local storage.
export function hydrate(p) {
  if (!p) return;
  state.profile = p.profile || null;
  state.goal = p.goal || null;
  state.watchlist = Array.isArray(p.watchlist) ? p.watchlist : [];
  state.paper = { cash: PAPER_START, holdings: [], trades: [], ...(p.paper || {}) };
  state.settings.onboarded = !!p.onboarded;
  write(KEYS.profile, state.profile); write(KEYS.goal, state.goal);
  write(KEYS.watchlist, state.watchlist); write(KEYS.paper, state.paper); write(KEYS.settings, state.settings);
}
// Clear the current user's data on sign-out (keep theme preference).
export function clearUser() {
  state.profile = null; state.goal = null; state.watchlist = [];
  state.paper = { cash: PAPER_START, holdings: [], trades: [] };
  state.settings.onboarded = false;
  [KEYS.profile, KEYS.goal, KEYS.watchlist, KEYS.paper].forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  write(KEYS.settings, state.settings);
}
