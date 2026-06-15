Folio is an educational stock recommendation and investor onboarding web app for first time equity investors in India. It walks a beginner through a short onboarding flow, builds a quantified risk profile from their background and goals, checks whether their target is realistic, and surfaces stock ideas drawn from past performance with a written reason for each one. It is a learning and discovery tool. It is not a broker, it is not investment advice, and it never places trades.

This README explains what the app does, how a user moves through it, how it is built, and how each part actually works, including the formulas the engine uses.

## Contents

1. Overview and positioning
2. The user journey
3. Architecture
4. How each part works
   - Onboarding and risk profiling
   - Reality check
   - Recommendation engine
   - Wealth blueprint
   - Watchlist, paper trading, learn
   - Authentication and data sync
   - AI advisor (Gemini)
5. Data and external services
6. Where data is stored
7. Technology
8. Project structure
9. How to run
10. Using the app
11. Enabling accounts and sync (Supabase)
12. Configuration and tuning
13. Resetting the app
14. Roadmap
15. Limitations and disclaimer
16. Deploying to Vercel (step by step)

## 1. Overview and positioning

A large number of new retail investors enter the Indian market each year without a clear sense of how much risk they can take, what returns are realistic, or which stocks suit them. Folio is built to close that preparation gap. It treats recommendation as education: every idea comes with the reasoning and the numbers behind it, the system corrects unrealistic goals instead of rejecting them, and it always leaves the decision and the execution with the user and their licensed broker.

The guiding design principle is **rules are the brain, language is the voice**. A transparent, deterministic engine decides every recommendation and computes every figure. Any natural language layer added later (Google Gemini is planned) is only allowed to rephrase those facts for a beginner. It never invents a number and never says buy or sell. This keeps the output accurate, explainable, and on the correct side of investment advice regulations.

## 2. The user journey

1. **Onboarding.** A six step wizard records the user's work and industry, age, income band, savings and monthly surplus, prior experience, a financial goal with a target amount and target year, and an attitude towards risk.
2. **Profile.** From those answers the app computes a risk score out of 100 and assigns an investor archetype, such as Capital Protector or Balanced Grower.
3. **Reality check.** The app computes the annual return the stated goal actually requires and classifies it. If the goal is unrealistic, it explains the gap and offers three concrete ways to fix it, with live sliders.
4. **Dashboard (Home).** The user lands on a dashboard showing goal progress and their watchlist.
5. **Picks.** A recommendation feed scores a curated set of large companies and groups them into risk tiers, each stock carrying a fit score and a one line reason.
6. **Blueprint.** A personalised plan with a suggested allocation, profession specific tips, and a projection chart.
7. **Watchlist, paper trading, and learn.** The user bookmarks stocks, practises with virtual money, and reads short lessons.

When Supabase keys are configured, step 1 is preceded by sign in or sign up, and everything the user creates is saved to their account and synced across devices.

## 3. Architecture

Folio is a single page application built from plain HTML, CSS, and JavaScript modules, with no build step. It is organised in three layers.

- **Presentation layer.** The screens the user sees, one module per screen in `js/views/`, plus a shared design system in `styles.css` and shared card rendering in `js/components.js`.
- **Application logic.** A hash based router and navigation (`js/main.js`), an in memory state store with persistence (`js/store.js`), the deterministic engine (`js/engine.js`), the guidance text generator (`js/advisor.js`), the quote client and symbol search (`js/quotes.js`), and the optional auth and sync layer (`js/supabase.js`).
- **Data layer.** A live quote service reached over the network, the exchange symbol directory held in the browser database, and browser storage for the user's own data.

Routing is driven by the URL hash. Changing the hash (for example to `picks`) triggers the router, which clears the main outlet and calls the matching view's render function. When authentication is enabled, the router gates every route behind sign in.

## 4. How each part works

### Onboarding and risk profiling

The wizard collects answers into a draft object, validates each step, and on completion calls `computeRiskProfile` in `js/engine.js`. The risk score starts from the stated risk appetite and is then adjusted for capacity and temperament.

| Input | Effect on the risk score |
| --- | --- |
| Risk appetite | Base value: conservative 28, balanced 52, aggressive 76 |
| Time horizon | Up to +20, since a longer horizon allows more risk |
| Age | Between +15 and -10, since youth allows more risk |
| Reaction to a 30% drop | Panic and sell -12, worry but hold 0, buy more +12 |
| Prior experience | Never -16, beginner -8, some +2, active +8 |

