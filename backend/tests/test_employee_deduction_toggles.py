"""
Tests for per-employee deduction toggles (has_pension/has_health_insurance/has_isr).
Iter 211 — verifies that toggling AFP/ARS/ISR off per employee skips the deduction
in both create_payroll_period and payroll_projection, and that toggles override
the manual override values.
"""
import os
import pytest
import requests
from datetime import datetime, timezone

_url = os.environ.get("REACT_APP_BACKEND_URL")
if not _url:
    # Load from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                _url = line.split("=", 1)[1].strip()
                break
BASE_URL = _url.rstrip("/")
# Ensure MONGO_URL/DB_NAME available for backcompat test
if not os.environ.get("MONGO_URL"):
    with open("/app/backend/.env") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v.strip('"'))
LOGIN_EMAIL = "demo.agency@kora.com"
LOGIN_PASSWORD = "Evoque2024!"
EMP_ID = "emp_91f4dfa58d68"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def restore_employee(headers):
    """Ensure employee is restored to has_pension=true, has_isr=true, has_health_insurance=true,
    afp_override=null, ars_override=null after all tests (per main agent instruction)."""
    yield
    requests.put(
        f"{BASE_URL}/api/people-ops/employees/{EMP_ID}",
        headers=headers,
        json={
            "has_pension": True,
            "has_health_insurance": True,
            "has_isr": True,
            "afp_override": None,
            "ars_override": None,
        }
    )


def _get_emp(headers):
    r = requests.get(f"{BASE_URL}/api/people-ops/employees/{EMP_ID}", headers=headers)
    assert r.status_code == 200, f"GET employee failed: {r.status_code} {r.text}"
    return r.json()


def _update_emp(headers, payload):
    r = requests.put(f"{BASE_URL}/api/people-ops/employees/{EMP_ID}",
                     headers=headers, json=payload)
    assert r.status_code == 200, f"PUT employee failed: {r.status_code} {r.text}"
    return r.json()


# ---------- Test 1: PUT toggles persist and biweekly payroll respects them ----------
def test_toggle_persistence_and_payroll_calc(headers):
    # Set has_pension=false, has_isr=false, has_health_insurance=true
    _update_emp(headers, {
        "has_pension": False,
        "has_isr": False,
        "has_health_insurance": True,
        "afp_override": None,
        "ars_override": None,
        "isr_override": None,
    })
    emp = _get_emp(headers)
    assert emp["has_pension"] is False, f"has_pension not persisted: {emp.get('has_pension')}"
    assert emp["has_isr"] is False, f"has_isr not persisted: {emp.get('has_isr')}"
    assert emp["has_health_insurance"] is True, f"has_health_insurance not persisted: {emp.get('has_health_insurance')}"

    # base_salary should be 75000 monthly
    base_salary = float(emp.get("base_salary") or 0)
    assert base_salary == 75000, f"Base salary mismatch: {base_salary}"

    # Create biweekly payroll period
    now = datetime.now(timezone.utc)
    period_start = now.replace(day=1).strftime("%Y-%m-%d")
    period_end = now.replace(day=15).strftime("%Y-%m-%d")
    payload = {
        "period_type": "biweekly",
        "start_date": period_start,
        "end_date": period_end,
        "payment_date": period_end,
        "payment_kind": "regular",
        "notes": "TEST_iter211_toggles",
    }
    r = requests.post(f"{BASE_URL}/api/people-ops/payroll/periods",
                      headers=headers, json=payload)
    assert r.status_code in (200, 201), f"Create payroll failed: {r.status_code} {r.text}"
    period = r.json()
    period_id = period.get("period_id")

    try:
        # Fetch entries via GET (POST doesn't necessarily return entries embedded)
        g = requests.get(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}",
                        headers=headers)
        assert g.status_code == 200, f"GET period failed: {g.status_code} {g.text}"
        period_full = g.json()
        entries = period_full.get("entries") or period.get("entries") or []
        target = next((e for e in entries if e.get("employee_id") == EMP_ID), None)
        assert target is not None, f"Employee {EMP_ID} not found in payroll entries (total entries: {len(entries)})"

        # AFP should be 0 (has_pension=false)
        assert float(target.get("afp_employee", 0)) == 0.0, \
            f"AFP should be 0 when has_pension=false, got {target.get('afp_employee')}"

        # ARS should be > 0 (has_health_insurance=true). Biweekly: 37500 * 3.04% = 1140
        ars = float(target.get("ars_employee", 0))
        assert 1100 < ars < 1200, f"ARS should be ~1140 for biweekly 37500 * 3.04%, got {ars}"

        # ISR should be 0 (has_isr=false)
        assert float(target.get("isr", 0)) == 0.0, \
            f"ISR should be 0 when has_isr=false, got {target.get('isr')}"

        print(f"[OK] biweekly entry: afp={target.get('afp_employee')}, "
              f"ars={target.get('ars_employee')}, isr={target.get('isr')}")
    finally:
        # Cleanup: delete the test payroll period
        if period_id:
            requests.delete(f"{BASE_URL}/api/people-ops/payroll/periods/{period_id}",
                            headers=headers)


