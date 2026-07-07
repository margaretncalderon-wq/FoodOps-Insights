"""Iteration 226 — Verify worked_entries persistence across POST/PUT/GET.

User reported (3rd time) that Thursday and Saturday do not persist when editing.
This test suite verifies:
 1. CREATE + REOPEN: worked_entries containing Thu/Sat/Sun all persist.
 2. EDIT (PUT): updating Thu & Sat replaces those, other days stay untouched
    when full array is resent.
 3. EDIT with partial worked_entries: PUT with only Thursday should REPLACE
    entire worked_entries — other days dropped.
 4. entrada == salida: persisted in worked_entries; skipped in daily_entries.
 5. Only time_in (no time_out): backend gracefully skips that day but keeps
    valid days in daily_entries; raw worked_entries still stored as-is.
"""
import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://foodops-insights.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def employee_id(session):
    r = session.get(f"{API}/people-ops/employees")
    assert r.status_code == 200
    employees = r.json()
    if isinstance(employees, dict):
        employees = employees.get("employees", employees.get("data", []))
    assert len(employees) > 0
    active = [e for e in employees if e.get("status") in (None, "active", "Active")]
    emp = (active or employees)[0]
    return emp.get("employee_id") or emp.get("id")


def _week_dates(ref: date):
    """Return dict of Mon..Sun ISO dates for the week containing ref."""
    # backend period bounds for 'weekly': not fully known — use Mon-Sun.
    # Backend validates worked_entries fall within [start_date, end_date].
    # We use ref_date to anchor, then pick the Sunday of that week
    # as end anchor. But safer: retrieve start/end from create response.
    monday = ref - timedelta(days=ref.weekday())
    return {
        "monday": monday.isoformat(),
        "tuesday": (monday + timedelta(days=1)).isoformat(),
        "wednesday": (monday + timedelta(days=2)).isoformat(),
        "thursday": (monday + timedelta(days=3)).isoformat(),
        "friday": (monday + timedelta(days=4)).isoformat(),
        "saturday": (monday + timedelta(days=5)).isoformat(),
        "sunday": (monday + timedelta(days=6)).isoformat(),
    }


def _find_entry(entries, iso):
    for e in entries or []:
        if e.get("date") == iso:
            return e
    return None


@pytest.fixture(scope="module")
def created_ids():
    return {"list": []}


@pytest.fixture(scope="module")
def ref_iso():
    # Use a fixed past Wednesday to keep tests deterministic and within a
    # valid weekly period. Any date works: backend derives Mon-Sun bounds.
    return (date.today() - timedelta(days=14)).isoformat()


