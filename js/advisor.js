// advisor.js — the "voice": turns engine facts into human-readable guidance.
//
// Today this is rules/templates (deterministic, free, compliant). The functions
// are written as a clean seam so a Gemini call can replace the *phrasing* later
// WITHOUT changing what is recommended or any number — the engine stays the brain.
//
// ─── GEMINI SEAM ───────────────────────────────────────────────────────────
// When wired up, a Cloudflare Worker route (key stored as a Worker secret, never
// in the client) would POST the already-computed facts to the Gemini API:
//
//   POST https://generativelanguage.googleapis.com/v1beta/models/
//        gemini-2.5-flash:generateContent      (use 2.5-pro for the blueprint)
//   body: { contents:[{parts:[{text: PROMPT_WITH_FACTS}]}],
//           generationConfig:{ responseMimeType:"application/json",
//                              responseSchema: SCHEMA, temperature:0.4 } }
//
// The prompt is constrained: "Rephrase these facts for a nervous beginner.
// Never invent a number. Never say buy/sell. Always stay educational."
// Because we pass the engine's numbers in and forbid new ones, the model can
// only change tone — keeping output accurate and on the right side of advice
// regulations. Set USE_GEMINI=true and implement narrateWithGemini() to switch.
// ───────────────────────────────────────────────────────────────────────────

import { inrCompact } from "./ui.js";
import { EMPLOYMENT_TIPS, BENCHMARKS } from "./data.js";

export const USE_GEMINI = true;
const ADVICE_ENDPOINT = "/api/advise"; // server-side proxy that holds the Gemini key

// Calls the server-side advisor. Throws on any error so callers fall back to templates.
export async function narrate(kind, facts) {
  const res = await fetch(ADVICE_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, facts }),
  });
  if (!res.ok) throw new Error("advise " + res.status);
  const data = await res.json();
  if (!data.text) throw new Error("advise: no text");
  return data.text;
}

// The facts the blueprint narration is grounded in. Amounts are pre-formatted strings
// so the model never recomputes or invents a number.
export function blueprintFacts(profile, bp, goal, reality) {
  return {
    archetype: profile.archetype,
    riskScore: profile.riskScore,
    horizonYears: Math.round(profile.horizonYears),
    equityCeiling: bp.equityCeiling,
    employmentType: profile.employmentType,
    industry: profile.industry,
    monthlyInvestment: inrCompact(bp.monthly),
    suggestedCoreSip: inrCompact(bp.equitySip),
    allocation: bp.allocation.map((a) => ({ label: a.label, pct: a.pct })),
    goal: goal ? {
      label: goal.label, targetAmount: inrCompact(goal.targetAmount), targetYear: goal.targetYear,
      requiredReturnPct: reality ? Number(reality.requiredPct.toFixed(1)) : null,
      feasibility: reality ? reality.feasibility.tier : null,
    } : null,
  };
}

/* ---------- Recommendation rationale ---------- */
export function rationale(item, profile) {
  const f = item.score.factors;
  const bits = [];
  bits.push(`${f.sizeTier} ${String(f.sector).toLowerCase() !== "—" ? f.sector.toLowerCase() : "company"}`);
  if (f.near52High) bits.push("trading with strong momentum near its 52-week high");
  else if (f.near52Low) bits.push("sitting in the lower part of its 52-week range");
  else bits.push("trading mid-range");
  if (f.pe > 0 && f.pe < 22) bits.push("reasonably valued");
  const fitWord = item.score.riskFit >= 80 ? "fits" : item.score.riskFit >= 55 ? "broadly fits" : "stretches";
  const s = `${cap(bits[0])} ${bits.slice(1).join(", ")}. ${cap(fitWord)} your ${profile.archetype} profile.`;
  return s.replace(/\s+/g, " ").trim();
}

