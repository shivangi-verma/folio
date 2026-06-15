// views/auth.js — sign in / create account / forgot password

import { $, showToast } from "../ui.js";
import { signIn, signUp, resetPassword } from "../supabase.js";

let mode = "signin"; // or "signup"

export function renderAuth(outlet) {
  outlet.innerHTML = `
    <div class="ob-wrap">
      <div class="ob-card" style="max-width:440px">
        <div class="reveal" style="text-align:center;margin-bottom:22px">
          <div class="brand-mark" style="width:46px;height:46px;border-radius:14px;font-size:26px;margin:0 auto 14px">F</div>
          <h2 class="ob-step-title" style="font-size:26px">Welcome to <b>Folio</b></h2>
          <p class="ob-step-sub">Learn to invest with confidence. Sign in to save your profile, watchlist and progress.</p>
        </div>

        <div class="seg" style="display:flex;width:100%;margin-bottom:20px">
          <button class="seg-btn ${mode === "signin" ? "active" : ""}" data-mode="signin" style="flex:1">Sign in</button>
          <button class="seg-btn ${mode === "signup" ? "active" : ""}" data-mode="signup" style="flex:1">Create account</button>
        </div>

        <form id="authForm" class="reveal">
          <div class="field">
            <label class="label">Email</label>
            <input class="input" type="email" id="email" placeholder="you@example.com" autocomplete="email" required />
          </div>
          <div class="field">
            <label class="label">Password</label>
            <input class="input" type="password" id="password" placeholder="At least 6 characters" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="6" required />
          </div>
          <button class="btn btn-primary btn-lg btn-block" id="authSubmit" type="submit" style="margin-top:6px">
            ${mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div class="row between" style="margin-top:14px">
          <button class="btn-ghost btn-sm" id="forgot">Forgot password?</button>
          <button class="btn-ghost btn-sm" id="toggleMode">${mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}</button>
        </div>

        <p class="disclaimer" style="margin-top:18px;border:none;padding:8px 0 0">
          <b>Educational only.</b> Folio surfaces ideas from past performance and never executes trades or replaces a licensed adviser or broker.
        </p>
      </div>
    </div>`;

  $("#authForm").addEventListener("submit", submit);
  $$mode("signin");
  $$mode("signup");
  $("#toggleMode").addEventListener("click", () => { mode = mode === "signin" ? "signup" : "signin"; renderAuth(outlet); });
  $("#forgot").addEventListener("click", forgot);
}

function $$mode(m) {
  document.querySelector(`.seg-btn[data-mode="${m}"]`)?.addEventListener("click", () => {
    if (mode !== m) { mode = m; renderAuth($("#view")); }
  });
}

async function submit(e) {
  e.preventDefault();
  const email = $("#email").value.trim();
  const password = $("#password").value;
  if (!email || password.length < 6) { showToast("Enter an email and a password of at least 6 characters", "warning"); return; }
  const btn = $("#authSubmit");
  btn.disabled = true;
  btn.textContent = mode === "signin" ? "Signing in…" : "Creating account…";
  try {
    if (mode === "signup") {
      const data = await signUp(email, password);
      if (!data.session) {
        showToast("Account created. Check your email to confirm, then sign in.", "success");
        mode = "signin"; renderAuth($("#view"));
        return;
      }
      showToast("Welcome to Folio", "success");
    } else {
      await signIn(email, password);
      showToast("Signed in", "success");
    }
    // onAuth listener in main.js handles navigation.
  } catch (err) {
    showToast(err?.message || "Authentication failed", "error");
    btn.disabled = false;
    btn.textContent = mode === "signin" ? "Sign in" : "Create account";
  }
}

async function forgot() {
  const email = $("#email").value.trim();
  if (!email) { showToast("Enter your email above first", "warning"); return; }
  try {
    await resetPassword(email);
    showToast("Password reset link sent to your email", "success");
  } catch (err) {
    showToast(err?.message || "Could not send reset link", "error");
  }
}
