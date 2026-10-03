"""
Verify Menu/Package persistence of default_cost + internal_notes and that
bulk-from-menu propagates them correctly to order_items.
Uses an existing event/proposal (first one in the tenant) to avoid coupling
to tests that create them.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
if not BASE_URL.startswith("http"):
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def food_category_id(auth_headers):
    r = requests.get(f"{BASE_URL}/api/settings/categories", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    cats = r.json()
    food = next((c for c in cats if (c.get("name") or "").lower() == "food"), None) or cats[0]
    return food["category_id"]


@pytest.fixture(scope="module")
def existing_proposal(auth_headers):
    """Pick any existing proposal in the tenant for bulk-from-menu tests."""
    r = requests.get(f"{BASE_URL}/api/events", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    events = r.json() if isinstance(r.json(), list) else r.json().get("events", [])
    for ev in events:
        rp = requests.get(f"{BASE_URL}/api/proposals/event/{ev['event_id']}", headers=auth_headers, timeout=10)
        if rp.status_code == 200:
            body = rp.json()
            if body and body.get("proposal_id"):
                return body["proposal_id"]
    pytest.skip("no existing proposal available in tenant for e2e test")


def test_menu_model_persists_new_fields(auth_headers):
    """POST menu with default_cost + internal_notes, GET it back enriched."""
    sfx = uuid.uuid4().hex[:6]
    rm = requests.post(
        f"{BASE_URL}/api/settings/menus",
        headers=auth_headers,
        json={
            "name": f"Persistence Test {sfx}",
            "menu_type": "Package",
            "is_fixed_price": True,
            "default_price": 100.0,
            "default_cost": 40.0,
            "internal_notes": "Prep 48h in advance",
        },
        timeout=15,
    )
    assert rm.status_code in (200, 201), rm.text
    menu_id = rm.json()["menu_id"]

    rg = requests.get(f"{BASE_URL}/api/settings/menus/{menu_id}", headers=auth_headers, timeout=15)
    assert rg.status_code == 200
    body = rg.json()
    assert body.get("default_cost") == 40.0
    assert body.get("internal_notes") == "Prep 48h in advance"
    assert body.get("total_cost") == 40.0
    assert abs(body.get("margin_percentage", 0) - 60.0) < 0.1

    # Cleanup
    requests.delete(f"{BASE_URL}/api/settings/menus/{menu_id}", headers=auth_headers, timeout=10)


def test_flat_package_propagates_to_order_item(auth_headers, existing_proposal):
    """Flat package with default_cost + internal_notes should produce an
    order_item carrying internal_cost, internal_notes and long_description."""
    sfx = uuid.uuid4().hex[:6]
    menu_payload = {
        "name": f"Flat Package {sfx}",
        "menu_type": "Package",
        "is_fixed_price": True,
        "default_price": 150.0,
        "default_cost": 60.0,
        "description": "All-in-one dinner package",
        "internal_notes": "Serve on gold plates, no shellfish allowed",
        "items": [],
    }
    rm = requests.post(f"{BASE_URL}/api/settings/menus", headers=auth_headers, json=menu_payload, timeout=15)
    assert rm.status_code in (200, 201), rm.text
    menu_id = rm.json()["menu_id"]

    rb = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/items/bulk-from-menu",
        headers=auth_headers,
        json={"menu_id": menu_id, "quantity_multiplier": 2, "section_title": f"test-sec-{sfx}"},
        timeout=15,
    )
    assert rb.status_code == 200, rb.text
    items = rb.json().get("items") or []
    assert len(items) == 1, f"expected 1 flat line, got {len(items)}"
    line = items[0]
    assert line["quantity"] == 2
    assert line["unit_price"] == 150.0
    assert line["internal_cost"] == 60.0
    assert line["total_cost"] == 120.0
    assert line["internal_notes"] == "Serve on gold plates, no shellfish allowed"
    assert line["long_description"] == "All-in-one dinner package"

    # Cleanup: remove the inserted item + menu
    requests.delete(
        f"{BASE_URL}/api/proposals/{existing_proposal}/items/{line['item_id']}",
        headers=auth_headers, timeout=10,
    )
    requests.delete(f"{BASE_URL}/api/settings/menus/{menu_id}", headers=auth_headers, timeout=10)


def test_itemized_menu_propagates_picklist_internal_notes(auth_headers, existing_proposal, food_category_id):
    """When a menu contains picklist items with internal_notes, those notes
    should flow to the order_item line created from bulk-from-menu."""
    sfx = uuid.uuid4().hex[:6]
    rp = requests.post(
        f"{BASE_URL}/api/settings/picklist",
        headers=auth_headers,
        json={
            "name": f"Steak {sfx}",
            "category_id": food_category_id,
            "item_type": "Food",
            "default_price": 50.0,
            "internal_cost": 20.0,
            "internal_notes": "Medium rare only",
        },
        timeout=15,
    )
    assert rp.status_code in (200, 201), rp.text
    pli_id = rp.json()["item_id"]

    rm = requests.post(
        f"{BASE_URL}/api/settings/menus",
        headers=auth_headers,
        json={
            "name": f"Itemized Menu {sfx}",
            "menu_type": "Menu",
            "is_fixed_price": False,
            "items": [{"picklist_item_id": pli_id, "quantity": 1}],
        },
        timeout=15,
    )
    assert rm.status_code in (200, 201), rm.text
    menu_id = rm.json()["menu_id"]

    rb = requests.post(
        f"{BASE_URL}/api/proposals/{existing_proposal}/items/bulk-from-menu",
        headers=auth_headers,
        json={"menu_id": menu_id, "quantity_multiplier": 3, "section_title": f"test-sec-{sfx}"},
        timeout=15,
    )
    assert rb.status_code == 200, rb.text
    items = rb.json().get("items") or []
    assert len(items) == 1
    line = items[0]
    assert line["unit_price"] == 50.0
    assert line["internal_cost"] == 20.0
    assert line["quantity"] == 3
    assert line["total_cost"] == 60.0
    assert line["internal_notes"] == "Medium rare only"

    # Cleanup
    requests.delete(
        f"{BASE_URL}/api/proposals/{existing_proposal}/items/{line['item_id']}",
        headers=auth_headers, timeout=10,
    )
    requests.delete(f"{BASE_URL}/api/settings/menus/{menu_id}", headers=auth_headers, timeout=10)
    requests.delete(f"{BASE_URL}/api/settings/picklist/{pli_id}", headers=auth_headers, timeout=10)
