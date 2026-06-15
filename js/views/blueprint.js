// views/blueprint.js — personalized wealth model: allocation, projection, profession tips

import { $, inr, inrCompact, num } from "../ui.js";
import { state } from "../store.js";
import { buildBlueprint, narrate, blueprintFacts, USE_GEMINI } from "../advisor.js";
import { buildRealityCheck, projectValue } from "../engine.js";
import { LESSONS } from "../data.js";

export function renderBlueprint(outlet) {
  const p = state.profile, g = state.goal;
  if (!p) { outlet.innerHTML = `<div class="empty"><i class="ph ph-compass"></i><h3>Finish onboarding first</h3></div>`; return; }

  const bp = buildBlueprint(p, g);
  const r = g ? buildRealityCheck({ initial: p.savings || 0, monthly: g.monthlyContribution || 0, targetAmount: g.targetAmount, targetYear: g.targetYear }) : null;
  const lesson = LESSONS.find((l) => l.id === bp.nextLesson);

  outlet.innerHTML = `
    <div class="stagger bp-stack">
      <div class="page-head">
        <div class="eyebrow">Your wealth blueprint</div>
        <h1 class="page-title">Built for a <b>${p.archetype}</b></h1>
        <p class="page-sub">A starting plan shaped by your profile and goal.</p>
      </div>

      <div class="card card-pad" style="margin-bottom:16px">
        <div class="row between" style="align-items:center;margin-bottom:8px">
          <div class="eyebrow">Your plan, in plain words</div>
          <span class="badge badge-accent hidden" id="bpAiTag"><i class="ph ph-sparkle"></i> Personalizing</span>
        </div>
        <p id="bpNarrative" style="font-size:15px;line-height:1.7;color:var(--text-2);margin:0">${bp.archetypeLine}</p>
      </div>

      <div class="card card-pad">
        <div class="section-title">Suggested allocation</div>
        <p class="help" style="margin:3px 0 16px">A starting mix for your risk level — ${bp.equityCeiling}% growth assets, the rest for stability.</p>
        <div class="alloc-bar">
          ${bp.allocation.map((a) => `<div class="alloc-seg" style="width:${a.pct}%;background:${a.color}"></div>`).join("")}
        </div>
        <div class="alloc-legend">
          ${bp.allocation.map((a) => `<div class="alloc-key"><span class="alloc-dot" style="background:${a.color}"></span><b class="mono" style="color:var(--text)">${a.pct}%</b> ${a.label}</div>`).join("")}
        </div>
        <div class="grid" style="margin-top:18px;gap:8px">
          ${bp.allocation.map((a) => `<div class="srow"><span class="k">${a.label}</span><span class="v" style="color:var(--text-2);font-family:var(--font-ui);text-align:right;max-width:60%">${a.note}</span></div>`).join("")}
        </div>
      </div>

      ${r ? projectionCard(p, g, r) : ""}

      <div class="card card-pad">
        <div class="section-title">Tips for your profession</div>
        <p class="help" style="margin:3px 0 6px">Tailored to ${professionLabel(p)}.</p>
        <div>${bp.tips.map((t) => `
          <div class="tip"><div class="tip-ic"><i class="ph ${t.icon}"></i></div>
          <div><h4>${t.title}</h4><p>${t.text}</p></div></div>`).join("")}</div>
      </div>

      <div class="grid grid-2">
        <div class="card card-pad">
          <div class="section-title" style="color:var(--pos)"><i class="ph ph-check-circle"></i> Do</div>
          <div style="margin-top:10px">${bp.dos.map((d) => `<div class="row" style="align-items:flex-start;gap:9px;padding:6px 0"><i class="ph ph-check" style="color:var(--pos);margin-top:3px"></i><span style="font-size:13.5px">${d}</span></div>`).join("")}</div>
        </div>
        <div class="card card-pad">
          <div class="section-title" style="color:var(--neg)"><i class="ph ph-x-circle"></i> Avoid</div>
          <div style="margin-top:10px">${bp.donts.map((d) => `<div class="row" style="align-items:flex-start;gap:9px;padding:6px 0"><i class="ph ph-x" style="color:var(--neg);margin-top:3px"></i><span style="font-size:13.5px">${d}</span></div>`).join("")}</div>
        </div>
      </div>

      ${lesson ? `
      <a class="card card-pad card-link" href="lesson/${lesson.id}" data-link style="display:flex;align-items:center;gap:14px">
        <div class="lesson-ic"><i class="ph ${lesson.icon}"></i></div>
        <div style="flex:1"><div class="eyebrow">Recommended next lesson</div><div style="font-weight:600;margin-top:2px">${lesson.title}</div></div>
        <i class="ph ph-arrow-right" style="font-size:20px;color:var(--text-3)"></i>
      </a>` : ""}

      <p class="disclaimer"><b>Educational guidance only.</b> This blueprint is a generic model based on your inputs, not personalized financial advice. Consult a SEBI-registered adviser for decisions.</p>
    </div>`;

  // Progressive enhancement: replace the template summary with a Gemini-written one
  // when the advisor endpoint is available. Falls back silently to the template.
  if (USE_GEMINI) {
    const tag = $("#bpAiTag");
    if (tag) tag.classList.remove("hidden");
    narrate("blueprint", blueprintFacts(p, bp, g, r))
      .then((text) => {
        const el = $("#bpNarrative"); if (el) el.textContent = text;
        if (tag) tag.innerHTML = '<i class="ph ph-sparkle"></i> Personalized';
      })
      .catch(() => { if (tag) tag.classList.add("hidden"); });
  }
}

