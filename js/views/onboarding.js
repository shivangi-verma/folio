// views/onboarding.js — step-by-step wizard capturing professional background → profile

import { $, $$, el, showToast, inr, inrCompact, countUp } from "../ui.js";
import { setProfile, setGoal, completeOnboarding, state } from "../store.js";
import { computeRiskProfile, buildRealityCheck } from "../engine.js";
import { realityMessage } from "../advisor.js";

const YEAR = new Date().getFullYear();
const TOTAL = 6;

let draft, step;

function resetDraft() {
  const p = state.profile || {};
  const g = state.goal || {};
  draft = {
    employmentType: p.employmentType || null,
    industry: p.industry || "",
    age: p.age || 28,
    incomeBand: p.incomeBand || null,
    savings: p.savings ?? 50000,
    monthlySurplus: p.monthlySurplus ?? 10000,
    experience: p.experience || null,
    goalLabel: g.label || "",
    targetAmount: g.targetAmount || 5000000,
    targetYear: g.targetYear || YEAR + 10,
    riskAppetite: p.riskAppetite || null,
    maxDrawdown: p.maxDrawdown || null,
  };
}

const INDUSTRIES = ["IT / Software", "Finance / Banking", "Healthcare", "Engineering / Manufacturing",
  "Government / PSU", "Education", "Sales / Marketing", "Business owner", "Student", "Other"];

const tile = (field, value, icon, title, desc) => `
  <button class="option" data-field="${field}" data-value="${value}">
    <i class="ph ${icon} opt-ic"></i>
    <span><span class="opt-title">${title}</span><span class="opt-desc">${desc}</span></span>
  </button>`;

