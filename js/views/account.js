// views/account.js — signed-in account dashboard

import { $, showToast, inrCompact } from "../ui.js";
import { state, clearUser } from "../store.js";
import { getSession, signOut } from "../supabase.js";

export function renderAccount(outlet) {
  const p = state.profile, g = state.goal;
  outlet.innerHTML = `
    <div class="reveal" style="max-width:640px;margin:0 auto">
      <div class="page-head">
        <div class="eyebrow">Account</div>
        <h1 class="page-title">Your <b>account</b></h1>
      </div>

      <div class="card card-pad" style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
        <div class="brand-mark" id="acctAvatar" style="width:48px;height:48px;border-radius:15px;font-size:22px">·</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600" id="acctEmail">Loading…</div>
          <div class="help" style="margin:2px 0 0" id="acctMeta"></div>
        </div>
        <span class="badge badge-accent"><i class="ph ph-cloud-check"></i> Synced</span>
      </div>

      ${p ? `
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="section-title">Your profile</div>
        <div class="stat-grid" style="margin-top:14px">
          <div class="stat"><div class="stat-label">Archetype</div><div class="stat-value" style="font-family:var(--font-ui);font-size:14px">${p.archetype}</div></div>
          <div class="stat"><div class="stat-label">Risk score</div><div class="stat-value">${p.riskScore}/100</div></div>
          <div class="stat"><div class="stat-label">Goal</div><div class="stat-value" style="font-family:var(--font-ui);font-size:14px">${g ? (g.label || "—") : "—"}</div></div>
          <div class="stat"><div class="stat-label">Target</div><div class="stat-value">${g ? inrCompact(g.targetAmount) + " · " + g.targetYear : "—"}</div></div>
        </div>
      </div>` : ""}

      <div class="card card-pad">
        <div class="section-title">Manage</div>
        <div class="grid" style="margin-top:14px;gap:10px">
          <a class="btn btn-secondary" href="#/onboarding" data-link><i class="ph ph-pencil-simple"></i> Edit profile and goal</a>
          <button class="btn btn-ghost" id="signOut" style="color:var(--neg)"><i class="ph ph-sign-out"></i> Sign out</button>
        </div>
        <p class="help" style="margin:14px 0 0">Your profile, watchlist and paper portfolio are saved to this account and follow you across devices.</p>
      </div>
    </div>`;

  (async () => {
    const s = await getSession();
    const email = s?.user?.email || "your account";
    $("#acctEmail").textContent = email;
    $("#acctAvatar").textContent = (email[0] || "F").toUpperCase();
    const created = s?.user?.created_at ? new Date(s.user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long" }) : null;
    $("#acctMeta").textContent = created ? "Member since " + created : "";
  })();

  $("#signOut").addEventListener("click", async () => {
    clearUser();
    await signOut();
    showToast("Signed out", "info");
    // onAuth listener in main.js returns to the sign-in screen.
  });
}