Beginners (never invested or just starting) are then capped at 70 so they cannot be pushed into the most aggressive band even if they describe themselves as aggressive. The result is clamped to the range 5 to 98 and mapped to an archetype.

| Risk score | Archetype | Risk band for matching |
| --- | --- | --- |
| Below 35 | Capital Protector | 1 (low) |
| 35 to 54 | Steady Builder | 2 (medium) |
| 55 to 74 | Balanced Grower | 2 to 3 |
| 75 and above | Growth Seeker | 3 (high) |

The profile also derives an equity ceiling, computed as 25 plus 0.7 times the score and clamped between 25 and 90, which the blueprint uses for allocation. Beginners receive a "Careful" prefix on their archetype and are kept out of the top risk band.

### Reality check

This is the feature that anchors expectations. Given the user's starting capital, monthly contribution, target amount, and the number of years to the target, `buildRealityCheck` solves for the annual return the plan requires. Because there is no closed form for the rate when regular contributions are involved, the engine uses a bisection search over the compound interest formula for an initial lump sum plus a monthly series. The required return is then classified.

| Required annual return | Verdict |
| --- | --- |
| Up to 8% | Comfortable, safer instruments can suffice |
| 8% to 13% | Realistic, in line with long run broad equity |
| 13% to 22% | Ambitious, demanding and needs discipline |
| Above 22% | Unrealistic, rarely sustained |

For context the engine uses reference returns of about 12% for broad Indian equity over the long run, about 15% for strong sustained funds, and treats 22% and above as very rarely sustained. When a goal is ambitious or unrealistic, the app shows three corrective paths computed at the realistic 12% rate: give it more time (the year by which the goal becomes realistic), invest a little more (the monthly amount that reaches it on time), or aim for what is realistic (the amount the current plan is actually on course for). The onboarding screen exposes sliders for the target year and the monthly amount so the user can watch an unrealistic plan move into a realistic range in real time.

### Recommendation engine

The recommender scores a curated universe of thirty large capitalisation NSE stocks (defined in `js/data.js`). For each stock `scoreStock` computes a fit score out of 100 as a weighted sum of four factors.

| Factor | Weight | What it measures |
| --- | --- | --- |
| Performance (momentum) | 35% | Where the current price sits within its 52 week range |
| Risk fit | 30% | How closely the stock's risk band matches the user's profile band |
| Quality | 20% | Positive earnings, a sane price to earnings ratio, and company size |
| Horizon fit | 15% | Whether the stock's volatility suits the user's time horizon |

Each stock is placed in a risk band, taken first from the volatility based risk label that the quote service supplies, and falling back to market capitalisation only when no label is present.

| Risk label from the data | Band | Recommendation tier |
| --- | --- | --- |
| Low Risk | 1 | Beginner-safe |
| Moderate Risk | 2 | Steady growers |
| High or Very High Risk | 3 | Higher risk, higher reward |

Stocks are sorted by fit score and grouped into the tiers above, up to five per tier. For a very conservative or beginner profile the highest risk tier is dropped from the default view. Each card shows the fit score, the risk band, and a short rationale generated in `js/advisor.js` from the score factors, for example "Large-cap financials trading mid-range, reasonably valued. Broadly fits your Balanced Grower profile."

### Wealth blueprint

`buildBlueprint` in `js/advisor.js` turns the profile into a suggested allocation across four sleeves. The total equity proportion equals the equity ceiling from the risk profile. Within equity, an index and large cap core takes the larger share (80% of equity for beginners, otherwise 62%), with the remainder as a satellite of individual stocks. A cash buffer is always held (10%, or more for very short horizons), and debt takes whatever remains. The blueprint also suggests a monthly amount for the core, a set of tips chosen for the user's profession, do and avoid lists, a projection chart of a disciplined plan at the realistic rate, and a recommended next lesson.

### Watchlist, paper trading, and learn

The watchlist is the bookmarking feature. Stocks are added from search (Cmd or Ctrl plus K) or from the Picks feed, reordered by dragging on Home, and removed from the manage panel. Live prices are fetched and cached.

Paper trading gives the user 1,000,000 rupees of virtual cash. Buys and sells use live prices, update the cash balance, and record a holding and an activity log, so the user can practise and watch profit and loss without real money.

Learn is a small set of plain language lessons defined in `js/data.js`, covering what a stock is, risk and reward, compounding, diversification, systematic investing, emergency funds, reading the basics, and avoiding hype.

### Authentication and data sync

