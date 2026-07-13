"""BUG 2 regression: NaN persistence fix for recipes.

Confirms:
 1. GET /api/recipes returns 200 for pamemey27 and margaret (company_98d8b4725822)
 2. No recipe has NaN/Inf in critical numeric fields
 3. POST /api/recipes/recalculate-all does not re-poison the DB
 4. POST /api/recipes/repair-nan returns repaired_count=0 after everything is clean
"""
import math
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")

CIANO_USERS = [
    ("pamemey27@gmail.com", "Evoque2024!"),
    ("margaret.n.calderon@gmail.com", "Evoque2024!"),
]

NUMERIC_FIELDS = [
    "labor_cost",
    "total_cost_full",
    "cost_per_portion",
    "total_cost_per_portion",
    "prep_time",
    "cook_time",
    "prep_time_minutes",
    "cook_time_minutes",
    "overhead_cost",
    "ingredient_cost",
]


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


def _hdrs(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _has_bad_float(v):
    if isinstance(v, float):
        return math.isnan(v) or math.isinf(v)
    return False


def _scan_recipe_for_nan(recipe: dict) -> list:
    """Return list of (field, value) that are NaN/Inf/'nan' strings."""
    bad = []
    for f in NUMERIC_FIELDS:
        v = recipe.get(f)
        if _has_bad_float(v):
            bad.append((f, v))
        if isinstance(v, str) and v.strip().lower() in ("nan", "inf", "-inf"):
            bad.append((f, v))
    return bad


@pytest.mark.parametrize("email,password", CIANO_USERS)
def test_get_recipes_returns_200_no_nan(email, password):
    token = _login(email, password)
    r = requests.get(f"{BASE_URL}/api/recipes", headers=_hdrs(token), timeout=30)
    assert r.status_code == 200, f"GET /recipes returned {r.status_code}: {r.text[:300]}"
    # JSON must parse cleanly (no NaN literal)
    body = r.json()
    assert isinstance(body, list)
    print(f"[{email}] recipes count = {len(body)}")
    problems = []
    for rec in body:
        bad = _scan_recipe_for_nan(rec)
        if bad:
            problems.append((rec.get("name"), rec.get("id"), bad))
    assert not problems, f"NaN/Inf still present in {len(problems)} recipes: {problems[:5]}"


def test_recalculate_all_does_not_repoison():
    token = _login(*CIANO_USERS[0])
    # dry_run=false: actually persist
    r = requests.post(
        f"{BASE_URL}/api/recipes/recalculate-all?dry_run=false",
        headers=_hdrs(token),
        timeout=120,
    )
    assert r.status_code == 200, f"recalculate-all failed: {r.status_code} {r.text[:300]}"
    print(f"recalculate-all response keys: {list(r.json().keys())}")

    # Now GET /recipes must still be 200 and clean
    r2 = requests.get(f"{BASE_URL}/api/recipes", headers=_hdrs(token), timeout=30)
    assert r2.status_code == 200, f"GET after recalculate returned {r2.status_code}: {r2.text[:300]}"
    body = r2.json()
    problems = [(rec.get("name"), _scan_recipe_for_nan(rec)) for rec in body if _scan_recipe_for_nan(rec)]
    assert not problems, f"recalculate-all re-poisoned: {problems[:5]}"


def test_repair_nan_reports_zero_after_clean():
    token = _login(*CIANO_USERS[0])
    r = requests.post(f"{BASE_URL}/api/recipes/repair-nan", headers=_hdrs(token), timeout=60)
    assert r.status_code == 200, f"repair-nan failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    print(f"repair-nan response: {data}")
    # After the main agent has already run repair once + our recalculate-all no-repoison test,
    # the count MUST be zero.
    repaired = data.get("repaired_count", data.get("repaired", 0))
    assert repaired == 0, f"repair-nan still finds bad rows: {data}"
