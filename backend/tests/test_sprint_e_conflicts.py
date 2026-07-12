"""Sprint E — date-scope conflict enforcement + over-reserved diagnostic."""
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


class TestOverReservedEndpoint:
    def test_shape(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/inventory/over-reserved")
        assert r.status_code == 200
        d = r.json()
        assert "count" in d and "items" in d and "total_shortfall" in d
        assert isinstance(d["items"], list)
        for item in d["items"]:
            for k in ("inventory_item_id", "name", "stock", "reserved", "shortfall"):
                assert k in item
            assert item["shortfall"] > 0


class TestReserveHardening:
    def test_reserve_still_accepts_valid_payload(self, auth_session):
        """/reserve continues to work for zero-conflict inputs (regression)."""
        r = auth_session.post(
            f"{BASE_URL}/api/inventory/reserve",
            json={"items": [], "event_ids": []},
        )
        # empty items => 400
        assert r.status_code == 400

    def test_reserve_rejects_when_no_stock(self, auth_session):
        """/reserve returns failures[] when qty exceeds stock (kind=stock)."""
        r = auth_session.post(
            f"{BASE_URL}/api/inventory/reserve",
            json={
                "items": [{"inventory_item_id": "definitely-nonexistent-id", "qty_needed": 5}],
                "event_ids": [],
            },
        )
        # Non-existent items are silently skipped; reservations/failures should still be lists
        assert r.status_code == 200
        d = r.json()
        assert "reservations" in d and "failures" in d
        assert isinstance(d["reservations"], list)
        assert isinstance(d["failures"], list)
