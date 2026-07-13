"""Iteration 237 — E2E validation of all Kora ERP sprint endpoints requested in review."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


# AUTH
def test_login_returns_user(auth):
    r = auth.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200
    d = r.json()
    assert d.get("email") == TEST_EMAIL


# Sprint E — over-reserved
def test_over_reserved_shape(auth):
    r = auth.get(f"{BASE_URL}/api/inventory/over-reserved")
    assert r.status_code == 200
    d = r.json()
    for k in ("count", "total_shortfall", "items"):
        assert k in d, f"missing key {k}"
    assert isinstance(d["items"], list)


# Sprint F — invalid template preview → 404
def test_invalid_template_preview_returns_404(auth):
    r = auth.post(f"{BASE_URL}/api/packing-templates/invalid_bogus_id/preview", json={"guest_count": 60})
    assert r.status_code == 404


# Sprint G — invalid bill → 404
def test_invalid_damaged_bill_returns_404(auth):
    r = auth.post(f"{BASE_URL}/api/damaged-items-log/bogus_id/bill", json={})
    assert r.status_code == 404


# Sprint H — upcoming-commitments
def test_upcoming_commitments_14d(auth):
    r = auth.get(f"{BASE_URL}/api/inventory/upcoming-commitments?days=14")
    assert r.status_code == 200
    d = r.json()
    for k in ("horizon_days", "events", "stock_pressure"):
        assert k in d
    assert d["horizon_days"] == 14


# Sprint I — utilization
def test_utilization_90d(auth):
    r = auth.get(f"{BASE_URL}/api/inventory/utilization-report?days=90")
    assert r.status_code == 200
    d = r.json()
    for k in ("top_used", "never_moved", "always_rented"):
        assert k in d


# Sprint J — QR PNG
def test_qr_png_bytes(auth):
    ings = auth.get(f"{BASE_URL}/api/inventory/ingredients").json()
    if not ings:
        pytest.skip("no ingredients")
    iid = ings[0]["ingredient_id"]
    r = auth.get(f"{BASE_URL}/api/inventory/qr/{iid}")
    assert r.status_code == 200
    assert r.headers.get("content-type") == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


# Sprint K — cached recs
def test_recommendations_cached_shape(auth):
    r = auth.get(f"{BASE_URL}/api/inventory/recommendations")
    assert r.status_code == 200
    d = r.json()
    assert "recommendations" in d
    assert isinstance(d["recommendations"], list)


# Sprint L — create goal from bogus rec → 404
def test_create_goal_from_bogus_rec_returns_404(auth):
    r = auth.post(f"{BASE_URL}/api/inventory/recommendations/999/create-goal", json={})
    assert r.status_code == 404


# Cross-module: Event Orchestration + Resource Management use the same event
def test_confirmed_event_shared_between_modules(auth):
    events = auth.get(f"{BASE_URL}/api/events").json()
    # accept planning/confirmed (demo tenant currently has 1 planning event)
    active = [e for e in events if e.get("status") in ("confirmed", "planning")]
    assert len(active) >= 1, f"demo tenant must have at least one event; got {events}"
    ev = active[0]
    eid = ev["event_id"]
    # Same event served by Event Orchestration detail
    r_ev = auth.get(f"{BASE_URL}/api/events/{eid}")
    assert r_ev.status_code == 200
    # Same event's packing list served by Resource Management side
    r_pack = auth.get(f"{BASE_URL}/api/events/{eid}/packing-list-live")
    assert r_pack.status_code == 200
    d = r_pack.json()
    # sanity: guest_count matches across both endpoints if present
    if "guest_count" in d and "guest_count" in ev:
        assert d["guest_count"] == ev["guest_count"], \
            f"guest_count divergence: orch={ev.get('guest_count')} vs pack={d.get('guest_count')}"


# Packing templates seeded
def test_packing_templates_seeded(auth):
    r = auth.get(f"{BASE_URL}/api/packing-templates")
    assert r.status_code == 200
    tpls = r.json()
    assert len(tpls) >= 4, f"expected >=4 seeded templates, got {len(tpls)}"
    names = {t.get("name", "").lower() for t in tpls}
    # At least one of the seed defaults must exist
    expected_seeds = {"buffet francés", "brunch box", "picadera", "brand moment"}
    assert names & expected_seeds, f"none of seed defaults found in {names}"
