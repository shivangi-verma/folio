// views/paper.js — risk-free paper trading with ₹10L virtual cash

import { $, $$, showToast, inr, inrCompact, num, escapeHtml } from "../ui.js";
import { state, paperBuy, paperSell, resetPaper, PAPER_START } from "../store.js";
import { fetchQuote, fetchQuotes, searchSymbols } from "../quotes.js";

let pick = null; // { symbol, name, price }

export async function renderPaper(outlet) {
  pick = null;
  outlet.innerHTML = `
    <div class="reveal">
      <div class="page-head row between wrap" style="gap:10px">
        <div><div class="eyebrow">Practice mode</div><h1 class="page-title">Paper <b>trading</b></h1></div>
        <button class="btn btn-ghost btn-sm" id="resetPaper"><i class="ph ph-arrow-counter-clockwise"></i> Reset</button>
      </div>
      <div id="summary" class="stat-grid" style="margin-bottom:18px"></div>

      <div class="card card-pad" style="margin-bottom:18px">
        <div class="section-title">Buy a stock</div>
        <p class="help" style="margin:3px 0 12px">Spend virtual cash to practice. No real money, no risk.</p>
        <div style="position:relative">
          <input class="input" id="buySearch" placeholder="Search a company or symbol…" autocomplete="off" />
          <ul id="buyResults" class="results card" style="position:absolute;left:0;right:0;top:48px;z-index:20;display:none;max-height:240px"></ul>
        </div>
        <div id="ticket" style="margin-top:14px"></div>
      </div>

      <div class="section-title" style="margin-bottom:10px">Your holdings</div>
      <div id="holdings" class="grid" style="gap:10px"></div>

      <div id="activity"></div>
      <p class="disclaimer"><b>Simulated trades only.</b> Prices are live but no orders are placed. Practice here, invest through your real broker.</p>
    </div>`;

  $("#resetPaper").addEventListener("click", () => {
    resetPaper(); showToast("Portfolio reset to ₹10L", "info"); renderPaper(outlet);
  });
  wireBuy(outlet);
  await refresh();
}

function wireBuy(outlet) {
  const search = $("#buySearch"), results = $("#buyResults");
  search.addEventListener("input", () => {
    const q = search.value.trim();
    if (!q) { results.style.display = "none"; return; }
    const matches = searchSymbols(q, 8);
    if (!matches.length) { results.style.display = "none"; return; }
    results.innerHTML = matches.map((m) => `<li class="result-item" data-sym="${m.symbol}"><div><div class="result-sym">${m.symbol}</div><div class="result-name">${escapeHtml(m.name)}</div></div><i class="ph ph-plus"></i></li>`).join("");
    results.style.display = "block";
  });
  results.addEventListener("click", async (e) => {
    const li = e.target.closest("[data-sym]"); if (!li) return;
    results.style.display = "none"; search.value = "";
    await selectPick(li.dataset.sym);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#buySearch, #buyResults")) results.style.display = "none";
  }, { once: false });
}

async function selectPick(symbol) {
  const ticket = $("#ticket");
  ticket.innerHTML = `<div class="help">Fetching ${symbol} price…</div>`;
  const q = await fetchQuote(symbol);
  if (!q || !q.price) { ticket.innerHTML = `<div class="help" style="color:var(--neg)">Couldn't fetch ${symbol}. Try another.</div>`; return; }
  pick = { symbol, name: q.info?.name || symbol, price: q.price.price };
  renderTicket();
}

function renderTicket() {
  const ticket = $("#ticket");
  if (!pick) { ticket.innerHTML = ""; return; }
  const qty = 1;
  ticket.innerHTML = `
    <div class="panel" style="padding:14px 16px">
      <div class="row between" style="margin-bottom:12px">
        <div><div style="font-weight:600">${escapeHtml(pick.name)}</div><div class="stock-meta"><span class="tk">${pick.symbol}</span></div></div>
        <div class="price">${inr(pick.price)}</div>
      </div>
      <div class="row" style="gap:10px">
        <div style="flex:1"><label class="label" style="font-size:12px">Quantity</label>
          <input class="input" type="number" id="qty" min="1" value="${qty}" /></div>
        <div style="flex:1"><label class="label" style="font-size:12px">Est. cost</label>
          <div class="input mono" id="cost" style="display:flex;align-items:center">${inr(pick.price)}</div></div>
      </div>
      <button class="btn btn-primary btn-block" id="confirmBuy" style="margin-top:12px"><i class="ph ph-shopping-cart-simple"></i> Buy ${pick.symbol}</button>
      <div class="help" id="afford" style="margin-top:8px">Cash available: ${inr(state.paper.cash, 0)}</div>
    </div>`;
  const qtyEl = $("#qty"), costEl = $("#cost");
  const upd = () => { const c = (Number(qtyEl.value) || 0) * pick.price; costEl.textContent = inr(c); };
  qtyEl.addEventListener("input", upd); upd();
  $("#confirmBuy").addEventListener("click", () => {
    const n = Math.floor(Number(qtyEl.value) || 0);
    if (n < 1) return showToast("Enter a quantity", "warning");
    const res = paperBuy(pick.symbol, pick.name, pick.price, n);
    if (!res.ok) return showToast(res.error, "error");
    showToast(`Bought ${n} × ${pick.symbol}`, "success");
    pick = null; refresh();
  });
}

