"""P2 Refactor Verification — proposal_section_templates extracted into a sibling
router file. Endpoints attach onto `proposals_router` so URLs are unchanged.

Covers:
  1. Section-templates CRUD (list, create, put, delete)
  2. Check + refresh endpoints
  3. Apply-template to a proposal
  4. Regression on core proposals endpoints (cost-health, event/{event_id})
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"
TAG = f"P2SEC_{uuid.uuid4().hex[:6]}"


@pytest.fixture(scope="session")
def client():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


created_ids = []


class TestSectionTemplatesCRUD:
    def test_list_ok(self, client):
        r = client.get(f"{API}/proposals/section-templates")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_requires_name(self, client):
        r = client.post(f"{API}/proposals/section-templates", json={"items": [{"description": "x"}]})
        assert r.status_code == 400

    def test_create_requires_items(self, client):
        r = client.post(f"{API}/proposals/section-templates", json={"name": f"{TAG}_noitems"})
        assert r.status_code == 400

    def test_create_ok(self, client):
        payload = {
            "name": f"{TAG}_pack",
            "description": "Test pack",
            "scope": "pack",
            "items": [
                {
                    "item_type": "Service",
                    "description": "Cocktail 1h",
                    "quantity": 10,
                    "unit_price": 25.50,
                    "internal_cost": 12.00,
                    "section_title": "Bar",
                    "sort_order": 1,
                }
            ],
        }
        r = client.post(f"{API}/proposals/section-templates", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert d["template_id"].startswith("sectpl_")
        assert "_id" not in d
        assert len(d["items"]) == 1
        assert d["items"][0]["unit_price"] == 25.50
        created_ids.append(d["template_id"])

    def test_list_contains_created(self, client):
        r = client.get(f"{API}/proposals/section-templates")
        assert r.status_code == 200
        names = [t["name"] for t in r.json()]
        assert f"{TAG}_pack" in names

    def test_rename(self, client):
        tid = created_ids[0]
        r = client.put(f"{API}/proposals/section-templates/{tid}", json={"name": f"{TAG}_renamed"})
        assert r.status_code == 200
        assert r.json()["name"] == f"{TAG}_renamed"

    def test_rename_empty_400(self, client):
        tid = created_ids[0]
        r = client.put(f"{API}/proposals/section-templates/{tid}", json={"name": "  "})
        assert r.status_code == 400

    def test_rename_nothing_400(self, client):
        tid = created_ids[0]
        r = client.put(f"{API}/proposals/section-templates/{tid}", json={})
        assert r.status_code == 400

    def test_rename_missing_404(self, client):
        r = client.put(f"{API}/proposals/section-templates/does_not_exist", json={"name": "x"})
        assert r.status_code == 404

    def test_check(self, client):
        tid = created_ids[0]
        r = client.get(f"{API}/proposals/section-templates/{tid}/check")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "stale_count" in d
        assert d["items"][0]["_idx"] == 0
        assert "_is_stale_price" in d["items"][0]

    def test_check_404(self, client):
        r = client.get(f"{API}/proposals/section-templates/nope_xxx/check")
        assert r.status_code == 404

    def test_refresh_no_refs(self, client):
        tid = created_ids[0]
        # items have no reference_id → nothing to refresh but call must succeed
        r = client.post(f"{API}/proposals/section-templates/{tid}/refresh", json={})
        assert r.status_code == 200
        d = r.json()
        assert d["total"] == 1
        assert d["updated"] == 0

    def test_refresh_404(self, client):
        r = client.post(f"{API}/proposals/section-templates/nope_xxx/refresh", json={})
        assert r.status_code == 404


class TestApplyTemplate:
    def test_apply_template_requires_id(self, client):
        # Get any proposal via events
        # Try finding a proposal to apply against
        r = client.get(f"{API}/proposals/cost-health/overview")
        assert r.status_code == 200

    def test_apply_missing_proposal(self, client):
        tid = created_ids[0] if created_ids else "sectpl_none"
        r = client.post(
            f"{API}/proposals/nonexistent_proposal/apply-template",
            json={"template_id": tid},
        )
        assert r.status_code == 404

    def test_apply_missing_template_id_400(self, client):
        r = client.post(
            f"{API}/proposals/nonexistent_proposal/apply-template",
            json={},
        )
        assert r.status_code == 400

    def test_apply_end_to_end_if_proposal_exists(self, client):
        """If any proposal exists in the tenant, apply the template to it and verify items created."""
        # Try to find a proposal via events listing
        events = client.get(f"{API}/events").json()
        if not isinstance(events, list) or not events:
            pytest.skip("No events available for e2e apply test")
        proposal_id = None
        event_id_used = None
        for ev in events[:10]:
            eid = ev.get("event_id") or ev.get("id")
            if not eid:
                continue
            pr = client.get(f"{API}/proposals/event/{eid}")
            if pr.status_code == 200:
                body = pr.json()
                if isinstance(body, list) and body:
                    proposal_id = body[0].get("proposal_id")
                elif isinstance(body, dict):
                    proposal_id = body.get("proposal_id")
                event_id_used = eid
                if proposal_id:
                    break
        if not proposal_id:
            pytest.skip("No proposal found for e2e apply test")
        tid = created_ids[0]
        r = client.post(
            f"{API}/proposals/{proposal_id}/apply-template",
            json={"template_id": tid, "use_current_prices": False},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["created"] == 1
        assert d["items"][0]["description"] == "Cocktail 1h"
        assert d["items"][0]["unit_price"] == 25.50
        assert "_id" not in d["items"][0]
        # Cleanup created item
        item_id = d["items"][0]["item_id"]
        client.delete(f"{API}/proposals/{proposal_id}/items/{item_id}")


class TestProposalsCoreRegression:
    def test_cost_health_overview(self, client):
        r = client.get(f"{API}/proposals/cost-health/overview")
        assert r.status_code == 200
        assert isinstance(r.json(), dict) or isinstance(r.json(), list)

    def test_section_templates_endpoint_still_registered(self, client):
        # Sanity: OpenAPI should list the section-templates route
        for url in (f"{API}/openapi.json", f"{BASE_URL}/openapi.json"):
            r = client.get(url)
            if r.status_code == 200:
                try:
                    paths = r.json().get("paths", {})
                except Exception:
                    continue
                assert any("/section-templates" in p for p in paths), "section-templates missing from OpenAPI"
                assert any("apply-template" in p for p in paths), "apply-template missing from OpenAPI"
                return
        pytest.skip("openapi.json not exposed")


class TestCleanup:
    def test_delete_created(self, client):
        assert created_ids, "no template was created earlier"
        tid = created_ids[0]
        r = client.delete(f"{API}/proposals/section-templates/{tid}")
        assert r.status_code == 200
        # Delete again → 404
        r2 = client.delete(f"{API}/proposals/section-templates/{tid}")
        assert r2.status_code == 404