function projectionCard(p, g, r) {
  const initial = p.savings || 0, monthly = g.monthlyContribution || 0;
  const reaches = r.realisticValue >= g.targetAmount;
  return `
    <div class="card card-pad glow-box">
      <div class="row between wrap" style="gap:8px">
        <div><div class="section-title">Realistic projection</div>
        <p class="help" style="margin:3px 0 0">At a long-run ${r.expectedRate}% equity return</p></div>
        <span class="badge badge-${reaches ? "pos" : "warn"}">${reaches ? "On track" : "Falls a bit short"}</span>
      </div>
      ${projectionSVG(initial, monthly, r.years, r.expectedRate, g.targetAmount)}
      <div class="stat-grid" style="margin-top:16px">
        <div class="stat"><div class="stat-label">Projected by ${g.targetYear}</div><div class="stat-value" style="color:var(--accent)">${inrCompact(r.realisticValue)}</div></div>
        <div class="stat"><div class="stat-label">Your target</div><div class="stat-value">${inrCompact(g.targetAmount)}</div></div>
        <div class="stat"><div class="stat-label">You invest</div><div class="stat-value">${inrCompact(initial + monthly * r.years * 12)}</div></div>
        <div class="stat"><div class="stat-label">Growth earned</div><div class="stat-value" style="color:var(--pos)">${inrCompact(Math.max(0, r.realisticValue - initial - monthly * r.years * 12))}</div></div>
      </div>
    </div>`;
}

function projectionSVG(initial, monthly, years, rate, target) {
  const W = 600, H = 188, padL = 6, padR = 6, padT = 16, padB = 22;
  const n = Math.max(1, Math.round(years));
  const pts = [];
  for (let y = 0; y <= n; y++) pts.push(projectValue(initial, monthly, y, rate));
  const maxV = Math.max(target, pts[n]) * 1.08;
  const x = (i) => padL + (i / n) * (W - padL - padR);
  const y = (v) => H - padB - (v / maxV) * (H - padT - padB);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;
  const ty = y(target).toFixed(1);
  const Y = new Date().getFullYear();
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected portfolio value over time">
      <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.28"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${padL}" y1="${ty}" x2="${W - padR}" y2="${ty}" stroke="var(--text-3)" stroke-width="1" stroke-dasharray="4 4"/>
      <text x="${W - padR}" y="${Math.max(12, ty - 5)}" text-anchor="end" fill="var(--text-3)" font-size="11" font-family="var(--font-mono)">target ${inrCompact(target)}</text>
      <path d="${area}" fill="url(#pg)"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${x(n).toFixed(1)}" cy="${y(pts[n]).toFixed(1)}" r="4" fill="var(--accent)"/>
      <text x="${padL}" y="${H - 6}" fill="var(--text-3)" font-size="11" font-family="var(--font-mono)">${Y}</text>
      <text x="${W - padR}" y="${H - 6}" text-anchor="end" fill="var(--text-3)" font-size="11" font-family="var(--font-mono)">${Y + n}</text>
    </svg>`;
}

function professionLabel(p) {
  const map = { salaried: "salaried professionals", business: "business owners", freelancer: "freelancers", student: "students", retired: "retirees" };
  const who = map[p.employmentType] || "your situation";
  return p.industry ? `${who} in ${p.industry.toLowerCase()}` : who;
}
