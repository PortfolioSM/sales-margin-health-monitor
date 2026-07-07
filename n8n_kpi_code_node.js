// =====================================================================
//  n8n "Code" node  ->  compute KPIs from sales data
//  Mode: "Run Once for All Items"  |  Language: JavaScript
//
//  Input:  1440 rows from Google Sheets (each = one day x SKU)
//  Output: 1 JSON object with KPI summary for the briefing
// =====================================================================

// --- helper: safe number parsing (handles strings and commas) ---
const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

// --- helper: ISO date shifted back by N days ("2026-07-02" -> ...) ---
const isoMinus = (dateIso, days) => {
  const d = new Date(dateIso);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

// --- helper: round to 2 decimals ---
const r2 = (x) => Math.round(x * 100) / 100;

// 1) Get all rows from the previous node
const rows = $input.all().map((i) => i.json);
if (rows.length === 0) {
  throw new Error("No input data - check the Google Sheets node.");
}

// 2) Find the latest date in the data (our "yesterday")
const latestDate = rows
  .map((r) => r.date)
  .sort()
  .slice(-1)[0];

// 3) Build two time windows: last 7 days and previous 7 days
const window7 = new Set();
const windowPrev = new Set();
for (let k = 0; k < 7; k++) window7.add(isoMinus(latestDate, k));
for (let k = 7; k < 14; k++) windowPrev.add(isoMinus(latestDate, k));

// 4) Sum revenue and cost (COGS) per window + for the latest day
let revDay = 0, cogsDay = 0;     // latest day
let rev7 = 0, cogs7 = 0;         // last 7 days
let revPrev = 0, cogsPrev = 0;   // previous 7 days

for (const row of rows) {
  const rev = num(row.revenue);
  const cogs = num(row.cogs);

  if (row.date === latestDate) { revDay += rev; cogsDay += cogs; }
  if (window7.has(row.date))        { rev7 += rev;     cogs7 += cogs; }
  else if (windowPrev.has(row.date)) { revPrev += rev; cogsPrev += cogs; }
}

// 5) Margin % (guard against division by zero)
const marginPct = (rev, cogs) => (rev > 0 ? ((rev - cogs) / rev) * 100 : 0);

const marginDayPct = marginPct(revDay, cogsDay);
const margin7Pct = marginPct(rev7, cogs7);
const marginPrevPct = marginPct(revPrev, cogsPrev);

// 6) Week-over-week changes
const wowRevenuePct = revPrev > 0 ? ((rev7 - revPrev) / revPrev) * 100 : 0;
const wowMarginPp = margin7Pct - marginPrevPct; // difference in percentage points

// 7) Return a single object with ready KPIs
return [
  {
    json: {
      briefing_date: latestDate,
      // latest day
      revenue_day: r2(revDay),
      margin_day_value: r2(revDay - cogsDay),
      margin_day_pct: r2(marginDayPct),
      // last 7 days
      revenue_7d: r2(rev7),
      margin_7d_pct: r2(margin7Pct),
      // previous 7 days (comparison baseline)
      revenue_prev7d: r2(revPrev),
      margin_prev7d_pct: r2(marginPrevPct),
      // week-over-week changes
      wow_revenue_pct: r2(wowRevenuePct),
      wow_margin_pp: r2(wowMarginPp),
    },
  },
];
