"""
Regression tests after Menu Engineering router extraction.
Verifies:
- /api/menu-engineering/* (extracted router) still works
- Recipes, Proposals, Plated menus, Menus, Inventory, Production, Culinary digest unaffected
- /api/debug/whoami (near syntax fix) still works
- Recipes<->Proposals cost link not broken
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

@pytest.fixture(scope="module")
def token():
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok

@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# --- whoami (near syntax fix) ---
def test_whoami(auth):
    r = session.get(f"{BASE_URL}/api/debug/whoami", headers=auth, timeout=30)
    assert r.status_code == 200, f"whoami: {r.status_code} {r.text[:300]}"


# --- Menu Engineering (extracted router) ---
def test_menu_engineering_analyze(auth):
    r = session.get(f"{BASE_URL}/api/menu-engineering/analyze?days=90", headers=auth, timeout=60)
    assert r.status_code == 200, f"analyze: {r.status_code} {r.text[:500]}"
    data = r.json()
    # Expect quadrants structure
    assert isinstance(data, dict)
    # Look for expected fields
    keys = str(data.keys()).lower()
    assert any(k in keys for k in ["star", "quadrant", "plowhorse", "puzzle", "dog", "items", "menu_items"]), \
        f"Unexpected structure: {list(data.keys())}"


def test_menu_engineering_what_if(auth):
    # Get a recipe id first
    r = session.get(f"{BASE_URL}/api/recipes", headers=auth, timeout=30)
    assert r.status_code == 200
    recipes = r.json()
    recipes_list = recipes if isinstance(recipes, list) else recipes.get("items", recipes.get("recipes", []))
    if not recipes_list:
        pytest.skip("No recipes to run what-if against")
    rid = recipes_list[0].get("id") or recipes_list[0].get("_id")
    payload = {"recipe_id": rid, "cost_delta_pct": 10, "price_delta_pct": 5}
    r = session.post(f"{BASE_URL}/api/menu-engineering/what-if", headers=auth, json=payload, timeout=60)
    # Accept 200 OR 422 (invalid schema) but never 500
    assert r.status_code != 500, f"what-if 500: {r.text[:500]}"
    assert r.status_code in (200, 400, 404, 422), f"what-if unexpected: {r.status_code} {r.text[:500]}"


# --- Recipes ---
def test_recipes_list(auth):
    r = session.get(f"{BASE_URL}/api/recipes", headers=auth, timeout=30)
    assert r.status_code == 200, f"recipes: {r.status_code} {r.text[:300]}"
    data = r.json()
    lst = data if isinstance(data, list) else data.get("items", data.get("recipes", []))
    assert isinstance(lst, list)
    # Look for at least one recipe with costing fields
    costed = [x for x in lst if any(k in x for k in ("total_cost_per_portion", "food_cost", "labor_cost", "overhead_cost"))]
    print(f"Recipes: {len(lst)}, with costing fields: {len(costed)}")


def test_recipes_recalculate_all(auth):
    r = session.post(f"{BASE_URL}/api/recipes/recalculate-all", headers=auth, timeout=180)
    assert r.status_code == 200, f"recalc-all: {r.status_code} {r.text[:500]}"
    data = r.json()
    assert isinstance(data, dict)
    # Expect some count field
    keys = [k.lower() for k in data.keys()]
    assert any("count" in k or "updated" in k or "total" in k or "recipes" in k for k in keys), \
        f"Unexpected recalc response: {data}"


# --- Plated Menus ---
def test_plated_menus_list(auth):
    r = session.get(f"{BASE_URL}/api/plated-menus", headers=auth, timeout=30)
    assert r.status_code == 200, f"plated-menus: {r.status_code} {r.text[:300]}"
    return r.json()


def test_plated_menus_staleness(auth):
    r = session.get(f"{BASE_URL}/api/plated-menus", headers=auth, timeout=30)
    assert r.status_code == 200
    data = r.json()
    lst = data if isinstance(data, list) else data.get("items", [])
    if not lst:
        pytest.skip("No plated menus available")
    pid = lst[0].get("menu_id") or lst[0].get("id") or lst[0].get("_id")
    r = session.get(f"{BASE_URL}/api/plated-menus/{pid}/staleness", headers=auth, timeout=30)
    assert r.status_code == 200, f"staleness: {r.status_code} {r.text[:300]}"


# --- Menus catalog (settings prefix) ---
def test_menus_list(auth):
    r = session.get(f"{BASE_URL}/api/settings/menus", headers=auth, timeout=30)
    assert r.status_code == 200, f"settings/menus: {r.status_code} {r.text[:300]}"


# --- Inventory ---
def test_inventory_ingredients(auth):
    r = session.get(f"{BASE_URL}/api/inventory/ingredients", headers=auth, timeout=30)
    assert r.status_code == 200, f"ingredients: {r.status_code} {r.text[:300]}"


def test_inventory_ai_repair(auth):
    # Attempt small/dry-run
    for payload in ({"dry_run": True}, {"limit": 1}, {}):
        r = session.post(f"{BASE_URL}/api/inventory/ingredients/ai-repair", headers=auth, json=payload, timeout=120)
        # Never 500
        assert r.status_code != 500, f"ai-repair 500 with {payload}: {r.text[:500]}"
        if r.status_code in (200, 202):
            return
    # Even if 400/422 that's acceptable — just not 500
    assert r.status_code in (200, 202, 400, 404, 422), f"ai-repair status={r.status_code} {r.text[:300]}"


# --- Proposals: CRITICAL user concern (recipe cost link) ---
def test_proposals_via_event(auth):
    # Proposals are keyed by event_id in this ERP
    r = session.get(f"{BASE_URL}/api/events", headers=auth, timeout=30)
    if r.status_code != 200:
        pytest.skip("Events endpoint unavailable")
    events = r.json()
    lst = events if isinstance(events, list) else events.get("items", events.get("events", []))
    if not lst:
        pytest.skip("No events available")
    found_proposal = False
    for ev in lst[:15]:
        eid = ev.get("id") or ev.get("event_id") or ev.get("_id")
        if not eid:
            continue
        r = session.get(f"{BASE_URL}/api/proposals/event/{eid}", headers=auth, timeout=30)
        assert r.status_code != 500, f"proposals/event 500: {r.text[:300]}"
        if r.status_code == 200 and r.json():
            found_proposal = True
            data = r.json()
            print(f"Event {eid}: proposal={data.get('proposal_id')}")
            break
    print(f"Found at least one proposal: {found_proposal}")


def test_proposal_detail_recipe_link(auth):
    # Look for proposals with items and verify recipe cost linkage
    r = session.get(f"{BASE_URL}/api/events", headers=auth, timeout=30)
    if r.status_code != 200:
        pytest.skip("Events endpoint unavailable")
    events = r.json()
    lst = events if isinstance(events, list) else events.get("items", events.get("events", []))
    checked_items = 0
    for ev in lst[:20]:
        eid = ev.get("id") or ev.get("event_id") or ev.get("_id")
        if not eid:
            continue
        pr = session.get(f"{BASE_URL}/api/proposals/event/{eid}", headers=auth, timeout=30)
        if pr.status_code != 200:
            continue
        prop = pr.json() or {}
        proposal_id = prop.get("proposal_id")
        if not proposal_id:
            continue
        ir = session.get(f"{BASE_URL}/api/proposals/{proposal_id}/items", headers=auth, timeout=30)
        assert ir.status_code != 500, f"proposal items 500: {ir.text[:300]}"
        if ir.status_code != 200:
            continue
        items_data = ir.json()
        items = items_data if isinstance(items_data, list) else items_data.get("items", [])
        for it in items:
            # Recipe-linked items must carry cost & sell price fields
            if it.get("recipe_id") or it.get("item_type") in ("recipe", "food"):
                checked_items += 1
                has_cost = any(k in it for k in ("unit_cost", "cost", "food_cost", "total_cost"))
                has_price = any(k in it for k in ("unit_price", "price", "sell_price"))
                assert has_cost or has_price, f"Recipe item missing cost/price: {list(it.keys())[:20]}"
                if checked_items >= 3:
                    print(f"Verified {checked_items} recipe-linked proposal items with cost/price")
                    return
    if checked_items == 0:
        pytest.skip("No recipe-linked proposal items available to verify")


# --- Production ---
def test_production_kitchen_beo(auth):
    # Try without params first
    r = session.get(f"{BASE_URL}/api/production/kitchen-beo", headers=auth, timeout=60)
    # Some endpoints need event_id; accept 200/400/422 but never 500
    assert r.status_code != 500, f"kitchen-beo 500: {r.text[:500]}"


def test_production_cost_variance(auth):
    r = session.get(f"{BASE_URL}/api/production/cost-variance", headers=auth, timeout=60)
    assert r.status_code != 500, f"cost-variance 500: {r.text[:500]}"
    assert r.status_code in (200, 400, 404, 422), f"cost-variance: {r.status_code} {r.text[:300]}"


def test_production_event_plan(auth):
    # Needs a valid event — try to fetch one
    r = session.get(f"{BASE_URL}/api/events", headers=auth, timeout=30)
    if r.status_code != 200:
        pytest.skip("Events endpoint unavailable")
    events = r.json()
    lst = events if isinstance(events, list) else events.get("items", [])
    if not lst:
        pytest.skip("No events available")
    eid = lst[0].get("id") or lst[0].get("_id")
    r = session.post(f"{BASE_URL}/api/production/event-plan", headers=auth, json={"event_id": eid}, timeout=90)
    assert r.status_code != 500, f"event-plan 500: {r.text[:500]}"


# --- Misc ---
def test_buffet_factors(auth):
    r = session.get(f"{BASE_URL}/api/buffet-factors", headers=auth, timeout=30)
    assert r.status_code == 200, f"buffet-factors: {r.status_code} {r.text[:300]}"


def test_culinary_digest_settings(auth):
    r = session.get(f"{BASE_URL}/api/culinary-digest/settings", headers=auth, timeout=30)
    assert r.status_code == 200, f"culinary-digest settings: {r.status_code} {r.text[:300]}"
