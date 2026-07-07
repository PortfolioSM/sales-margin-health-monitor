// =====================================================================
//  workflow_feeder.json ("Data Feeder") - n8n "Code" node -> generate synthetic sales
//  Mode: "Run Once for All Items"  |  Language: JavaScript
//
//  Simulates an ERP / warehouse export. On each run it generates a full
//  ~120-day daily sales dataset ending TODAY, so the Monitor always has
//  fresh data. In production this whole node is replaced by a real
//  connector (MS SQL / ERP API / file drop).
//
//  Output: one item per row (date x SKU) -> feed into Google Sheets Append.
// =====================================================================

// --- CONFIG ---
const DAYS_HISTORY = 120;

// Catalog: [SKU, name, category, base_price, unit_cost, base_demand]
const PRODUCTS = [
  ["TSH-001", "Basic cotton tee",     "T-shirts",     59.0,  19.0, 45],
  ["TSH-002", "Premium oversize tee", "T-shirts",     89.0,  31.0, 30],
  ["SHI-101", "Linen slim shirt",     "Shirts",      159.0,  62.0, 18],
  ["SHI-102", "Flannel check shirt",  "Shirts",      139.0,  54.0, 15],
  ["TRO-201", "Chino trousers",       "Trousers",    179.0,  70.0, 22],
  ["TRO-202", "Regular jeans",        "Trousers",    199.0,  82.0, 25],
  ["TRO-203", "Jogger sweatpants",    "Trousers",    119.0,  40.0, 28],
  ["HOO-301", "Hooded sweatshirt",    "Hoodies",     189.0,  72.0, 20],
  ["HOO-302", "Crewneck sweatshirt",  "Hoodies",     159.0,  60.0, 16],
  ["JKT-401", "Transitional parka",   "Jackets",     399.0, 175.0,  8],
  ["JKT-402", "Denim jacket",         "Jackets",     259.0, 105.0, 10],
  ["ACC-501", "Beanie hat",           "Accessories",  49.0,  14.0, 35],
];

// Injected anomalies: [SKU, startOffset days back, duration days, type, strength]
const ANOMALIES = [
  ["TRO-202", 6,  4,  "price_drop",    0.75],
  ["TSH-001", 3,  2,  "demand_spike",  3.2],
  ["JKT-401", 9,  5,  "stockout",      0.0],
  ["SHI-101", 10, 10, "cost_increase", 1.35],
];

// Weekday demand multiplier (JS getDay: 0=Sun ... 6=Sat) - weekends stronger
const WEEKDAY = { 0: 1.25, 1: 1.15, 2: 0.95, 3: 0.90, 4: 0.95, 5: 1.10, 6: 1.30 };

// --- helpers ---
const iso = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const r2 = (x) => Math.round(x * 100) / 100;

// End date = today (local midnight); start = 119 days earlier
const end = new Date();
end.setHours(0, 0, 0, 0);
const start = new Date(end);
start.setDate(start.getDate() - (DAYS_HISTORY - 1));

// Precompute anomaly date windows as ISO string sets per SKU
const anomalyByDay = ANOMALIES.map(([sku, off, dur, type, strength]) => {
  const s = new Date(end); s.setDate(s.getDate() - off);
  const f = new Date(s);   f.setDate(f.getDate() + dur - 1);
  const days = new Set();
  for (let d = new Date(s); d <= f; d.setDate(d.getDate() + 1)) days.add(iso(d));
  return { sku, type, strength, days };
});

const rows = [];

for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const dayIso = iso(d);
  const trend = 1.0 + 0.0015 * Math.round((d - start) / 86400000); // slight growth
  const season = WEEKDAY[d.getDay()];

  for (const [sku, name, category, basePrice, baseCost, baseDemand] of PRODUCTS) {
    let price = basePrice;
    let cost = baseCost;
    let demand = baseDemand * trend * season;

    // apply any active anomalies for this SKU/day
    for (const a of anomalyByDay) {
      if (a.sku !== sku || !a.days.has(dayIso)) continue;
      if (a.type === "price_drop")    { price = r2(basePrice * a.strength); demand *= 1.6; }
      else if (a.type === "demand_spike") { demand *= a.strength; }
      else if (a.type === "stockout")     { demand = 0.0; }
      else if (a.type === "cost_increase"){ cost = r2(baseCost * a.strength); }
    }

    // random noise +/-20%, rounded to whole units
    const units = Math.max(0, Math.round(demand * (0.8 + Math.random() * 0.4)));

    const revenue = r2(units * price);
    const cogs = r2(units * cost);
    const grossMargin = r2(revenue - cogs);
    const grossMarginPct = revenue > 0 ? r2((grossMargin / revenue) * 100) : 0;

    rows.push({
      date: dayIso,
      sku,
      product: name,
      category,
      units_sold: units,
      unit_price: price,
      unit_cost: cost,
      revenue,
      cogs,
      gross_margin: grossMargin,
      gross_margin_pct: grossMarginPct,
    });
  }
}

// Return one n8n item per row (for the Google Sheets Append node)
return rows.map((r) => ({ json: r }));
