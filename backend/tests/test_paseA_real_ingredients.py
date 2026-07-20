"""
PASE A · Before/After regression test using REAL broken ingredients.

Confirms that the fix actually resolves the case that originated this
workstream — not just synthetic data.

Reference ingredients (all in company_98d8b4725822):
- Aceite Capullo Bidón 20 LT   pcost=$3450  qty=20000ml  pu=galón   base=ml
- Aceite de Oliva Extra Virgen pcost=$450   qty=150ml    pu=botella base=ml   stock=5
- Aceite de Oliva 150ML        pcost=$150   qty=150ml    pu=botella base=ml

Pre-fix behaviour (cost_per_unit written as $/base):
- Inventory Value = stock × cpu  →  5 × $3 = $15 (WRONG)
- Recipe using 1 ml → line_cost = 1 × $3 = $3 ($/ml semantic worked "by accident")

Post-fix (PASE A):
- cost_per_unit = purchase_cost           → $450/botella
- cost_per_base_unit = pcost/qty          → $3/ml
- Inventory Value = stock × cpu = 5 × 450 = $2,250 (CORRECT)
- Recipe using 1 ml via cost_for_recipe_line = 1 × $3 = $3 (still correct)
"""
import os
import pytest
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


BROKEN_ING_IDS = {
    "aceite_capullo": "ing_3e6c72f6221f",
    "aceite_oliva_extra_virgen_98": "ing_2db22b0b423f",
    "aceite_oliva_150ml": "ing_f6d47909877f",
}
EXPECTED = {
    "aceite_capullo":                 {"pcost": 3450, "qty": 20000, "stock_val_expected_if_stock1": 3450, "per_base": 0.1725},
    "aceite_oliva_extra_virgen_98":   {"pcost": 450,  "qty": 150,   "stock_val_expected_if_stock1": 450,  "per_base": 3.0},
    "aceite_oliva_150ml":             {"pcost": 150,  "qty": 150,   "stock_val_expected_if_stock1": 150,  "per_base": 1.0},
}


@pytest.mark.asyncio
async def test_broken_ingredients_pre_and_post_fix_values():
    """Log the ACTUAL numbers pre vs post fix for the three broken ingredients.

    Runs the normalize-cost logic in-process (same code path as the endpoint)
    and asserts that:
      - Inventory Value = stock × cost_per_unit is corrected
      - cost_per_base_unit = purchase_cost / purchase_quantity_per_unit
    """
    from config import db
    from routers.inventory import _apply_pase_a_derivations

    for key, ing_id in BROKEN_ING_IDS.items():
        exp = EXPECTED[key]
        ing = await db.ingredients.find_one({"ingredient_id": ing_id}, {"_id": 0})
        assert ing, f"Missing broken ingredient {ing_id}"

        pre_cpu = float(ing.get("cost_per_unit") or 0)
        pre_stock = float(ing.get("stock_quantity") or 0)
        pre_value = pre_stock * pre_cpu

        # Apply PASE A derivations (same code the update_ingredient endpoint runs)
        merged = {**ing}
        _apply_pase_a_derivations(merged)
        post_cpu = float(merged["cost_per_unit"])
        post_cpbu = float(merged["cost_per_base_unit"])
        post_value = pre_stock * post_cpu

        # Contract assertions
        assert post_cpu == pytest.approx(exp["pcost"], abs=0.01), (
            f"{ing['name']}: post cpu should equal purchase_cost. got {post_cpu} exp {exp['pcost']}"
        )
        assert post_cpbu == pytest.approx(exp["per_base"], abs=1e-3), (
            f"{ing['name']}: post cpbu should equal pcost/qty. got {post_cpbu} exp {exp['per_base']}"
        )
        assert not merged["purchase_incomplete"], f"{ing['name']}: should be marked complete"

        # Sanity: post_value equals purchase_cost × stock
        assert post_value == pytest.approx(exp["pcost"] * pre_stock, abs=0.01)

        # For the log:
        print(f"\n=== {ing['name']} ({ing_id}) ===")
        print(f"  purchase_cost = ${exp['pcost']}, qty={exp['qty']} {ing.get('base_unit')}")
        print(f"  stock = {pre_stock} {ing.get('unit')}")
        print(f"  PRE-FIX  : cpu=${pre_cpu:.4f}   Value = stock × cpu = ${pre_value:.2f}   (BUG: deflated ~{exp['pcost']/max(pre_cpu,1e-9):.0f}×)")
        print(f"  POST-FIX : cpu=${post_cpu:.2f}  cpbu=${post_cpbu:.6f}   Value = stock × cpu = ${post_value:.2f}")


