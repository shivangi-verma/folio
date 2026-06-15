// data.js — static reference data: stock universe, benchmarks, profession tips, lessons

// Curated large-cap, liquid universe (≈ Nifty 50) used by the recommender.
// Beginners are steered here rather than the full 9,500-symbol exchange list.
export const UNIVERSE = [
  "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "HINDUNILVR", "ITC", "SBIN",
  "BHARTIARTL", "LT", "KOTAKBANK", "BAJFINANCE", "AXISBANK", "ASIANPAINT", "MARUTI",
  "HCLTECH", "SUNPHARMA", "TITAN", "WIPRO", "NTPC", "POWERGRID", "CIPLA", "TECHM",
  "BAJAJFINSV", "TATAMOTORS", "TATASTEEL", "JSWSTEEL", "ADANIENT", "HINDALCO", "COALINDIA",
];

// Long-run reference returns (annual %), used by the reality-check.
export const BENCHMARKS = {
  savings: 3.5,
  fd: 7,
  inflation: 6,
  gold: 9,
  nifty: 12,        // broad index long-term average
  topFunds: 15,     // strong, sustained equity funds
  rareElite: 22,    // achievable only by a few, rarely sustained
};

// Profession-aware blueprint tips, keyed by employment type.
export const EMPLOYMENT_TIPS = {
  salaried: [
    { icon: "ph-repeat", title: "Automate a monthly SIP", text: "Steady salary is your superpower — set up an auto-debit SIP on payday so investing happens before you can spend it." },
    { icon: "ph-receipt", title: "Use tax-advantaged routes", text: "ELSS funds, EPF/VPF and NPS lower your tax bill while building long-term wealth. Max these before chasing individual stocks." },
    { icon: "ph-gift", title: "Don't over-concentrate in your employer", text: "If you hold ESOPs/RSUs, your salary and that stock share one fate. Diversify the rest of your portfolio away from your company and sector." },
  ],
  business: [
    { icon: "ph-wave-sine", title: "Plan for lumpy cash flow", text: "Income varies, so keep a larger buffer (6–9 months) and invest windfalls as lump sums into your core allocation instead of timing the market." },
    { icon: "ph-scales", title: "Separate business and personal wealth", text: "Your business is already a concentrated, high-risk bet. Your market portfolio should be the diversified, boring counterweight to it." },
    { icon: "ph-shield-check", title: "Liquidity before growth", text: "Keep an emergency + working-capital reserve in liquid funds before allocating to equities you may need to sell at a bad time." },
  ],
  freelancer: [
    { icon: "ph-calendar-check", title: "Invest on a fixed date, not on mood", text: "Irregular income tempts irregular investing. Pick one day a month and invest whatever your minimum target is, top up in good months." },
    { icon: "ph-umbrella", title: "Build a deeper safety net", text: "No paid leave or PF means your emergency fund (6+ months) and own retirement plan (NPS / index SIP) matter even more." },
    { icon: "ph-percent", title: "Set aside tax with every invoice", text: "Park advance-tax money in a liquid fund so it earns a little until it's due — and never gets confused with investable surplus." },
  ],
  student: [
    { icon: "ph-seedling", title: "Time is your biggest asset", text: "Even ₹500/month started now beats large sums started later, thanks to decades of compounding. Begin tiny, stay consistent." },
    { icon: "ph-book-open", title: "Invest in learning first", text: "Paper-trade and read before risking real money. The habits you build now compound as much as the money does." },
    { icon: "ph-chart-line-up", title: "Start with one index SIP", text: "A single low-cost Nifty index fund teaches you the rhythm of investing without needing to pick winners." },
  ],
  retired: [
    { icon: "ph-shield", title: "Protect capital first", text: "At this stage, avoiding large drawdowns matters more than chasing high returns. Tilt toward debt, large-caps and dividend payers." },
    { icon: "ph-drop", title: "Build an income ladder", text: "Use SWPs, dividend stocks and bonds to create predictable monthly income, keeping 2–3 years of expenses in safe instruments." },
    { icon: "ph-heart", title: "Keep a small growth sleeve", text: "A modest equity allocation helps your corpus outpace inflation over a long retirement — just keep it sized to what you can sleep on." },
  ],
};

