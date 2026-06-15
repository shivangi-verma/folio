// supabase.js — auth and per-user data sync.
//
// The Supabase client is loaded dynamically and ONLY when valid credentials are
// present in config.js, so the app has no external auth dependency until then.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

let client = null;

function configured() {
  return (
    SUPABASE_URL && SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_") &&
    SUPABASE_URL.startsWith("http")
  );
}

export function isAuthEnabled() { return !!client; }

export async function initSupabase() {
  if (!configured()) { console.log("Supabase not configured — running in local mode."); return null; }
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    console.log("Supabase initialised.");
    return client;
  } catch (e) {
    console.error("Failed to load Supabase client; staying in local mode.", e);
    client = null;
    return null;
  }
}

/* ---------- Auth ---------- */
export async function signUp(email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data; // data.session is null when email confirmation is required
}
export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOut() {
  if (client) await client.auth.signOut();
}
export async function getSession() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}
export function onAuth(cb) {
  if (!client) return;
  client.auth.onAuthStateChange((_event, session) => cb(session));
}
export async function resetPassword(email) {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) throw error;
}

/* ---------- Per-user data sync (single row per user in `profiles`) ---------- */
export async function pullState(userId) {
  const { data, error } = await client
    .from("profiles")
    .select("profile, goal, watchlist, paper, onboarded")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data; // null if no row yet
}
export async function pushState(userId, payload) {
  const { error } = await client.from("profiles").upsert({
    id: userId,
    email: payload.email,
    profile: payload.profile,
    goal: payload.goal,
    watchlist: payload.watchlist,
    paper: payload.paper,
    onboarded: payload.onboarded,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
