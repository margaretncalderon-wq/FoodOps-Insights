"""
Backend tests for Month-End Closing module (/api/people-ops/month-end/*).
Tests cover:
  - Access control (admin allowed, role check)
  - CRUD: create, get, update, delete
  - Duplicate rejection (409)
  - Lock (close) -> snapshot -> reopen
  - Compute breakdown (revenue × pct/100 = pool, distribution rows, OT extras)
  - Soft validation on pct sum != 100
"""

import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://foodops-insights.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "demo.agency@kora.com"
ADMIN_PASSWORD = "Evoque2024!"

# Use far-future year to avoid clashing with real data
TEST_YEAR = 2099
TEST_MONTH_BASE = 1  # tests pick distinct months to avoid 409 collisions


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_user_info():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    return r.json().get("user", {})


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_closings(admin_headers):
    """Delete any pre-existing test closings (year=TEST_YEAR) before & after."""
    def _purge():
        r = requests.get(f"{BASE_URL}/api/people-ops/month-end", headers=admin_headers, timeout=20)
        if r.status_code != 200:
            return
        for doc in r.json():
            if doc.get("year") == TEST_YEAR:
                cid = doc.get("closing_id")
                # Reopen if closed (so we can delete)
                if doc.get("status") == "closed":
                    requests.post(
                        f"{BASE_URL}/api/people-ops/month-end/{cid}/reopen",
                        headers=admin_headers, timeout=20
                    )
                requests.delete(
                    f"{BASE_URL}/api/people-ops/month-end/{cid}",
                    headers=admin_headers, timeout=20
                )
    _purge()
    yield
    _purge()


# ---------- Access control ----------

class TestAccess:
    def test_can_view_admin_allowed(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/month-end/access/can-view",
            headers=admin_headers, timeout=20
        )
        assert r.status_code == 200
        data = r.json()
        assert data["allowed"] is True
        assert data["role"] in ("admin", "owner", "hr")

    def test_can_view_unauthenticated(self):
        r = requests.get(
            f"{BASE_URL}/api/people-ops/month-end/access/can-view",
            timeout=20
        )
        # Should require auth
        assert r.status_code in (401, 403)

    def test_endpoint_under_api_prefix(self, admin_headers):
        """Verify endpoints are mounted under /api/people-ops/month-end (not double-prefixed)."""
        r = requests.get(
            f"{BASE_URL}/api/people-ops/month-end",
            headers=admin_headers, timeout=20
        )
        assert r.status_code == 200
        # Ensure the response is the API JSON (list) — not the frontend SPA HTML
        data = r.json()
        assert isinstance(data, list)


# ---------- CRUD ----------