# ---------- Test 2: payroll_projection respects toggles ----------
def test_projection_respects_toggles(headers):
    # Set has_pension=false, has_isr=false
    _update_emp(headers, {
        "has_pension": False,
        "has_isr": False,
        "has_health_insurance": True,
        "afp_override": None,
        "ars_override": None,
        "isr_override": None,
    })
    r = requests.get(f"{BASE_URL}/api/people-ops/payroll/projection?period_type=biweekly",
                     headers=headers)
    assert r.status_code == 200, f"Projection failed: {r.status_code} {r.text}"
    proj = r.json()
    breakdown = proj.get("employee_breakdown") or []
    # employee_breakdown may be dict or list — accept both shapes
    if isinstance(breakdown, dict):
        entry = breakdown.get(EMP_ID)
    else:
        entry = next((e for e in breakdown if e.get("employee_id") == EMP_ID), None)
    assert entry is not None, f"Employee {EMP_ID} not in projection breakdown"

    assert float(entry.get("afp", 0)) == 0.0, \
        f"Projection AFP should be 0 when has_pension=false, got {entry.get('afp')}"
    assert float(entry.get("isr", 0)) == 0.0, \
        f"Projection ISR should be 0 when has_isr=false, got {entry.get('isr')}"
    assert float(entry.get("ars", 0)) > 0, \
        f"Projection ARS should be >0 when has_health_insurance=true, got {entry.get('ars')}"

    print(f"[OK] projection: afp={entry.get('afp')}, ars={entry.get('ars')}, isr={entry.get('isr')}")


# ---------- Test 3: restore all True -> all deductions non-zero ----------
def test_restore_all_true_nonzero(headers):
    _update_emp(headers, {
        "has_pension": True,
        "has_isr": True,
        "has_health_insurance": True,
        "afp_override": None,
        "ars_override": None,
        "isr_override": None,
    })
    emp = _get_emp(headers)
    assert emp["has_pension"] is True
    assert emp["has_isr"] is True
    assert emp["has_health_insurance"] is True

    r = requests.get(f"{BASE_URL}/api/people-ops/payroll/projection?period_type=biweekly",
                     headers=headers)
    assert r.status_code == 200
    proj = r.json()
    breakdown = proj.get("employee_breakdown") or []
    if isinstance(breakdown, dict):
        entry = breakdown.get(EMP_ID)
    else:
        entry = next((e for e in breakdown if e.get("employee_id") == EMP_ID), None)
    assert entry is not None
    assert float(entry.get("afp", 0)) > 0, "AFP should be >0 when has_pension=true"
    assert float(entry.get("ars", 0)) > 0, "ARS should be >0 when has_health_insurance=true"
    assert float(entry.get("isr", 0)) > 0, "ISR should be >0 when has_isr=true (75k monthly is above ISR threshold)"

    print(f"[OK] restored: afp={entry.get('afp')}, ars={entry.get('ars')}, isr={entry.get('isr')}")