When Supabase keys are present in `js/config.js`, the app loads the Supabase client, requires sign in, and syncs each user's data to their account. On login it pulls the saved profile, goal, watchlist, and paper portfolio from the account and loads them into the app. On any change it pushes the updated state back, debounced. Signing out clears local data so nothing carries over between accounts. When the keys are absent, the app runs in local mode with no login and stores everything in the browser, which is the default state of this repository.

### AI advisor (Gemini)

The recommendation scores, the reality check, and every figure are produced by the deterministic engine. Google Gemini is used only as a writer: it turns the blueprint facts into a short personalised summary in plain English, shown in the "Your plan, in plain words" card on the Blueprint screen. It is handed the numbers the engine already computed and is instructed never to invent a figure and never to tell the user to buy or sell. If the call fails or is not configured, the app silently shows the built-in template summary, so it always works. The key is never placed in the browser; the request goes through a small server-side route that reads it from an environment variable. The local and Vercel setup is described in "How to run".

## 5. Data and external services

- **Quotes.** Live prices and fundamentals come from a Cloudflare Worker proxy at `https://folio.devsim.workers.dev`. A request looks like `?stock=RELIANCE,TCS`, and the response is a map keyed by ticker. For each ticker the app reads the price and daily change, the day range and 52 week high and low, market capitalisation, the price to earnings ratio, earnings per share, the sector, and a volatility based risk label. This service limits large batch requests, so the quote client requests four symbols at a time, keeps two requests in flight, and retries dropped symbols across a few rounds, which reliably retrieves the full universe. Quotes are cached for ten minutes.
- **Symbol directory.** The full set of roughly 9,500 NSE equity symbols is bundled in `NSE_CM_sym_master.json`, cached in the browser database through `symboldb.js`, and refreshed periodically from a public exchange file. It powers search and works offline once loaded.
- **Accounts.** Optional, through Supabase, as described above.

## 6. Where data is stored

In local mode and as a cache in account mode, the app uses browser local storage with these keys.

| Key | Holds |
| --- | --- |
| `folio.profile` | The investor profile, including risk score and archetype |
| `folio.goal` | The goal: target amount, target year, monthly contribution, required return, feasibility |
| `folio.watchlist` | An ordered array of bookmarked tickers |
| `folio.paper` | Virtual cash, holdings, and the trade log |
| `folio.settings` | Theme preference and the onboarded flag |
| `folio.q.<TICKER>` | A cached quote with a timestamp, expiring after ten minutes |

The symbol directory is stored separately in IndexedDB. When accounts are enabled, the same profile, goal, watchlist, and paper data are also stored as a single row per user in a Supabase `profiles` table, protected by row level security.

## 7. Technology

Plain HTML, CSS, and JavaScript modules, with no build step and no framework. The app is served as static files. It uses SortableJS for drag and drop, a local Motion library for animation, Phosphor icons, and Google Fonts (Fraunces for display type, Hanken Grotesk for the interface, Spline Sans Mono for figures). The optional Supabase client is loaded on demand from a CDN only when configured. The no build approach keeps the project simple to run and host, and is appropriate for a client side educational tool.

## 8. Project structure

```
index.html              App shell: top nav, router outlet, search and manage modals, account button
styles.css              Design system and all component styles (dark and light)
symboldb.js             IndexedDB wrapper for the NSE symbol directory
motion.js               Animation library (local)
NSE_CM_sym_master.json  Bundled NSE symbol directory (used for search)
supabase_schema.sql     Database schema and security policies for accounts
server.js               Local dev server: serves the app and the /api/advise route
.env.example            Template for the Gemini key (copy to .env.local)
fonts/, fonts.css       Bundled font assets

api/
  advise.js             Vercel serverless function: the AI advisor endpoint
  _gemini.js            Shared Gemini call logic (server side only)

js/
  main.js               Bootstrap, hash router, auth gating, navigation, modal wiring
  store.js              In memory state, localStorage persistence, sync helpers
  quotes.js             Quote fetching (Cloudflare Worker) and symbol search
  data.js               Stock universe, benchmark returns, profession tips, lessons
  engine.js             Risk profiling, reality check math, recommendation scoring (the brain)
  advisor.js            Plain language guidance: rationale and blueprint, calls the Gemini advisor (the voice)
  components.js         Shared stock card rendering
  ui.js                 Formatting, toasts, count up, small DOM helpers
  config.js             Supabase URL and anon key (placeholders by default)
  supabase.js           Supabase client, auth, and per user data sync
  views/
    auth.js             Sign in, create account, forgot password
    onboarding.js       The six step wizard and the reality check
    home.js             Dashboard: goal progress and watchlist
    picks.js            Tiered recommendations
    blueprint.js        Allocation, projection chart, tips
    paper.js            Paper trading portfolio
    learn.js            Lessons list and detail
    account.js          Signed in account dashboard
```

