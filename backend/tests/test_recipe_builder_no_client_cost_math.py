"""
Static-regression guard: verify that RecipeBuilder.js NEVER re-introduces
client-side cost multiplication.

PASE A rule: the frontend never computes costs. It renders whatever
`total_cost` the backend returns (via GET /api/recipes/{id} or via
POST /api/inventory/ingredients/cost-preview). Any local multiplication
of `quantity × ingredient.cost_per_unit` in the client silently drifts
after PASE A because `cost_per_unit` semantically became "$/purchase_unit"
(price of the whole container), not "$/base_unit".

This test scans the actual JS source and fails if any of the 5 known
bug patterns come back.
"""
import re
from pathlib import Path

RECIPE_BUILDER_JS = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "components" / "RecipeBuilder.js"
)

# The 5 patterns we removed. If any resurfaces, the fix has regressed.
FORBIDDEN_PATTERNS = [
    # 1. addIngredient (line ~669) initialized total_cost with the container price
    (r"total_cost:\s*ingredient\.cost_per_unit",
     "addIngredient must NOT initialise total_cost with ingredient.cost_per_unit"),

    # 2. updateIngredient (line ~687) multiplied quantity × invItem.cost_per_unit
    (r"updated\.total_cost\s*=\s*\(?\s*updated\.quantity[^*]*\*[^;]*(cost_per_unit|effectiveCost)",
     "updateIngredient must NOT recompute total_cost = quantity × cost_per_unit"),

    # 3. addSubRecipe (line ~716) initialized total_cost with cost_per_yield
    (r"total_cost:\s*recipe\.cost_per_yield",
     "addSubRecipe must NOT initialise total_cost with recipe.cost_per_yield"),

    # 4. updateSubRecipe (line ~729) multiplied quantity_used × cost_per_yield
    (r"updated\.total_cost\s*=\s*\(?\s*updated\.quantity_used[^;]*cost_per_yield",
     "updateSubRecipe must NOT recompute total_cost = quantity_used × cost_per_yield"),

    # 5. Print/export template (line ~1035) had `qty * ing.cost_per_unit`
    (r"const\s+cost\s*=\s*qty\s*\*\s*\(?\s*ing\.cost_per_unit",
     "Print/export template must NOT recompute cost = qty × ing.cost_per_unit"),
]


def test_no_client_side_cost_multiplication_in_recipe_builder():
    assert RECIPE_BUILDER_JS.exists(), f"missing {RECIPE_BUILDER_JS}"
    text = RECIPE_BUILDER_JS.read_text()
    offenders = []
    for pattern, label in FORBIDDEN_PATTERNS:
        m = re.search(pattern, text, flags=re.MULTILINE)
        if m:
            # Grab a small context window for the failure message
            start = max(0, m.start() - 60)
            end = min(len(text), m.end() + 60)
            snippet = text[start:end].replace("\n", " ⏎ ")
            offenders.append(f"❌ {label}\n   pattern: {pattern}\n   found:   …{snippet}…")
    assert not offenders, "\n\n".join(offenders)