class TestWorkedEntriesPersistence:
    def test_1_create_with_thu_sat_sun(self, session, employee_id, ref_iso, created_ids):
        w = _week_dates(date.fromisoformat(ref_iso))
        payload = {
            "employee_id": employee_id,
            "period_type": "weekly",
            "ref_date": ref_iso,
            "worked_entries": [
                {"date": w["thursday"], "time_in": "09:00", "time_out": "19:00", "break_min": 60},
                {"date": w["saturday"], "time_in": "10:00", "time_out": "16:00", "break_min": 0},
                {"date": w["sunday"], "time_in": "08:00", "time_out": "14:00", "break_min": 0},
            ],
        }
        r = session.post(f"{API}/people-ops/overtime/periods", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "overtime_period_id" in data
        pid = data["overtime_period_id"]
        created_ids["list"].append(pid)
        created_ids["pid"] = pid
        created_ids["week"] = w
        created_ids["start"] = data["start_date"]
        created_ids["end"] = data["end_date"]

        # GET should return all 3 worked_entries with exact times
        g = session.get(f"{API}/people-ops/overtime/periods/{pid}")
        assert g.status_code == 200, g.text
        doc = g.json()
        we = doc.get("worked_entries") or []
        assert len(we) == 3, f"Expected 3 worked_entries, got {len(we)}: {we}"
        for iso_key, tin, tout in [
            (w["thursday"], "09:00", "19:00"),
            (w["saturday"], "10:00", "16:00"),
            (w["sunday"], "08:00", "14:00"),
        ]:
            e = _find_entry(we, iso_key)
            assert e is not None, f"Missing entry for {iso_key}: {we}"
            assert e.get("time_in") == tin
            assert e.get("time_out") == tout

    def test_2_edit_full_array_updates_thu_sat(self, session, created_ids):
        pid = created_ids["pid"]
        w = created_ids["week"]
        # Send full 3-day array with updated Thu/Sat times, unchanged Sun
        payload = {
            "worked_entries": [
                {"date": w["thursday"], "time_in": "08:00", "time_out": "20:00", "break_min": 60},
                {"date": w["saturday"], "time_in": "09:00", "time_out": "18:00", "break_min": 0},
                {"date": w["sunday"], "time_in": "08:00", "time_out": "14:00", "break_min": 0},
            ]
        }
        r = session.put(f"{API}/people-ops/overtime/periods/{pid}", json=payload)
        assert r.status_code == 200, r.text

        g = session.get(f"{API}/people-ops/overtime/periods/{pid}")
        assert g.status_code == 200
        we = g.json().get("worked_entries") or []
        assert len(we) == 3, f"Expected 3 entries after edit, got {len(we)}: {we}"
        thu = _find_entry(we, w["thursday"])
        sat = _find_entry(we, w["saturday"])
        sun = _find_entry(we, w["sunday"])
        assert thu and thu["time_in"] == "08:00" and thu["time_out"] == "20:00", f"THU not updated: {thu}"
        assert sat and sat["time_in"] == "09:00" and sat["time_out"] == "18:00", f"SAT not updated: {sat}"
        assert sun and sun["time_in"] == "08:00" and sun["time_out"] == "14:00", f"SUN dropped/changed: {sun}"

    def test_3_edit_partial_replaces_whole_array(self, session, employee_id, ref_iso):
        """PUT with only Thursday should REPLACE the whole array — other days dropped."""
        w = _week_dates(date.fromisoformat(ref_iso))
        # Create fresh period for this scenario
        create = session.post(f"{API}/people-ops/overtime/periods", json={
            "employee_id": employee_id,
            "period_type": "weekly",
            "ref_date": ref_iso,
            "worked_entries": [
                {"date": w["monday"], "time_in": "09:00", "time_out": "17:00", "break_min": 0},
                {"date": w["thursday"], "time_in": "09:00", "time_out": "17:00", "break_min": 0},
                {"date": w["saturday"], "time_in": "10:00", "time_out": "14:00", "break_min": 0},
            ],
        })
        assert create.status_code == 200, create.text
        pid = create.json()["overtime_period_id"]

        # PUT with ONLY Thursday
        r = session.put(f"{API}/people-ops/overtime/periods/{pid}", json={
            "worked_entries": [
                {"date": w["thursday"], "time_in": "10:00", "time_out": "22:00", "break_min": 0},
            ]
        })
        assert r.status_code == 200, r.text
        g = session.get(f"{API}/people-ops/overtime/periods/{pid}")
        we = g.json().get("worked_entries") or []
        assert len(we) == 1, f"PUT should REPLACE. Got {len(we)} entries: {we}"
        assert we[0]["date"] == w["thursday"]
        assert we[0]["time_in"] == "10:00" and we[0]["time_out"] == "22:00"

    def test_4_entrada_equals_salida(self, session, employee_id, ref_iso):
        """time_in == time_out → stored in worked_entries but skipped in daily_entries."""
        w = _week_dates(date.fromisoformat(ref_iso))
        r = session.post(f"{API}/people-ops/overtime/periods", json={
            "employee_id": employee_id,
            "period_type": "weekly",
            "ref_date": ref_iso,
            "worked_entries": [
                {"date": w["thursday"], "time_in": "09:00", "time_out": "09:00", "break_min": 0},
                {"date": w["friday"], "time_in": "09:00", "time_out": "18:00", "break_min": 60},
            ],
        })
        assert r.status_code == 200, r.text
        pid = r.json()["overtime_period_id"]
        g = session.get(f"{API}/people-ops/overtime/periods/{pid}")
        doc = g.json()
        we = doc.get("worked_entries") or []
        de = doc.get("daily_entries") or []
        # Both worked_entries persisted as source of truth
        assert len(we) == 2, f"worked_entries should include both. Got: {we}"
        assert _find_entry(we, w["thursday"]) is not None
        # daily_entries: Thu skipped (0 min); Fri present
        fri_de = _find_entry(de, w["friday"])
        thu_de = _find_entry(de, w["thursday"])
        assert fri_de is not None, f"Friday missing from daily_entries: {de}"
        assert thu_de is None, f"Thursday (0-hour) should be skipped in daily_entries: {thu_de}"

    def test_5_only_time_in_backend_behavior(self, session, employee_id, ref_iso):
        """Backend receives a row with only time_in (no time_out). It should:
           - not crash
           - skip that day in daily_entries
           - keep worked_entries as-sent (source of truth)"""
        w = _week_dates(date.fromisoformat(ref_iso))
        r = session.post(f"{API}/people-ops/overtime/periods", json={
            "employee_id": employee_id,
            "period_type": "weekly",
            "ref_date": ref_iso,
            "worked_entries": [
                {"date": w["thursday"], "time_in": "09:00", "time_out": ""},
                {"date": w["saturday"], "time_in": "10:00", "time_out": "16:00"},
            ],
        })
        assert r.status_code == 200, r.text
        pid = r.json()["overtime_period_id"]
        g = session.get(f"{API}/people-ops/overtime/periods/{pid}")
        doc = g.json()
        we = doc.get("worked_entries") or []
        de = doc.get("daily_entries") or []
        # worked_entries stores whatever was sent as-is
        assert len(we) == 2, f"worked_entries should still contain 2 rows raw: {we}"
        # daily_entries — Thu skipped (no time_out), Sat present
        assert _find_entry(de, w["saturday"]) is not None
        assert _find_entry(de, w["thursday"]) is None

    def test_6_reopen_after_edit_returns_latest(self, session, created_ids):
        """Sanity: re-fetch original period and confirm data still matches test_2."""
        pid = created_ids["pid"]
        w = created_ids["week"]
        g = session.get(f"{API}/people-ops/overtime/periods/{pid}")
        assert g.status_code == 200
        we = g.json().get("worked_entries") or []
        thu = _find_entry(we, w["thursday"])
        sat = _find_entry(we, w["saturday"])
        assert thu and thu["time_in"] == "08:00" and thu["time_out"] == "20:00"
        assert sat and sat["time_in"] == "09:00" and sat["time_out"] == "18:00"

    def test_7_cleanup(self, session, created_ids):
        # Best-effort cleanup of pending periods created above (list-tracked ones)
        for pid in created_ids.get("list", []):
            session.delete(f"{API}/people-ops/overtime/periods/{pid}")