`app.js` in the root is the previous single file version and is no longer loaded by `index.html`. It is safe to delete. `Folio_Project_Report.docx` is the project report and is not part of the app.

## 9. How to run

The app must be served over HTTP, because browsers block JavaScript modules and `fetch` on the `file://` protocol. Do not open `index.html` by double clicking it. An internet connection is needed for live quotes and CDN assets.

The two quickest options, run from this folder:

```bash
npm start                     # Node dev server + AI advisor, on http://localhost:8000
```

```bash
python3 -m http.server 8000   # Static only (AI advisor off, templates used)
```

Then open http://localhost:8000. `npm start` runs a small Node dev server (`server.js`) that serves the static files plus the single server-side route the AI advisor uses (`/api/advise`), reading the Gemini key from `.env.local`. The Python option (or `npm run static`) serves the files only: the app still works fully, it just falls back to the built-in template wording instead of the AI-written summary. The core app needs no backend; the AI route is the one optional server piece. The VS Code Live Server extension also works (static only).

### The AI advisor route and deploying

The AI summary needs one server-side route, `/api/advise`, which holds the Gemini key.

- Locally, `npm start` provides it through `server.js`, reading `GEMINI_API_KEY` and `GEMINI_MODEL` from `.env.local` (copy `.env.example`; default model `gemini-flash-lite-latest`). Static servers such as `python3 -m http.server` do not provide the route, so the app falls back to the template summary.
- On Vercel, `api/advise.js` is the serverless function. Deploy with framework preset Other, no build command, and the project root as the output directory, then set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in the project's Environment Variables. The Supabase anon key in `js/config.js` is safe to ship. After deploying, set the Supabase Site URL and Redirect URLs to your domain so the auth email links return to the app.

The shared call logic is in `api/_gemini.js`. To extend the advisor to other text, add a new `kind` there and call `narrate(kind, facts)` from the client. The endpoint is open as written; for production add rate limiting or require the signed-in session token.

## 10. Using the app

1. On first load you reach onboarding (or sign in, if accounts are enabled). Answer the six steps, then review the reality check.
2. After finishing, the top navigation unlocks: Home, Picks, Blueprint, Paper trade, and Learn.
3. Press Cmd plus K or Ctrl plus K anywhere to search for a stock and add it to your watchlist.
4. On Home, drag watchlist cards to reorder them, and tap a card to expand its details.
5. Toggle light and dark mode with the sun or moon button at the top right.

## 11. Enabling accounts and sync (Supabase)

By default the app runs in local mode with no login. To turn on the authentication flow (sign up, sign in, forgot password) and sync each user's data to an account:

