"""
Tests for multi-country liquidation dispatcher + recalculate endpoint.
Covers:
  - calculate_liquidation (DO / US) unit tests
  - POST /api/people-ops/offboarding stores country/law/concepts_not_applicable
  - POST /api/people-ops/offboarding/{id}/recalculate flow (draft / processed)
"""
import os
import sys
import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "demo.agency@kora.com"
PASSWORD = "Evoque2024!"


# ------------- unit tests on dispatcher -------------
from models.people_ops import calculate_liquidation, TerminationType  # noqa: E402


class TestDispatcherUnit:
    def test_do_dismissal_unjustified(self):
        r = calculate_liquidation(
            country_code="DO",
            termination_type=TerminationType.DISMISSAL_UNJUSTIFIED,
            hire_date="2022-01-01",
            termination_date="2024-01-01",
            base_salary=20000,
        )
        assert r["country_code"] == "DO"
        assert r["preaviso_applies"] is True
        assert r["cesantia_applies"] is True
        assert r["preaviso_days"] > 0
        assert r["cesantia_days"] > 0
        assert "Código de Trabajo" in r["applicable_law"]
        assert r["concepts_not_applicable"] == []

    def test_do_resignation(self):
        r = calculate_liquidation(
            country_code="DO",
            termination_type=TerminationType.RESIGNATION,
            hire_date="2022-01-01",
            termination_date="2024-01-01",
            base_salary=20000,
        )
        assert r["preaviso_applies"] is False
        assert r["cesantia_applies"] is False
        assert r["preaviso_amount"] == 0
        assert r["cesantia_amount"] == 0
        concepts = {c["concept"] for c in r["concepts_not_applicable"]}
        assert "preaviso" in concepts and "cesantia" in concepts
        # reason must reference the legal article
        assert any("Art. 76" in c["reason"] for c in r["concepts_not_applicable"])

    def test_us_any_type(self):
        r = calculate_liquidation(
            country_code="US",
            termination_type=TerminationType.DISMISSAL_UNJUSTIFIED,
            hire_date="2022-01-01",
            termination_date="2024-01-01",
            base_salary=5200,  # monthly
        )
        assert r["country_code"] == "US"
        assert "weekly_salary" in r
        # daily = weekly / 5
        assert r["daily_salary"] == pytest.approx(r["weekly_salary"] / 5, rel=1e-2)
        assert r["regalia_proportion"] == 0
        concepts = {c["concept"] for c in r["concepts_not_applicable"]}
        assert concepts == {"preaviso", "cesantia", "regalia"}


# ------------- API integration tests -------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


class TestOffboardingAPI:
    def test_list_offboarding(self, session):
        r = session.get(f"{BASE_URL}/api/people-ops/offboarding", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), list)

    def test_recalculate_flow(self, session):
        # find any draft/pending record
        r = session.get(f"{BASE_URL}/api/people-ops/offboarding", timeout=30)
        records = r.json()
        target = next(
            (x for x in records if x.get("status") in ("draft", "pending_approval")),
            None,
        )
        if not target:
            pytest.skip("No draft/pending offboarding record to recalculate")
        oid = target["offboarding_id"]

        # 1) Recalc as resignation → preaviso/cesantia = 0
        r1 = session.post(
            f"{BASE_URL}/api/people-ops/offboarding/{oid}/recalculate",
            json={"termination_type": "resignation"},
            timeout=30,
        )
        assert r1.status_code == 200, r1.text[:300]
        rec1 = r1.json()["record"]
        assert rec1["preaviso_amount"] == 0
        assert rec1["cesantia_amount"] == 0
        assert rec1["preaviso_applies"] is False
        assert rec1["cesantia_applies"] is False
        assert len(rec1.get("concepts_not_applicable", [])) >= 2
        gross_resig = rec1["gross_liquidation"]

        # 2) Recalc as dismissal_unjustified → preaviso/cesantia > 0, gross changes
        r2 = session.post(
            f"{BASE_URL}/api/people-ops/offboarding/{oid}/recalculate",
            json={"termination_type": "dismissal_unjustified"},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text[:300]
        rec2 = r2.json()["record"]
        assert rec2["preaviso_applies"] is True
        assert rec2["cesantia_applies"] is True
        assert rec2["preaviso_days"] > 0
        # cesantia only applies after 3 months of service — may be 0 for short tenure
        assert rec2["cesantia_days"] >= 0
        assert rec2["gross_liquidation"] != gross_resig

    def test_cannot_recalc_processed(self, session):
        r = session.get(f"{BASE_URL}/api/people-ops/offboarding", timeout=30)
        processed = next(
            (x for x in r.json() if x.get("status") in ("processed", "approved")),
            None,
        )
        if not processed:
            pytest.skip("No processed/approved record")
        r2 = session.post(
            f"{BASE_URL}/api/people-ops/offboarding/{processed['offboarding_id']}/recalculate",
            json={"termination_type": "resignation"},
            timeout=30,
        )
        assert r2.status_code == 400

    def test_create_offboarding_stores_country_fields(self, session):
        emps = session.get(f"{BASE_URL}/api/people-ops/employees?limit=50", timeout=30)
        if emps.status_code != 200:
            pytest.skip(f"Employees list failed: {emps.status_code}")
        active = [
            e for e in emps.json()
            if e.get("status") != "terminated" and e.get("hire_date") and e.get("base_salary")
        ]
        if not active:
            pytest.skip("No active employee to create offboarding")
        emp = active[0]
        payload = {
            "employee_id": emp["employee_id"],
            "termination_type": "dismissal_unjustified",
            "termination_date": "2025-01-15",
            "reason": "TEST_iter241",
            "notes": "TEST_iter241 auto",
        }
        r = session.post(f"{BASE_URL}/api/people-ops/offboarding", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]
        # Response may be the record itself or {message, record}
        body = r.json()
        # Response nests liquidation details under "liquidation" and returns offboarding_id at top level
        liq = body.get("liquidation") or {}
        rec = body.get("record", body)
        assert body.get("offboarding_id")
        assert liq.get("country_code") in ("DO", "US") or rec.get("country_code") in ("DO", "US")
        assert liq.get("applicable_law") or rec.get("applicable_law")
        assert "concepts_not_applicable" in liq or "concepts_not_applicable" in rec
        assert "preaviso_applies" in liq or "preaviso_applies" in rec
        assert "cesantia_applies" in liq or "cesantia_applies" in rec

        oid = body.get("offboarding_id")
        # Fetch the record to verify persistence of country fields on the row itself
        listing = session.get(f"{BASE_URL}/api/people-ops/offboarding", timeout=30).json()
        saved = next((x for x in listing if x.get("offboarding_id") == oid), None)
        assert saved is not None, "record not persisted"
        assert saved.get("country_code")
        assert saved.get("applicable_law")
        assert "concepts_not_applicable" in saved
        assert "preaviso_applies" in saved
        assert "cesantia_applies" in saved
        if oid:
            session.delete(f"{BASE_URL}/api/people-ops/offboarding/{oid}", timeout=15)