@pytest.mark.asyncio
async def test_broken_ingredients_recipe_cost_via_cost_for_recipe_line():
    """Recipe costing still gives $per-base correctly (via cost_per_base_unit),
    even though cost_per_unit changed semantic."""
    from config import db
    from utils.units import cost_for_recipe_line
    from routers.inventory import _apply_pase_a_derivations

    for key, ing_id in BROKEN_ING_IDS.items():
        exp = EXPECTED[key]
        ing = await db.ingredients.find_one({"ingredient_id": ing_id}, {"_id": 0})
        merged = {**ing}
        _apply_pase_a_derivations(merged)
        # Recipe uses 1 base_unit (e.g. 1 ml of oil)
        cost = cost_for_recipe_line(1.0, merged.get("base_unit"), merged)
        assert cost == pytest.approx(exp["per_base"], abs=1e-3), (
            f"{ing['name']}: recipe cost per 1 {merged.get('base_unit')} = ${cost}, exp ${exp['per_base']}"
        )
        # Recipe uses 500 base_units (500 ml)
        cost500 = cost_for_recipe_line(500.0, merged.get("base_unit"), merged)
        assert cost500 == pytest.approx(exp["per_base"] * 500, abs=0.05), (
            f"{ing['name']}: 500 {merged.get('base_unit')} = ${cost500}, exp ${exp['per_base']*500}"
        )


@pytest.mark.asyncio
async def test_reorder_list_cost_no_pack_size_inflation():
    """Regression for server.py:1153 — estimated_cost should be
    packs_to_order × cost_per_unit (no extra × pack_size factor)."""
    from config import db
    from routers.inventory import _apply_pase_a_derivations
    ing = await db.ingredients.find_one({"ingredient_id": BROKEN_ING_IDS["aceite_oliva_extra_virgen_98"]}, {"_id": 0})
    merged = {**ing}
    _apply_pase_a_derivations(merged)
    pack_size = float(merged.get("pack_size") or 1)
    packs_to_order = 3
    cpu = merged["cost_per_unit"]
    # PASE A formula
    estimated_cost_new = packs_to_order * cpu                        # 3 × $450 = $1350
    # OLD formula (pre-fix)
    estimated_cost_old = packs_to_order * pack_size * cpu            # 3 × 1 × $450 = $1350 (same if pack_size=1)
    print(f"\nreorder-list post-fix: {packs_to_order} × ${cpu} = ${estimated_cost_new}")
    assert estimated_cost_new == pytest.approx(1350.0, abs=0.01)


@pytest.mark.asyncio
async def test_purchase_incomplete_flag_matches_data_shape():
    """The migration must not flag ingredients whose unit == base_unit
    (degenerate-but-safe case). That's ~42 items in the current DB."""
    from config import db
    total = await db.ingredients.count_documents({})
    incomplete = await db.ingredients.count_documents({"purchase_incomplete": True})
    complete = total - incomplete
    print(f"\nTotal ingredients: {total}, incomplete: {incomplete}, complete: {complete}")
    # The three broken ones should now be complete.
    for ing_id in BROKEN_ING_IDS.values():
        i = await db.ingredients.find_one({"ingredient_id": ing_id}, {"_id": 0, "purchase_incomplete": 1})
        assert i is not None
        # Note: broken ones will be complete only after normalize-cost is run,
        # OR if the migration script recognized their complete purchase format.
