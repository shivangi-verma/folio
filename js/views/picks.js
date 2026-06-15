// views/picks.js — rules-based recommendations, banded into tiers, with rationale

import { $, $$, showToast } from "../ui.js";
import { state, addToWatchlist, isWatched } from "../store.js";
import { fetchQuotes } from "../quotes.js";
import { UNIVERSE } from "../data.js";
import { recommend } from "../engine.js";
import { rationale } from "../advisor.js";
import { recCardHTML, wireCardExpand } from "../components.js";

export function renderPicks(outlet) {
  const p = state.profile;
  outlet.innerHTML = `
    <div class="reveal">
      <div class="page-head">
        <div class="eyebrow">Ideas, not orders</div>
        <h1 class="page-title">Picks for a <b>${p?.archetype || "balanced"}</b></h1>
        <p class="page-sub">Ranked from a curated large-cap universe by past performance, quality and how well each fits your risk profile.</p>
      </div>
      <div id="picksBody">${skeletonTiers()}</div>
      <p class="disclaimer">
        Scores blend momentum, valuation, size and risk-fit from live market data. Deeper multi-year return history connects via the data layer.
        <b>This is educational, not a buy/sell recommendation.</b> Always do your own research.
      </p>
    </div>`;

  load(outlet);
}

function skeletonTiers() {
  const card = `<div class="card stock-card skeleton" style="cursor:default"><div class="stock-top"><div><div class="skeleton-line" style="width:140px;height:15px"></div><div class="skeleton-line" style="width:90px;height:11px;margin-top:8px"></div></div><div class="skeleton-line" style="width:64px;height:16px"></div></div></div>`;
  return `<div class="tier"><div class="skeleton-line" style="width:160px;height:14px;margin-bottom:12px"></div><div class="grid" style="gap:10px">${card}${card}${card}</div></div>`;
}

async function load(outlet) {
  const body = $("#picksBody");
  let quotes;
  try {
    quotes = await fetchQuotes(UNIVERSE);
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="empty"><i class="ph ph-cloud-warning"></i><h3>Couldn't load market data</h3><p>Check your connection and try again.</p></div>`;
    return;
  }

  if (!Object.keys(quotes).length) {
    body.innerHTML = `<div class="empty"><i class="ph ph-cloud-warning"></i><h3>No market data right now</h3><p>The quote service didn't respond. Please retry in a bit.</p></div>`;
    return;
  }

  const { tiers } = recommend(quotes, state.profile, { perTier: 5 });
  body.innerHTML = tiers.map((t) => `
    <div class="tier">
      <div class="tier-head">
        <div class="tier-title"><i class="ph ${t.icon}"></i> ${t.title}</div>
        <div class="tier-sub">${t.sub}</div>
      </div>
      <div class="grid" style="gap:10px">
        ${t.stocks.map((it) => recCardHTML(it, rationale(it, state.profile), isWatched(it.symbol))).join("")}
      </div>
    </div>`).join("");

  wireCardExpand(body);
  body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    const sym = btn.dataset.add;
    if (addToWatchlist(sym)) {
      btn.classList.add("added");
      btn.innerHTML = `<i class="ph ph-check"></i> Bookmarked`;
      showToast(`Added ${sym} to watchlist`, "success");
    } else {
      showToast(`${sym} is already bookmarked`, "warning");
    }
  });
}