# ---------- Test 4: toggle takes precedence over override ----------
def test_toggle_overrides_manual_override(headers):
    # has_pension=false + afp_override=2000 -> biweekly afp should be 0 (toggle wins)
    _update_emp(headers, {
        "has_pension": False,
        "has_health_insurance": True,
        "has_isr": True,
        "afp_override": 2000,
        "ars_override": None,
        "isr_override": None,
    })
    r = requests.get(f"{BASE_URL}/api/people-ops/payroll/projection?period_type=biweekly",
                     headers=headers)
    assert r.status_code == 200
    proj = r.json()
    breakdown = proj.get("employee_breakdown") or []
    entry = breakdown.get(EMP_ID) if isinstance(breakdown, dict) else \
            next((e for e in breakdown if e.get("employee_id") == EMP_ID), None)
    assert entry is not None
    assert float(entry.get("afp", 0)) == 0.0, \
        f"AFP must be 0 (toggle off) even with afp_override=2000, got {entry.get('afp')}"

    # Now has_pension=true + afp_override=2000 -> biweekly afp = 2000/2 = 1000
    _update_emp(headers, {
        "has_pension": True,
        "afp_override": 2000,
    })
    r = requests.get(f"{BASE_URL}/api/people-ops/payroll/projection?period_type=biweekly",
                     headers=headers)
    proj = r.json()
    breakdown = proj.get("employee_breakdown") or []
    entry = breakdown.get(EMP_ID) if isinstance(breakdown, dict) else \
            next((e for e in breakdown if e.get("employee_id") == EMP_ID), None)
    afp_val = float(entry.get("afp", 0))
    assert 995 <= afp_val <= 1005, f"AFP with override=2000 should be 1000 biweekly, got {afp_val}"
    print(f"[OK] override respected when toggle=true: afp={afp_val}")


# ---------- Test 5: backward compat — employee without has_isr treated as True ----------
def test_backward_compat_missing_fields():
    """Directly unset has_isr in DB and verify projection still calculates ISR."""
    import motor.motor_asyncio
    import asyncio

    async def run():
        client = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        # Snapshot
        emp = await db.employees.find_one({"employee_id": EMP_ID}, {"_id": 0})
        assert emp, "employee not found in DB"
        prev_has_isr = emp.get("has_isr")
        prev_has_pension = emp.get("has_pension")
        prev_has_ars = emp.get("has_health_insurance")

        try:
            # Unset the fields entirely
            await db.employees.update_one(
                {"employee_id": EMP_ID},
                {"$unset": {"has_isr": "", "has_pension": "", "has_health_insurance": ""}}
            )
            # Verify unset
            emp2 = await db.employees.find_one({"employee_id": EMP_ID}, {"_id": 0})
            assert "has_isr" not in emp2
            assert "has_pension" not in emp2
            assert "has_health_insurance" not in emp2
        finally:
            # Restore original values
            restore = {}
            if prev_has_isr is not None:
                restore["has_isr"] = prev_has_isr
            if prev_has_pension is not None:
                restore["has_pension"] = prev_has_pension
            if prev_has_ars is not None:
                restore["has_health_insurance"] = prev_has_ars
            if restore:
                await db.employees.update_one({"employee_id": EMP_ID}, {"$set": restore})

        client.close()

    asyncio.run(run())

    # Now hit projection with fields absent — should treat all as True
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD})
    tok = r.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}

    # Unset again for the actual test
    import motor.motor_asyncio  # noqa: F811
    async def unset_and_test():
        client = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        emp_before = await db.employees.find_one({"employee_id": EMP_ID}, {"_id": 0})
        snap = {
            "has_isr": emp_before.get("has_isr"),
            "has_pension": emp_before.get("has_pension"),
            "has_health_insurance": emp_before.get("has_health_insurance"),
            "afp_override": emp_before.get("afp_override"),
        }
        await db.employees.update_one(
            {"employee_id": EMP_ID},
            {"$unset": {"has_isr": "", "has_pension": "", "has_health_insurance": ""},
             "$set": {"afp_override": None}}
        )
        client.close()
        return snap

    snap = asyncio.run(unset_and_test())

    try:
        resp = requests.get(f"{BASE_URL}/api/people-ops/payroll/projection?period_type=biweekly",
                            headers=h)
        assert resp.status_code == 200
        proj = resp.json()
        breakdown = proj.get("employee_breakdown") or []
        entry = breakdown.get(EMP_ID) if isinstance(breakdown, dict) else \
                next((e for e in breakdown if e.get("employee_id") == EMP_ID), None)
        assert entry is not None
        assert float(entry.get("afp", 0)) > 0, "AFP should be calculated when field missing (backcompat=True)"
        assert float(entry.get("ars", 0)) > 0, "ARS should be calculated when field missing (backcompat=True)"
        assert float(entry.get("isr", 0)) > 0, "ISR should be calculated when field missing (backcompat=True)"
        print(f"[OK] backcompat (fields unset): afp={entry.get('afp')}, ars={entry.get('ars')}, isr={entry.get('isr')}")
    finally:
        # Restore
        async def restore_snap():
            client = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            set_doc = {}
            for k, v in snap.items():
                if v is not None:
                    set_doc[k] = v
            if set_doc:
                await db.employees.update_one({"employee_id": EMP_ID}, {"$set": set_doc})
            client.close()
        asyncio.run(restore_snap())
