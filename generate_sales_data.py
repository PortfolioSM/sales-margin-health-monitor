# -*- coding: utf-8 -*-
"""
Synthetic sales-data generator for the portfolio project
"Sales & Margin Health Monitor".

Creates a realistic but ENTIRELY FICTIONAL e-commerce sales CSV
(a generic apparel shop - no connection to any real company):
- a dozen SKUs across several apparel categories,
- daily sales for the last ~120 days,
- weekly seasonality (stronger weekends) + mild trend + random noise,
- injected ANOMALIES (margin drop, demand spike, stockout, cost increase)
  so the monitor has something to detect.

No real company data. The random SEED is fixed, so results are reproducible.

How to run:
    python generate_sales_data.py
Dependencies: Python standard library only. Nothing to install.
Output: sales_data.csv in the same folder.
"""

import csv
import random
from datetime import date, timedelta

# --- CONFIG ------------------------------------------------------------------

SEED = 42
DAYS_HISTORY = 120
END_DATE = date(2026, 7, 2)   # last day of data ("yesterday")
OUTPUT_FILE = "sales_data.csv"

# Catalog: (SKU, name, category, base_price, unit_cost, base_demand)
# base_demand = average units sold per day
PRODUCTS = [
    ("TSH-001", "Basic cotton tee",        "T-shirts",     59.00,  19.00, 45),
    ("TSH-002", "Premium oversize tee",    "T-shirts",     89.00,  31.00, 30),
    ("SHI-101", "Linen slim shirt",        "Shirts",      159.00,  62.00, 18),
    ("SHI-102", "Flannel check shirt",     "Shirts",      139.00,  54.00, 15),
    ("TRO-201", "Chino trousers",          "Trousers",    179.00,  70.00, 22),
    ("TRO-202", "Regular jeans",           "Trousers",    199.00,  82.00, 25),
    ("TRO-203", "Jogger sweatpants",       "Trousers",    119.00,  40.00, 28),
    ("HOO-301", "Hooded sweatshirt",       "Hoodies",     189.00,  72.00, 20),
    ("HOO-302", "Crewneck sweatshirt",     "Hoodies",     159.00,  60.00, 16),
    ("JKT-401", "Transitional parka",      "Jackets",     399.00, 175.00,  8),
    ("JKT-402", "Denim jacket",            "Jackets",     259.00, 105.00, 10),
    ("ACC-501", "Beanie hat",              "Accessories",  49.00,  14.00, 35),
]

# --- ANOMALIES (injected events the monitor should catch) --------------------
# Each: SKU, start offset (days back from END_DATE), duration, type, strength.
ANOMALIES = [
    {"sku": "TRO-202", "start_offset": 6,  "days": 4,  "type": "price_drop",   "strength": 0.75},
    {"sku": "TSH-001", "start_offset": 3,  "days": 2,  "type": "demand_spike", "strength": 3.2},
    {"sku": "JKT-401", "start_offset": 9,  "days": 5,  "type": "stockout",     "strength": 0.0},
    {"sku": "SHI-101", "start_offset": 10, "days": 10, "type": "cost_increase","strength": 1.35},
]


def seasonal_multiplier(day):
    """Demand multiplier by weekday (weekends stronger)."""
    weights = {0: 1.15, 1: 0.95, 2: 0.90, 3: 0.95, 4: 1.10, 5: 1.30, 6: 1.25}
    return weights[day.weekday()]


def active_anomalies(sku, day, end_day):
    """Return anomalies active for a given SKU and day."""
    matches = []
    for a in ANOMALIES:
        if a["sku"] != sku:
            continue
        start = end_day - timedelta(days=a["start_offset"])
        finish = start + timedelta(days=a["days"] - 1)
        if start <= day <= finish:
            matches.append(a)
    return matches


def generate():
    """Main generator loop. Returns a list of rows (dicts)."""
    random.seed(SEED)
    rows = []
    start_date = END_DATE - timedelta(days=DAYS_HISTORY - 1)

    for i in range(DAYS_HISTORY):
        day = start_date + timedelta(days=i)
        trend = 1.0 + 0.0015 * i            # slight growth over time
        season = seasonal_multiplier(day)

        for sku, name, category, base_price, base_cost, base_demand in PRODUCTS:
            price = base_price
            cost = base_cost
            demand = base_demand * trend * season

            for a in active_anomalies(sku, day, END_DATE):
                if a["type"] == "price_drop":
                    price = round(base_price * a["strength"], 2)
                    demand *= 1.6
                elif a["type"] == "demand_spike":
                    demand *= a["strength"]
                elif a["type"] == "stockout":
                    demand = 0.0
                elif a["type"] == "cost_increase":
                    cost = round(base_cost * a["strength"], 2)

            units = max(0, round(demand * random.uniform(0.80, 1.20)))

            revenue = round(units * price, 2)
            cogs = round(units * cost, 2)
            gross_margin = round(revenue - cogs, 2)
            gross_margin_pct = round((gross_margin / revenue) * 100, 2) if revenue > 0 else 0.0

            rows.append({
                "date": day.isoformat(),
                "sku": sku,
                "product": name,
                "category": category,
                "units_sold": units,
                "unit_price": price,
                "unit_cost": cost,
                "revenue": revenue,
                "cogs": cogs,
                "gross_margin": gross_margin,
                "gross_margin_pct": gross_margin_pct,
            })
    return rows


def save_csv(rows, path):
    """Write rows to CSV (UTF-8, comma separator)."""
    if not rows:
        raise ValueError("No data to write - the rows list is empty.")
    headers = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    try:
        data = generate()
        save_csv(data, OUTPUT_FILE)
        total_revenue = sum(r["revenue"] for r in data)
        print(f"OK: generated {len(data)} rows -> {OUTPUT_FILE}")
        print(f"Date range: {data[0]['date']} -> {data[-1]['date']}")
        print(f"Total revenue in period: {total_revenue:,.2f} PLN")
    except Exception as e:
        print(f"ERROR while generating data: {e}")
        raise
