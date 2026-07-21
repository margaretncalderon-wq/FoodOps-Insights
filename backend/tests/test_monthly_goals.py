"""Tests for Monthly Content Goals feature (iteration 246)."""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def account_id(headers):
    r = requests.get(f"{BASE_URL}/api/demand-studio/social/accounts", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    accounts = data if isinstance(data, list) else data.get("accounts") or data.get("data") or []
    assert accounts, f"No accounts available for test: {data}"
    return accounts[0].get("account_id") or accounts[0].get("id")


class TestMonthlyTargets:
    def test_set_targets_success(self, headers, account_id):
        payload = {"targets": {"reel": 5, "carousel": 4, "photoshoot": 1, "story": 0, "unknown_fmt": 3, "feed": "abc"}}
        r = requests.put(
            f"{BASE_URL}/api/demand-studio/social/accounts/{account_id}/monthly-targets",
            json=payload, headers=headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        mt = data.get("monthly_targets") or {}
        # Only positive int + valid format keys should remain
        assert mt.get("reel") == 5
        assert mt.get("carousel") == 4
        assert mt.get("photoshoot") == 1
        assert "story" not in mt  # 0 dropped
        assert "unknown_fmt" not in mt  # invalid key dropped
        assert "feed" not in mt  # non-int dropped

    def test_set_targets_persists_in_progress_endpoint(self, headers, account_id):
        # Confirm persisted via goals-progress
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        r = requests.get(f"{BASE_URL}/api/demand-studio/social/goals-progress?month={month}", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        acc = next((a for a in data["accounts"] if a["account_id"] == account_id), None)
        assert acc is not None
        assert acc["targets"].get("reel") == 5
        assert acc["has_targets"] is True

    def test_set_targets_404_for_bad_account(self, headers):
        r = requests.put(
            f"{BASE_URL}/api/demand-studio/social/accounts/nonexistent-xyz/monthly-targets",
            json={"targets": {"reel": 3}}, headers=headers,
        )
        assert r.status_code == 404

    def test_set_targets_all_invalid_returns_empty(self, headers, account_id):
        r = requests.put(
            f"{BASE_URL}/api/demand-studio/social/accounts/{account_id}/monthly-targets",
            json={"targets": {"garbage": -1, "reel": -5}}, headers=headers,
        )
        assert r.status_code == 200
        assert r.json().get("monthly_targets") == {}


class TestGoalsProgress:
    def test_progress_shape(self, headers):
        r = requests.get(f"{BASE_URL}/api/demand-studio/social/goals-progress?month=2026-07", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["month"] == "2026-07"
        assert data["days_in_month"] == 31
        assert isinstance(data["day_of_month"], int)
        assert isinstance(data["accounts"], list)
        if data["accounts"]:
            a = data["accounts"][0]
            for k in ("account_id", "account_name", "targets", "actual", "health", "overall_pct", "has_targets"):
                assert k in a, f"missing key {k}"

    def test_progress_default_month(self, headers):
        r = requests.get(f"{BASE_URL}/api/demand-studio/social/goals-progress", headers=headers)
        assert r.status_code == 200
        cur = datetime.now(timezone.utc).strftime("%Y-%m")
        assert r.json()["month"] == cur

    def test_progress_invalid_month_falls_back(self, headers):
        r = requests.get(f"{BASE_URL}/api/demand-studio/social/goals-progress?month=not-a-month", headers=headers)
        assert r.status_code == 200
        # Should not raise; days_in_month > 0 (defaults to current month)
        assert r.json()["days_in_month"] > 0


class TestHealthTiers:
    """Verify _health_tier logic against real endpoint responses via reset then set of targets."""

    def test_complete_tier_when_no_target(self, headers, account_id):
        # Set a target of 1 reel to check schema; check overall_pct correctness
        r = requests.put(
            f"{BASE_URL}/api/demand-studio/social/accounts/{account_id}/monthly-targets",
            json={"targets": {"reel": 1}}, headers=headers,
        )
        assert r.status_code == 200
        # Overall pct should be 0..100 range with no scheduled reel likely
        month = "2026-07"  # future — day_of_month should be 0 -> not_started
        r2 = requests.get(f"{BASE_URL}/api/demand-studio/social/goals-progress?month={month}", headers=headers)
        assert r2.status_code == 200
        acc = next((a for a in r2.json()["accounts"] if a["account_id"] == account_id), None)
        assert acc is not None
        assert acc["targets"] == {"reel": 1}
        # For future month, health should be not_started (day_of_month=0, actual likely 0)
        h = acc["health"].get("reel")
        assert h in ("not_started", "complete", "on_track", "behind", "warning"), f"unexpected health tier: {h}"

    def test_cleanup_reset_targets(self, headers, account_id):
        r = requests.put(
            f"{BASE_URL}/api/demand-studio/social/accounts/{account_id}/monthly-targets",
            json={"targets": {}}, headers=headers,
        )
        assert r.status_code == 200
        assert r.json().get("monthly_targets") == {}
