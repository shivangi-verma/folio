// engine.js — the deterministic "brain": risk profile, reality-check math, recommender.
// No LLM here. Everything is explainable and reproducible.

import { BENCHMARKS } from "./data.js";

/* =========================================================
   1. RISK PROFILE
   ========================================================= */

const APPETITE_BASE = { conservative: 28, balanced: 52, aggressive: 76 };
const EXP_ADJ = { never: -16, beginner: -8, some: 2, active: 8 };
const DRAW_ADJ = { low: -12, medium: 0, high: 12 };

export function computeRiskProfile(p) {
  const horizonYears = Math.max(0.5, (p.targetYear || new Date().getFullYear() + 5) - new Date().getFullYear());
  let score = APPETITE_BASE[p.riskAppetite] ?? 50;
  score += Math.min(20, horizonYears * 1.6);                  // longer horizon → more capacity
  score += Math.max(-10, Math.min(15, (38 - (p.age || 30)) / 2)); // youth → more capacity
  score += DRAW_ADJ[p.maxDrawdown] ?? 0;
  score += EXP_ADJ[p.experience] ?? 0;

  const isNovice = p.experience === "never" || p.experience === "beginner";
  // Beginners are protected: capped away from the highest-risk band regardless of appetite.
  if (isNovice) score = Math.min(score, 70);
  score = Math.round(Math.max(5, Math.min(98, score)));

  let archetype, level;
  if (score < 35) { archetype = "Capital Protector"; level = 1; }
  else if (score < 55) { archetype = "Steady Builder"; level = 2; }
  else if (score < 75) { archetype = "Balanced Grower"; level = 3; }
  else { archetype = "Growth Seeker"; level = 4; }
  if (isNovice && level >= 3) archetype = "Careful " + archetype;

  // Target risk band for stock matching (1 low, 2 medium, 3 high)
  let targetBand = score < 42 ? 1 : score < 72 ? 2 : 3;
  if (isNovice) targetBand = Math.min(targetBand, 2);

  const equityCeiling = Math.round(Math.max(25, Math.min(90, 25 + score * 0.7)));

  return { riskScore: score, archetype, level, isNovice, targetBand, horizonYears, equityCeiling };
}

/* =========================================================
   2. REALITY-CHECK (compound-interest math)
   ========================================================= */

function fv(initial, monthly, months, annualRate) {
  const i = annualRate / 12;
  if (Math.abs(i) < 1e-9) return initial + monthly * months;
  return initial * Math.pow(1 + i, months) + monthly * (Math.pow(1 + i, months) - 1) / i;
}