// Bite-sized lessons unlocked during the journey.
export const LESSONS = [
  {
    id: "what-is-a-stock", icon: "ph-buildings", title: "What a stock actually is", time: "3 min",
    summary: "Owning a share means owning a tiny slice of a real business — not a lottery ticket.",
    body: [
      "A share of stock is a small ownership stake in a company. When the business grows its profits over years, your slice tends to become more valuable.",
      "Prices wobble daily on news and emotion, but over long periods they tend to follow the actual earnings of the company.",
      "That's why investing is about owning good businesses for years — not guessing tomorrow's price.",
    ],
  },
  {
    id: "risk-and-reward", icon: "ph-scales", title: "Risk and reward are linked", time: "3 min",
    summary: "Higher potential returns always come with higher chances of loss. There is no free lunch.",
    body: [
      "Safe assets (FDs, savings) return little but rarely fall. Equities can compound strongly but can also drop 30–50% in bad years.",
      "Anyone promising high returns with no risk is selling something. Match the risk you take to your timeline and your sleep.",
      "Folio scores each idea with a risk band so you can see what you're signing up for.",
    ],
  },
  {
    id: "power-of-compounding", icon: "ph-chart-line-up", title: "The power of compounding", time: "4 min",
    summary: "Returns earning returns is the quiet engine behind almost all wealth.",
    body: [
      "₹10,000/month at 12% for 25 years becomes roughly ₹1.9 crore — most of which is growth, not your contributions.",
      "The earlier you start, the more time does the heavy lifting. Delay of even 5 years can cut your final corpus dramatically.",
      "Compounding rewards patience and consistency far more than clever timing.",
    ],
  },
  {
    id: "diversification", icon: "ph-squares-four", title: "Don't bet it all on one", time: "3 min",
    summary: "Spreading across companies and sectors smooths the ride and protects you from any single failure.",
    body: [
      "Even great-looking companies can stumble. Holding 12–20 names across sectors means no single mistake sinks your plan.",
      "Index funds give instant diversification in one purchase — a sensible core for most beginners.",
      "Use individual stocks as a smaller 'satellite' around that core, not the whole portfolio.",
    ],
  },
  {
    id: "sip-vs-lumpsum", icon: "ph-repeat", title: "SIP: investing on autopilot", time: "3 min",
    summary: "Investing a fixed amount regularly removes emotion and timing from the equation.",
    body: [
      "A Systematic Investment Plan buys more units when prices are low and fewer when high — averaging your cost over time.",
      "It turns investing into a boring monthly habit, which is exactly what builds wealth.",
      "For most people with a salary, an automated SIP beats trying to time lump sums.",
    ],
  },
  {
    id: "emergency-fund", icon: "ph-umbrella", title: "Emergency fund first", time: "2 min",
    summary: "Before investing, set aside 3–6 months of expenses you can reach instantly.",
    body: [
      "Investments can fall right when you need cash. An emergency fund means you never have to sell at the worst time.",
      "Keep it in a savings account or liquid fund — boring and accessible, not invested in stocks.",
      "This single step is what lets you stay invested through scary markets.",
    ],
  },
  {
    id: "reading-a-stock", icon: "ph-magnifying-glass", title: "Reading the basics", time: "4 min",
    summary: "P/E, market cap and 52-week range — what the numbers on a stock card mean.",
    body: [
      "Market cap = company size (large-caps are steadier, small-caps swingier). P/E roughly says how expensive the stock is versus its earnings.",
      "The 52-week range shows where today's price sits between its yearly high and low.",
      "None of these alone is a buy signal — they're context. Folio combines them into a single fit score for you.",
    ],
  },
  {
    id: "avoid-hype", icon: "ph-fire-simple", title: "Beware of hype and tips", time: "3 min",
    summary: "If a 'sure-shot multibagger' is circulating on social media, you're usually the exit, not the entry.",
    body: [
      "Hot tips, Telegram groups and 'guaranteed' calls are how beginners lose money fastest.",
      "Real wealth is slow and unglamorous. Be suspicious of urgency and anyone discouraging you from doing your own research.",
      "Folio never tells you to buy — it surfaces ideas with reasons so you can decide and verify yourself.",
    ],
  },
];
