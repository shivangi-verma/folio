// components.js — shared stock-card rendering used by Home (watchlist) and Picks (recs)

import { inr, num, fmtMarketCap, escapeHtml } from "./ui.js";
import { riskBandFromQuote } from "./engine.js";

export function riskBadge(quote) {
  const band = riskBandFromQuote(quote);
  const cls = ["risk-low", "risk-med", "risk-high"][band - 1];
  const label = quote.labels?.risk?.title || ["Low risk", "Medium risk", "High risk"][band - 1];
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

export function priceHTML(quote) {
  const p = quote.price || {};
  const change = p.change || 0, pct = p.dyChange || 0, pos = change >= 0;
  return `
    <div class="price">${inr(p.price)}</div>
    <div class="change ${pos ? "pos" : "neg"}">
      <i class="ph ph-caret-${pos ? "up" : "down"}"></i>${num(Math.abs(change))} (${num(Math.abs(pct))}%)
    </div>`;
}

export function statsHTML(quote) {
  const r = quote.ratios || {}, p = quote.price || {};
  const row = (k, v) => `<div class="srow"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  return `
    ${row("Market cap", fmtMarketCap(r.marketCap))}
    ${row("P / E", num(r.pe))}
    ${row("EPS", inr(r.eps))}
    ${row("52W high", inr(r["52wHigh"]))}
    ${row("52W low", inr(r["52wLow"]))}
    ${row("Day range", `${inr(p.l)}–${inr(p.h)}`)}`;
}

/** Watchlist card (draggable, expandable). */
export function watchCardHTML(symbol, quote) {
  if (!quote || !quote.price) {
    return `<div class="card stock-card skeleton" data-ticker="${symbol}" style="cursor:default">
      <div class="stock-top"><div><div class="stock-name">${symbol}</div>
      <div class="skeleton-line" style="width:90px;height:11px;margin-top:7px"></div></div>
      <div class="skeleton-line" style="width:70px;height:16px"></div></div></div>`;
  }
  return `
    <div class="card stock-card" data-ticker="${symbol}">
      <div class="stock-top">
        <div>
          <div class="stock-name">${escapeHtml(quote.info?.name || symbol)}
            <a class="ext" href="https://www.tradingview.com/chart/?symbol=NSE:${symbol}" target="_blank" rel="noopener" title="Open chart"><i class="ph-fill ph-arrow-square-out"></i></a>
          </div>
          <div class="stock-meta"><span class="tk">${symbol}</span><span>·</span><span>${escapeHtml(quote.gic?.sector || "—")}</span>${riskBadge(quote)}</div>
        </div>
        <div class="stock-price">${priceHTML(quote)}</div>
      </div>
      <div class="stock-stats">${statsHTML(quote)}</div>
    </div>`;
}

/** Recommendation card with fit score, rationale, add-to-watchlist. */
export function recCardHTML(item, why, watched) {
  const { symbol, quote, score } = item;
  return `
    <div class="card stock-card" data-ticker="${symbol}" data-rec="1">
      <div class="stock-top">
        <div>
          <div class="stock-name">${escapeHtml(quote.info?.name || symbol)}
            <a class="ext" href="https://www.tradingview.com/chart/?symbol=NSE:${symbol}" target="_blank" rel="noopener" title="Open chart"><i class="ph-fill ph-arrow-square-out"></i></a>
          </div>
          <div class="stock-meta"><span class="tk">${symbol}</span><span>·</span><span>${escapeHtml(quote.gic?.sector || "—")}</span>${riskBadge(quote)}</div>
        </div>
        <div class="rec-score">
          <span class="score-pill" title="Folio fit score">${score.fit} fit</span>
          ${priceHTML(quote)}
        </div>
      </div>
      <div class="rec-why"><i class="ph ph-sparkle"></i><span>${escapeHtml(why)}</span></div>
      <div class="stock-stats">${statsHTML(quote)}</div>
      <div class="row between" style="margin-top:14px">
        <button class="add-btn ${watched ? "added" : ""}" data-add="${symbol}">
          <i class="ph ph-${watched ? "check" : "bookmark-simple"}"></i> ${watched ? "Bookmarked" : "Add to watchlist"}
        </button>
        <span class="help" style="margin:0">Educational · not advice</span>
      </div>
    </div>`;
}

/** Toggle the collapsible stats panel on a card. */
export function wireCardExpand(container) {
  container.addEventListener("click", (e) => {
    const card = e.target.closest(".stock-card");
    if (!card) return;
    if (e.target.closest("a, button")) return;          // links/buttons handled elsewhere
    if (container.dataset.dragging === "1") return;
    if (window.getSelection().toString()) return;
    card.querySelector(".stock-stats")?.classList.toggle("open");
  });
}