/** Solve for the annual return % needed to reach `target`. */
export function solveRequiredRate(initial, monthly, years, target) {
  const months = years * 12;
  const noGrowth = initial + monthly * months;
  if (target <= noGrowth) return 0;
  let lo = 0, hi = 3; // up to 300%
  if (fv(initial, monthly, months, hi) < target) return hi * 100;
  for (let k = 0; k < 90; k++) {
    const mid = (lo + hi) / 2;
    if (fv(initial, monthly, months, mid) < target) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

export function projectValue(initial, monthly, years, annualRatePct) {
  return fv(initial, monthly, years * 12, annualRatePct / 100);
}

export function solveMonthlyForTarget(initial, years, ratePct, target) {
  const months = years * 12, i = ratePct / 100 / 12;
  const fvInit = initial * Math.pow(1 + i, months);
  const remaining = target - fvInit;
  if (remaining <= 0) return 0;
  const factor = i < 1e-9 ? months : (Math.pow(1 + i, months) - 1) / i;
  return remaining / factor;
}

export function solveYearsForTarget(initial, monthly, ratePct, target) {
  for (let m = 1; m <= 80 * 12; m++) {
    if (fv(initial, monthly, m, ratePct / 100) >= target) return m / 12;
  }
  return 80;
}

export function classifyFeasibility(pct) {
  if (pct <= 8) return { tier: "comfortable", label: "Very achievable", tone: "ok" };
  if (pct <= 13) return { tier: "realistic", label: "Realistic", tone: "ok" };
  if (pct <= 22) return { tier: "ambitious", label: "Ambitious", tone: "warn" };
  return { tier: "unrealistic", label: "Unrealistic", tone: "bad" };
}

/**
 * Full reality-check bundle for a goal.
 * @returns numbers + a realistic projection + three corrective paths.
 */
export function buildRealityCheck({ initial = 0, monthly = 0, targetAmount, targetYear }) {
  const currentYear = new Date().getFullYear();
  const years = Math.max(0.5, (targetYear || currentYear + 5) - currentYear);
  const requiredPct = solveRequiredRate(initial, monthly, years, targetAmount);
  const feasibility = classifyFeasibility(requiredPct);

  const expectedRate = BENCHMARKS.nifty; // realistic broad-equity assumption
  const realisticValue = projectValue(initial, monthly, years, expectedRate);
  const shortfall = Math.max(0, targetAmount - realisticValue);

  // Corrective paths (all computed at the realistic equity rate)
  const paths = {
    extendYears: Math.ceil(solveYearsForTarget(initial, monthly, expectedRate, targetAmount)),
    raiseMonthly: Math.ceil(solveMonthlyForTarget(initial, years, expectedRate, targetAmount) / 500) * 500,
    achievableTarget: realisticValue,
  };

  return { years, requiredPct, feasibility, expectedRate, realisticValue, shortfall, paths, initial, monthly, targetAmount, targetYear };
}

/* =========================================================
   3. RECOMMENDER (rules-based scoring over a quote map)
   ========================================================= */

export function riskBandFromQuote(q) {
  const title = (q.labels?.risk?.title || "").toLowerCase();
  if (title) {
    if (title.includes("very high") || title.includes("specul")) return 3;
    if (title.includes("low") || title.includes("conserv")) return 1;
    if (title.includes("high") || title.includes("aggress")) return 3;
    return 2; // moderate / medium / balanced
  }
  // No label from the API — fall back to size.
  const cap = q.ratios?.marketCap || 0; // ₹ crore
  return cap >= 50000 ? 1 : cap >= 15000 ? 2 : 3;
}

function sizeTier(cap) {
  if (cap >= 50000) return "Large-cap";
  if (cap >= 15000) return "Mid-cap";
  return "Small-cap";
}

function clamp(n, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }

export function scoreStock(quote, profile) {
  const r = quote.ratios || {};
  const price = quote.price?.price ?? 0;
  const high = r["52wHigh"] || price, low = r["52wLow"] || price;
  const cap = r.marketCap || 0;
  const pe = r.pe || 0, eps = r.eps || 0;

  // Position in 52-week range (0 = at low, 1 = at high) — momentum proxy.
  const pos = high > low ? clamp((price - low) / (high - low), 0, 1) : 0.5;
  const momentum = 40 + pos * 50;                 // 40..90
  const perf = clamp(momentum);

  // Quality: sane valuation + positive earnings + size.
  let quality = 40;
  if (eps > 0) quality += 18;
  if (pe > 0 && pe < 22) quality += 22; else if (pe >= 22 && pe < 40) quality += 10; else if (pe <= 0) quality -= 10;
  if (cap >= 50000) quality += 18; else if (cap >= 15000) quality += 8;
  quality = clamp(quality);

  const band = riskBandFromQuote(quote);
  const target = profile.targetBand || 2;
  let riskFit = 100 - Math.abs(target - band) * 35;
  if (profile.isNovice && band === 3) riskFit -= 20;
  riskFit = clamp(riskFit);

  const hy = profile.horizonYears || 5;
  const horizonBand = hy < 3 ? 1 : hy <= 7 ? 2 : 3;
  const horizonFit = clamp(100 - Math.abs(horizonBand - band) * 28);

  const fit = Math.round(perf * 0.35 + riskFit * 0.30 + quality * 0.20 + horizonFit * 0.15);

  return {
    symbol: quote.info ? undefined : undefined, // set by caller
    fit, perf: Math.round(perf), quality: Math.round(quality), riskFit: Math.round(riskFit), horizonFit: Math.round(horizonFit),
    band, factors: {
      momentum: pos, sizeTier: sizeTier(cap), sector: quote.gic?.sector || "—",
      pe, eps, near52High: pos > 0.85, near52Low: pos < 0.15, cap,
    },
  };
}

const TIERS = [
  { key: "safe", band: 1, title: "Beginner-safe", sub: "Lower-risk large-caps to start with", icon: "ph-shield-check" },
  { key: "steady", band: 2, title: "Steady growers", sub: "Balanced risk and growth potential", icon: "ph-chart-line-up" },
  { key: "spicy", band: 3, title: "Higher risk · higher reward", sub: "More volatile — only a small slice", icon: "ph-flame" },
];

/**
 * Rank a quote map into risk-banded tiers for the given profile.
 * @returns { tiers: [{...tier, stocks: [{symbol, name, quote, score}]}], count }
 */
export function recommend(quotesMap, profile, { perTier = 5 } = {}) {
  const scored = [];
  for (const [symbol, quote] of Object.entries(quotesMap)) {
    if (!quote || !quote.price || quote.error) continue;
    const score = scoreStock(quote, profile);
    scored.push({ symbol, name: quote.info?.name || symbol, quote, score });
  }
  scored.sort((a, b) => b.score.fit - a.score.fit);

  const tiers = TIERS.map((t) => ({
    ...t,
    stocks: scored.filter((s) => s.score.band === t.band).slice(0, perTier),
  })).filter((t) => t.stocks.length > 0);

  // For very conservative / novice users, drop the spicy tier from the default view.
  const filtered = profile.targetBand === 1
    ? tiers.filter((t) => t.key !== "spicy")
    : tiers;

  return { tiers: filtered, count: scored.length };
}
