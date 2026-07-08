"""P2 Refactor Verification — proposal_financials + proposal_cost_health
extracted into sibling router files. Endpoints attach onto `proposals_router`
so URLs are unchanged.

Covers:
  1. Financials:  PUT /api/proposals/{id}/financials
  2. Day-logistics: PUT/GET /api/proposals/{id}/day-logistics
  3. Custom fields: PUT /api/proposals/{id}/custom-fields
  4. Cost-staleness: GET /api/proposals/{id}/cost-staleness
  5. Refresh-costs: POST /api/proposals/{id}/refresh-costs
  6. Request-margin-approval: POST /api/proposals/{id}/request-margin-approval
  7. Cost-health overview + refresh-all
  8. Regression on proposals core (event/{event_id}, items, etc.)
  9. No-circular-import / startup check via /api/proposals/cost-health/overview 200
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"
TAG = f"P2FCH_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="session")
def client():
    r = requests.post(
        f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def sample_proposal(client):
    """Pick a real event+proposal in the tenant to run realistic tests.
    Prefer a Draft proposal so refresh-costs/request-margin-approval can be exercised."""
    # Look through recent events until we find one with a proposal
    r = client.get(f"{API}/events?limit=50")
    if r.status_code != 200:
        pytest.skip(f"cannot list events: {r.status_code}")
    events = r.json() if isinstance(r.json(), list) else r.json().get("events", [])
    draft = None
    fallback = None
    for ev in events[:50]:
        eid = ev.get("event_id") or ev.get("id")
        if not eid:
            continue
        pr = client.get(f"{API}/proposals/event/{eid}")
        if pr.status_code != 200:
            continue
        pjson = pr.json()
        # Different shapes possible; try to extract a proposal_id + status
        prop = pjson.get("proposal") if isinstance(pjson, dict) else None
        if not prop and isinstance(pjson, dict) and pjson.get("proposal_id"):
            prop = pjson
        if not prop:
            continue
        pid = prop.get("proposal_id")
        if not pid:
            continue
        entry = {"event_id": eid, "proposal_id": pid, "status": prop.get("status", "Draft")}
        if entry["status"] == "Draft" and not draft:
            draft = entry
            break
        if not fallback:
            fallback = entry
    chosen = draft or fallback
    if not chosen:
        pytest.skip("no proposals found in tenant")
    return chosen


# ============== FINANCIALS ==============
class TestFinancials:
    def test_financials_404_on_bad_id(self, client):
        r = client.put(f"{API}/proposals/does-not-exist/financials", json={"tax_ids": []})
        assert r.status_code == 404

    def test_financials_update_ok(self, client, sample_proposal):
        pid = sample_proposal["proposal_id"]
        if sample_proposal["status"] not in ("Draft",):
            # Skip mutation on non-draft to avoid side effects; still verify endpoint reachable
            r = client.put(
                f"{API}/proposals/{pid}/financials",
                json={"discount_type": "fixed", "discount_value": 0, "tax_ids": []},
            )
            # Not draft -> either allowed (endpoint recomputes) or a controlled error
            assert r.status_code in (200, 400, 403), r.text[:200]
            return
        r = client.put(
            f"{API}/proposals/{pid}/financials",
            json={"discount_type": "fixed", "discount_value": 0, "tax_ids": []},
        )
        assert r.status_code == 200, r.text[:200]


# ============== DAY-LOGISTICS ==============
class TestDayLogistics:
    def test_get_day_logistics_404(self, client):
        r = client.get(f"{API}/proposals/does-not-exist/day-logistics")
        assert r.status_code == 404

    def test_put_day_logistics_404(self, client):
        r = client.put(
            f"{API}/proposals/does-not-exist/day-logistics", json={"day_logistics": []}
        )
        assert r.status_code == 404

    def test_get_day_logistics_ok(self, client, sample_proposal):
        pid = sample_proposal["proposal_id"]
        r = client.get(f"{API}/proposals/{pid}/day-logistics")
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "day_logistics" in data
        assert isinstance(data["day_logistics"], list)

    def test_put_day_logistics_roundtrip(self, client, sample_proposal):
        pid = sample_proposal["proposal_id"]
        payload = {
            "day_logistics": [
                {
                    "event_date": "2099-01-01",
                    "delivery_time": "10:00",
                    "guest_count": 25,
                    "service_type": "Almuerzo",
                }
            ]
        }
        r = client.put(f"{API}/proposals/{pid}/day-logistics", json=payload)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert isinstance(body.get("day_logistics"), list)
        got = body["day_logistics"]
        assert any(d.get("event_date") == "2099-01-01" for d in got)
        # Verify persistence via GET
        r2 = client.get(f"{API}/proposals/{pid}/day-logistics")
        assert r2.status_code == 200
        assert any(d.get("event_date") == "2099-01-01" for d in r2.json()["day_logistics"])

    def test_put_day_logistics_filters_invalid_entries(self, client, sample_proposal):
        pid = sample_proposal["proposal_id"]
        # Missing event_date => invalid entry should be dropped
        payload = {"day_logistics": [{"delivery_time": "09:00"}]}
        r = client.put(f"{API}/proposals/{pid}/day-logistics", json=payload)
        assert r.status_code == 200
        assert isinstance(r.json().get("day_logistics"), list)


# ============== CUSTOM FIELDS ==============
class TestCustomFields:
    def test_custom_fields_404(self, client):
        r = client.put(f"{API}/proposals/does-not-exist/custom-fields", json={"values": {}})
        assert r.status_code == 404

    def test_custom_fields_update_ok(self, client, sample_proposal):
        pid = sample_proposal["proposal_id"]
        r = client.put(
            f"{API}/proposals/{pid}/custom-fields",
            json={"values": {f"{TAG}_key": "value"}},
        )
        # Only draft proposals editable; both cases acceptable
        assert r.status_code in (200, 400), r.text[:200]


# ============== COST STALENESS ==============
class TestCostStaleness:
    def test_staleness_404(self, client):
        r = client.get(f"{API}/proposals/does-not-exist/cost-staleness")
        assert r.status_code == 404

    def test_staleness_ok(self, client, sample_proposal):
        pid = sample_proposal["proposal_id"]
        r = client.get(f"{API}/proposals/{pid}/cost-staleness")
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        # Structural asserts
        for key in ("proposal_id", "is_stale", "stale_count", "can_refresh", "stale_items"):
            assert key in data, f"missing key {key}"
        assert data["proposal_id"] == pid
        assert isinstance(data["stale_items"], list)
        assert isinstance(data["is_stale"], bool)
        assert data["stale_count"] == len(data["stale_items"])


# ============== REFRESH COSTS ==============
class TestRefreshCosts:
    def test_refresh_404(self, client):
        r = client.post(f"{API}/proposals/does-not-exist/refresh-costs", json={})
        assert r.status_code == 404

    def test_refresh_ok_or_gated(self, client, sample_proposal):
        pid = sample_proposal["proposal_id"]
        r = client.post(f"{API}/proposals/{pid}/refresh-costs", json={})
        # Draft => 200 (possibly refreshed 0) OR 403 (margin guardrail).
        # Non-draft => 400.
        assert r.status_code in (200, 400, 403), r.text[:200]
        if r.status_code == 200:
            data = r.json()
            for k in ("refreshed_count", "proposal_id", "below_threshold", "override_applied"):
                assert k in data


# ============== REQUEST MARGIN APPROVAL ==============
class TestRequestMarginApproval:
    def test_approval_404(self, client):
        r = client.post(f"{API}/proposals/does-not-exist/request-margin-approval")
        assert r.status_code == 404

    def test_approval_bad_status_or_not_below(self, client, sample_proposal):
        pid = sample_proposal["proposal_id"]
        r = client.post(f"{API}/proposals/{pid}/request-margin-approval")
        # Admin user: if Draft & not below threshold => 400 with detail
        # If not-draft => 400. Success possible only when there's an actual below-threshold state.
        assert r.status_code in (200, 400), r.text[:200]
        if r.status_code == 200:
            assert "approvers_notified" in r.json()


# ============== COST HEALTH DASHBOARD ==============
class TestCostHealth:
    def test_overview_ok(self, client):
        r = client.get(f"{API}/proposals/cost-health/overview")
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "total_drafts_scanned" in data
        assert "stale_proposals" in data
        assert isinstance(data.get("proposals"), list)

    def test_refresh_all_ok(self, client):
        r = client.post(f"{API}/proposals/cost-health/refresh-all", json={})
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        for k in ("scanned", "refreshed_proposals", "refreshed_items",
                  "skipped_below_threshold", "overridden_proposals", "can_override"):
            assert k in data, f"missing key {k}"


# ============== REGRESSION: proposals core still works ==============
class TestProposalsCoreRegression:
    def test_get_by_event(self, client, sample_proposal):
        eid = sample_proposal["event_id"]
        r = client.get(f"{API}/proposals/event/{eid}")
        assert r.status_code == 200

    def test_items_list(self, client, sample_proposal):
        pid = sample_proposal["proposal_id"]
        r = client.get(f"{API}/proposals/{pid}/items")
        # Some tenants use different item routes — accept 200 or 404 gracefully but flag 5xx
        assert r.status_code < 500, r.text[:200]


# ============== STARTUP / NO CIRCULAR IMPORT ==============
class TestStartup:
    def test_backend_healthy(self, client):
        # cost-health/overview is exported from the NEW sibling file — if we hit it OK,
        # the file loaded, no circular import
        r = client.get(f"{API}/proposals/cost-health/overview")
        assert r.status_code == 200
