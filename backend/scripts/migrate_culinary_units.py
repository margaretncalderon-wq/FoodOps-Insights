"""
Migrate existing ingredients to the new unit system (v2).
- Adds base_unit, cost_per_base_unit, density_g_per_ml
- Flags ambiguous data with needs_review=true
- Recomputes total_cost for all recipes after migration
"""
import sys
sys.path.insert(0, "/app/backend")

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from utils.units import (
    derive_base_unit, normalize_unit, convert as unit_convert,
    detect_density, cost_for_recipe_line, unit_kind,
)


async def migrate_ingredients(db):
    print("\n=== STEP 1: Migrate ingredients ===")
    count = 0
    fixed = 0
    flagged = 0
    cursor = db.ingredients.find({})
    async for ing in cursor:
        count += 1
        updates = {}
        needs_review = False

        category = ing.get("category", "")
        legacy_unit = normalize_unit(ing.get("unit") or "")
        legacy_cost = float(ing.get("cost_per_unit") or 0)

        # 1. base_unit
        if not ing.get("base_unit"):
            base = derive_base_unit(category)
            updates["base_unit"] = base
        else:
            base = normalize_unit(ing["base_unit"])

        # 2. density (try detection from name)
        if not ing.get("density_g_per_ml"):
            density = detect_density(ing)
            if density:
                updates["density_g_per_ml"] = density

        # 3. cost_per_base_unit (the key one)
        if ing.get("cost_per_base_unit") is None:
            # Build a temporary ingredient dict with the updates so convert() sees the new base_unit/density
            temp_ing = {**ing, **updates}
            if legacy_unit and base:
                ratio = unit_convert(1.0, legacy_unit, base, temp_ing)
                if ratio is not None and ratio > 0:
                    updates["cost_per_base_unit"] = round(legacy_cost / ratio, 6)
                else:
                    # Cross-kind without density or ambiguous unit — flag for review
                    updates["cost_per_base_unit"] = legacy_cost  # best guess
                    needs_review = True
            else:
                updates["cost_per_base_unit"] = legacy_cost
                needs_review = True

        # 4. Flag ambiguous: cross-kind unit (e.g., "Sal" with unit="unit")
        if legacy_unit:
            kind_legacy = unit_kind(legacy_unit)
            kind_base = unit_kind(base) if base else None
            if kind_legacy == "count" and kind_base in ("weight", "volume"):
                needs_review = True
            if not kind_legacy:
                needs_review = True

        if needs_review:
            updates["needs_review"] = True
            flagged += 1

        if updates:
            await db.ingredients.update_one({"_id": ing["_id"]}, {"$set": updates})
            fixed += 1

    print(f"  Total ingredients: {count}")
    print(f"  Updated: {fixed}")
    print(f"  Flagged for review: {flagged}")


async def recompute_recipes(db):
    print("\n=== STEP 2: Recompute recipe costs ===")
    count = 0
    recalculated = 0
    cursor = db.recipes.find({})
    async for recipe in cursor:
        count += 1
        company_id = recipe.get("company_id")
        ingredients = recipe.get("ingredients") or []
        if not ingredients:
            continue

        # Build ingredient lookup
        ingredient_ids = list({(ing.get("item_id") or ing.get("ingredient_id")) for ing in ingredients if (ing.get("item_id") or ing.get("ingredient_id"))})
        ings_master = {}
        async for m in db.ingredients.find({"ingredient_id": {"$in": ingredient_ids}, "company_id": company_id}):
            ings_master[m["ingredient_id"]] = m

        total_cost = 0.0
        updated_lines = []
        for line in ingredients:
            item_id = line.get("item_id") or line.get("ingredient_id")
            qty = float(line.get("quantity") or 0)
            line_unit = line.get("unit") or "g"
            master = ings_master.get(item_id)
            if not master or qty == 0:
                updated_lines.append(line)
                continue
            waste = float(line.get("waste_factor_pct") or 0)
            effective_qty = qty * (1 + waste / 100) if waste > 0 else qty
            line_cost = cost_for_recipe_line(effective_qty, line_unit, master)
            updated_lines.append({
                **line,
                "item_type": line.get("item_type") or "ingredient",
                "item_id": item_id,
                "ingredient_id": item_id,
                "cost_per_unit": round(line_cost / qty, 6) if qty > 0 else 0,
                "cost": round(line_cost, 4),
                "total_cost": round(line_cost, 4),
            })
            total_cost += line_cost

        yield_qty = float(recipe.get("yield_quantity") or 0)
        cost_per_yield = round(total_cost / yield_qty, 4) if yield_qty > 0 else 0
        portions = float(recipe.get("portions_per_yield") or recipe.get("servings") or 1)
        cost_per_portion = round(total_cost / portions, 4) if portions > 0 else 0

        await db.recipes.update_one({"_id": recipe["_id"]}, {"$set": {
            "ingredients": updated_lines,
            "total_cost": round(total_cost, 4),
            "cost_per_yield": cost_per_yield,
            "cost_per_portion": cost_per_portion,
        }})
        recalculated += 1
        print(f"  ✓ {recipe.get('name', '?'):<35} total_cost=${total_cost:.2f}  per_portion=${cost_per_portion:.2f}")

    print(f"\n  Total recipes: {count}")
    print(f"  Recalculated: {recalculated}")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    await migrate_ingredients(db)
    await recompute_recipes(db)
    print("\n✅ Done")


if __name__ == "__main__":
    asyncio.run(main())
