"""
Iteration 225 - Backend tests for:
- Offboarding auto_approve immediate flow
- Offboarding default (draft) unchanged behavior
- reconcile-terminated repair endpoint
- CRM /team-members: filtering based on active memberships
"""
import os
import uuid
import time
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.company_id = body["user"].get("company_id")
    s.user_id = body["user"].get("user_id")
    assert s.company_id, "Admin has no company_id"
    return s


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


def _create_active_employee(api, prefix="TESTITER225") -> str:
    """Create a fresh active employee. Returns employee_id."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "first_name": f"{prefix}",
        "last_name": suffix,
        "email": f"test_iter225_{suffix}@example.com",
        "job_title": "Test QA",
        "hire_date": "2023-01-01",
        "base_salary": 30000.0,
    }
    r = api.post(f"{BASE_URL}/api/people-ops/employees", json=payload)
    assert r.status_code == 200, f"create employee failed: {r.status_code} {r.text}"
    return r.json()["employee_id"]


def _fetch_employee(mongo, company_id, employee_id):
    return mongo.employees.find_one({"company_id": company_id, "employee_id": employee_id}, {"_id": 0})


# =========================================================
# 1. AUTO-APPROVE flow: single-shot terminate
# =========================================================
class TestOffboardingAutoApprove:
    def test_auto_approve_terminates_immediately(self, api, mongo):
        emp_id = _create_active_employee(api, prefix="AutoApprove")
        try:
            payload = {
                "employee_id": emp_id,
                "termination_type": "resignation",
                "termination_date": "2026-01-15",
                "reason": "Auto approve test",
                "auto_approve": True,
            }
            r = api.post(f"{BASE_URL}/api/people-ops/offboarding", json=payload)
            assert r.status_code == 200, r.text
            body = r.json()
            off_id = body.get("offboarding_id")
            assert off_id, "no offboarding_id"

            # 2. Verify offboarding record
            off = mongo.offboarding.find_one({"offboarding_id": off_id}, {"_id": 0})
            assert off is not None
            assert off.get("status") == "approved", f"status={off.get('status')}"
            assert off.get("approved_at") is not None

            # 3. Verify employee is terminated
            emp = _fetch_employee(mongo, api.company_id, emp_id)
            assert emp is not None
            assert emp.get("status") == "terminated", f"status={emp.get('status')}"
            assert emp.get("termination_date") == "2026-01-15"

            # 4. Verify employee not returned by ACTIVE list (status=active filter).
            # NOTE: GET /people-ops/employees without status filter returns ALL
            # employees including terminated (this is by design — UI filters).
            r2 = api.get(f"{BASE_URL}/api/people-ops/employees?status=active")
            assert r2.status_code == 200
            active_ids = [e.get("employee_id") for e in r2.json()]
            assert emp_id not in active_ids, \
                f"Terminated employee {emp_id} appears in ?status=active list"
        finally:
            # cleanup
            mongo.offboarding.delete_many({"employee_id": emp_id})
            mongo.employees.delete_one({"employee_id": emp_id})


# =========================================================
# 2. Default flow: no auto_approve → draft, employee active
# =========================================================
class TestOffboardingDefaultDraft:
    def test_default_no_auto_approve(self, api, mongo):
        emp_id = _create_active_employee(api, prefix="DraftFlow")
        try:
            payload = {
                "employee_id": emp_id,
                "termination_type": "resignation",
                "termination_date": "2026-02-01",
                "reason": "Default flow test",
                # no auto_approve
            }
            r = api.post(f"{BASE_URL}/api/people-ops/offboarding", json=payload)
            assert r.status_code == 200, r.text
            off_id = r.json().get("offboarding_id")

            off = mongo.offboarding.find_one({"offboarding_id": off_id}, {"_id": 0})
            assert off.get("status") == "draft", f"expected draft got {off.get('status')}"

            emp = _fetch_employee(mongo, api.company_id, emp_id)
            assert emp.get("status") == "active", f"employee status should remain active, got {emp.get('status')}"
            assert emp.get("termination_date") in (None, ""), \
                f"termination_date should not be set, got {emp.get('termination_date')}"
        finally:
            mongo.offboarding.delete_many({"employee_id": emp_id})
            mongo.employees.delete_one({"employee_id": emp_id})


# =========================================================
# 3. Reconcile endpoint
# =========================================================
class TestOffboardingReconcile:
    def test_reconcile_terminates_stuck_employees(self, api, mongo):
        emp_id = _create_active_employee(api, prefix="Reconcile")
        off_id = f"off_{uuid.uuid4().hex[:12]}"
        try:
            # Seed offboarding record: approved but employee still active
            now = datetime.now(timezone.utc)
            mongo.offboarding.insert_one({
                "offboarding_id": off_id,
                "company_id": api.company_id,
                "employee_id": emp_id,
                "termination_type": "resignation",
                "termination_date": "2025-12-01",
                "status": "approved",
                "approved_at": now,
                "created_at": now,
                "updated_at": now,
            })
            # Verify employee is still active before reconcile
            emp_before = _fetch_employee(mongo, api.company_id, emp_id)
            assert emp_before.get("status") == "active"

            r = api.post(f"{BASE_URL}/api/people-ops/offboarding/reconcile-terminated")
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("employees_fixed", 0) >= 1, f"employees_fixed={body}"

            emp_after = _fetch_employee(mongo, api.company_id, emp_id)
            assert emp_after.get("status") == "terminated"
            assert emp_after.get("termination_date") == "2025-12-01"
        finally:
            mongo.offboarding.delete_many({"employee_id": emp_id})
            mongo.employees.delete_one({"employee_id": emp_id})


# =========================================================
# 4. CRM /team-members - active memberships only
# =========================================================
class TestCrmTeamMembersMemberships:
    def _make_user(self, mongo, company_id, is_active_field="set_true"):
        uid = f"usr_test225_{uuid.uuid4().hex[:8]}"
        doc = {
            "user_id": uid,
            "email": f"{uid}@example.com",
            "name": f"Test {uid[-6:]}",
            "company_id": company_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if is_active_field == "set_true":
            doc["is_active"] = True
        elif is_active_field == "set_false":
            doc["is_active"] = False
        # else: omit field entirely
        mongo.users.insert_one(doc)
        return uid

    def _make_membership(self, mongo, company_id, user_id, status="active"):
        mid = f"mem_test225_{uuid.uuid4().hex[:8]}"
        mongo.memberships.insert_one({
            "membership_id": mid,
            "user_id": user_id,
            "company_id": company_id,
            "organization_id": company_id,
            "status": status,
            "role": "member",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return mid

    def test_active_memberships_included_removed_excluded(self, api, mongo):
        cid = api.company_id
        created_users = []
        created_memberships = []
        try:
            # User A: active membership + is_active True
            uid_a = self._make_user(mongo, cid, "set_true")
            mid_a = self._make_membership(mongo, cid, uid_a, status="active")
            # User B: removed membership
            uid_b = self._make_user(mongo, cid, "set_true")
            mid_b = self._make_membership(mongo, cid, uid_b, status="removed")
            # User C: active membership + is_active MISSING
            uid_c = self._make_user(mongo, cid, "omit")
            mid_c = self._make_membership(mongo, cid, uid_c, status="active")

            created_users = [uid_a, uid_b, uid_c]
            created_memberships = [mid_a, mid_b, mid_c]

            r = api.get(f"{BASE_URL}/api/crm/team-members")
            assert r.status_code == 200, r.text
            members = r.json()
            returned_ids = {m.get("user_id") for m in members}

            assert uid_a in returned_ids, "User A (active membership) should be returned"
            assert uid_c in returned_ids, "User C (active membership, is_active missing) should be returned"
            assert uid_b not in returned_ids, "User B (removed membership) should NOT be returned"
        finally:
            if created_users:
                mongo.users.delete_many({"user_id": {"$in": created_users}})
            if created_memberships:
                mongo.memberships.delete_many({"membership_id": {"$in": created_memberships}})

    def test_empty_case_no_active_memberships_scoped(self, api, mongo):
        """
        Rather than deleting existing memberships (destructive), we assert
        the endpoint returns a list (possibly empty) with correct type.
        For a stricter empty test, we'd need an isolated company.
        """
        r = api.get(f"{BASE_URL}/api/crm/team-members")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
