"""
Menu Engineering — Sprint 3 of Culinary Intelligence Phase 2.

Classifies recipes into Stars / Plowhorses / Puzzles / Dogs using the
BCG-style popularity × profitability matrix. Also exposes a what-if endpoint
for cost/price sensitivity analysis.

Sprint P0 update: profit now uses `total_cost_per_portion` (food + labor +
overhead) instead of the legacy food-only `cost_per_portion`, so classifications
reflect real profitability (matching CaterTrax / Gastrokaisen behavior).

Extracted from server.py in the refactor sprint. LOGIC UNCHANGED.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from dependencies import get_current_user, User

menu_engineering_router = APIRouter(prefix="/menu-engineering", tags=["Menu Engineering"])


@menu_engineering_router.get("/analyze")
async def analyze_menu_engineering(
    days: int = 90,
    user: User = Depends(get_current_user),
):
    """Classify every recipe with a sell price into Stars / Plowhorses / Puzzles / Dogs.

    Popularity = number of times the recipe appears across (a) proposal order_items
    of type Food in the last `days` days and (b) production batches POSTED in same
    window. Profit = sell_price - cost_per_portion (raw $).
    Thresholds: above company-average for popularity and profit → high.
    """
    if days <= 0 or days > 730:
        raise HTTPException(status_code=400, detail="days must be between 1 and 730")

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_iso = cutoff.isoformat()

    recipes = await db.recipes.find(
        {"company_id": user.company_id},
        {"_id": 0, "recipe_id": 1, "name": 1, "category": 1,
         "cost_per_portion": 1, "default_portion_price": 1, "sell_price": 1,
         "recipe_type": 1,
         # Sprint P0 fields — total cost per portion must be in the projection
         # so menu-engineering classifies using food+labor+overhead (not food-only).
         "total_cost_per_portion": 1, "food_cost": 1,
         "labor_cost": 1, "overhead_cost": 1, "total_cost_full": 1},
    ).to_list(2000)
    recipes = [r for r in recipes if (r.get("default_portion_price") or r.get("sell_price") or 0) > 0]

    if not recipes:
        return {
            "window_days": days,
            "recipes": [],
            "quadrants_summary": {"star": 0, "plowhorse": 0, "puzzle": 0, "dog": 0},
            "thresholds": {"popularity_avg": 0, "profit_avg": 0},
        }

    recipe_ids = [r["recipe_id"] for r in recipes]

    cursor = db.order_items.find(
        {
            "company_id": user.company_id,
            "reference_id": {"$in": recipe_ids},
            "item_type": "Food",
            "created_at": {"$gte": cutoff_iso},
        },
        {"_id": 0, "reference_id": 1, "quantity": 1},
    )
    pop_proposals = {}
    async for it in cursor:
        rid = it.get("reference_id")
        if rid:
            pop_proposals[rid] = pop_proposals.get(rid, 0) + float(it.get("quantity") or 1)

    cursor = db.production_batches.find(
        {
            "company_id": user.company_id,
            "status": "POSTED",
            "posted_at": {"$gte": cutoff_iso},
        },
        {"_id": 0, "lines": 1},
    )
    pop_production = {}
    async for batch in cursor:
        for line in batch.get("lines", []):
            rid = line.get("recipe_id")
            if rid in recipe_ids:
                pop_production[rid] = pop_production.get(rid, 0) + float(line.get("target_output_qty") or 1)

    rows = []
    for r in recipes:
        rid = r["recipe_id"]
        sell = float(r.get("default_portion_price") or r.get("sell_price") or 0)
        # Use TOTAL cost (food + labor + overhead) not just food cost — the CaterTrax/Gastrokaisen way.
        # Fall back to legacy cost_per_portion (food only) if new field not populated yet.
        cost = float(r.get("total_cost_per_portion") or r.get("cost_per_portion") or 0)
        food_only_cost = float(r.get("cost_per_portion") or 0)
        profit = sell - cost
        popularity = pop_proposals.get(rid, 0) + pop_production.get(rid, 0)
        rows.append({
            "recipe_id": rid,
            "recipe_name": r.get("name"),
            "category": r.get("category"),
            "recipe_type": r.get("recipe_type", "Final"),
            "sell_price": round(sell, 4),
            "cost_per_portion": round(cost, 4),  # total cost per portion (food+labor+overhead)
            "food_cost_only": round(food_only_cost, 4),  # kept for reference
            "labor_cost": round(float(r.get("labor_cost") or 0), 4),
            "overhead_cost": round(float(r.get("overhead_cost") or 0), 4),
            "profit_per_portion": round(profit, 4),
            "profit_margin_percent": round(((profit / sell) * 100) if sell > 0 else 0, 2),
            "popularity_score": round(popularity, 2),
            "popularity_from_proposals": round(pop_proposals.get(rid, 0), 2),
            "popularity_from_production": round(pop_production.get(rid, 0), 2),
        })

    pop_values = [x["popularity_score"] for x in rows]
    profit_values = [x["profit_per_portion"] for x in rows]
    pop_avg = (sum(pop_values) / len(pop_values)) if pop_values else 0
    profit_avg = (sum(profit_values) / len(profit_values)) if profit_values else 0

    summary = {"star": 0, "plowhorse": 0, "puzzle": 0, "dog": 0}
    for row in rows:
        high_pop = row["popularity_score"] >= pop_avg
        high_prof = row["profit_per_portion"] >= profit_avg
        if high_pop and high_prof:
            row["quadrant"] = "star"
        elif high_pop and not high_prof:
            row["quadrant"] = "plowhorse"
        elif not high_pop and high_prof:
            row["quadrant"] = "puzzle"
        else:
            row["quadrant"] = "dog"
        summary[row["quadrant"]] += 1

    quadrant_order = {"star": 0, "puzzle": 1, "plowhorse": 2, "dog": 3}
    rows.sort(key=lambda x: (quadrant_order.get(x["quadrant"], 9), -x["popularity_score"]))

    return {
        "window_days": days,
        "recipes": rows,
        "quadrants_summary": summary,
        "thresholds": {
            "popularity_avg": round(pop_avg, 2),
            "profit_avg": round(profit_avg, 4),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


class WhatIfRequest(BaseModel):
    recipe_id: str
    new_cost_per_portion: Optional[float] = None
    new_sell_price: Optional[float] = None
    days: int = 90


@menu_engineering_router.post("/what-if")
async def what_if_menu_engineering(data: WhatIfRequest, user: User = Depends(get_current_user)):
    """Re-classify a single recipe with hypothetical cost/price, leaving its popularity
    unchanged. Returns the current quadrant and the simulated quadrant side-by-side."""
    analysis = await analyze_menu_engineering(days=data.days, user=user)
    thresholds = analysis["thresholds"]
    current_row = next((r for r in analysis["recipes"] if r["recipe_id"] == data.recipe_id), None)
    if not current_row:
        raise HTTPException(status_code=404, detail="Recipe not found in analysis window")

    new_cost = float(data.new_cost_per_portion) if data.new_cost_per_portion is not None else current_row["cost_per_portion"]
    new_sell = float(data.new_sell_price) if data.new_sell_price is not None else current_row["sell_price"]
    new_profit = new_sell - new_cost
    popularity = current_row["popularity_score"]
    high_pop = popularity >= thresholds["popularity_avg"]
    high_prof = new_profit >= thresholds["profit_avg"]
    if high_pop and high_prof:
        sim_quadrant = "star"
    elif high_pop and not high_prof:
        sim_quadrant = "plowhorse"
    elif not high_pop and high_prof:
        sim_quadrant = "puzzle"
    else:
        sim_quadrant = "dog"

    return {
        "recipe_id": data.recipe_id,
        "recipe_name": current_row["recipe_name"],
        "current": {
            "cost_per_portion": current_row["cost_per_portion"],
            "sell_price": current_row["sell_price"],
            "profit_per_portion": current_row["profit_per_portion"],
            "quadrant": current_row["quadrant"],
        },
        "simulated": {
            "cost_per_portion": round(new_cost, 4),
            "sell_price": round(new_sell, 4),
            "profit_per_portion": round(new_profit, 4),
            "quadrant": sim_quadrant,
        },
        "popularity_score": popularity,
        "thresholds": thresholds,
    }
