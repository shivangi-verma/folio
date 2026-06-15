// main.js — bootstrap, hash router, auth gating, top-nav + modal wiring

import { $, $$, escapeHtml, showToast } from "./ui.js";
import {
  loadState, state, isOnboarded, setTheme, addToWatchlist, removeFromWatchlist, isWatched,
  setOnChange, snapshot, hydrate, clearUser,
} from "./store.js";
import { initSymbols, searchSymbols, refreshSymbols, symbolsStatusText, dropCachedQuote } from "./quotes.js";
import { initSupabase, isAuthEnabled, onAuth, getSession, pullState, pushState } from "./supabase.js";
import { renderOnboarding } from "./views/onboarding.js";
import { renderHome } from "./views/home.js";
import { renderPicks } from "./views/picks.js";
import { renderBlueprint } from "./views/blueprint.js";
import { renderPaper } from "./views/paper.js";
import { renderLearn, renderLesson } from "./views/learn.js";
import { renderAuth } from "./views/auth.js";
import { renderAccount } from "./views/account.js";

let currentRoute = "home";
let watchlistDirty = false;
let authUser = null;
let syncTimer = null;

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("#themeBtn").innerHTML = `<i class="ph ph-${theme === "light" ? "moon" : "sun"}" style="font-size:19px"></i>`;
}

/* ---------- Auth + cloud sync ---------- */
async function setupAuth() {
  const client = await initSupabase();
  if (!client) return; // local mode — app behaves exactly as before
  setOnChange(scheduleSync);
  onAuth(async (session) => {
    const prev = authUser;
    authUser = session?.user || null;
    if (authUser && (!prev || prev.id !== authUser.id)) await syncDown(authUser);
    route();
  });
  const session = await getSession();
  authUser = session?.user || null;
  if (authUser) await syncDown(authUser);
}

async function syncDown(user) {
  try {
    const remote = await pullState(user.id);
    if (remote && remote.profile) hydrate(remote);
    else if (state.profile) await pushState(user.id, { ...snapshot(), email: user.email });
  } catch (e) { console.error("Sync down failed", e); }
}

function scheduleSync() {
  if (!authUser) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try { await pushState(authUser.id, { ...snapshot(), email: authUser.email }); }
    catch (e) { console.error("Sync up failed", e); }
  }, 800);
}

/* ---------- Router ---------- */
function setChrome(minimal) {
  ["#navLinks", "#bottomNav", "#searchBtn", "#manageBtn"].forEach((sel) => $(sel)?.classList.toggle("hidden", minimal));
}
function setActive(route) {
  const target = "#/" + (route === "lesson" ? "learn" : route);
  $$(".nav-link, .bn-link").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === target));
}

function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [seg, sub] = hash.split("/");
  let r = seg || "home";
  const outlet = $("#view");

  // Gate everything behind sign-in when auth is configured.
  if (isAuthEnabled() && !authUser) {
    currentRoute = "auth";
    setChrome(true);
    $("#accountBtn")?.classList.add("hidden");
    setActive("");
    renderAuth(outlet);
    return;
  }

  if (!isOnboarded() && r !== "onboarding") r = "onboarding";
  const minimal = r === "onboarding";
  setChrome(minimal);
  $("#accountBtn")?.classList.toggle("hidden", !(isAuthEnabled() && authUser) || minimal);
  currentRoute = r;
  window.scrollTo(0, 0);
  setActive(r);

  switch (r) {
    case "onboarding": renderOnboarding(outlet); break;
    case "picks": renderPicks(outlet); break;
    case "blueprint": renderBlueprint(outlet); break;
    case "paper": renderPaper(outlet); break;
    case "learn": renderLearn(outlet); break;
    case "lesson": renderLesson(outlet, { id: sub }); break;
    case "account": renderAccount(outlet); break;
    case "home": default: renderHome(outlet); break;
  }
}

function refreshIfHome() { if (currentRoute === "home") route(); }

