// ui.js — shared DOM + formatting + feedback helpers

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Build a DOM node from an HTML string (first root element). */
export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ---------- Number formatting (Indian conventions) ---------- */

export function inr(n, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Compact Indian money: ₹1.25 Cr, ₹50.0 L, ₹4.5K */
export function inrCompact(n) {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}K`;
  return `${sign}₹${a.toFixed(0)}`;
}

/** Market cap from the quote API is already in crores. */
export function fmtMarketCap(valCr) {
  if (!valCr) return "—";
  if (valCr >= 1e5) return `₹${(valCr / 1e5).toFixed(2)} L Cr`;
  if (valCr >= 1000) return `₹${(valCr / 1000).toFixed(2)}K Cr`;
  return `₹${valCr.toFixed(0)} Cr`;
}

export function num(n, decimals = 2) {
  return n == null || isNaN(n) ? "—" : Number(n).toFixed(decimals);
}

export function pct(n, decimals = 1) {
  return n == null || isNaN(n) ? "—" : `${Number(n).toFixed(decimals)}%`;
}

/* ---------- Animated number count-up ---------- */
export function countUp(node, to, { duration = 700, format = (v) => v.toFixed(0) } = {}) {
  if (!node) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    node.textContent = format(to);
    return;
  }
  const from = 0;
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = format(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------- Toasts ---------- */
export function showToast(msg, type = "info") {
  const container = $(".toast-container");
  if (!container) return;
  const icon = { success: "check-circle", error: "warning-circle", warning: "warning", info: "sparkle" }[type] || "info";
  const toast = el(`<div class="toast toast-${type}"><i class="ph ph-${icon}"></i><span>${escapeHtml(msg)}</span></div>`);
  container.appendChild(toast);
  if (window.Motion) {
    window.Motion.animate(toast, { y: [16, 0], opacity: [0, 1] }, { duration: 0.28 });
  }
  setTimeout(() => {
    if (window.Motion) {
      window.Motion.animate(toast, { opacity: 0, y: -12 }, { duration: 0.2 })
        .finished.catch(() => {}).finally(() => toast.remove());
    } else {
      toast.remove();
    }
  }, 2800);
}

/* ---------- Generic modal toggles ---------- */
export function openOverlay(id) { $("#" + id)?.classList.add("active"); }
export function closeOverlay(id) { $("#" + id)?.classList.remove("active"); }