/* ---------- Reality-check message ---------- */
export function realityMessage(r) {
  const reqd = `${r.requiredPct.toFixed(1)}%`;
  const tone = r.feasibility.tone;
  let headline, body;

  if (r.feasibility.tier === "comfortable") {
    headline = "You're on track — comfortably.";
    body = `Your plan only needs about ${reqd} a year, which steadier instruments can realistically deliver. You could even dial risk down.`;
  } else if (r.feasibility.tier === "realistic") {
    headline = "This goal looks realistic.";
    body = `It needs roughly ${reqd} a year. Broad Indian equity has historically averaged around ${BENCHMARKS.nifty}% over long periods, so a disciplined, diversified plan can get there.`;
  } else if (r.feasibility.tier === "ambitious") {
    headline = "Ambitious — possible, but demanding.";
    body = `You'd need about ${reqd} a year, above the ~${BENCHMARKS.nifty}% long-run index average. Only strong, sustained portfolios reach this, and it means accepting bigger swings. Have a backup path.`;
  } else {
    headline = "Let's recalibrate this one.";
    body = `Hitting this would need about ${reqd} a year. For context, even India's best equity funds average ~${BENCHMARKS.topFunds}% long-term, and sustaining ${BENCHMARKS.rareElite}%+ is extremely rare. Chasing it usually means taking reckless risk. Here are realistic ways to reach your dream instead:`;
  }

  const nextYear = new Date().getFullYear() + r.paths.extendYears;
  const paths = [
    { icon: "ph-calendar-plus", title: "Give it more time", text: `At a realistic ${r.expectedRate}%, you'd reach ${inrCompact(r.targetAmount)} by about ${nextYear}.` },
    { icon: "ph-plus-circle", title: "Invest a little more", text: `Raising your monthly to ${inrCompact(r.paths.raiseMonthly)} reaches the goal on time at ~${r.expectedRate}%.` },
    { icon: "ph-target", title: "Aim for what's realistic", text: `Your current plan is on course for about ${inrCompact(r.paths.achievableTarget)} — already a strong result.` },
  ];

  return { headline, body, tone, paths };
}

/* ---------- Wealth blueprint ---------- */
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function buildBlueprint(profile, goal) {
  const eq = profile.equityCeiling;                 // total equity %
  const corePart = profile.isNovice ? 0.8 : 0.62;
  const core = Math.round(eq * corePart);
  const satellite = eq - core;
  const cash = Math.min(15, profile.horizonYears < 3 ? 20 : 10);
  const debt = Math.max(0, 100 - eq - cash);

  const allocation = [
    { label: "Index & large-cap core", pct: core, color: "var(--accent)", note: "Low-cost foundation — set-and-forget SIP." },
    { label: "Satellite stocks", pct: satellite, color: "var(--warn)", note: "Your hand-picked ideas from the Picks tab." },
    { label: "Debt / bonds", pct: debt, color: "#5C9CE6", note: "Cushions the ride and steadies returns." },
    { label: "Cash / liquid", pct: cash, color: "var(--text-3)", note: "Emergency buffer — never invested in stocks." },
  ].filter((a) => a.pct > 0);

  const monthly = (goal && goal.monthlyContribution) || profile.monthlySurplus || 0;
  const equitySip = Math.round((monthly * eq / 100) / 100) * 100;

  const tips = EMPLOYMENT_TIPS[profile.employmentType] || EMPLOYMENT_TIPS.salaried;

  const dos = [
    `Automate ${inrCompact(equitySip)}/month into your core before anything else.`,
    "Rebalance once a year, not on every headline.",
    "Keep 3–6 months of expenses in your cash buffer first.",
  ];
  const donts = [
    "Don't chase tips, 'sure-shot' calls, or hype on social media.",
    "Don't put money you'll need within your horizon into stocks.",
    `Don't let any single stock exceed ~${profile.isNovice ? 5 : 8}% of your portfolio.`,
  ];

  const nextLesson = profile.isNovice ? "what-is-a-stock" : "diversification";

  const archetypeLine = `As a ${profile.archetype.toLowerCase()} with a ${profile.horizonYears.toFixed(0)}-year horizon, your edge is ${profile.horizonYears >= 7 ? "time — let compounding work" : "discipline — steady contributions and low costs"}.`;

  return { archetypeLine, allocation, equitySip, monthly, tips, dos, donts, nextLesson, equityCeiling: eq };
}
