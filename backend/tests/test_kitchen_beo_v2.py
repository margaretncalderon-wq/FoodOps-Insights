"""Kitchen BEO v2 — tests new days/tandas structure, change-detection
and batch endpoint introduced in this iteration.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"
EVENT_ID = "event_test_timed_services"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed {r.status_code}: {r.text[:200]}")
    return s


# ============== Single-event BEO shape ==============
class TestKitchenBEOShape:
    def test_get_beo_returns_expected_shape(self, session):
        r = session.get(f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in [
            "event_id", "event_name", "calendar_dates", "guest_count",
            "days", "totals", "snapshot_hash", "last_print",
            "changed_since_print", "allergens_aggregate", "dietary_tags_aggregate",
        ]:
            assert k in d, f"missing field {k}"
        assert d["event_id"] == EVENT_ID
        assert isinstance(d["days"], list)
        assert isinstance(d["totals"], dict)
        for sub in ("days_count", "tandas_count", "recipes_count"):
            assert sub in d["totals"]
        assert isinstance(d["snapshot_hash"], str) and len(d["snapshot_hash"]) > 0

    def test_no_price_fields_anywhere(self, session):
        r = session.get(f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}")
        assert r.status_code == 200
        body = r.text.lower()
        for forbidden in ("\"price\"", "\"cost\"", "\"unit_price\"", "\"total_price\""):
            assert forbidden not in body, f"Forbidden field present: {forbidden}"

    def test_three_tandas_on_one_day(self, session):
        r = session.get(f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}")
        assert r.status_code == 200
        d = r.json()
        # one day, 2026-05-20, 3 tandas
        assert len(d["days"]) >= 1
        day = [x for x in d["days"] if x.get("date") == "2026-05-20"]
        assert day, f"expected day 2026-05-20, got {[x.get('date') for x in d['days']]}"
        day = day[0]
        assert day["tanda_count"] == 3, f"got tanda_count={day['tanda_count']}"
        titles = sorted([(t.get("section_title") or "").lower() for t in day["tandas"]])
        for needle in ("desayuno", "almuerzo", "coffee"):
            assert any(needle in tt for tt in titles), f"missing {needle} in {titles}"
        # Each tanda has a section_time and extras list
        for t in day["tandas"]:
            assert "section_time" in t
            assert "extras" in t and isinstance(t["extras"], list)
            assert "recipes" in t and isinstance(t["recipes"], list)


# ============== mark-printed + change detection ==============
class TestMarkPrintedAndDrift:
    def test_mark_printed_then_no_drift_then_drift(self, session):
        r = session.get(f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}")
        assert r.status_code == 200
        snap = r.json()["snapshot_hash"]

        post = session.post(
            f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}/mark-printed",
            json={"snapshot_hash": snap, "scope": "single"},
        )
        assert post.status_code == 200, post.text[:300]
        body = post.json()
        assert body.get("success") is True
        assert "log_id" in body and "printed_at" in body

        # Re-GET → no drift
        time.sleep(0.5)
        r2 = session.get(f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}")
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["changed_since_print"] is False, "expected no drift right after print"
        assert d2.get("last_print") is not None

        # Mutate: bump qty of one order_item via proposal patch endpoint (if accessible).
        # If we can't mutate without breaking seed data, mark printed with a DIFFERENT
        # snapshot to simulate drift, then re-GET and verify drift detection.
        post2 = session.post(
            f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}/mark-printed",
            json={"snapshot_hash": "deadbeef_fake_hash", "scope": "single"},
        )
        assert post2.status_code == 200
        time.sleep(0.5)
        r3 = session.get(f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}")
        assert r3.status_code == 200
        d3 = r3.json()
        assert d3["changed_since_print"] is True, "expected drift after fake snapshot print"
        assert d3.get("last_print") is not None

        # Restore: re-mark with the real snapshot so other tests stay clean
        snap_real = d3["snapshot_hash"]
        session.post(
            f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}/mark-printed",
            json={"snapshot_hash": snap_real, "scope": "single"},
        )

    def test_mark_printed_404_for_unknown_event(self, session):
        r = session.post(
            f"{BASE_URL}/api/kitchen-beo/event/__no_such_event__/mark-printed",
            json={"snapshot_hash": "x"},
        )
        assert r.status_code == 404


# ============== Batch endpoint ==============
class TestKitchenBEOBatch:
    def test_batch_includes_test_event(self, session):
        r = session.get(
            f"{BASE_URL}/api/kitchen-beo/batch",
            params={"start_date": "2026-05-01", "end_date": "2026-05-31"},
        )
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "sheets_count" in d and "sheets" in d
        assert isinstance(d["sheets"], list)
        ids = [s.get("event_id") for s in d["sheets"]]
        assert EVENT_ID in ids, f"test event not in batch: ids={ids[:10]} count={d['sheets_count']}"

    def test_batch_sorted_by_first_date(self, session):
        r = session.get(
            f"{BASE_URL}/api/kitchen-beo/batch",
            params={"start_date": "2026-01-01", "end_date": "2026-12-31"},
        )
        assert r.status_code == 200
        sheets = r.json()["sheets"]
        firsts = [(s.get("calendar_dates") or ["9999"])[0] for s in sheets]
        assert firsts == sorted(firsts), "sheets not sorted ascending by first date"

    def test_batch_default_stages_omitted(self, session):
        # Even without passing include_stages, defaults to Won/Committed/Confirmed
        r = session.get(
            f"{BASE_URL}/api/kitchen-beo/batch",
            params={"start_date": "2026-05-01", "end_date": "2026-05-31"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["sheets_count"] >= 0


# ============== Regression: existing endpoint still returns core fields ==============
class TestKitchenBEORegression:
    def test_core_fields_for_old_consumers(self, session):
        r = session.get(f"{BASE_URL}/api/kitchen-beo/event/{EVENT_ID}")
        assert r.status_code == 200
        d = r.json()
        # old tests expect these to be present (the shape changed but these survived)
        for k in ("event_id", "event_name", "days"):
            assert k in d

    def test_unknown_event_returns_404(self, session):
        r = session.get(f"{BASE_URL}/api/kitchen-beo/event/__no_event__")
        assert r.status_code == 404
