"""
Regression coverage for GET /api/delivery-notes/pending-returns

This endpoint powers the "Pending Returns Dashboard" widget:
it aggregates delivery notes that haven't been fully checked-in
AND supplier rentals whose deadline is approaching / overdue,
bucketed by urgency (overdue / due_soon / upcoming / no_date).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Use the demo tenant from test_credentials.md
TEST_EMAIL = "demo.agency@kora.com"
TEST_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def auth_session():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    if resp.status_code != 200:
        pytest.skip(f"login failed: {resp.status_code}")
    return session


class TestPendingReturnsEndpoint:
    def test_endpoint_returns_expected_shape(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/delivery-notes/pending-returns")
        assert r.status_code == 200, r.text
        data = r.json()

        # Top-level keys
        for key in ("summary", "delivery_notes", "rentals", "today"):
            assert key in data, f"missing key {key}"

        # Summary must expose all buckets
        summary_keys = {
            "notes_overdue", "notes_due_soon", "notes_upcoming", "notes_no_date",
            "rentals_overdue", "rentals_due_soon", "rentals_upcoming",
            "total_pending",
        }
        assert summary_keys.issubset(data["summary"].keys())

        # Delivery notes + rentals must each expose the four urgency buckets
        for section_key in ("delivery_notes", "rentals"):
            section = data[section_key]
            for bucket in ("overdue", "due_soon", "upcoming", "no_date"):
                assert bucket in section, f"{section_key} missing bucket {bucket}"
                assert isinstance(section[bucket], list)

    def test_total_pending_is_consistent(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/delivery-notes/pending-returns")
        assert r.status_code == 200
        data = r.json()
        s = data["summary"]
        expected_total = (
            s["notes_overdue"] + s["notes_due_soon"] + s["notes_upcoming"] + s["notes_no_date"]
            + s["rentals_overdue"] + s["rentals_due_soon"] + s["rentals_upcoming"]
        )
        assert s["total_pending"] == expected_total

    def test_note_rows_contain_actionable_fields(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/delivery-notes/pending-returns")
        assert r.status_code == 200
        data = r.json()

        all_notes = (
            data["delivery_notes"]["overdue"]
            + data["delivery_notes"]["due_soon"]
            + data["delivery_notes"]["upcoming"]
            + data["delivery_notes"]["no_date"]
        )
        for n in all_notes:
            # Fields the UI relies on for showing + wiring the "Check-in" button
            assert "note_id" in n
            assert "note_number" in n
            assert "pending_items_count" in n
            # days_diff can be None (no date) but the key must exist
            assert "days_diff" in n

    def test_endpoint_requires_auth(self):
        if not BASE_URL:
            pytest.skip("no backend url")
        r = requests.get(f"{BASE_URL}/api/delivery-notes/pending-returns")
        assert r.status_code in (401, 403), (
            f"Expected 401/403 without auth, got {r.status_code}"
        )

    def test_scan_overdue_endpoint(self, auth_session):
        """Manual trigger of the overdue-notes scan should always return a count."""
        r = auth_session.post(f"{BASE_URL}/api/delivery-notes/scan-overdue")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "notifications_sent" in data
        assert isinstance(data["notifications_sent"], int)
        assert "checked_at" in data
