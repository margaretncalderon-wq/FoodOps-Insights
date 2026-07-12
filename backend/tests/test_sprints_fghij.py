"""Sprint F/G/H/I/J — comprehensive regression coverage."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_session():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"login failed: {r.status_code}")
    return s


class TestPackingTemplates:
    """Sprint F"""

    def test_list_endpoint(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/packing-templates")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_seed_is_idempotent(self, auth_session):
        r1 = auth_session.post(f"{BASE_URL}/api/packing-templates/seed-defaults")
        assert r1.status_code == 200
        r2 = auth_session.post(f"{BASE_URL}/api/packing-templates/seed-defaults")
        assert r2.status_code == 200
        # Second call should skip existing
        assert r2.json()["skipped_existing"] >= 4

    def test_preview_computes_quantities(self, auth_session):
        templates = auth_session.get(f"{BASE_URL}/api/packing-templates").json()
        if not templates:
            pytest.skip("no templates")
        tpl = templates[0]
        r = auth_session.post(
            f"{BASE_URL}/api/packing-templates/{tpl['template_id']}/preview",
            json={"guest_count": 60},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["guest_count"] == 60
        for item in d["items"]:
            # suggested must be >= min and >= ceil(60/per_guests)
            assert item["suggested_qty"] >= item["minimum_qty"]

    def test_preview_requires_guest_count(self, auth_session):
        templates = auth_session.get(f"{BASE_URL}/api/packing-templates").json()
        if not templates:
            pytest.skip("no templates")
        tpl = templates[0]
        # empty body — no guest_count, no event_id
        r = auth_session.post(
            f"{BASE_URL}/api/packing-templates/{tpl['template_id']}/preview",
            json={},
        )
        assert r.status_code == 400


class TestUpcomingCommitments:
    """Sprint H"""

    def test_endpoint_shape(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/inventory/upcoming-commitments?days=14")
        assert r.status_code == 200
        d = r.json()
        for k in ("horizon_days", "events", "stock_pressure"):
            assert k in d
        assert isinstance(d["events"], list)
        assert isinstance(d["stock_pressure"], list)


class TestUtilizationReport:
    """Sprint I"""

    def test_endpoint_shape(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/inventory/utilization-report?days=90")
        assert r.status_code == 200
        d = r.json()
        for k in ("top_used", "never_moved", "always_rented", "total_items_analyzed"):
            assert k in d
        for row in d["top_used"]:
            assert "times_used" in row and "total_qty" in row


class TestQRCode:
    """Sprint J"""

    def test_qr_endpoint_returns_png(self, auth_session):
        ing = auth_session.get(f"{BASE_URL}/api/inventory/ingredients").json()
        if not ing:
            pytest.skip("no ingredients")
        iid = ing[0]["ingredient_id"]
        r = auth_session.get(f"{BASE_URL}/api/inventory/qr/{iid}")
        assert r.status_code == 200
        assert r.headers.get("content-type") == "image/png"
        # PNG magic number
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_qr_sheet_returns_html(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/inventory/qr-sheet?inventory_type=equipment")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "<html" in r.text

    def test_scan_count_updates_stock(self, auth_session):
        ing = auth_session.get(f"{BASE_URL}/api/inventory/ingredients").json()
        if not ing:
            pytest.skip("no ingredients")
        iid = ing[0]["ingredient_id"]
        prev_stock = ing[0].get("stock_quantity", 0)
        # Set to previous + 0 (no-op)
        r = auth_session.post(
            f"{BASE_URL}/api/inventory/scan/{iid}/count",
            json={"counted_qty": prev_stock, "note": "regression"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["counted_qty"] == prev_stock
        assert "diff" in d


class TestSmartRecommendations:
    """Sprint K — cached endpoint always returns a valid shape."""

    def test_cached_endpoint_shape(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/inventory/recommendations")
        assert r.status_code == 200
        d = r.json()
        assert "generated_at" in d
        assert "recommendations" in d
        assert isinstance(d["recommendations"], list)
        for rec in d["recommendations"]:
            for k in ("title", "reason", "priority", "estimated_impact_usd", "action_hint"):
                assert k in rec
            assert rec["priority"] in ("high", "medium", "low")


class TestDamageBilling:
    """Sprint G — manual bill trigger endpoint shape."""

    def test_bill_endpoint_requires_valid_log(self, auth_session):
        r = auth_session.post(f"{BASE_URL}/api/damaged-items-log/bogus_id/bill")
        assert r.status_code == 404
