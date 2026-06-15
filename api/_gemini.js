// api/_gemini.js — shared Gemini call logic (server-side only).
// Used by both the Vercel serverless function (api/advise.js) and the local
// dev server (server.js). The API key is read from the environment and never
// reaches the browser.

const DEFAULT_MODEL = "gemini-flash-lite-latest";

const SYSTEMS = {
  blueprint:
    "You are Folio, an educational investing companion for first-time investors in India. " +
    "Using ONLY the plan facts provided, write a short, warm, plain-English explanation of the user's " +
    "plan in at most two short paragraphs, under 110 words total. " +
    "Rules: use only the numbers given and never invent figures; never tell the user to buy or sell any " +
    "specific stock or fund; avoid jargon; be encouraging but realistic; address the reader as 'you'. " +
    "Return plain text only, with no markdown and no headings.",
};

async function advise({ kind, facts }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const system = SYSTEMS[kind] || SYSTEMS.blueprint;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ parts: [{ text: "Plan facts:\n" + JSON.stringify(facts, null, 2) }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Gemini " + res.status + ": " + t.slice(0, 300));
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => p && p.text && p.thought !== true).map((p) => p.text).join("").trim();
  if (!text) throw new Error("Gemini returned no text");
  return { text, model };
}

module.exports = { advise };