/* ---------- Spotlight search ---------- */
let spotIndex = -1;
function openSpotlight() {
  const ov = $("#spotlightOverlay"), input = $("#spotlightInput");
  ov.classList.add("active");
  input.value = "";
  renderSpot(searchSymbols(""));
  spotIndex = -1;
  setTimeout(() => input.focus(), 30);
}
function renderSpot(matches) {
  const ul = $("#spotlightResults");
  if (!matches.length) { ul.innerHTML = `<li style="padding:18px;text-align:center;color:var(--text-3)">No results</li>`; return; }
  ul.innerHTML = matches.map((m) => {
    const w = isWatched(m.symbol);
    return `<li class="result-item" data-symbol="${m.symbol}">
      <div><div class="result-sym">${m.symbol}</div><div class="result-name">${escapeHtml(m.name)}</div></div>
      <i class="ph ph-${w ? "check" : "plus"}" style="${w ? "color:var(--accent)" : "color:var(--text-3)"}"></i></li>`;
  }).join("");
}
function addFromSpot(li) {
  const sym = li.dataset.symbol;
  if (addToWatchlist(sym)) {
    const ic = li.querySelector("i"); ic.className = "ph ph-check"; ic.style.color = "var(--accent)";
    watchlistDirty = true; showToast(`Added ${sym}`, "success");
  } else { showToast(`${sym} already bookmarked`, "warning"); }
}

/* ---------- Manage watchlist ---------- */
function openManage() {
  $("#manageOverlay").classList.add("active");
  renderManageList();
  symbolsStatusText().then((t) => { const e = $("#symbolsStatus"); if (e) e.textContent = t; });
}
function renderManageList() {
  const wrap = $("#manageList");
  if (!state.watchlist.length) { wrap.innerHTML = `<p class="help">Your watchlist is empty.</p>`; return; }
  wrap.innerHTML = state.watchlist.map((s) =>
    `<div class="manage-item"><span class="mono" style="font-weight:500">${s}</span>
     <button class="del-btn" data-del="${s}" aria-label="Remove ${s}"><i class="ph ph-trash"></i></button></div>`).join("");
}
function closeOverlays() {
  $("#spotlightOverlay").classList.remove("active");
  $("#manageOverlay").classList.remove("active");
  if (watchlistDirty) { watchlistDirty = false; refreshIfHome(); }
}

/* ---------- Wiring ---------- */
function wire() {
  $("#searchBtn").addEventListener("click", openSpotlight);
  $("#manageBtn").addEventListener("click", openManage);
  $("#closeManage").addEventListener("click", closeOverlays);
  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    setTheme(next); applyTheme(next);
  });

  $("#spotlightOverlay").addEventListener("click", (e) => { if (e.target.id === "spotlightOverlay") closeOverlays(); });
  $("#manageOverlay").addEventListener("click", (e) => { if (e.target.id === "manageOverlay") closeOverlays(); });

  const input = $("#spotlightInput");
  input.addEventListener("input", () => { renderSpot(searchSymbols(input.value)); spotIndex = -1; });
  input.addEventListener("keydown", (e) => {
    const items = $$("#spotlightResults .result-item");
    if (!items.length) return;
    if (e.key === "ArrowDown") { spotIndex = Math.min(spotIndex + 1, items.length - 1); paintSel(items); e.preventDefault(); }
    else if (e.key === "ArrowUp") { spotIndex = Math.max(spotIndex - 1, 0); paintSel(items); e.preventDefault(); }
    else if (e.key === "Enter") { e.preventDefault(); (items[spotIndex] || items[0]).click(); }
  });
  $("#spotlightResults").addEventListener("click", (e) => { const li = e.target.closest(".result-item"); if (li) addFromSpot(li); });

  $("#manageList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del]"); if (!btn) return;
    const sym = btn.dataset.del;
    removeFromWatchlist(sym); dropCachedQuote(sym);
    watchlistDirty = true; renderManageList();
    showToast(`Removed ${sym}`, "info");
  });
  $("#refreshSymbols").addEventListener("click", async () => {
    const e = $("#symbolsStatus"); if (e) e.textContent = "Updating symbols…";
    const res = await refreshSymbols(true);
    if (e) e.textContent = await symbolsStatusText();
    showToast(res.ok ? `Updated ${res.count} symbols` : "Refresh failed", res.ok ? "success" : "error");
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); if (!(isAuthEnabled() && !authUser)) openSpotlight(); }
    if (e.key === "Escape") closeOverlays();
  });

  window.addEventListener("hashchange", route);
}
function paintSel(items) {
  items.forEach((it, i) => it.classList.toggle("selected", i === spotIndex));
  items[spotIndex]?.scrollIntoView({ block: "nearest" });
}

/* ---------- Boot ---------- */
async function boot() {
  loadState();
  applyTheme(state.settings.theme || "dark");
  wire();
  await setupAuth();
  route();
  initSymbols().then(() => { if (currentRoute === "picks") route(); }).catch((e) => console.error(e));
}

boot();
