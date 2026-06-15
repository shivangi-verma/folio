// views/home.js — dashboard: goal progress + watchlist (bookmarks) + explore

import { $, $$, showToast, inrCompact, inr } from "../ui.js";
import { state, setWatchlist } from "../store.js";
import { fetchQuotes } from "../quotes.js";
import { watchCardHTML, wireCardExpand } from "../components.js";
import { buildRealityCheck } from "../engine.js";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function renderHome(outlet) {
  const p = state.profile, g = state.goal;
  outlet.innerHTML = `
    <div class="stagger">
      <div class="page-head row between wrap" style="gap:12px">
        <div>
          <div class="eyebrow">${greeting()}</div>
          <h1 class="page-title">Your <b>journey</b></h1>
        </div>
        <span class="badge badge-accent" style="padding:7px 13px"><i class="ph ph-seal-check"></i> ${p?.archetype || "Investor"}</span>
      </div>

      ${g ? goalCard(g) : ""}

      <div class="row between" style="margin:6px 0 2px">
        <div><div class="section-title">Watchlist</div><div class="help" style="margin:2px 0 0">Stocks you've bookmarked to track</div></div>
        <button class="btn btn-secondary btn-sm" id="addWatch"><i class="ph ph-plus"></i> Add</button>
      </div>
      <div id="watchList" class="grid" style="gap:10px"></div>

      <div class="section-title" style="margin:22px 0 2px">Explore</div>
      <div class="grid grid-2">
        ${exploreCard("picks", "ph-sparkle", "Get stock ideas", "Past-performance picks matched to your profile")}
        ${exploreCard("blueprint", "ph-compass", "Wealth blueprint", "Your personalized plan and tips")}
        ${exploreCard("paper", "ph-wallet", "Paper trade", "Practice with ₹10L virtual cash")}
        ${exploreCard("learn", "ph-graduation-cap", "Learn", "Bite-sized investing lessons")}
      </div>

      <p class="disclaimer">
        <b>Folio is an educational recommendation engine.</b> It surfaces ideas based on past performance, helps you plan, and lets you practice.
        It does <b>not</b> execute trades, give personalized financial advice, or replace a SEBI-registered adviser or your broker. Past performance never guarantees future results.
      </p>
    </div>`;

  $("#addWatch")?.addEventListener("click", () => $("#searchBtn")?.click());
  loadWatchlist();
}

function goalCard(g) {
  const r = buildRealityCheck({ initial: state.profile?.savings || 0, monthly: g.monthlyContribution || 0, targetAmount: g.targetAmount, targetYear: g.targetYear });
  const pctToGoal = Math.min(100, Math.round((r.realisticValue / g.targetAmount) * 100));
  const tone = r.feasibility.tone === "bad" ? "neg" : r.feasibility.tone === "warn" ? "warn" : "pos";
  return `
    <div class="card card-pad glow-box" style="margin-bottom:18px">
      <div class="row between wrap" style="gap:10px;align-items:flex-start">
        <div>
          <div class="eyebrow">Your goal</div>
          <div class="serif" style="font-size:23px;margin-top:3px">${g.label || "Wealth goal"}</div>
          <div class="help" style="margin:4px 0 0">${inrCompact(g.targetAmount)} by ${g.targetYear} · invest ${inr(g.monthlyContribution, 0)}/mo</div>
        </div>
        <span class="badge badge-${tone}">${r.feasibility.label} · needs ${r.requiredPct.toFixed(1)}%/yr</span>
      </div>
      <div style="margin-top:18px">
        <div class="row between" style="font-size:12px;margin-bottom:7px">
          <span class="muted">On a realistic ${r.expectedRate}% path</span>
          <span class="mono">${inrCompact(r.realisticValue)} <span class="dim">/ ${inrCompact(g.targetAmount)}</span></span>
        </div>
        <div class="progress" style="height:8px"><div class="progress-fill" style="width:${pctToGoal}%"></div></div>
      </div>
      <div class="row" style="margin-top:16px;gap:8px">
        <a class="btn btn-primary btn-sm" href="blueprint" data-link><i class="ph ph-compass"></i> See my plan</a>
        <a class="btn btn-ghost btn-sm" href="onboarding" data-link>Adjust goal</a>
      </div>
    </div>`;
}

function exploreCard(href, icon, title, desc) {
  return `
    <a class="card card-pad card-link" href="${href}" data-link style="display:block">
      <div class="tip-ic" style="width:40px;height:40px;border-radius:12px;font-size:20px"><i class="ph ${icon}"></i></div>
      <div style="font-weight:600;margin-top:12px">${title}</div>
      <div class="help" style="margin:3px 0 0">${desc}</div>
    </a>`;
}

async function loadWatchlist() {
  const list = $("#watchList");
  if (!list) return;
  if (!state.watchlist.length) {
    list.innerHTML = `<div class="empty"><i class="ph ph-bookmark-simple"></i><h3>No bookmarks yet</h3><p>Search for a stock or grab an idea from Picks to start your watchlist.</p></div>`;
    return;
  }
  list.innerHTML = state.watchlist.map((s) => watchCardHTML(s, null)).join("");
  const quotes = await fetchQuotes(state.watchlist);
  // re-render in saved order with data
  list.innerHTML = state.watchlist.map((s) => watchCardHTML(s, quotes[s])).join("");
  wireCardExpand(list);
  initSortable(list);
}

function initSortable(list) {
  if (typeof window.Sortable === "undefined") return;
  window.Sortable.create(list, {
    animation: 180, delay: 140, delayOnTouchOnly: true,
    filter: ".skeleton, a, .ext", draggable: ".stock-card",
    ghostClass: "sortable-ghost",
    onStart: () => { list.dataset.dragging = "1"; },
    onEnd: () => {
      setWatchlist($$(".stock-card[data-ticker]", list).map((e) => e.dataset.ticker));
      setTimeout(() => { list.dataset.dragging = "0"; }, 40);
    },
  });
}
