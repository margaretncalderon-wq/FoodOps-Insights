"""Tests for Super Admin Usage Alerts bell endpoint.

Endpoint:
- GET /api/super-admin/usage-alerts?threshold=N

Validates:
- Default threshold=80 returns proper schema and sorted by percentage desc.
- threshold=0 returns >= count of alerts than threshold=80 (filter works).
- limit_overrides on a company suppress that metric from alerts when raised.
- Companies w/o active/trialing subscription are excluded.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SUPER_ADMIN_EMAIL = "margaret.n.calderon@gmail.com"
SUPER_ADMIN_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Super-admin login failed: {r.status_code} {r.text[:200]}")
    token = r.json().get("access_token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---- Schema & default threshold ----
class TestUsageAlertsDefault:
    def test_default_threshold_returns_envelope(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/super-admin/usage-alerts")
        assert r.status_code == 200, r.text
        data = r.json()
        # Envelope fields
        for k in ("threshold", "period", "total", "companies_count", "alerts"):
            assert k in data, f"Missing key '{k}' in response: {data.keys()}"
        assert data["threshold"] == 80
        assert isinstance(data["alerts"], list)
        assert isinstance(data["total"], int)
        assert isinstance(data["companies_count"], int)
        assert data["total"] == len(data["alerts"])

    def test_default_alerts_have_required_fields_and_sorted(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/super-admin/usage-alerts")
        assert r.status_code == 200
        data = r.json()
        alerts = data["alerts"]
        required_fields = {
            "company_id", "name", "metric", "label",
            "current", "limit", "percentage", "source",
            "plan_id", "subscription_status",
        }
        for a in alerts:
            missing = required_fields - set(a.keys())
            assert not missing, f"Alert missing fields {missing}: {a}"
            assert a["source"] in ("override", "plan")
            assert a["subscription_status"] in ("active", "trialing")
            assert a["percentage"] >= 80
            assert isinstance(a["limit"], int) and a["limit"] > 0
        # Sorted desc by percentage
        pcts = [a["percentage"] for a in alerts]
        assert pcts == sorted(pcts, reverse=True), f"Alerts not sorted desc: {pcts}"


# ---- Threshold query param ----
class TestUsageAlertsThreshold:
    def test_threshold_zero_returns_at_least_as_many(self, admin_session):
        r_default = admin_session.get(f"{BASE_URL}/api/super-admin/usage-alerts")
        r_zero = admin_session.get(f"{BASE_URL}/api/super-admin/usage-alerts?threshold=0")
        assert r_default.status_code == 200
        assert r_zero.status_code == 200
        d_default = r_default.json()
        d_zero = r_zero.json()
        assert d_zero["threshold"] == 0
        assert d_zero["total"] >= d_default["total"], (
            f"threshold=0 returned {d_zero['total']} vs default {d_default['total']}"
        )

    def test_threshold_200_returns_few_or_none(self, admin_session):
        """Sanity: very high threshold should return only those over 200% (likely empty)."""
        r = admin_session.get(f"{BASE_URL}/api/super-admin/usage-alerts?threshold=200")
        assert r.status_code == 200
        data = r.json()
        for a in data["alerts"]:
            assert a["percentage"] >= 200


# ---- Override-suppresses-alert flow ----
class TestUsageAlertsOverrideSuppression:
    """Bump events_per_month to 999 on a company whose events_per_month
    alert was visible at default threshold; verify it disappears, then revert."""

    def test_override_removes_events_alert(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/super-admin/usage-alerts")
        assert r.status_code == 200
        alerts = r.json()["alerts"]
        events_alerts = [a for a in alerts if a["metric"] == "events_created"]
        if not events_alerts:
            pytest.skip("No events_created alerts present to test suppression.")
        target = events_alerts[0]
        cid = target["company_id"]

        # Snapshot existing overrides
        det = admin_session.get(f"{BASE_URL}/api/super-admin/organizations/{cid}")
        assert det.status_code == 200, det.text
        prior_overrides = dict((det.json() or {}).get("limit_overrides") or {})

        try:
            # Set override
            put = admin_session.put(
                f"{BASE_URL}/api/super-admin/organizations/{cid}/limit-overrides",
                json={"events_per_month": 999},
            )
            assert put.status_code == 200, put.text
            assert put.json()["limit_overrides"].get("events_per_month") == 999

            # Re-fetch alerts: this company's events_created should be gone
            r2 = admin_session.get(f"{BASE_URL}/api/super-admin/usage-alerts")
            assert r2.status_code == 200
            still = [
                a for a in r2.json()["alerts"]
                if a["company_id"] == cid and a["metric"] == "events_created"
            ]
            assert not still, (
                f"Override events_per_month=999 did not suppress alert: {still}"
            )
        finally:
            # Revert to prior overrides exactly
            # Send keys that were removed as null
            payload = {}
            for k in ("events_per_month",):
                payload[k] = prior_overrides.get(k, None)
            admin_session.put(
                f"{BASE_URL}/api/super-admin/organizations/{cid}/limit-overrides",
                json=payload,
            )


# ---- Subscription gating ----
class TestUsageAlertsSubscriptionGating:
    def test_only_active_or_trialing_subscriptions_in_alerts(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/super-admin/usage-alerts?threshold=0")
        assert r.status_code == 200
        for a in r.json()["alerts"]:
            assert a["subscription_status"] in ("active", "trialing"), a


# ---- Authz ----
class TestUsageAlertsAuthz:
    def test_unauthenticated_returns_401_or_403(self):
        s = requests.Session()
        r = s.get(f"{BASE_URL}/api/super-admin/usage-alerts")
        assert r.status_code in (401, 403), f"Expected 401/403 got {r.status_code}"