1. Create a free project at supabase.com.
2. In the Supabase dashboard open Project Settings, then API, and copy the Project URL and the anon public key.
3. Paste both into `js/config.js` as `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Do not use the service_role key.
4. Open the SQL Editor, paste the contents of `supabase_schema.sql`, and run it. This creates the `profiles` table, the row level security policies, and the trigger that creates a row for each new user.
5. Under Authentication, Providers, make sure Email is enabled. For quick local testing you can turn off "Confirm email" so new accounts can sign in right away.
6. Reload the app. Sign in is now required, and the profile, watchlist, and paper portfolio sync to the signed in account across devices.

The anon key is a public client key, protected by row level security, and is safe to keep in client code. The service_role key must never be placed in the app.

## 12. Configuration and tuning

Most behaviour can be adjusted in two files without touching the views.

- **`js/data.js`** holds the `UNIVERSE` array of tickers the recommender considers, the `BENCHMARKS` reference returns used by the reality check, the profession tips, and the lessons.
- **`js/engine.js`** holds the risk scoring weights and caps, the feasibility thresholds in `classifyFeasibility`, the scoring factor weights in `scoreStock`, and the risk band mapping in `riskBandFromQuote`.

For example, to widen the recommendation set, add tickers to `UNIVERSE`. To change what counts as an ambitious goal, edit the thresholds in `classifyFeasibility`. To re weight the recommendation score, edit the multipliers in `scoreStock`.

## 13. Resetting the app

All local data lives in the browser. To start over, clear the site's local storage from DevTools, or run this in the console and reload:

```js
Object.keys(localStorage).filter(k => k.startsWith('folio.')).forEach(k => localStorage.removeItem(k));
location.reload();
```

When accounts are enabled, signing out from the account screen also clears local data.

## 14. Roadmap

- Extend the Google Gemini advisor, which already personalises the blueprint summary, to the recommendation rationales and the reality check wording, with the engine still deciding every recommendation and number.
- Replace the single third party quote service with a dedicated data service that stores prices on a schedule and precomputes a daily ranking table.
- Incorporate genuine multi year return history so the performance factor reflects long term growth rather than the 52 week range proxy.
- Expand the universe in stages, add portfolio level analytics and alerts, add backtesting, and offer the interface as an installable mobile app.

## 15. Limitations and disclaimer

- Educational only. Folio surfaces ideas with reasons and does not give personalised investment advice, execute trades, or replace a registered investment adviser or a stock broker. Past performance does not guarantee future results.
- It depends on a third party quote service that is rate limited, so prices may be delayed and should not be treated as a real time trading feed.
- The performance factor uses the position within the 52 week range as a proxy, because genuine multi year return data is not yet connected.
- The recommendation universe is a curated set of large capitalisation NSE stocks on a single exchange.
- The Gemini advisor currently writes the blueprint summary only; the recommendation rationales and reality check wording still use built-in templates.

## 16. Deploying to Vercel (step by step)

Folio is a static site plus one serverless function (the AI advisor), which Vercel hosts natively. You do not run any server yourself. Supabase is your hosted backend, and the browser talks to it directly.

Prerequisites: a free Vercel account, and either a Git host (GitHub, GitLab, or Bitbucket) or the Vercel CLI.

### Option A — from the Vercel dashboard (recommended)

1. Put the project in a Git repository and push it. Confirm that `.env.local` is not committed: run `git status` and check it does not appear (it is listed in `.gitignore`).
2. Go to vercel.com, choose New Project, and import the repository.
3. Configure the project when prompted:
   - Framework Preset: Other.
   - Build Command: leave empty (there is no build step).
   - Output Directory: leave empty, so the repository root is served.
   - Root Directory: the folder that contains `index.html`.
4. Add Environment Variables (in the import screen, or later under Settings, Environment Variables):
   - `GEMINI_API_KEY` set to your Gemini key.
   - `GEMINI_MODEL` set to `gemini-flash-lite-latest` (optional; this is the default).
   Apply them to the Production environment (and Preview if you want preview deployments to have AI too).
5. Click Deploy. Vercel serves the static files and turns `api/advise.js` into a function at `/api/advise`.
6. You receive a URL such as `https://folio-xxxx.vercel.app`. Open it; the sign-in screen should appear.

### Option B — from the Vercel CLI

1. Install the CLI: `npm i -g vercel`.
2. From the project folder, run `vercel` and accept the defaults (no build command, output is the root).
3. Add the key: `vercel env add GEMINI_API_KEY` (paste the key, choose Production). Optionally `vercel env add GEMINI_MODEL`.
4. Deploy to production: `vercel --prod`.

### After deploying — required Supabase step

1. In Supabase, open Authentication, URL Configuration. Set Site URL to your Vercel URL (for example `https://folio-xxxx.vercel.app`) and add the same URL under Redirect URLs. Without this, the confirmation and password reset email links will not return to your app.
2. Make sure you have run `supabase_schema.sql` in the SQL Editor so the `profiles` table exists, and that Email is enabled under Authentication, Providers.

### Verifying the deployment

- The app loads and shows the sign-in screen, which confirms the Supabase keys are in place.
- Create an account, confirm it through the email, sign in, and complete onboarding.
- On the Blueprint screen, the "Your plan, in plain words" card should fill with the AI written summary. That confirms `GEMINI_API_KEY` is set correctly on Vercel. If it shows the plain template wording instead, the environment variable is missing or wrong.
- Your data should appear as a row in the Supabase `profiles` table.

### Notes

- The Supabase anon key in `js/config.js` is public by design and is fine to ship. Never put the service_role key or the Gemini key in client code. The Gemini key lives only in Vercel environment variables, and in `.env.local` for local development.
- The `/api/advise` function is open as written. For a public deployment, add rate limiting or require the Supabase session token.
- The bundled `NSE_CM_sym_master.json` (about 10 MB) is served as a static asset. The first load downloads it once, after which it is cached in the browser.
- Custom domain: add it under the Vercel project's Domains, then update the Supabase Site URL and Redirect URLs to match.