async function refresh() {
  const holdings = state.paper.holdings;
  const quotes = holdings.length ? await fetchQuotes(holdings.map((h) => h.symbol)) : {};

  let invested = 0, marketValue = 0;
  const rows = holdings.map((h) => {
    const price = quotes[h.symbol]?.price?.price ?? h.avgPrice;
    const value = price * h.qty, cost = h.avgPrice * h.qty;
    const pnl = value - cost, pnlPct = cost ? (pnl / cost) * 100 : 0;
    invested += cost; marketValue += value;
    const pos = pnl >= 0;
    return `
      <div class="card stock-card" style="cursor:default">
        <div class="stock-top">
          <div><div class="stock-name">${escapeHtml(h.name || h.symbol)}</div>
            <div class="stock-meta"><span class="tk">${h.symbol}</span><span>·</span><span>${h.qty} sh @ ${inr(h.avgPrice)}</span></div></div>
          <div class="stock-price"><div class="price">${inr(value, 0)}</div>
            <div class="change ${pos ? "pos" : "neg"}"><i class="ph ph-caret-${pos ? "up" : "down"}"></i>${inr(Math.abs(pnl), 0)} (${num(Math.abs(pnlPct))}%)</div></div>
        </div>
        <div class="row between" style="margin-top:12px">
          <span class="help" style="margin:0">LTP ${inr(price)}</span>
          <button class="add-btn" data-sell="${h.symbol}" data-qty="${h.qty}" data-price="${price}"><i class="ph ph-minus-circle"></i> Sell all</button>
        </div>
      </div>`;
  });

  const cash = state.paper.cash;
  const total = cash + marketValue;
  const pnl = total - PAPER_START, pnlPct = (pnl / PAPER_START) * 100, pos = pnl >= 0;

  $("#summary").innerHTML = `
    <div class="stat"><div class="stat-label">Portfolio value</div><div class="stat-value">${inrCompact(total)}</div></div>
    <div class="stat"><div class="stat-label">Cash</div><div class="stat-value">${inrCompact(cash)}</div></div>
    <div class="stat"><div class="stat-label">Invested</div><div class="stat-value">${inrCompact(marketValue)}</div></div>
    <div class="stat"><div class="stat-label">Total P&L</div><div class="stat-value" style="color:var(--${pos ? "pos" : "neg"})">${pos ? "+" : "−"}${inrCompact(Math.abs(pnl))} (${num(Math.abs(pnlPct))}%)</div></div>`;

  const list = $("#holdings");
  list.innerHTML = holdings.length ? rows.join("")
    : `<div class="empty"><i class="ph ph-wallet"></i><h3>No positions yet</h3><p>Buy a stock above to start practicing.</p></div>`;
  list.onclick = (e) => {
    const btn = e.target.closest("[data-sell]"); if (!btn) return;
    const res = paperSell(btn.dataset.sell, Number(btn.dataset.price), Number(btn.dataset.qty));
    if (!res.ok) return showToast(res.error, "error");
    showToast(`Sold ${btn.dataset.sell}`, "success"); refresh();
  };

  const trades = state.paper.trades.slice(0, 6);
  $("#activity").innerHTML = trades.length ? `
    <div class="section-title" style="margin:22px 0 10px">Recent activity</div>
    <div class="card card-pad" style="padding:8px 18px">
      ${trades.map((t) => `<div class="manage-item">
        <div class="row" style="gap:10px"><span class="badge badge-${t.type === "buy" ? "pos" : "neg"}">${t.type.toUpperCase()}</span>
        <span class="mono">${t.qty} × ${t.symbol}</span></div>
        <span class="help" style="margin:0">${inr(t.price)}</span></div>`).join("")}
    </div>` : "";
}