class TestCreateClosing:
    def test_create_draft_closing(self, admin_headers):
        payload = {
            "year": TEST_YEAR,
            "month": 4,
            "revenue_total": 100000,
            "incentive_pool_pct": 15,
            "distribution": [],
        }
        r = requests.post(
            f"{BASE_URL}/api/people-ops/month-end",
            headers=admin_headers, json=payload, timeout=20
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "draft"
        assert "closing_id" in data and data["closing_id"].startswith("close_")
        assert data["year"] == TEST_YEAR
        assert data["month"] == 4
        assert data["revenue_total"] == 100000
        assert data["incentive_pool_pct"] == 15
        # Clean up
        requests.delete(
            f"{BASE_URL}/api/people-ops/month-end/{data['closing_id']}",
            headers=admin_headers, timeout=20
        )

    def test_duplicate_rejected_409(self, admin_headers):
        payload = {
            "year": TEST_YEAR,
            "month": 5,
            "revenue_total": 50000,
            "incentive_pool_pct": 10,
        }
        r1 = requests.post(
            f"{BASE_URL}/api/people-ops/month-end",
            headers=admin_headers, json=payload, timeout=20
        )
        assert r1.status_code == 200, r1.text
        cid = r1.json()["closing_id"]

        try:
            r2 = requests.post(
                f"{BASE_URL}/api/people-ops/month-end",
                headers=admin_headers, json=payload, timeout=20
            )
            assert r2.status_code == 409, r2.text
            assert "already exists" in r2.json().get("detail", "").lower()
        finally:
            requests.delete(
                f"{BASE_URL}/api/people-ops/month-end/{cid}",
                headers=admin_headers, timeout=20
            )


# ---------- Breakdown / Compute ----------

class TestBreakdown:
    @pytest.fixture(scope="class")
    def closing_with_dist(self, admin_headers):
        # Fetch 2 employees from the company to use as targets
        emp_r = requests.get(
            f"{BASE_URL}/api/people-ops/employees",
            headers=admin_headers, timeout=20
        )
        emp_ids = []
        if emp_r.status_code == 200:
            emps = emp_r.json()
            if isinstance(emps, dict):
                emps = emps.get("items") or emps.get("employees") or []
            for e in emps[:2]:
                eid = e.get("employee_id") or e.get("id")
                if eid:
                    emp_ids.append(eid)
        # Fallback synthetic IDs if no employees
        if len(emp_ids) < 2:
            emp_ids = [f"emp_test_a_{uuid.uuid4().hex[:6]}", f"emp_test_b_{uuid.uuid4().hex[:6]}"]

        payload = {
            "year": TEST_YEAR,
            "month": 6,
            "revenue_total": 100000,
            "incentive_pool_pct": 15,
            "distribution": [
                {"employee_id": emp_ids[0], "pct": 50},
                {"employee_id": emp_ids[1], "pct": 50},
            ],
        }
        r = requests.post(
            f"{BASE_URL}/api/people-ops/month-end",
            headers=admin_headers, json=payload, timeout=20
        )
        assert r.status_code == 200, r.text
        cid = r.json()["closing_id"]
        yield cid, emp_ids
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/people-ops/month-end/{cid}",
            headers=admin_headers, timeout=20
        )

    def test_get_returns_breakdown(self, admin_headers, closing_with_dist):
        cid, emp_ids = closing_with_dist
        r = requests.get(
            f"{BASE_URL}/api/people-ops/month-end/{cid}",
            headers=admin_headers, timeout=20
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "breakdown" in data
        bd = data["breakdown"]
        # Pool calc: 100000 × 15/100 = 15000
        assert bd["incentive_pool"] == 15000, f"Expected pool=15000 got {bd['incentive_pool']}"
        assert bd["revenue_total"] == 100000
        assert bd["incentive_pool_pct"] == 15
        # 50/50 split => each row 7500
        rows = bd["rows"]
        assert len(rows) >= 2
        # Check that each distribution employee receives 7500
        dist_rows = [r for r in rows if r["employee_id"] in emp_ids]
        for row in dist_rows:
            assert row["incentive_amount"] == 7500, row
            assert row["pct"] == 50
        # Totals
        assert bd["totals"]["incentive"] >= 15000 - 0.01
        assert "grand_total" in bd["totals"]
        assert bd["distribution_pct_sum"] == 100

    def test_update_distribution_recalculates(self, admin_headers, closing_with_dist):
        cid, emp_ids = closing_with_dist
        # Update to 70/30
        update_payload = {
            "distribution": [
                {"employee_id": emp_ids[0], "pct": 70},
                {"employee_id": emp_ids[1], "pct": 30},
            ]
        }
        r = requests.put(
            f"{BASE_URL}/api/people-ops/month-end/{cid}",
            headers=admin_headers, json=update_payload, timeout=20
        )
        assert r.status_code == 200, r.text
        bd = r.json()["breakdown"]
        rows_by_emp = {row["employee_id"]: row for row in bd["rows"]}
        # 15000 * 0.7 = 10500, * 0.3 = 4500
        assert rows_by_emp[emp_ids[0]]["incentive_amount"] == 10500
        assert rows_by_emp[emp_ids[1]]["incentive_amount"] == 4500
        assert bd["distribution_pct_sum"] == 100

    def test_soft_validation_pct_sum_not_100(self, admin_headers, closing_with_dist):
        cid, emp_ids = closing_with_dist
        # Sum = 80 (soft validation only)
        update_payload = {
            "distribution": [
                {"employee_id": emp_ids[0], "pct": 50},
                {"employee_id": emp_ids[1], "pct": 30},
            ]
        }
        r = requests.put(
            f"{BASE_URL}/api/people-ops/month-end/{cid}",
            headers=admin_headers, json=update_payload, timeout=20
        )
        # Endpoint must NOT reject (200), but pct_sum reflects the issue
        assert r.status_code == 200, r.text
        bd = r.json()["breakdown"]
        assert bd["distribution_pct_sum"] == 80


# ---------- Lock / Reopen / Delete ----------

class TestLockReopen:
    def test_lock_then_edit_rejected_then_reopen(self, admin_headers):
        # Create
        payload = {
            "year": TEST_YEAR,
            "month": 7,
            "revenue_total": 80000,
            "incentive_pool_pct": 10,
            "distribution": [],
        }
        r = requests.post(
            f"{BASE_URL}/api/people-ops/month-end",
            headers=admin_headers, json=payload, timeout=20
        )
        assert r.status_code == 200
        cid = r.json()["closing_id"]

        try:
            # Close
            r = requests.post(
                f"{BASE_URL}/api/people-ops/month-end/{cid}/close",
                headers=admin_headers, timeout=20
            )
            assert r.status_code == 200, r.text
            assert "closed_at" in r.json()

            # Verify status closed via GET
            r = requests.get(
                f"{BASE_URL}/api/people-ops/month-end/{cid}",
                headers=admin_headers, timeout=20
            )
            assert r.status_code == 200
            assert r.json()["status"] == "closed"
            assert r.json().get("closed_at") is not None
            assert r.json().get("snapshot") is not None

            # PUT should fail (already closed)
            r = requests.put(
                f"{BASE_URL}/api/people-ops/month-end/{cid}",
                headers=admin_headers, json={"revenue_total": 99999}, timeout=20
            )
            assert r.status_code == 400, r.text
            assert "closed" in r.json().get("detail", "").lower()

            # DELETE should fail
            r = requests.delete(
                f"{BASE_URL}/api/people-ops/month-end/{cid}",
                headers=admin_headers, timeout=20
            )
            assert r.status_code == 400, r.text

            # Reopen
            r = requests.post(
                f"{BASE_URL}/api/people-ops/month-end/{cid}/reopen",
                headers=admin_headers, timeout=20
            )
            assert r.status_code == 200, r.text

            # Now status should be draft & deletable
            r = requests.get(
                f"{BASE_URL}/api/people-ops/month-end/{cid}",
                headers=admin_headers, timeout=20
            )
            assert r.json()["status"] == "draft"
            assert r.json().get("snapshot") is None
        finally:
            requests.delete(
                f"{BASE_URL}/api/people-ops/month-end/{cid}",
                headers=admin_headers, timeout=20
            )

    def test_delete_draft_succeeds(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/people-ops/month-end",
            headers=admin_headers,
            json={"year": TEST_YEAR, "month": 8, "revenue_total": 1000, "incentive_pool_pct": 5},
            timeout=20
        )
        assert r.status_code == 200
        cid = r.json()["closing_id"]
        r = requests.delete(
            f"{BASE_URL}/api/people-ops/month-end/{cid}",
            headers=admin_headers, timeout=20
        )
        assert r.status_code == 200, r.text

        # Verify gone
        r = requests.get(
            f"{BASE_URL}/api/people-ops/month-end/{cid}",
            headers=admin_headers, timeout=20
        )
        assert r.status_code == 404


# ---------- OT Extras integration ----------

class TestExtrasIntegration:
    def test_breakdown_includes_extras_field(self, admin_headers):
        """Verify the breakdown structure always exposes extras fields (even if 0)."""
        payload = {
            "year": TEST_YEAR,
            "month": 9,
            "revenue_total": 50000,
            "incentive_pool_pct": 10,
            "distribution": [],
        }
        r = requests.post(
            f"{BASE_URL}/api/people-ops/month-end",
            headers=admin_headers, json=payload, timeout=20
        )
        assert r.status_code == 200
        cid = r.json()["closing_id"]
        try:
            r = requests.get(
                f"{BASE_URL}/api/people-ops/month-end/{cid}",
                headers=admin_headers, timeout=20
            )
            assert r.status_code == 200
            bd = r.json()["breakdown"]
            assert "extras" in bd["totals"]
            assert "incentive" in bd["totals"]
            assert "grand_total" in bd["totals"]
            assert bd["start_date"] == f"{TEST_YEAR}-09-01"
            assert bd["end_date"] == f"{TEST_YEAR}-09-30"
            # Rows in this case may be empty (no distribution, no extras for year 2099)
            assert isinstance(bd["rows"], list)
        finally:
            requests.delete(
                f"{BASE_URL}/api/people-ops/month-end/{cid}",
                headers=admin_headers, timeout=20
            )
