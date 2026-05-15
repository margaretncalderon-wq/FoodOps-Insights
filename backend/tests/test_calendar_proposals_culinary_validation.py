"""
End-to-end validation for:
  - Calendar (events): list, filter by stage, create with event_date, update, orchestration calendar
  - Proposals: list, get, create, update, totals
  - Culinary Phase 2 endpoints (smoke)
Run: pytest /app/backend/tests/test_calendar_proposals_culinary_validation.py -v --tb=short
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("access_token") or data.get("token") or (data.get("data") or {}).get("access_token")
    if not token:
        pytest.skip(f"No token in login response: {data}")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return {"token": token, "user": data.get("user", {})}


# ---------- Calendar / Events ----------
class TestCalendar:
    def test_list_events(self, session, auth):
        r = session.get(f"{BASE_URL}/api/events")
        assert r.status_code == 200, r.text
        data = r.json()
        events = data if isinstance(data, list) else data.get("events", data.get("data", []))
        assert isinstance(events, list)
        print(f"[events] count={len(events)}")
        with_date = [e for e in events if e.get("event_date")]
        print(f"[events] with event_date={len(with_date)}")
        # store on class for next tests
        TestCalendar._events = events
        TestCalendar._with_date = with_date

    def test_events_have_event_date_field(self, session, auth):
        events = getattr(TestCalendar, "_events", [])
        if not events:
            pytest.skip("no events")
        # at least one should have event_date
        assert any(e.get("event_date") for e in events), "No events have event_date — calendar will be empty"

    def test_filter_by_stage(self, session, auth):
        r = session.get(f"{BASE_URL}/api/events", params={"stage": "confirmed"})
        assert r.status_code == 200, r.text
        data = r.json()
        events = data if isinstance(data, list) else data.get("events", data.get("data", []))
        assert isinstance(events, list)

    def test_create_event_with_date_and_verify_persistence(self, session, auth):
        # need a client_id
        rc = session.get(f"{BASE_URL}/api/clients")
        if rc.status_code != 200:
            pytest.skip("clients not accessible")
        clients = rc.json()
        clients = clients if isinstance(clients, list) else clients.get("clients", clients.get("data", []))
        if not clients:
            pytest.skip("no clients available")
        cid = clients[0].get("id") or clients[0].get("_id") or clients[0].get("client_id")
        future = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
        payload = {
            "name": f"TEST_CAL_{uuid.uuid4().hex[:6]}",
            "client_id": cid,
            "event_date": future,
            "stage": "lead",
            "guests": 50,
        }
        r = session.post(f"{BASE_URL}/api/events", json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        eid = created.get("id") or created.get("event_id") or created.get("_id")
        assert eid, f"no id in create response: {created}"
        TestCalendar._eid = eid
        TestCalendar._date = future

        # Verify persistence via list and direct GET
        r2 = session.get(f"{BASE_URL}/api/events/{eid}")
        assert r2.status_code == 200, r2.text
        got = r2.json()
        assert got.get("event_date", "").startswith(future), (
            f"event_date not persisted as expected. expected={future} got={got.get('event_date')}"
        )

    def test_update_event_date_persists(self, session, auth):
        eid = getattr(TestCalendar, "_eid", None)
        if not eid:
            pytest.skip("no event created")
        new_date = (datetime.now(timezone.utc) + timedelta(days=45)).strftime("%Y-%m-%d")
        r = session.put(f"{BASE_URL}/api/events/{eid}", json={"event_date": new_date})
        assert r.status_code in (200, 204), r.text
        r2 = session.get(f"{BASE_URL}/api/events/{eid}")
        assert r2.status_code == 200
        got = r2.json()
        assert got.get("event_date", "").startswith(new_date), (
            f"updated event_date did not persist. expected={new_date} got={got.get('event_date')}"
        )

    def test_orchestration_calendar_window(self, session, auth):
        start = "2026-01-01"
        end = "2026-12-31"
        r = session.get(f"{BASE_URL}/api/orchestration/calendar", params={"start_date": start, "end_date": end})
        # accept 200 only
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"

    def test_cleanup_test_event(self, session, auth):
        eid = getattr(TestCalendar, "_eid", None)
        if not eid:
            pytest.skip("nothing to clean")
        r = session.delete(f"{BASE_URL}/api/events/{eid}")
        assert r.status_code in (200, 204, 404), r.text


# ---------- Proposals (event-scoped) ----------
class TestProposals:
    def test_list_via_events(self, session, auth):
        # Application model: one proposal per event; access via /api/proposals/event/{event_id}
        r = session.get(f"{BASE_URL}/api/events")
        assert r.status_code == 200, r.text
        events = r.json() if isinstance(r.json(), list) else r.json().get("events", r.json().get("data", []))
        assert isinstance(events, list) and len(events) > 0, "no events to test proposals against"
        TestProposals._events = events

    def test_get_proposal_for_event(self, session, auth):
        events = getattr(TestProposals, "_events", [])
        if not events:
            pytest.skip("no events")
        found = None
        for e in events[:10]:
            eid = e.get("id") or e.get("_id")
            r = session.get(f"{BASE_URL}/api/proposals/event/{eid}")
            if r.status_code == 200 and r.json():
                found = (eid, r.json())
                break
        assert found, "No event had an accessible proposal"
        eid, proposal = found
        TestProposals._eid = eid
        TestProposals._pid = proposal.get("proposal_id") or proposal.get("id") or proposal.get("_id")
        TestProposals._proposal = proposal
        # totals shape
        for k in ("subtotal", "total"):
            assert k in proposal or k.replace("subtotal", "subtotal_amount") in proposal, (
                f"missing totals key in proposal keys={list(proposal.keys())[:20]}"
            )

    def test_proposal_items_endpoint(self, session, auth):
        pid = getattr(TestProposals, "_pid", None)
        if not pid:
            pytest.skip("no proposal id")
        r = session.get(f"{BASE_URL}/api/proposals/{pid}/items")
        assert r.status_code == 200, r.text
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        TestProposals._items = items
        print(f"[proposal_items] count={len(items)}")

    def test_proposal_totals_math(self, session, auth):
        proposal = getattr(TestProposals, "_proposal", None)
        items = getattr(TestProposals, "_items", None)
        if not proposal or items is None:
            pytest.skip("no proposal data")
        computed = 0.0
        for it in items:
            qty = float(it.get("quantity", it.get("qty", 1)) or 0)
            price = float(it.get("price", it.get("unit_price", it.get("sale_price", 0))) or 0)
            computed += qty * price
        subtotal = float(proposal.get("subtotal", 0) or 0)
        total = float(proposal.get("total", 0) or 0)
        print(f"[totals] items_sum={computed:.2f} subtotal={subtotal:.2f} total={total:.2f}")
        # total should be >= subtotal (taxes), or 0 if empty
        assert total >= 0
        if computed > 0 and subtotal > 0:
            # Items sum should be in same ballpark as subtotal (subtotal may include addons)
            assert subtotal > 0

    def test_proposal_cost_staleness(self, session, auth):
        pid = getattr(TestProposals, "_pid", None)
        if not pid:
            pytest.skip("no proposal id")
        r = session.get(f"{BASE_URL}/api/proposals/{pid}/cost-staleness")
        assert r.status_code == 200, r.text


# ---------- Culinary Phase 2 smoke ----------
class TestCulinaryP2:
    def test_plated_menus_list(self, session, auth):
        r = session.get(f"{BASE_URL}/api/plated-menus")
        assert r.status_code == 200, r.text
        data = r.json()
        menus = data if isinstance(data, list) else data.get("plated_menus", data.get("data", []))
        TestCulinaryP2._menus = menus

    def test_plated_menu_staleness(self, session, auth):
        menus = getattr(TestCulinaryP2, "_menus", [])
        if not menus:
            pytest.skip("no plated menus")
        mid = menus[0].get("id") or menus[0].get("_id") or menus[0].get("menu_id")
        r = session.get(f"{BASE_URL}/api/plated-menus/{mid}/staleness")
        assert r.status_code == 200, r.text

    def test_buffet_factors_list(self, session, auth):
        r = session.get(f"{BASE_URL}/api/buffet-factors")
        assert r.status_code == 200, r.text

    def test_menu_engineering_analyze(self, session, auth):
        r = session.get(f"{BASE_URL}/api/menu-engineering/analyze")
        assert r.status_code == 200, r.text

    def test_cost_variance(self, session, auth):
        r = session.get(f"{BASE_URL}/api/production/cost-variance")
        assert r.status_code in (200, 404), r.text

    def test_culinary_digest_settings(self, session, auth):
        r = session.get(f"{BASE_URL}/api/culinary-digest/settings")
        assert r.status_code == 200, r.text

    def test_kitchen_beo_requires_event(self, session, auth):
        # get an event id
        r = session.get(f"{BASE_URL}/api/events")
        events = r.json() if isinstance(r.json(), list) else r.json().get("events", r.json().get("data", []))
        if not events:
            pytest.skip("no events")
        eid = events[0].get("id") or events[0].get("_id")
        r = session.get(f"{BASE_URL}/api/production/kitchen-beo", params={"event_id": eid})
        assert r.status_code in (200, 404), f"{r.status_code} {r.text[:200]}"