/* ---------- Steps ---------- */
const STEPS = [
  { // 1 — professional background
    title: "Tell us about <b>your work</b>",
    sub: "Your profession shapes how much risk you can take and the tips we'll give you.",
    body: () => `
      <label class="label">What best describes you?</label>
      <div class="options cols-2" data-group="employmentType" style="margin-bottom:18px">
        ${tile("employmentType", "salaried", "ph-briefcase", "Salaried", "Regular monthly income")}
        ${tile("employmentType", "business", "ph-storefront", "Business owner", "Self-run, variable income")}
        ${tile("employmentType", "freelancer", "ph-laptop", "Freelancer", "Project / gig income")}
        ${tile("employmentType", "student", "ph-student", "Student", "Studying, little income")}
        ${tile("employmentType", "retired", "ph-armchair", "Retired", "Living off savings")}
        ${tile("employmentType", "salaried", "ph-dots-three", "Other", "Something else").replace('data-value="salaried"', 'data-value="other"')}
      </div>
      <div class="grid grid-2">
        <div class="field" style="margin:0">
          <label class="label">Industry</label>
          <select class="select" data-bind="industry">
            <option value="">Select…</option>
            ${INDUSTRIES.map((i) => `<option ${draft.industry === i ? "selected" : ""}>${i}</option>`).join("")}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label class="label">Your age</label>
          <input class="input" type="number" inputmode="numeric" data-bind="age" value="${draft.age}" min="16" max="90" />
        </div>
      </div>`,
    valid: () => draft.employmentType && draft.industry && draft.age >= 16,
    err: "Pick your work type, industry and age.",
  },
  { // 2 — finances
    title: "Your <b>money</b>, roughly",
    sub: "Honest numbers give you an honest plan. Nothing leaves your device.",
    body: () => `
      <div class="field">
        <label class="label">Annual income</label>
        <select class="select" data-bind="incomeBand">
          ${["", "< ₹3 L", "₹3–8 L", "₹8–15 L", "₹15–30 L", "₹30 L +"].map((b, i) =>
      `<option value="${i === 0 ? "" : b}" ${draft.incomeBand === b ? "selected" : ""}>${i === 0 ? "Select…" : b}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="label">Money you can invest now (savings)</label>
        <div class="input-prefix"><span>₹</span><input class="input" type="number" inputmode="numeric" data-bind="savings" value="${draft.savings}" min="0" /></div>
        <p class="help">A one-time starting amount. Enter 0 if you're starting fresh.</p>
      </div>
      <div class="field" style="margin:0">
        <label class="label">Amount you can invest every month</label>
        <div class="input-prefix"><span>₹</span><input class="input" type="number" inputmode="numeric" data-bind="monthlySurplus" value="${draft.monthlySurplus}" min="0" /></div>
        <p class="help">Only surplus after expenses and EMIs.</p>
      </div>`,
    valid: () => !!draft.incomeBand && draft.savings >= 0 && draft.monthlySurplus >= 0,
    err: "Add your income and how much you can invest.",
  },
  { // 3 — experience
    title: "How much have you <b>invested before?</b>",
    sub: "We'll calibrate the guidance — and protect beginners from risky bets.",
    body: () => `
      <div class="options" data-group="experience">
        ${tile("experience", "never", "ph-egg", "Never invested", "Brand new to all of this")}
        ${tile("experience", "beginner", "ph-seedling", "Just starting", "A little, still learning the ropes")}
        ${tile("experience", "some", "ph-plant", "Some experience", "I've held stocks or funds a while")}
        ${tile("experience", "active", "ph-tree", "Active investor", "I follow markets and trade regularly")}
      </div>`,
    valid: () => !!draft.experience,
    err: "Pick your experience level.",
  },
  { // 4 — goal
    title: "What's the <b>dream?</b>",
    sub: "A target and a timeline turn investing from vague to concrete.",
    body: () => `
      <div class="field">
        <label class="label">What are you investing for?</label>
        <input class="input" type="text" data-bind="goalLabel" value="${draft.goalLabel}" placeholder="e.g. Buy a home, retire early, child's education" maxlength="60" />
      </div>
      <div class="field">
        <label class="label">Target amount</label>
        <div class="input-prefix"><span>₹</span><input class="input" type="number" inputmode="numeric" data-bind="targetAmount" value="${draft.targetAmount}" min="10000" step="10000" /></div>
        <p class="help" data-echo="targetAmount">${inrCompact(draft.targetAmount)}</p>
      </div>
      <div class="slider-block" style="margin-bottom:0">
        <div class="slider-head"><label class="label" style="margin:0">Reach it by</label><span class="v" data-echo="targetYear">${draft.targetYear}</span></div>
        <input class="range" type="range" data-bind="targetYear" min="${YEAR + 1}" max="${YEAR + 30}" value="${draft.targetYear}" />
        <div class="row between" style="font-size:11.5px;color:var(--text-3);margin-top:6px"><span>${YEAR + 1}</span><span>${YEAR + 30}</span></div>
      </div>`,
    valid: () => draft.goalLabel.trim() && draft.targetAmount > 0 && draft.targetYear > YEAR,
    err: "Name your goal, amount and target year.",
  },
  { // 5 — risk
    title: "Your comfort with <b>risk</b>",
    sub: "There's no right answer — only what lets you sleep at night.",
    body: () => `
      <label class="label">How would you like your money to grow?</label>
      <div class="options" data-group="riskAppetite" style="margin-bottom:20px">
        ${tile("riskAppetite", "conservative", "ph-shield", "Slow & safe", "Protect what I have, modest growth")}
        ${tile("riskAppetite", "balanced", "ph-scales", "Balanced", "A healthy mix of safety and growth")}
        ${tile("riskAppetite", "aggressive", "ph-rocket", "Go for growth", "Bigger swings for bigger long-term gains")}
      </div>
      <label class="label">If your investments dropped 30% in a month, you'd…</label>
      <div class="options" data-group="maxDrawdown">
        ${tile("maxDrawdown", "low", "ph-warning", "Panic & sell", "Losses keep me up at night")}
        ${tile("maxDrawdown", "medium", "ph-hand", "Worry but hold", "I'd grit my teeth and wait")}
        ${tile("maxDrawdown", "high", "ph-trend-up", "Buy more", "A drop is a discount to me")}
      </div>`,
    valid: () => draft.riskAppetite && draft.maxDrawdown,
    err: "Pick how you feel about risk and a drop.",
  },
];

/* ---------- Render ---------- */
export function renderOnboarding(outlet) {
  resetDraft();
  step = 0;
  outlet.innerHTML = `<div class="ob-wrap"><div class="ob-card" id="obCard"></div></div>`;
  paintStep();
}

function paintStep() {
  const card = $("#obCard");
  if (step < STEPS.length) {
    const s = STEPS[step];
    card.innerHTML = `
      <div class="reveal">
        <div class="ob-progress-row">
          <div class="progress"><div class="progress-fill" style="width:${(step / TOTAL) * 100}%"></div></div>
          <span class="ob-count">${step + 1} / ${TOTAL}</span>
        </div>
        <h2 class="ob-step-title">${s.title}</h2>
        <p class="ob-step-sub">${s.sub}</p>
        <div class="ob-body">${s.body()}</div>
        <div class="ob-foot">
          ${step > 0 ? `<button class="btn btn-secondary" id="obBack"><i class="ph ph-arrow-left"></i></button>` : ""}
          <button class="btn btn-primary btn-lg" id="obNext">Continue <i class="ph ph-arrow-right"></i></button>
        </div>
      </div>`;
    wireStep();
  } else {
    paintSummary();
  }
}

function wireStep() {
  const card = $("#obCard");
  // option tiles
  $$(".option", card).forEach((btn) => {
    if (btn.dataset.value === draft[btn.dataset.field]) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      const f = btn.dataset.field;
      $$(`.option[data-field="${f}"]`, card).forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      draft[f] = btn.dataset.value;
    });
  });
  // bound inputs
  $$("[data-bind]", card).forEach((inp) => {
    inp.addEventListener("input", () => {
      const k = inp.dataset.bind;
      draft[k] = inp.type === "number" || inp.type === "range" ? Number(inp.value) : inp.value;
      const echo = $(`[data-echo="${k}"]`, card);
      if (echo) echo.textContent = k === "targetAmount" ? inrCompact(draft[k]) : draft[k];
    });
  });
  $("#obNext").addEventListener("click", next);
  $("#obBack")?.addEventListener("click", () => { step--; paintStep(); });
}

function next() {
  const s = STEPS[step];
  if (!s.valid()) { showToast(s.err, "warning"); return; }
  step++;
  paintStep();
}

/* ---------- Final step: reality-check + summary ---------- */
function computeReality() {
  return buildRealityCheck({
    initial: draft.savings, monthly: draft.monthlySurplus,
    targetAmount: draft.targetAmount, targetYear: draft.targetYear,
  });
}

function paintSummary() {
  const card = $("#obCard");
  const rp = computeRiskProfile({ ...draft });
  card.innerHTML = `
    <div class="reveal">
      <div class="ob-progress-row">
        <div class="progress"><div class="progress-fill" style="width:100%"></div></div>
        <span class="ob-count">Reality check</span>
      </div>
      <h2 class="ob-step-title">Let's <b>pressure-test</b> it</h2>
      <p class="ob-step-sub">Here's the return your goal actually demands — and how to make it realistic.</p>

      <div class="card card-pad glow-box" style="text-align:center;margin:22px 0 18px">
        <div class="eyebrow">Required return / year</div>
        <div class="hero-num bignum" id="reqNum" style="color:var(--accent)">0%</div>
        <div id="verdictWrap" style="margin-top:6px"></div>
      </div>

      <div id="pathsWrap" style="margin-bottom:18px"></div>

      <div class="slider-block">
        <div class="slider-head"><span class="muted">Target year</span><span class="v" id="ty">${draft.targetYear}</span></div>
        <input class="range" type="range" id="tyRange" min="${YEAR + 1}" max="${YEAR + 30}" value="${draft.targetYear}" />
      </div>
      <div class="slider-block">
        <div class="slider-head"><span class="muted">Monthly investment</span><span class="v" id="ms">${inr(draft.monthlySurplus, 0)}</span></div>
        <input class="range" type="range" id="msRange" min="0" max="${Math.max(100000, draft.monthlySurplus * 4)}" step="500" value="${draft.monthlySurplus}" />
      </div>

      <div class="panel" style="padding:14px 16px;margin:18px 0;display:flex;gap:12px;align-items:center">
        <div class="brand-mark" style="width:34px;height:34px;border-radius:10px">${rp.level}</div>
        <div>
          <div style="font-weight:600" id="archLine">${rp.archetype}</div>
          <div class="help" style="margin:0">Risk score <b id="rsLine" class="mono">${rp.riskScore}</b>/100 · ${rp.equityCeiling}% equity suits you</div>
        </div>
      </div>

      <div class="ob-foot">
        <button class="btn btn-secondary" id="obBack"><i class="ph ph-arrow-left"></i></button>
        <button class="btn btn-primary btn-lg" id="obFinish">Enter Folio <i class="ph ph-arrow-right"></i></button>
      </div>
      <p class="disclaimer" style="margin-top:14px;border:none;padding:8px 0 0">
        <b>Educational only.</b> Folio surfaces ideas from past performance and never executes trades or replaces a licensed adviser or broker.
      </p>
    </div>`;

  const refresh = (animate = false) => {
    const r = computeReality();
    const msg = realityMessage(r);
    const reqNum = $("#reqNum");
    if (animate) countUp(reqNum, r.requiredPct, { duration: 650, format: (v) => v.toFixed(1) + "%" });
    else reqNum.textContent = r.requiredPct.toFixed(1) + "%";
    reqNum.style.color = msg.tone === "bad" ? "var(--neg)" : msg.tone === "warn" ? "var(--warn)" : "var(--pos)";

    $("#verdictWrap").innerHTML = `<span class="badge badge-${msg.tone === "bad" ? "neg" : msg.tone === "warn" ? "warn" : "pos"}">${r.feasibility.label}</span>
      <p class="help" style="margin-top:10px;max-width:420px;margin-inline:auto">${msg.headline} ${msg.body}</p>`;

    // Show corrective paths when the plan needs help.
    $("#pathsWrap").innerHTML = (msg.tone === "ok") ? "" :
      `<div class="grid">${msg.paths.map((p) => `
        <div class="panel" style="padding:13px 15px;display:flex;gap:11px;align-items:flex-start">
          <i class="ph ${p.icon}" style="font-size:20px;color:var(--accent);margin-top:1px"></i>
          <div><div style="font-weight:600;font-size:13.5px">${p.title}</div><div class="help" style="margin:2px 0 0">${p.text}</div></div>
        </div>`).join("")}</div>`;
  };
  refresh(true);

  $("#tyRange").addEventListener("input", (e) => { draft.targetYear = Number(e.target.value); $("#ty").textContent = draft.targetYear; refresh(); });
  $("#msRange").addEventListener("input", (e) => { draft.monthlySurplus = Number(e.target.value); $("#ms").textContent = inr(draft.monthlySurplus, 0); refresh(); });
  $("#obBack").addEventListener("click", () => { step = STEPS.length - 1; paintStep(); });
  $("#obFinish").addEventListener("click", finish);
}

function finish() {
  const rp = computeRiskProfile({ ...draft });
  const r = computeReality();
  setProfile({
    employmentType: draft.employmentType, industry: draft.industry, age: draft.age,
    incomeBand: draft.incomeBand, savings: draft.savings, monthlySurplus: draft.monthlySurplus,
    experience: draft.experience, riskAppetite: draft.riskAppetite, maxDrawdown: draft.maxDrawdown,
    ...rp,
  });
  setGoal({
    label: draft.goalLabel.trim(), targetAmount: draft.targetAmount, targetYear: draft.targetYear,
    monthlyContribution: draft.monthlySurplus, requiredCagr: r.requiredPct, feasibility: r.feasibility.tier,
  });
  completeOnboarding();
  showToast("Welcome to Folio 🌱", "success");
  location.hash = "home";
}
